using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeProviderExtensions
{
    extension(INodeProvider nodeProvider)
    {
        public IAsyncEnumerable<(LinkId LinkId, Result<NodeOperationData, Exception> Result)> EnumerateNodeOperationDataAsync(
            VolumeId volumeId,
            IEnumerable<LinkId> linkIds,
            CancellationToken cancellationToken)
        {
            return nodeProvider.EnumerateNodeOperationDataAsync(volumeId, linkIds.Select(linkId => (linkId, linkId)), cancellationToken);
        }

        public IAsyncEnumerable<(LinkId LinkId, Result<NodeMetadata, Exception> Result)> EnumerateNodeMetadataAsync(
            VolumeId volumeId,
            IEnumerable<LinkId> linkIds,
            CancellationToken cancellationToken)
        {
            return nodeProvider.EnumerateNodeMetadataAsync(volumeId, linkIds.Select(linkId => (linkId, linkId)), cancellationToken);
        }
    }
}
