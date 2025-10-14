using Google.Protobuf;
using Proton.Sdk.CExports;
using Proton.Sdk.CExports.Tasks;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropActionExtensions
{
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

    public static unsafe void InvokeProgressUpdate(this InteropAction<nint, InteropArray<byte>> interopAction, nint bindingsHandle, long total, long completed)
    {
        var progressUpdate = new ProgressUpdate
        {
            BytesCompleted = completed,
            BytesInTotal = total,
        };

        var requestBytes = progressUpdate.ToByteArray();

        fixed (byte* requestBytesPointer = requestBytes)
        {
            interopAction.Invoke(bindingsHandle, new InteropArray<byte>(requestBytesPointer, requestBytes.Length));
        }
    }
}
