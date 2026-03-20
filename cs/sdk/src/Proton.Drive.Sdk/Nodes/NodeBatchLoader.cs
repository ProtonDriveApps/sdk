using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class NodeBatchLoader(ProtonDriveClient client, VolumeId volumeId, bool forPhotos) : BatchLoaderBase<LinkId, Result<Node, DegradedNode>>
{
    private readonly ProtonDriveClient _client = client;
    private readonly bool _forPhotos = forPhotos;

    protected override async ValueTask<IReadOnlyList<Result<Node, DegradedNode>>> LoadBatchAsync(
        ReadOnlyMemory<LinkId> ids,
        CancellationToken cancellationToken)
    {
        var nodeResults = new List<Result<Node, DegradedNode>>(ids.Length);

        var response = _forPhotos
            ? await _client.Api.Photos.GetDetailsAsync(volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false)
            : await _client.Api.Links.GetDetailsAsync(volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            var nodeMetadataResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                volumeId,
                linkDetails,
                knownShareAndKey: null,
                cancellationToken).ConfigureAwait(false);

            var nodeResult = nodeMetadataResult.ToNodeResult();

            nodeResults.Add(nodeResult);
        }

        return nodeResults;
    }
}
