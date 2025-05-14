using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Addresses;

internal static class AddressOperations
{
    public static async ValueTask<IReadOnlyList<Address>> GetCurrentUserAddressesAsync(ProtonAccountClient client, CancellationToken cancellationToken)
    {
        var result = await client.Cache.Entities.TryGetCurrentUserAddressesAsync(cancellationToken).ConfigureAwait(false);

        if (result is null)
        {
            var addressListResponse = await client.Api.Addresses.GetAddressesAsync(cancellationToken).ConfigureAwait(false);

            var addresses = new List<Address>(addressListResponse.Addresses.Count);

            var userKeys = await client.GetUserKeysAsync(cancellationToken).ConfigureAwait(false);

            foreach (var dto in addressListResponse.Addresses)
            {
                try
                {
                    var address = await ConvertFromDtoAsync(client, dto, userKeys, cancellationToken).ConfigureAwait(false);

                    addresses.Add(address);
                }
                catch (Exception e)
                {
                    client.Logger.LogError(e, "Failed to load address {AddressId}", dto.Id);
                }
            }

            await client.Cache.Entities.SetCurrentUserAddressesAsync(addresses, cancellationToken).ConfigureAwait(false);

            result = addresses;
        }

        return result;
    }

    public static async ValueTask<Address> GetAddressAsync(ProtonAccountClient client, AddressId addressId, CancellationToken cancellationToken)
    {
        var address = await client.Cache.Entities.TryGetAddressAsync(addressId, cancellationToken).ConfigureAwait(false);

        if (address is null)
        {
            var userKeys = await client.GetUserKeysAsync(cancellationToken).ConfigureAwait(false);

            var response = await client.Api.Addresses.GetAddressAsync(addressId, cancellationToken).ConfigureAwait(false);

            address = await ConvertFromDtoAsync(client, response.Address, userKeys, cancellationToken).ConfigureAwait(false);

            await client.Cache.Entities.SetAddressAsync(address, cancellationToken).ConfigureAwait(false);
        }

        return address;
    }

    public static async ValueTask<Address> GetCurrentUserDefaultAddressAsync(ProtonAccountClient client, CancellationToken cancellationToken)
    {
        var addresses = await GetCurrentUserAddressesAsync(client, cancellationToken).ConfigureAwait(false);

        if (addresses.Count == 0)
        {
            throw new ProtonApiException("User has no address");
        }

        return addresses.OrderBy(x => x.Order).First();
    }

    public static async ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressPrivateKeysAsync(
        ProtonAccountClient client,
        AddressId addressId,
        CancellationToken cancellationToken)
    {
        var addressKeys = await client.Cache.Secrets.TryGetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

        if (addressKeys is null)
        {
            await GetAddressAsync(client, addressId, cancellationToken).ConfigureAwait(false);

            addressKeys = await client.Cache.Secrets.TryGetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

            if (addressKeys is null)
            {
                throw new ProtonApiException($"Could not get address keys for address {addressId}");
            }
        }

        return addressKeys;
    }

    public static async ValueTask<PgpPrivateKey> GetAddressPrimaryPrivateKeyAsync(
        ProtonAccountClient client,
        AddressId addressId,
        CancellationToken cancellationToken)
    {
        var address = await GetAddressAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        var addressKeys = await GetAddressPrivateKeysAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        return addressKeys[address.PrimaryKeyIndex];
    }

    public static async ValueTask<PgpPrivateKey> GetAddressPrivateKeyAsync(
        ProtonAccountClient client,
        AddressId addressId,
        int index,
        CancellationToken cancellationToken)
    {
        var addressKeys = await GetAddressPrivateKeysAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        return addressKeys[index];
    }

