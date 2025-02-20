using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Keys.Api;
using Proton.Sdk.Users.Api;

namespace Proton.Sdk;

internal sealed class AccountApiClients(HttpClient httpClient)
{
    public IKeysApiClient Keys { get; } = new KeysApiClient(httpClient);
    public IUsersApiClient Users { get; } = new UsersApiClient(httpClient);
    public IAddressesApiClient Addresses { get; } = new AddressesApiClient(httpClient);
}
