using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

public interface IAccountClient
{
    ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken);
}
