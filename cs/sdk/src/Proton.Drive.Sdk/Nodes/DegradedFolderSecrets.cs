namespace Proton.Drive.Sdk.Nodes;

internal sealed class DegradedFolderSecrets : DegradedNodeSecrets
{
    public required ReadOnlyMemory<byte>? HashKey { get; init; }
}
