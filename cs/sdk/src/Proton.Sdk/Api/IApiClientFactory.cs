using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Authentication.Api;
using Proton.Sdk.Keys.Api;
using Proton.Sdk.Users.Api;

namespace Proton.Sdk.Api;

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
