namespace Proton.Drive.Sdk.Account.Caching;

public interface ISessionSecretCache
{
    ValueTask SetAccountKeyPassphraseAsync(string keyId, ReadOnlyMemory<byte> passphrase, CancellationToken cancellationToken);
    ValueTask<ReadOnlyMemory<byte>?> TryGetAccountKeyPassphraseAsync(string keyId, CancellationToken cancellationToken);
}
