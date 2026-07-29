using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Re-encrypts photos (and their related photos) for a target node's keys.
/// Mirroring the JS <c>PhotoTransferPayloadBuilder</c>.
/// </summary>
internal static class PhotoTransferPayloadBuilder
{
    public static async ValueTask<PhotoPayloadBuildResult> BuildPayloadsAsync(
        ProtonDriveClient client,
        IReadOnlyList<PhotoPayloadItem> items,
        NodeUid targetNodeUid,
        PgpPrivateKey targetKey,
        ReadOnlyMemory<byte> targetHashKey,
        PgpPrivateKey signingKey,
        string signingEmailAddress,
        CancellationToken cancellationToken)
    {
        var payloads = new List<TransferEncryptedPhotoPayload>();
        var errors = new Dictionary<NodeUid, Exception>();

        // Batch-load the main photos, then resolve each once and gather the related UIDs to load next.
        var mainMetadata = await LoadMetadataAsync(client, items.Select(item => item.PhotoNodeUid), cancellationToken).ConfigureAwait(false);

        var resolvedItems = new List<(PhotoPayloadItem Item, NodeMetadata Metadata, IReadOnlyList<NodeUid> RelatedNodeUids)>();
        var relatedUids = new HashSet<NodeUid>();

        foreach (var item in items)
        {
            if (!mainMetadata.TryGetValue(item.PhotoNodeUid, out var metadataResult))
            {
                errors[item.PhotoNodeUid] = new NodeNotFoundException(item.PhotoNodeUid);
                continue;
            }

            if (!metadataResult.TryGetValueElseError(out var metadata, out var loadError))
            {
                errors[item.PhotoNodeUid] = loadError;
                continue;
            }

            if (metadata.OperationData.ParentUid == targetNodeUid)
            {
                errors[item.PhotoNodeUid] = new PhotoAlreadyInTargetException(item.PhotoNodeUid);
                continue;
            }

            var relatedNodeUids = GetRelatedNodeUids(metadata).Concat(item.AdditionalRelatedPhotoNodeUids).Distinct().ToList();
            foreach (var relatedNodeUid in relatedNodeUids)
            {
                relatedUids.Add(relatedNodeUid);
            }

            resolvedItems.Add((item, metadata, relatedNodeUids));
        }

        var relatedMetadata = await LoadMetadataAsync(client, relatedUids, cancellationToken).ConfigureAwait(false);

        // Re-encrypt sequentially: the crypto runs against the single shared target key.
        foreach (var (item, metadata, relatedNodeUids) in resolvedItems)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var mainPayload = EncryptPhoto(item.PhotoNodeUid, metadata, targetKey, targetHashKey, signingKey, signingEmailAddress);

                var relatedPayloads = new List<TransferEncryptedPhotoPayload>();
                foreach (var relatedNodeUid in relatedNodeUids)
                {
                    // Missing or failed-to-load related photos are skipped.
                    if (relatedMetadata.TryGetValue(relatedNodeUid, out var relatedResult)
                        && relatedResult.TryGetValueElseError(out var relatedNodeMetadata, out _))
                    {
                        relatedPayloads.Add(EncryptPhoto(relatedNodeUid, relatedNodeMetadata, targetKey, targetHashKey, signingKey, signingEmailAddress));
                    }
                }

                payloads.Add(relatedPayloads.Count == 0 ? mainPayload : mainPayload with { RelatedPhotos = relatedPayloads });
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                errors[item.PhotoNodeUid] = e;
            }
        }

        return new PhotoPayloadBuildResult(payloads, errors);
    }

    private static TransferEncryptedPhotoPayload EncryptPhoto(
        NodeUid photoNodeUid,
        NodeMetadata metadata,
        PgpPrivateKey targetKey,
        ReadOnlyMemory<byte> targetHashKey,
        PgpPrivateKey signingKey,
        string signingEmailAddress)
    {
        if (!metadata.TryGetFileElseFolder(out var fileNode, out var fileOperationData, out _, out _))
        {
            throw new InvalidOperationException($"Node {photoNodeUid} is not a photo");
        }

        var name = metadata.Node.Name.GetValueOrThrow();

        var contentDigest = fileNode.ActiveRevision.ClaimedDigests.Sha1
            ?? throw new InvalidOperationException($"Cannot build photo payload without a content hash for {photoNodeUid}");

        var nameSessionKey = fileOperationData.NameSessionKey
            ?? throw new InvalidOperationException($"Name session key not available for {photoNodeUid}");

        var passphraseSessionKey = fileOperationData.PassphraseSessionKey
            ?? throw new InvalidOperationException($"Passphrase session key not available for {photoNodeUid}");

        var encrypted = PhotosCrypto.EncryptPhotoForTarget(
            name,
            contentDigest,
            nameSessionKey,
            passphraseSessionKey,
            targetKey,
            targetHashKey.Span,
            signingKey,
            fileOperationData.PassphraseForAnonymousMove);

        return new TransferEncryptedPhotoPayload
        {
            NodeUid = photoNodeUid,
            ContentHash = encrypted.ContentHash,
            NameHashDigest = encrypted.NameHashDigest,
            OriginalNameHashDigest = metadata.NameHashDigest,
            Name = encrypted.Name,
            NameSignatureEmailAddress = signingEmailAddress,
            Passphrase = encrypted.Passphrase,

            // The passphrase signature (and its email) are set only when PhotosCrypto signed the passphrase, i.e. for anonymous nodes.
            PassphraseSignature = encrypted.PassphraseSignature,
            SignatureEmailAddress = encrypted.PassphraseSignature is not null ? signingEmailAddress : null,
            RelatedPhotos = [],
        };
    }

    private static IReadOnlyList<NodeUid> GetRelatedNodeUids(NodeMetadata metadata)
    {
        return metadata.TryGetFileElseFolder(out var fileNode, out _, out _, out _) && fileNode is PhotoNode photoNode
            ? photoNode.RelatedPhotoUids
            : [];
    }

    /// <summary>
    /// Batch-loads metadata grouped by volume. Each UID resolves to its metadata or its volume's load error, or is
    /// absent when the server didn't return it; one volume's failure doesn't abort the others.
    /// </summary>
    private static async ValueTask<IReadOnlyDictionary<NodeUid, Result<NodeMetadata, Exception>>> LoadMetadataAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> nodeUids,
        CancellationToken cancellationToken)
    {
        var resultsByUid = new Dictionary<NodeUid, Result<NodeMetadata, Exception>>();

        foreach (var volumeGroup in nodeUids.Distinct().GroupBy(uid => uid.VolumeId))
        {
            var linkIds = volumeGroup.Select(uid => uid.LinkId);

            try
            {
                await foreach (var metadata in client.NodeProvider
                    .EnumerateNodeMetadataAsync(client, volumeGroup.Key, linkIds, knownShareAndKey: null, cancellationToken).ConfigureAwait(false))
                {
                    resultsByUid[metadata.Node.Uid] = metadata;
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                foreach (var uid in volumeGroup)
                {
                    resultsByUid[uid] = e;
                }
            }
        }

        return resultsByUid;
    }

    /// <summary>A photo to build a payload for, plus related photo UIDs to include beyond the ones it already declares.</summary>
    public readonly record struct PhotoPayloadItem(NodeUid PhotoNodeUid, IReadOnlyList<NodeUid> AdditionalRelatedPhotoNodeUids);

    public readonly record struct PhotoPayloadBuildResult(
        IReadOnlyList<TransferEncryptedPhotoPayload> Payloads,
        IReadOnlyDictionary<NodeUid, Exception> Errors);
}
