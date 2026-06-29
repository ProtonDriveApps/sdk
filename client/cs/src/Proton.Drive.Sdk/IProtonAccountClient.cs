using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk;

public interface IProtonAccountClient
{
    ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<Address> GetCurrentUserDefaultAddressAsync(CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken);
}
