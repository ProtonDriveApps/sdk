using System.Runtime.InteropServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Volumes;

internal sealed class VolumeTrashBatchLoader(ProtonDriveClient client, VolumeId volumeId, PgpPrivateKey shareKey)
    : BatchLoaderBase<LinkId, RefResult<Node, DegradedNode>>
{
    private readonly ProtonDriveClient _client = client;
    private readonly VolumeId _volumeId = volumeId;
    private readonly PgpPrivateKey _shareKey = shareKey;

    private readonly Dictionary<LinkId, PgpPrivateKey> _parentKeys = new();

    protected override async ValueTask<IReadOnlyList<RefResult<Node, DegradedNode>>> LoadBatchAsync(
        ReadOnlyMemory<LinkId> ids,
        CancellationToken cancellationToken)
    {
        var response = await _client.Api.Links.GetDetailsAsync(_volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        var nodeResults = new List<RefResult<Node, DegradedNode>>(ids.Length);

        foreach (var linkDetails in response.Links)
        {
            PgpPrivateKey parentKey;

            if (linkDetails.Link.ParentId is { } parentId)
            {
                if (!_parentKeys.TryGetValue(parentId, out parentKey))
                {
                    var folderSecrets = await FolderOperations.GetSecretsAsync(_client, new NodeUid(_volumeId, parentId), cancellationToken)
                        .ConfigureAwait(false);

                    parentKey = folderSecrets.Key;

                    _parentKeys[parentId] = parentKey;
                }
            }
            else
            {
                parentKey = _shareKey;
            }

            var nodeMetadataResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(_client, _volumeId, linkDetails, parentKey, cancellationToken)
                .ConfigureAwait(false);

            var nodeResult = nodeMetadataResult.ToNodeResult();

            nodeResults.Add(nodeResult);
        }

        return nodeResults;
    }
}
