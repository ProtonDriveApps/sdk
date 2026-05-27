namespace Proton.Drive.Sdk.Nodes;

internal sealed class FolderSecrets : NodeSecrets
{
    public ReadOnlyMemory<byte>? HashKey { get; init; }
}
