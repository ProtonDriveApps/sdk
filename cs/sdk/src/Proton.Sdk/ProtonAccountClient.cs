using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;
using Proton.Sdk.Caching;

namespace Proton.Sdk;

public sealed class ProtonAccountClient
{
    public ProtonAccountClient(ProtonApiSession session)
        : this(
            new AccountApiClients(session.GetHttpClient()),
            new AccountClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository, session.SecretCache),
            session.ClientConfiguration.LoggerFactory.CreateLogger<ProtonAccountClient>())
    {
    }

    internal ProtonAccountClient(IAccountApiClients apiClients, IAccountClientCache cache, ILogger<ProtonAccountClient> logger)
    {
        Api = apiClients;
        Cache = cache;
        Logger = logger;
    }

    internal IAccountApiClients Api { get; }

    internal IAccountClientCache Cache { get; }

    internal ILogger<ProtonAccountClient> Logger { get; }

    public ValueTask<Address> GetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetAddressAsync(this, addressId, cancellationToken);
    }

    public ValueTask<IReadOnlyList<Address>> GetCurrentUserAddressesAsync(CancellationToken cancellationToken)
    {
        return AddressOperations.GetCurrentUserAddressesAsync(this, cancellationToken);
    }

    public ValueTask<Address> GetCurrentUserDefaultAddressAsync(CancellationToken cancellationToken)
    {
        return AddressOperations.GetCurrentUserDefaultAddressAsync(this, cancellationToken);
    }

    internal ValueTask<IReadOnlyList<PgpPrivateKey>> GetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetAddressKeysAsync(this, addressId, cancellationToken);
    }

    internal ValueTask<PgpPrivateKey> GetAddressPrimaryKeyAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return AddressOperations.GetAddressPrimaryKeyAsync(this, addressId, cancellationToken);
    }

    internal ValueTask<IReadOnlyList<PgpPublicKey>> GetAddressPublicKeysAsync(string emailAddress, CancellationToken cancellationToken)
    {
        return AddressOperations.GetPublicKeysAsync(this, emailAddress, cancellationToken);
    }

    internal async ValueTask<IReadOnlyList<PgpPrivateKey>> GetUserKeysAsync(CancellationToken cancellationToken)
    {
        var userKeys = await Cache.Secrets.TryGetUserKeysAsync(cancellationToken).ConfigureAwait(false);

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

                var passphrase = await Cache.SessionSecrets.TryGetAccountKeyPassphraseAsync(userKey.Id.ToString(), cancellationToken).ConfigureAwait(false);

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

            await Cache.Secrets.SetUserKeysAsync(unlockedKeys, cancellationToken).ConfigureAwait(false);

            userKeys = unlockedKeys;
        }

        return userKeys;
    }
}
