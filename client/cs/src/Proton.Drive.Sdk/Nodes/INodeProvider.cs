using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal interface INodeProvider
{
    IAsyncEnumerable<(T Item, Result<NodeOperationData, Exception> Result)> EnumerateNodeOperationDataAsync<T>(
        VolumeId volumeId,
        IEnumerable<(T Item, LinkId LinkId)> itemLinkIdPairs,
        CancellationToken cancellationToken);

    IAsyncEnumerable<(T Item, Result<NodeMetadata, Exception> Result)> EnumerateNodeMetadataAsync<T>(
        VolumeId volumeId,
        IEnumerable<(T Item, LinkId LinkId)> itemLinkIdPairs,
        CancellationToken cancellationToken);
}
