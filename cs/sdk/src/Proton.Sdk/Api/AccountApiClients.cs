using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Keys.Api;
using Proton.Sdk.Users.Api;

namespace Proton.Sdk.Api;

internal sealed class AccountApiClients(HttpClient httpClient) : IAccountApiClients
{
    public IKeysApiClient Keys { get; } = ApiClientFactory.Instance.CreateKeysApiClient(httpClient);
    public IUsersApiClient Users { get; } = ApiClientFactory.Instance.CreateUsersApiClient(httpClient);
    public IAddressesApiClient Addresses { get; } = ApiClientFactory.Instance.CreateAddressesApiClient(httpClient);
}
