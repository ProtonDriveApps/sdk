namespace Proton.Drive.Sdk.Nodes;

internal sealed class FolderSecrets : NodeSecrets
{
    public required ReadOnlyMemory<byte> HashKey { get; init; }
}
