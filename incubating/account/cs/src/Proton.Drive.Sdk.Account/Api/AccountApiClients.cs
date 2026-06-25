using Proton.Drive.Sdk.Account.Api.Addresses;
using Proton.Drive.Sdk.Account.Api.Keys;
using Proton.Drive.Sdk.Account.Api.Users;

namespace Proton.Drive.Sdk.Account.Api;

internal sealed class AccountApiClients(HttpClient httpClient) : IAccountApiClients
{
    public IKeysApiClient Keys { get; } = ApiClientFactory.Instance.CreateKeysApiClient(httpClient);
    public IUsersApiClient Users { get; } = ApiClientFactory.Instance.CreateUsersApiClient(httpClient);
    public IAddressesApiClient Addresses { get; } = ApiClientFactory.Instance.CreateAddressesApiClient(httpClient);
}
