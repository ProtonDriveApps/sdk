using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

internal interface IAccountClient
{
    ValueTask<Address> GetAddressAsync(ProtonDriveClient client, AddressId addressId, CancellationToken cancellationToken);
    ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey> GetAddressPrivateKeyAsync(AddressId addressId, int index, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken);
}
