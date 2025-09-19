using Google.Protobuf;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal readonly unsafe struct ProgressUpdateCallback(nint progressCallbackPointer, nint callerState)
{
    private readonly delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, void> _progressCallback =
        (delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, void>)progressCallbackPointer;

    private readonly IntPtr _callerState = callerState;

    public void UpdateProgress(long completed, long total)
    {
        var progressUpdate = new ProgressUpdate
        {
            BytesCompleted = completed,
            BytesInTotal = total,
        };

        var messageBytes = InteropArray<byte>.FromMemory(progressUpdate.ToByteArray());

        try
        {
            _progressCallback(_callerState, messageBytes);
        }
        finally
        {
            messageBytes.Free();
        }
    }
}
