using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropActionExtensions
{
    public static unsafe void InvokeWithMessage<T>(this InteropAction<nint, InteropArray<byte>> action, nint state, T message)
        where T : IMessage
    {
        var responseBytes = message.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            action.Invoke(state, new InteropArray<byte>(responsePointer, responseBytes.Length));
        }
    }

    public static unsafe void InvokeWithMessage<T>(this InteropAction<nint, InteropArray<byte>, nint> action, nint state, T message, nint callerState)
        where T : IMessage
    {
        var responseBytes = message.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            action.Invoke(state, new InteropArray<byte>(responsePointer, responseBytes.Length), callerState);
        }
    }
}
