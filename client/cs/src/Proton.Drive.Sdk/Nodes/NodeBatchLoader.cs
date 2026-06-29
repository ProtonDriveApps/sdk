using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class NodeBatchLoader(ProtonDriveClient client, VolumeId volumeId, bool forPhotos) : BatchLoaderBase<LinkId, Node>
{
    private readonly ProtonDriveClient _client = client;
    private readonly bool _forPhotos = forPhotos;

    protected override async IAsyncEnumerable<Node> LoadBatchAsync(ReadOnlyMemory<LinkId> ids, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var response = await _client.Api.GetLinkDetailsAsync(volumeId, MemoryMarshal.ToEnumerable(ids), _forPhotos, cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            var (node, _, _, _) = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                volumeId,
                linkDetails,
                knownShareAndKey: null,
                cancellationToken).ConfigureAwait(false);

            yield return node;
        }
    }
}
