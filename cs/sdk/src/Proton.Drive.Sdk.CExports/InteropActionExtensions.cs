using Google.Protobuf;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropActionExtensions
{
    public static unsafe void InvokeProgressUpdate(this InteropAction<nint, InteropArray<byte>> interopAction, nint bindingsHandle, long progress, long total)
    {
        var progressUpdate = new ProgressUpdate
        {
            BytesCompleted = progress,
            BytesInTotal = total,
        };

        var requestBytes = progressUpdate.ToByteArray();

        fixed (byte* requestBytesPointer = requestBytes)
        {
            interopAction.Invoke(bindingsHandle, new InteropArray<byte>(requestBytesPointer, requestBytes.Length));
        }
    }
}
