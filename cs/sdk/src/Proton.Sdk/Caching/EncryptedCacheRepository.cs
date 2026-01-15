using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Caching;

public sealed class EncryptedCacheRepository(ICacheRepository inner, byte[] encryptionKey) : ICacheRepository
{
    private const int IvByteCount = 12;
    private const int SaltByteCount = 16;
    private const int TagByteCount = 16;
    private const int KeyByteCount = 32;

    private readonly ICacheRepository _inner = inner;
    private readonly byte[] _encryptionKey = encryptionKey;

    private static byte[] CacheEncryptionContext => "Drive.EncryptedCacheRepository"u8.ToArray();

    public ValueTask SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        var encryptedValue = Encrypt(key, value);

        return _inner.SetAsync(key, encryptedValue, tags, cancellationToken);
    }

    public ValueTask RemoveAsync(string key, CancellationToken cancellationToken)
    {
        return _inner.RemoveAsync(key, cancellationToken);
    }

    public ValueTask RemoveByTagAsync(string tag, CancellationToken cancellationToken)
    {
        return _inner.RemoveByTagAsync(tag, cancellationToken);
    }

    public ValueTask ClearAsync()
    {
        return _inner.ClearAsync();
    }

    public async ValueTask<string?> TryGetAsync(string key, CancellationToken cancellationToken)
    {
        var encryptedValue = await _inner.TryGetAsync(key, cancellationToken).ConfigureAwait(false);

        return encryptedValue is not null ? Decrypt(key, encryptedValue) : null;
    }

    public async IAsyncEnumerable<(string Key, string Value)> GetByTagsAsync(
        IEnumerable<string> tags,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var (key, encryptedValue) in _inner.GetByTagsAsync(tags, cancellationToken).ConfigureAwait(false))
        {
            yield return (key, Decrypt(key, encryptedValue));
        }
    }

    public ValueTask DisposeAsync()
    {
        return _inner.DisposeAsync();
    }

    private static byte[] Concatenate(byte[] a1, byte[] a2)
    {
        var stream = new MemoryStream(
            new byte[a1.Length + a2.Length],
            0,
            a1.Length + a2.Length,
            true,
            true);

        stream.Write(a1, 0, a1.Length);
        stream.Write(a2, 0, a2.Length);

        return stream.ToArray();
    }

    private string Encrypt(string entryKey, string plaintext)
    {
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var salt = CryptoSecureNumberGenerator.GetBytes(SaltByteCount);

        Span<byte> derivedMaterial = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            _encryptionKey,
            KeyByteCount + IvByteCount,
            salt,
            Concatenate(CacheEncryptionContext, Encoding.UTF8.GetBytes(entryKey)));

        var derivedKey = derivedMaterial[..KeyByteCount];
        var iv = derivedMaterial[KeyByteCount..];
        Span<byte> ciphertext = stackalloc byte[plaintextBytes.Length];
        Span<byte> tag = stackalloc byte[TagByteCount];

        using var aesGcm = new AesGcm(derivedKey, TagByteCount);
        aesGcm.Encrypt(iv, plaintextBytes, ciphertext, tag);

        // Format: [salt][ciphertext][tag]
        var result = new byte[SaltByteCount + plaintextBytes.Length + TagByteCount];

        salt.CopyTo(result.AsSpan());
        ciphertext.CopyTo(result.AsSpan(SaltByteCount));
        tag.CopyTo(result.AsSpan(SaltByteCount + plaintextBytes.Length));

        return Convert.ToBase64String(result);
    }

    private string Decrypt(string entryKey, string encryptedBase64)
    {
        var combined = Convert.FromBase64String(encryptedBase64);

        // Validate minimum length: salt + tag
        if (combined.Length < SaltByteCount + TagByteCount)
        {
            throw new InvalidOperationException("Invalid encrypted data format");
        }

        var salt = combined[..SaltByteCount];
        var ciphertext = combined[SaltByteCount..^TagByteCount];
        var tag = combined[^TagByteCount..];

        Span<byte> derivedMaterial = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            _encryptionKey,
            KeyByteCount + IvByteCount,
            salt,
            Concatenate(CacheEncryptionContext, Encoding.UTF8.GetBytes(entryKey)));

        var derivedKey = derivedMaterial[..KeyByteCount];
        var iv = derivedMaterial[KeyByteCount..];
        Span<byte> plaintextBytes = stackalloc byte[ciphertext.Length];

        using var aesGcm = new AesGcm(derivedKey, TagByteCount);
        aesGcm.Decrypt(iv, ciphertext, tag, plaintextBytes);

        return Encoding.UTF8.GetString(plaintextBytes);
    }
}
