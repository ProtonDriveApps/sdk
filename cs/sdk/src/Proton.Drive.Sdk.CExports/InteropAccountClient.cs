using Google.Protobuf.WellKnownTypes;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.CExports;
using Address = Proton.Sdk.Addresses.Address;
using AddressKey = Proton.Sdk.Addresses.AddressKey;
using AddressStatus = Proton.Sdk.Addresses.AddressStatus;

namespace Proton.Drive.Sdk.CExports;

internal sealed class InteropAccountClient(nint state, InteropAction<nint, InteropArray<byte>, nint> requestAction) : IAccountClient
{
    private readonly nint _state = state;
    private readonly InteropAction<nint, InteropArray<byte>, nint> _requestAction = requestAction;

    public async ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountClientRequest { GetAddress = new GetAddressRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<Proton.Sdk.CExports.Address>(_state, request).ConfigureAwait(false);

        return ConvertToAddress(response);
    }

    public async ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken)
    {
        var response = await _requestAction.SendRequestAsync<Proton.Sdk.CExports.Address>(
            _state,
            new AccountClientRequest { GetAddress = new GetAddressRequest() }).ConfigureAwait(false);

        return ConvertToAddress(response);
    }

    public async ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountClientRequest { GetAddressPrimaryPrivateKey = new GetAddressPrimaryPrivateKeyRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<BytesValue>(_state, request).ConfigureAwait(false);

        return PgpPrivateKey.Import(response.Value.Span);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountClientRequest { GetAddressPrivateKeys = new GetAddressPrivateKeysRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<RepeatedBytesValue>(_state, request).ConfigureAwait(false);

        return [.. response.Value.Select(keyData => PgpPrivateKey.Import(keyData.Span))];
    }

    public async ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var request = new AccountClientRequest { GetAddressPublicKeys = new GetAddressPublicKeysRequest { EmailAddress = emailAddress } };
        var response = await _requestAction.SendRequestAsync<RepeatedBytesValue>(_state, request).ConfigureAwait(false);

        return [.. response.Value.Select(keyData => PgpPublicKey.Import(keyData.Span))];
    }

    private static Address ConvertToAddress(Proton.Sdk.CExports.Address addressMessage)
    {
        var addressId = new AddressId(addressMessage.AddressId);

        var keys = addressMessage.Keys.Select((key, index) => new AddressKey(
            addressId,
            new AddressKeyId(key.AddressKeyId),
            index == addressMessage.PrimaryKeyIndex,
            key.IsActive,
            key.IsAllowedForEncryption,
            key.IsAllowedForVerification)).ToList();

        return new Address(
            addressId,
            addressMessage.Order,
            addressMessage.EmailAddress,
            (AddressStatus)addressMessage.Status,
            keys,
            addressMessage.PrimaryKeyIndex);
    }
}
