using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Keys.Api;
using Proton.Sdk.Users.Api;

namespace Proton.Sdk.Api;

internal interface IAccountApiClients
{
    IKeysApiClient Keys { get; }
    IUsersApiClient Users { get; }
    IAddressesApiClient Addresses { get; }
}
