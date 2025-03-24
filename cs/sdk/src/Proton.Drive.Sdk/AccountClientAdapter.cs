using Proton.Cryptography.Pgp;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

internal sealed class AccountClientAdapter(ProtonApiSession session) : IAccountClient
{
    private readonly ProtonAccountClient _client = new(session);

    public ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken)
    {
        return _client.GetCurrentUserDefaultAddressAsync(cancellationToken);
    }

    public ValueTask<PgpPrivateKey> GetAddressPrimaryKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressPrimaryKeyAsync(addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressKeysAsync(addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        return _client.GetAddressPublicKeysAsync(emailAddress, cancellationToken);
    }
}
