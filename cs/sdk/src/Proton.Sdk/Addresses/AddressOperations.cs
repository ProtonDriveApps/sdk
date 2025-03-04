using CommunityToolkit.HighPerformance;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Api;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Keys.Api;

namespace Proton.Sdk.Addresses;

internal static class AddressOperations
{
    public static async ValueTask<IReadOnlyList<Address>> GetAddressesAsync(ProtonAccountClient client, CancellationToken cancellationToken)
    {
        var result = await client.EntityCache.TryGetCurrentUserAddressesAsync(cancellationToken).ConfigureAwait(false);

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

            await client.EntityCache.SetCurrentUserAddressesAsync(addresses, cancellationToken).ConfigureAwait(false);

            result = addresses;
        }

        return result;
    }

    public static async ValueTask<Address> GetAsync(ProtonAccountClient client, AddressId addressId, CancellationToken cancellationToken)
    {
        var address = await client.EntityCache.TryGetAddressAsync(addressId, cancellationToken).ConfigureAwait(false);

        if (address is null)
        {
            var userKeys = await client.GetUserKeysAsync(cancellationToken).ConfigureAwait(false);

            var response = await client.Api.Addresses.GetAddressAsync(addressId, cancellationToken).ConfigureAwait(false);

            address = await ConvertFromDtoAsync(client, response.Address, userKeys, cancellationToken).ConfigureAwait(false);

            await client.EntityCache.SetAddressAsync(address, cancellationToken).ConfigureAwait(false);
        }

        return address;
    }

    public static async ValueTask<Address> GetDefaultAsync(ProtonAccountClient client, CancellationToken cancellationToken)
    {
        var addresses = await GetAddressesAsync(client, cancellationToken).ConfigureAwait(false);

        if (addresses.Count == 0)
        {
            throw new ProtonApiException("User has no address");
        }

        return addresses.OrderBy(x => x.Order).First();
    }

    public static async ValueTask<IReadOnlyList<PgpPrivateKey>> GetKeysAsync(
        ProtonAccountClient client,
        AddressId addressId,
        CancellationToken cancellationToken)
    {
        var addressKeys = await client.SecretCache.TryGetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false)
            ?? await GetAddressKeysAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        return addressKeys;
    }

    public static async ValueTask<PgpPrivateKey> GetPrimaryKeyAsync(ProtonAccountClient client, AddressId addressId, CancellationToken cancellationToken)
    {
        // TODO: use cache
        var address = await GetAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        var addressKeys = await GetKeysAsync(client, addressId, cancellationToken).ConfigureAwait(false);

        return addressKeys[address.PrimaryKeyIndex];
    }

    public static async ValueTask<IReadOnlyList<PgpPublicKey>> GetPublicKeysAsync(
        ProtonAccountClient client,
        string emailAddress,
        CancellationToken cancellationToken)
    {
        if (!client.PublicKeyCache.TryGetPublicKeys(emailAddress, out var cachedPublicKeys))
        {
            try
            {
                var publicKeysResponse = await client.Api.Keys.GetActivePublicKeysAsync(emailAddress, cancellationToken).ConfigureAwait(false);

                var publicKeys = new List<PgpPublicKey>(publicKeysResponse.Address.Keys.Count);

                for (var keyIndex = 0; keyIndex < publicKeys.Count; ++keyIndex)
                {
                    var keyEntry = publicKeysResponse.Address.Keys[keyIndex];
                    if (!keyEntry.Status.HasFlag(PublicKeyStatus.IsNotCompromised))
                    {
                        continue;
                    }

                    var publicKey = PgpPublicKey.Import(keyEntry.PublicKey);

                    publicKeys.Add(publicKey);
                }

                client.PublicKeyCache.SetPublicKeys(emailAddress, publicKeys);

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
                    var passphrase = await client.SessionSecretCache.TryGetAccountKeyPassphraseAsync(keyDto.Id.Value, cancellationToken).ConfigureAwait(false);

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
                // TODO: log that
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

        await client.SecretCache.SetAddressKeysAsync(dto.Id, unlockedKeys, cancellationToken).ConfigureAwait(false);

        return new Address(dto.Id, dto.Order, dto.Email, dto.Status, keys.AsReadOnly(), primaryKeyIndex.Value);
    }

    private static ReadOnlyMemory<byte> GetAddressKeyTokenPassphrase(
        PgpArmoredMessage token,
        PgpArmoredSignature signature,
        IReadOnlyList<PgpPrivateKey> userKeys)
    {
        var userKeyRing = new PgpPrivateKeyRing(userKeys);
        using var decryptingStream = PgpDecryptingStream.Open(token.Bytes.AsStream(), userKeyRing, signature, userKeyRing);

        using var passphraseStream = new MemoryStream();
        decryptingStream.CopyTo(passphraseStream);

        // TODO: avoid another allocation
        return passphraseStream.ToArray();
    }

    private static async ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressKeysAsync(
        ProtonAccountClient client,
        AddressId addressId,
        CancellationToken cancellationToken)
    {
        var addressKeys = await client.SecretCache.TryGetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

        if (addressKeys is null)
        {
            await GetAsync(client, addressId, cancellationToken).ConfigureAwait(false);

            addressKeys = await client.SecretCache.TryGetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

            if (addressKeys is null)
            {
                throw new ProtonApiException($"Could not get address keys for address {addressId}");
            }
        }

        return addressKeys;
    }
}
