namespace Proton.Sdk.Caching;

internal interface ISessionSecretCache
{
    ValueTask SetAccountKeyPassphraseAsync(string keyId, ReadOnlyMemory<byte> passphrase, CancellationToken cancellationToken);
    ValueTask<ReadOnlyMemory<byte>?> TryGetAccountKeyPassphraseAsync(string keyId, CancellationToken cancellationToken);
}
