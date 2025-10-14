using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropActionExtensions
{
    public static unsafe void InvokeWithMessage<T>(this InteropAction<nint, InteropArray<byte>> action, nint bindingsHandle, T message)
        where T : IMessage
    {
        var responseBytes = message.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            action.Invoke(bindingsHandle, new InteropArray<byte>(responsePointer, responseBytes.Length));
        }
    }

    public static unsafe void InvokeWithMessage<T>(this InteropAction<nint, InteropArray<byte>, nint> action, nint bindingsHandle, T message, nint sdkHandle)
        where T : IMessage
    {
        var responseBytes = message.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            action.Invoke(bindingsHandle, new InteropArray<byte>(responsePointer, responseBytes.Length), sdkHandle);
        }
    }
}
