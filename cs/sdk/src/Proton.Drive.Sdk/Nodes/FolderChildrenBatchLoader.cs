using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class FolderChildrenBatchLoader(ProtonDriveClient client, VolumeId volumeId, PgpPrivateKey parentKey)
    : BatchLoaderBase<LinkId, Node>
{
    private readonly ProtonDriveClient _client = client;
    private readonly VolumeId _volumeId = volumeId;
    private readonly PgpPrivateKey _parentKey = parentKey;

    protected override async IAsyncEnumerable<Node> LoadBatchAsync(ReadOnlyMemory<LinkId> ids, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var response = await _client.Api.Links.GetDetailsAsync(_volumeId, MemoryMarshal.ToEnumerable(ids), cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            var nodeMetadataResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                _volumeId,
                linkDetails,
                _parentKey,
                cancellationToken).ConfigureAwait(false);

            yield return nodeMetadataResult.Node;
        }
    }
}
