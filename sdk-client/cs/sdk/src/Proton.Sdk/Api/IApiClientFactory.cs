using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Authentication;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Api.Users;

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
