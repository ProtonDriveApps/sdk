using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropCallbackExtensions
{
    public static unsafe void InvokeWithResponse<T>(this InteropValueCallback<InteropArray<byte>> callback, nint callerState, T response)
        where T : IMessage
    {
        var responseBytes = response.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            callback.Invoke(callerState, new InteropArray<byte>(responsePointer, responseBytes.Length));
        }
    }
}
