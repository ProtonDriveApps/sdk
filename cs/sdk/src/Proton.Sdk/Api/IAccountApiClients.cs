using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Api.Users;

namespace Proton.Sdk.Api;

internal interface IAccountApiClients
{
    IKeysApiClient Keys { get; }
    IUsersApiClient Users { get; }
    IAddressesApiClient Addresses { get; }
}
