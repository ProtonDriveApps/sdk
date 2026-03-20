using Proton.Drive.Sdk.Shares;

namespace Proton.Drive.Sdk.Api.Shares;

internal interface ISharesApiClient
{
    ValueTask<ShareResponseV2> GetMyFilesShareAsync(CancellationToken cancellationToken);
    ValueTask<ShareResponse> GetShareAsync(ShareId id, CancellationToken cancellationToken);
    ValueTask<ShareListResponse> GetSharesAsync(ShareType? typeFilter, CancellationToken cancellationToken);
}
