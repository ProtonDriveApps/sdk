using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Links;

internal readonly struct FileProperties
{
    public required ReadOnlyMemory<byte> ContentKeyPacket { get; init; }

    public PgpArmoredSignature? ContentKeyPacketSignature { get; init; }

    public required RevisionDto? ActiveRevision { get; init; }
}
