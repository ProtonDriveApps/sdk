using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.Caching;

namespace Proton.Sdk;

public sealed class ProtonAccountClient
{
    public ProtonAccountClient(ProtonApiSession session)
        : this(new AccountApiClients(session.GetHttpClient()), session.ClientConfiguration, session.SecretCache)
    {
    }

    internal ProtonAccountClient(AccountApiClients apiClients, ProtonClientConfiguration configuration, SessionSecretCache sessionSecretCache)
    {
        Api = apiClients;
        Logger = configuration.LoggerFactory.CreateLogger<ProtonAccountClient>();
        SessionSecretCache = sessionSecretCache;
        EntityCache = new AccountEntityCache(configuration.EntityCacheRepository);
        SecretCache = new AccountSecretCache(configuration.SecretCacheRepository);
    }

    internal AccountApiClients Api { get; }

    internal AccountEntityCache EntityCache { get; }
    internal AccountSecretCache SecretCache { get; }
    internal SessionSecretCache SessionSecretCache { get; }
    internal PublicKeyCache PublicKeyCache { get; } = new();

    internal ILogger<ProtonAccountClient> Logger { get; }

    public ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetAsync(this, addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<Address>> GetAddressesAsync(CancellationToken cancellationToken)
    {
        return AddressOperations.GetAddressesAsync(this, cancellationToken);
    }

    public ValueTask<Address> GetDefaultAddressAsync(CancellationToken cancellationToken)
    {
        return AddressOperations.GetDefaultAsync(this, cancellationToken);
    }

    internal async ValueTask<IReadOnlyList<PgpPrivateKey>> GetUserKeysAsync(CancellationToken cancellationToken)
    {
        var userKeys = await SecretCache.TryGetUserKeysAsync(cancellationToken).ConfigureAwait(false);

        if (userKeys is null)
        {
            var response = await Api.Users.GetAuthenticatedUserAsync(cancellationToken).ConfigureAwait(false);

            var unlockedKeys = new List<PgpPrivateKey>(response.User.Keys.Count);

            foreach (var userKey in response.User.Keys)
            {
                if (!userKey.IsActive)
                {
                    continue;
                }

                var passphrase = await SessionSecretCache.TryGetAccountKeyPassphraseAsync(userKey.Id.Value, cancellationToken).ConfigureAwait(false);

                if (passphrase is null)
                {
                    Logger.LogWarning("No passphrase found for user key {UserKeyId}", userKey.Id);
                    continue;
                }

                var unlockedUserKey = PgpPrivateKey.ImportAndUnlock(userKey.PrivateKey.Bytes.Span, passphrase.Value.Span);

                unlockedKeys.Add(unlockedUserKey);
            }

            if (unlockedKeys.Count == 0)
            {
                throw new ProtonApiException("No active user key was found.");
            }

            await SecretCache.SetUserKeysAsync(unlockedKeys, cancellationToken).ConfigureAwait(false);

            userKeys = unlockedKeys;
        }

        return userKeys;
    }

    internal ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetKeysAsync(this, addressId, cancellationToken);
    }

    internal ValueTask<PgpPrivateKey> GetAddressPrimaryKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetPrimaryKeyAsync(this, addressId, cancellationToken);
    }

    internal ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        return AddressOperations.GetPublicKeysAsync(this, emailAddress, cancellationToken);
    }
}
