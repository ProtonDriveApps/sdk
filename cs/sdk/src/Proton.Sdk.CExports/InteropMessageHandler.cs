using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Google.Protobuf.Reflection;
using Google.Protobuf.WellKnownTypes;
using Proton.Sdk.CExports.Logging;
using Proton.Sdk.CExports.Tasks;

namespace Proton.Sdk.CExports;

internal static class InteropMessageHandler
{
    private static readonly TypeRegistry ResponseTypeRegistry = TypeRegistry.FromMessages(
        Int32Value.Descriptor,
        Int64Value.Descriptor,
        StringValue.Descriptor,
        BytesValue.Descriptor,
        RepeatedBytesValue.Descriptor,
        Address.Descriptor);

    [UnmanagedCallersOnly(EntryPoint = "proton_sdk_handle_request", CallConvs = [typeof(CallConvCdecl)])]
    public static async void OnRequestReceived(InteropArray<byte> requestBytes, nint bindingsHandle, InteropAction<nint, InteropArray<byte>> responseAction)
    {
        try
        {
            var request = Request.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            var response = request.PayloadCase switch
            {
                Request.PayloadOneofCase.CancellationTokenSourceCreate
                    => InteropCancellationTokenSource.HandleCreate(request.CancellationTokenSourceCreate),

                Request.PayloadOneofCase.CancellationTokenSourceCancel
                    => InteropCancellationTokenSource.HandleCancel(request.CancellationTokenSourceCancel),

                Request.PayloadOneofCase.CancellationTokenSourceFree
                    => InteropCancellationTokenSource.HandleFree(request.CancellationTokenSourceFree),

                Request.PayloadOneofCase.StreamRead
                    => await InteropStream.HandleReadAsync(request.StreamRead).ConfigureAwait(false),

                Request.PayloadOneofCase.SessionBegin
                    => await ProtonApiSessionRequestHandler.HandleBeginAsync(request.SessionBegin, bindingsHandle).ConfigureAwait(false),

                Request.PayloadOneofCase.SessionResume
                    => ProtonApiSessionRequestHandler.HandleResume(request.SessionResume, bindingsHandle),

                Request.PayloadOneofCase.SessionRenew
                    => ProtonApiSessionRequestHandler.HandleRenew(request.SessionRenew),

                Request.PayloadOneofCase.SessionEnd
                    => await ProtonApiSessionRequestHandler.HandleEndAsync(request.SessionEnd).ConfigureAwait(false),

                Request.PayloadOneofCase.SessionFree
                    => ProtonApiSessionRequestHandler.HandleFree(request.SessionFree),

                Request.PayloadOneofCase.SessionTokensRefreshedSubscribe
                    => ProtonApiSessionRequestHandler.HandleSubscribeToTokensRefreshed(request.SessionTokensRefreshedSubscribe, bindingsHandle),

                Request.PayloadOneofCase.SessionTokensRefreshedUnsubscribe
                    => ProtonApiSessionRequestHandler.HandleUnsubscribeFromTokensRefreshed(request.SessionTokensRefreshedUnsubscribe),

                Request.PayloadOneofCase.LoggerProviderCreate
                    => InteropLoggerProvider.HandleCreate(request.LoggerProviderCreate, bindingsHandle),

                Request.PayloadOneofCase.None or _
                    => throw new ArgumentException($"Unknown request type: {request.PayloadCase}", nameof(requestBytes)),
            };

            var responseMessage = response switch
            {
                null => new Response(),
                Empty => throw new InvalidOperationException("Use null instead of Empty"),
                _ => new Response { Value = Any.Pack(response) },
            };

            responseAction.InvokeWithMessage(bindingsHandle, responseMessage);
        }
        catch (Exception e)
        {
            var error = e.ToErrorMessage(InteropErrorConverter.SetDomainAndCodes);

            responseAction.InvokeWithMessage(bindingsHandle, new Response { Error = error });
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "proton_sdk_handle_response", CallConvs = [typeof(CallConvCdecl)])]
    public static void OnResponseReceived(nint sdkHandle, InteropArray<byte> responseBytes)
    {
        var response = Response.Parser.ParseFrom(responseBytes.AsReadOnlySpan());

        if (response.Error is not null)
        {
            SetException(sdkHandle, response.Error);
            return;
        }

        if (response.Value is null)
        {
            SetResult(sdkHandle);
            return;
        }

        var responseValue = response.Value.Unpack(ResponseTypeRegistry);

        switch (responseValue)
        {
            case Int32Value value:
                SetResult(sdkHandle, value);
                break;

            case Int64Value value:
                SetResult(sdkHandle, value);
                break;

            case StringValue value:
                SetResult(sdkHandle, value);
                break;

            case BytesValue value:
                SetResult(sdkHandle, value);
                break;

            case RepeatedBytesValue value:
                SetResult(sdkHandle, value);
                break;

            case Address value:
                SetResult(sdkHandle, value);
                break;

            case HttpResponse value:
                SetResult(sdkHandle, value);
                break;

            default:
                throw new ArgumentException($"Unknown response value type: {responseValue.Descriptor.Name}", nameof(responseBytes));
        }
    }

    private static void SetResult<T>(nint tcsHandle, T value)
    {
        var tcs = Interop.GetFromHandleAndFree<ValueTaskCompletionSource<T>>(tcsHandle);

        tcs.SetResult(value);
    }

    private static void SetResult(nint tcsHandle)
    {
        var tcs = Interop.GetFromHandleAndFree<ValueTaskCompletionSource>(tcsHandle);

        tcs.SetResult();
    }

    private static void SetException(nint tcsHandle, Error error)
    {
        var tfs = Interop.GetFromHandleAndFree<IValueTaskFaultingSource>(tcsHandle);

        if (error.Domain == ErrorDomain.SuccessfulCancellation)
        {
            tfs.SetException(new OperationCanceledException());
        }
        else
        {
            tfs.SetException(new InteropErrorException(error));
        }
    }
}
