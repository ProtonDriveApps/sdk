using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

/// <summary>
/// Re-encrypts a photo's name and passphrase against a target node's key and hash key.
/// Mirrors the JS <c>AlbumsCryptoService.encryptPhotoForAlbum</c>, but re-wraps the passphrase session key
/// like a node move rather than re-encrypting the passphrase plaintext.
/// The anonymous-node passphrase, when supplied, is signed.
/// </summary>
internal static class PhotosCrypto
{
    public static EncryptedPhotoForTarget EncryptPhotoForTarget(
        string name,
        ReadOnlyMemory<byte> contentSha1Digest,
        PgpSessionKey nameSessionKey,
        PgpSessionKey passphraseSessionKey,
        PgpPrivateKey targetKey,
        ReadOnlySpan<byte> targetHashKey,
        PgpPrivateKey signingKey,
        ReadOnlyMemory<byte>? passphraseForAnonymousNode)
    {
        var encryptedName = PgpEncrypter.EncryptAndSignText(name, new EncryptionSecrets(targetKey, nameSessionKey), signingKey);
        var nameHashDigest = NodeCrypto.HashNodeName(name, targetHashKey);
        var contentHash = NodeCrypto.HashContentDigest(contentSha1Digest, targetHashKey);
        var passphrase = targetKey.EncryptSessionKey(passphraseSessionKey);

        // Signed only for anonymous nodes
        PgpArmoredSignature? passphraseSignature = null;
        if (passphraseForAnonymousNode is { } anonymousPassphrase)
        {
            passphraseSignature = signingKey.Sign(anonymousPassphrase.Span);
        }

        return new EncryptedPhotoForTarget
        {
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ContentHash = contentHash,
            Passphrase = passphrase,
            PassphraseSignature = passphraseSignature,
        };
    }

    public readonly record struct EncryptedPhotoForTarget
    {
        public required PgpArmoredMessage Name { get; init; }

        public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

        public required ReadOnlyMemory<byte> ContentHash { get; init; }

        public required PgpArmoredMessage Passphrase { get; init; }

        public PgpArmoredSignature? PassphraseSignature { get; init; }
    }
}
