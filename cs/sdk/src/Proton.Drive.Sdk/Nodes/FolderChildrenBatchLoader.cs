using System.Runtime.InteropServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class FolderChildrenBatchLoader(ProtonDriveClient client, VolumeId volumeId, PgpPrivateKey parentKey)
    : BatchLoaderBase<LinkId, Result<Node, DegradedNode>>
{
    private readonly ProtonDriveClient _client = client;
    private readonly VolumeId _volumeId = volumeId;
    private readonly PgpPrivateKey _parentKey = parentKey;

    protected override async ValueTask<IReadOnlyList<Result<Node, DegradedNode>>> LoadBatchAsync(
        ReadOnlyMemory<LinkId> ids,
        CancellationToken cancellationToken)
    {
        var response = await _client.Api.Links.GetDetailsAsync(_volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        var nodeResults = new List<Result<Node, DegradedNode>>(ids.Length);

        foreach (var linkDetails in response.Links)
        {
            var nodeMetadataResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(_client, _volumeId, linkDetails, _parentKey, cancellationToken)
                .ConfigureAwait(false);

            var nodeResult = nodeMetadataResult.ToNodeResult();

            nodeResults.Add(nodeResult);
        }

        return nodeResults;
    }
}