    public static async ValueTask<IReadOnlyList<PgpPublicKey>> GetPublicKeysAsync(
        ProtonAccountClient client,
        string emailAddress,
        CancellationToken cancellationToken)
    {
        if (!client.Cache.PublicKeys.TryGetPublicKeys(emailAddress, out var cachedPublicKeys))
        {
            try
            {
                var publicKeysResponse = await client.Api.Keys.GetActivePublicKeysAsync(emailAddress, cancellationToken).ConfigureAwait(false);

                var publicKeys = new List<PgpPublicKey>(publicKeysResponse.Address.Keys.Count);

                var publicKeyQuery = publicKeysResponse.Address.Keys
                    .Where(x => x.Status.HasFlag(PublicKeyStatus.IsNotCompromised))
                    .Select(x => PgpPublicKey.Import(x.PublicKey));

                publicKeys.AddRange(publicKeyQuery);

                client.Cache.PublicKeys.SetPublicKeys(emailAddress, publicKeys);

                cachedPublicKeys = publicKeys;
            }
            catch (ProtonApiException e) when (e.Code is ResponseCode.UnknownAddress)
            {
                client.Logger.LogError(e, "Unknown address {EmailAddress}", emailAddress);

                cachedPublicKeys = [];
            }
        }

        return cachedPublicKeys;
    }

    private static async ValueTask<Address> ConvertFromDtoAsync(
        ProtonAccountClient client,
        AddressDto dto,
        IReadOnlyList<PgpPrivateKey> userKeys,
        CancellationToken cancellationToken)
    {
        int? primaryKeyIndex = null;

        var keys = new List<AddressKey>(dto.Keys.Count);
        var unlockedKeys = new List<PgpPrivateKey>(dto.Keys.Count);
        var keyIndex = 0;

        foreach (var keyDto in dto.Keys)
        {
            if (!keyDto.IsActive)
            {
                continue;
            }

            try
            {
                PgpPrivateKey unlockedKey;

                if (keyDto is { Token: not null, Signature: not null })
                {
                    var passphrase = GetAddressKeyTokenPassphrase(keyDto.Token.Value, keyDto.Signature.Value, userKeys);
                    unlockedKey = PgpPrivateKey.ImportAndUnlock(keyDto.PrivateKey, passphrase.Span);
                }
                else
                {
                    var passphrase = await client.Cache.SessionSecrets.TryGetAccountKeyPassphraseAsync(
                        keyDto.Id.ToString(),
                        cancellationToken).ConfigureAwait(false);

                    if (passphrase is null)
                    {
                        client.Logger.LogWarning("No passphrase found for address key {UserKeyId}", keyDto.Id);
                        continue;
                    }

                    unlockedKey = PgpPrivateKey.ImportAndUnlock(keyDto.PrivateKey, passphrase.Value.Span);
                }

                unlockedKeys.Add(unlockedKey);
            }
            catch
            {
                // FIXME: log that
                continue;
            }

            var key = new AddressKey(
                dto.Id,
                keyDto.Id,
                keyDto.IsPrimary,
                keyDto.IsActive,
                (keyDto.Capabilities & AddressKeyCapabilities.IsAllowedForEncryption) != 0,
                (keyDto.Capabilities & AddressKeyCapabilities.IsAllowedForSignatureVerification) != 0);

            keys.Add(key);

            if (keyDto.IsPrimary)
            {
                primaryKeyIndex = keyIndex;
            }

            ++keyIndex;
        }

        if (primaryKeyIndex is null)
        {
            throw new ProtonApiException($"Address {dto.Id} has no primary key");
        }

        await client.Cache.Secrets.SetAddressKeysAsync(dto.Id, unlockedKeys, cancellationToken).ConfigureAwait(false);

        return new Address(dto.Id, dto.Order, dto.Email, dto.Status, keys.AsReadOnly(), primaryKeyIndex.Value);
    }

    private static ReadOnlyMemory<byte> GetAddressKeyTokenPassphrase(
        PgpArmoredMessage token,
        PgpArmoredSignature signature,
        IReadOnlyList<PgpPrivateKey> userKeys)
    {
        var userKeyRing = new PgpPrivateKeyRing(userKeys);
        using var decryptingStream = PgpDecryptingStream.Open(token, userKeyRing, signature, userKeyRing);

        using var passphraseStream = new MemoryStream();
        decryptingStream.CopyTo(passphraseStream);

        // TODO: avoid another allocation
        return passphraseStream.ToArray();
    }
}
