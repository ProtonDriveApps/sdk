using System.Runtime.InteropServices;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Photos.Sdk.Nodes;

internal sealed class PhotoNodeBatchLoader(ProtonPhotosClient client, VolumeId volumeId) : BatchLoaderBase<LinkId, Result<Node, DegradedNode>>
{
    private readonly ProtonPhotosClient _client = client;

    protected override async ValueTask<IReadOnlyList<Result<Node, DegradedNode>>> LoadBatchAsync(
        ReadOnlyMemory<LinkId> ids,
        CancellationToken cancellationToken)
    {
        var nodeResults = new List<Result<Node, DegradedNode>>(ids.Length);

        var response = await _client.PhotosApi.GetDetailsAsync(volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            var nodeMetadataResult = await PhotoDtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
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
