using Google.Protobuf;
using Proton.Sdk.CExports.Tasks;

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

    public static unsafe nint InvokeWithMessage<T>(
        this InteropFunction<nint, InteropArray<byte>, nint, nint> function,
        nint bindingsHandle,
        T message,
        nint sdkHandle)
        where T : IMessage
    {
        var responseBytes = message.ToByteArray();

        fixed (byte* responsePointer = responseBytes)
        {
            return function.Invoke(bindingsHandle, new InteropArray<byte>(responsePointer, responseBytes.Length), sdkHandle);
        }
    }

    public static unsafe ValueTask<TResponse> SendRequestAsync<TResponse>(
        this InteropAction<nint, InteropArray<byte>, nint> interopAction,
        nint bindingsHandle,
        IMessage request)
        where TResponse : IMessage
    {
        var tcs = new ValueTaskCompletionSource<TResponse>();

        var tcsHandle = Interop.AllocHandle(tcs);

        var requestBytes = request.ToByteArray();

        fixed (byte* requestBytesPointer = requestBytes)
        {
            interopAction.Invoke(bindingsHandle, new InteropArray<byte>(requestBytesPointer, requestBytes.Length), (nint)tcsHandle);
        }

        return tcs.Task;
    }

    public static unsafe ValueTask<TResponse> InvokeWithBufferAsync<TResponse>(
        this InteropAction<nint, InteropArray<byte>, nint> interopAction,
        nint bindingsHandle,
        Span<byte> buffer)
    {
        var tcs = new ValueTaskCompletionSource<TResponse>();

        var tcsHandle = Interop.AllocHandle(tcs);

        fixed (byte* requestBytesPointer = buffer)
        {
            interopAction.Invoke(bindingsHandle, new InteropArray<byte>(requestBytesPointer, buffer.Length), (nint)tcsHandle);
        }

        return tcs.Task;
    }

    public static unsafe ValueTask InvokeWithBufferAsync(
        this InteropAction<nint, InteropArray<byte>, nint> interopAction,
        nint bindingsHandle,
        ReadOnlySpan<byte> buffer)
    {
        var tcs = new ValueTaskCompletionSource();

        var tcsHandle = Interop.AllocHandle(tcs);

        fixed (byte* requestBytesPointer = buffer)
        {
            interopAction.Invoke(bindingsHandle, new InteropArray<byte>(requestBytesPointer, buffer.Length), (nint)tcsHandle);
        }

        return tcs.Task;
    }
}
