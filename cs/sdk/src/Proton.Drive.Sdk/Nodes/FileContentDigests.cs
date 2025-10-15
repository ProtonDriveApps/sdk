namespace Proton.Drive.Sdk.Nodes;

public readonly struct FileContentDigests
{
    public ReadOnlyMemory<byte>? Sha1 { get; init; }
}
