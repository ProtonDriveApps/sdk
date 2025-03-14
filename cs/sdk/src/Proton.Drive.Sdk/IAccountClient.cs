using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

internal interface IAccountClient
{
    ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey> GetAddressPrimaryKeyAsync(AddressId addressId, CancellationToken cancellationToken);
}
