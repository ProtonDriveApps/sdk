namespace Proton.Sdk.Api.Keys;

internal interface IKeysApiClient
{
    Task<AddressPublicKeyListResponse> GetActivePublicKeysAsync(string emailAddress, CancellationToken cancellationToken);

    Task<KeySaltListResponse> GetKeySaltsAsync(CancellationToken cancellationToken);
}
