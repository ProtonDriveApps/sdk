using Proton.Cryptography.Pgp;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk;

internal sealed class AccountClientAdapter(ProtonApiSession session) : IAccountClient
{
    private readonly ProtonAccountClient _client = new(session);

    public ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken)
    {
        return _client.GetDefaultAddressAsync(cancellationToken);
    }

    public ValueTask<PgpPrivateKey> GetAddressPrimaryKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return _client.GetAddressPrimaryKeyAsync(addressId, cancellationToken);
    }
}
