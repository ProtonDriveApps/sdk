using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// A photo (and its related photos) re-encrypted for a target node's keys.
/// Mirrors the JS <c>TransferEncryptedPhotoPayload</c>.
/// </summary>
internal sealed record TransferEncryptedPhotoPayload
{
    public required NodeUid NodeUid { get; init; }

    public required ReadOnlyMemory<byte> ContentHash { get; init; }

    public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

    /// <summary>The node's current name hash, required only when transferring (moving) a node.</summary>
    public required ReadOnlyMemory<byte> OriginalNameHashDigest { get; init; }

    public required PgpArmoredMessage Name { get; init; }

    public required string NameSignatureEmailAddress { get; init; }

    public required PgpArmoredMessage Passphrase { get; init; }

    /// <summary>Set only for anonymously-authored photos, whose re-encrypted passphrase is signed by the current user.</summary>
    public PgpArmoredSignature? PassphraseSignature { get; init; }

    /// <summary>Set only for anonymously-authored photos.</summary>
    public string? SignatureEmailAddress { get; init; }

    public IReadOnlyList<TransferEncryptedPhotoPayload> RelatedPhotos { get; init; } = [];
}
