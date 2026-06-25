using Proton.Drive.Sdk.Account.Api.Addresses;
using Proton.Drive.Sdk.Account.Api.Authentication;
using Proton.Drive.Sdk.Account.Api.Keys;
using Proton.Drive.Sdk.Account.Api.Users;

namespace Proton.Drive.Sdk.Account.Api;

internal interface IApiClientFactory
{
    public IAuthenticationApiClient CreateAuthenticationApiClient(HttpClient httpClient, Uri refreshRedirectUri)
        => new AuthenticationApiClient(httpClient, refreshRedirectUri);

    public IKeysApiClient CreateKeysApiClient(HttpClient httpClient)
        => new KeysApiClient(httpClient);

    public IUsersApiClient CreateUsersApiClient(HttpClient httpClient)
        => new UsersApiClient(httpClient);

    public IAddressesApiClient CreateAddressesApiClient(HttpClient httpClient)
        => new AddressesApiClient(httpClient);
}
