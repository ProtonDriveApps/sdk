using Proton.Cryptography.Pgp;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

internal sealed class AccountClientAdapter(ProtonApiSession session) : IAccountClient
{
    private readonly ProtonAccountClient _client = new(session);

    public ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressAsync(addressId, cancellationToken);
    }

    public ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken)
    {
        return _client.GetCurrentUserDefaultAddressAsync(cancellationToken);
    }

    public ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressPrimaryPrivateKeyAsync(addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressPrivateKeysAsync(addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        return _client.GetAddressPublicKeysAsync(emailAddress, cancellationToken);
    }
}
