namespace Proton.Sdk.Caching;

internal sealed class SessionSecretCache(ICache<string, ReadOnlyMemory<byte>> underlyingCache)
{
    public ValueTask SetPasswordDerivedKeyPassphraseAsync(string keyId, ReadOnlyMemory<byte> passphrase, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask<ReadOnlyMemory<byte>?> TryGetPasswordDerivedKeyPassphraseAsync(string keyId, CancellationToken cancellationToken)
    {
        return default;
    }
}
