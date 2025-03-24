using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Api.Users;

namespace Proton.Sdk.Api;

internal sealed class AccountApiClients(HttpClient httpClient) : IAccountApiClients
{
    public IKeysApiClient Keys { get; } = ApiClientFactory.Instance.CreateKeysApiClient(httpClient);
    public IUsersApiClient Users { get; } = ApiClientFactory.Instance.CreateUsersApiClient(httpClient);
    public IAddressesApiClient Addresses { get; } = ApiClientFactory.Instance.CreateAddressesApiClient(httpClient);
}
