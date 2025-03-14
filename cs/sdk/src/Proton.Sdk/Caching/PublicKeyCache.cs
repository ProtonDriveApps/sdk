using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Caching.Memory;
using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Caching;

internal sealed class PublicKeyCache
    : IPublicKeyCache
{
    public const int NumberOfMinutesBeforeExpiration = 30;

    private readonly IMemoryCache _memoryCache = new MemoryCache(new MemoryCacheOptions());

    public void SetPublicKeys(string emailAddress, IReadOnlyList<PgpPublicKey> publicKeys)
    {
        _memoryCache.Set(emailAddress, publicKeys, TimeSpan.FromMinutes(NumberOfMinutesBeforeExpiration));
    }

    public bool TryGetPublicKeys(string emailAddress, [MaybeNullWhen(false)] out IReadOnlyList<PgpPublicKey> publicKeys)
    {
        return _memoryCache.TryGetValue(emailAddress, out publicKeys);
    }
}
