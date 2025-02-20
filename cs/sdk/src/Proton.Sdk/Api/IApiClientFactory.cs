using Proton.Sdk.Authentication.Api;
using Proton.Sdk.Keys.Api;

namespace Proton.Sdk.Api;

internal interface IApiClientFactory
{
    public IAuthenticationApiClient CreateAuthenticationApiClient(HttpClient httpClient, Uri refreshRedirectUri)
        => new AuthenticationApiClient(httpClient, refreshRedirectUri);

    public IKeysApiClient CreateKeysApiClient(HttpClient httpClient)
        => new KeysApiClient(httpClient);
}
