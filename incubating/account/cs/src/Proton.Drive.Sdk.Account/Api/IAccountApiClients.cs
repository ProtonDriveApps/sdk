using Proton.Drive.Sdk.Account.Api.Addresses;
using Proton.Drive.Sdk.Account.Api.Keys;
using Proton.Drive.Sdk.Account.Api.Users;

namespace Proton.Drive.Sdk.Account.Api;

internal interface IAccountApiClients
{
    IKeysApiClient Keys { get; }
    IUsersApiClient Users { get; }
    IAddressesApiClient Addresses { get; }
}
