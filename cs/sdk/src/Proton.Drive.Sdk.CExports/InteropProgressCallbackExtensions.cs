using Google.Protobuf;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProgressCallbackExtensions
{
    internal static unsafe void UpdateProgress(this InteropValueCallback<InteropArray<byte>> progressCallback, long completed, long total)
    {
        var progressUpdate = new ProgressUpdate
        {
            BytesCompleted = completed,
            BytesInTotal = total,
        };

        var messageBytes = InteropArray<byte>.FromMemory(progressUpdate.ToByteArray());

        try
        {
            progressCallback.Invoke(progressCallback.Invoke, messageBytes);
        }
        finally
        {
            messageBytes.Free();
        }
    }
}
