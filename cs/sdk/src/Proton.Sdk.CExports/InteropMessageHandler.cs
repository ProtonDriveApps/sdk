using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Google.Protobuf.WellKnownTypes;
using Proton.Sdk.CExports.Logging;

namespace Proton.Sdk.CExports;

internal static class InteropMessageHandler
{
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

            responseAction.InvokeWithMessage(bindingsHandle, response is not null ? new Response { Value = Any.Pack(response) } : new Response());
        }
        catch (Exception e)
        {
            var error = e.ToErrorMessage(InteropErrorConverter.SetDomainAndCodes);

            responseAction.InvokeWithMessage(bindingsHandle, new Response { Error = error });
        }
    }
}
