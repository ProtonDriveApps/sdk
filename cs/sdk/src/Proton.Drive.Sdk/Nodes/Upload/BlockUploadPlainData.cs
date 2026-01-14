using System.Buffers;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct BlockUploadPlainData(Stream Stream, byte[] PrefixForVerification) : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        ArrayPool<byte>.Shared.Return(PrefixForVerification);
        await Stream.DisposeAsync().ConfigureAwait(false);
    }
}
