using Google.Protobuf.WellKnownTypes;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk.CExports;

internal sealed class InteropProtonAccountClient(nint bindingsHandle, InteropAction<nint, InteropArray<byte>, nint> requestAction) : IProtonAccountClient
{
    private readonly nint _bindingsHandle = bindingsHandle;
    private readonly InteropAction<nint, InteropArray<byte>, nint> _requestAction = requestAction;

    public async ValueTask<Account.Addresses.Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountRequest { GetAddress = new GetAddressRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<Address>(_bindingsHandle, request).ConfigureAwait(false);

        return ConvertToAddress(response);
    }

    public async ValueTask<Account.Addresses.Address> GetCurrentUserDefaultAddressAsync(CancellationToken cancellationToken)
    {
        var response = await _requestAction.SendRequestAsync<Address>(
            _bindingsHandle,
            new AccountRequest { GetDefaultAddress = new GetDefaultAddressRequest() }).ConfigureAwait(false);

        return ConvertToAddress(response);
    }

    public async ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountRequest { GetAddressPrimaryPrivateKey = new GetAddressPrimaryPrivateKeyRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<BytesValue>(_bindingsHandle, request).ConfigureAwait(false);

        return PgpPrivateKey.Import(response.Value.Span);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var request = new AccountRequest { GetAddressPrivateKeys = new GetAddressPrivateKeysRequest { AddressId = addressId.ToString() } };
        var response = await _requestAction.SendRequestAsync<RepeatedBytesValue>(_bindingsHandle, request).ConfigureAwait(false);

        return [.. response.Value.Select(keyData => PgpPrivateKey.Import(keyData.Span))];
    }

    public async ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var request = new AccountRequest { GetAddressPublicKeys = new GetAddressPublicKeysRequest { EmailAddress = emailAddress } };
        var response = await _requestAction.SendRequestAsync<RepeatedBytesValue>(_bindingsHandle, request).ConfigureAwait(false);

        return [.. response.Value.Select(keyData => PgpPublicKey.Import(keyData.Span))];
    }

    private static Account.Addresses.Address ConvertToAddress(Address addressMessage)
    {
        var addressId = (AddressId)addressMessage.AddressId;

        var keys = addressMessage.Keys.Select((key, index) => new Account.Addresses.AddressKey(
            addressId,
            (AddressKeyId)key.AddressKeyId,
            index == addressMessage.PrimaryKeyIndex,
            key.IsActive,
            key.IsAllowedForEncryption,
            key.IsAllowedForVerification)).ToList();

        return new Account.Addresses.Address(
            addressId,
            addressMessage.Order,
            addressMessage.EmailAddress,
            (Account.Addresses.AddressStatus)addressMessage.Status,
            keys,
            addressMessage.PrimaryKeyIndex);
    }
}
