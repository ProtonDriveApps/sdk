using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Volumes;

internal sealed class VolumeTrashBatchLoader(ProtonDriveClient client, VolumeId volumeId, PgpPrivateKey shareKey)
    : BatchLoaderBase<LinkId, Node>
{
    private readonly ProtonDriveClient _client = client;
    private readonly VolumeId _volumeId = volumeId;
    private readonly PgpPrivateKey _shareKey = shareKey;

    private readonly Dictionary<LinkId, PgpPrivateKey> _parentKeys = [];

    protected override async IAsyncEnumerable<Node> LoadBatchAsync(ReadOnlyMemory<LinkId> ids, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var response = await _client.Api.Links.GetDetailsAsync(_volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            PgpPrivateKey parentKey;

            if (linkDetails.Link.ParentId is { } parentId)
            {
                if (!_parentKeys.TryGetValue(parentId, out parentKey))
                {
                    var folderSecretsResult = await FolderOperations.GetSecretsAsync(_client, new NodeUid(_volumeId, parentId), cancellationToken)
                        .ConfigureAwait(false);

                    // FIXME: This should not throw, but rather return a Result with an appropriate error.
                    parentKey = folderSecretsResult.Key ?? throw new ProtonDriveException($"Folder key not available for {parentId}");

                    _parentKeys[parentId] = parentKey;
                }
            }
            else
            {
                parentKey = _shareKey;
            }

            var (node, _, _, _) = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                _volumeId,
                linkDetails,
                parentKey,
                cancellationToken)
                .ConfigureAwait(false);

            yield return node;
        }
    }
}
