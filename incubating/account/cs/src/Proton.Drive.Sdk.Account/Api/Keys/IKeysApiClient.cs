namespace Proton.Drive.Sdk.Account.Api.Keys;

internal interface IKeysApiClient
{
    Task<AddressPublicKeyListResponse> GetActivePublicKeysAsync(string emailAddress, CancellationToken cancellationToken);

    Task<KeySaltListResponse> GetKeySaltsAsync(CancellationToken cancellationToken);
}
