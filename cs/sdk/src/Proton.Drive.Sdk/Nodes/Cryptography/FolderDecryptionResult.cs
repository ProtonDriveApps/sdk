using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal sealed class FolderDecryptionResult
{
    public required LinkDecryptionResult Link { get; init; }
    public required ValResult<DecryptionOutput<ReadOnlyMemory<byte>>, string?> HashKey { get; init; }
}
