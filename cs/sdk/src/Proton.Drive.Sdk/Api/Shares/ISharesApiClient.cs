namespace Proton.Drive.Sdk.Api.Shares;

internal interface ISharesApiClient
{
    ValueTask<ShareResponseV2> GetMyFilesShareAsync(CancellationToken cancellationToken);
    ValueTask<ShareResponse> GetShareAsync(ShareId id, CancellationToken cancellationToken);
}
