using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Google.Protobuf.WellKnownTypes;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;
using Request = Proton.Sdk.Drive.CExports.Request;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropMessageHandler
{
    [UnmanagedCallersOnly(EntryPoint = "proton_drive_sdk_handle_request", CallConvs = [typeof(CallConvCdecl)])]
    public static async void OnRequestReceived(InteropArray<byte> requestBytes, nint callerState, InteropValueCallback<InteropArray<byte>> responseCallback)
    {
        try
        {
            var request = Request.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            var response = request.PayloadCase switch
            {
                Request.PayloadOneofCase.DriveClientCreate
                    => InteropProtonDriveClient.HandleCreate(request.DriveClientCreate),

                Request.PayloadOneofCase.DriveClientFree
                    => InteropProtonDriveClient.HandleFree(request.DriveClientFree),

                Request.PayloadOneofCase.DriveClientGetFileUploader
                    => await InteropProtonDriveClient.HandleGetFileUploaderAsync(request.DriveClientGetFileUploader).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetFileRevisionUploader
                    => await InteropProtonDriveClient.HandleGetFileRevisionUploaderAsync(request.DriveClientGetFileRevisionUploader).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetFileDownloader
                    => await InteropProtonDriveClient.HandleGetFileDownloaderAsync(request.DriveClientGetFileDownloader).ConfigureAwait(false),

                Request.PayloadOneofCase.UploadFromStream
                    => InteropFileUploader.HandleUploadFromStream(request.UploadFromStream, callerState),

                Request.PayloadOneofCase.FileUploaderFree
                    => InteropFileUploader.HandleFree(request.FileUploaderFree),

                Request.PayloadOneofCase.UploadControllerAwaitCompletion
                    => await InteropUploadController.HandleAwaitCompletion(request.UploadControllerAwaitCompletion).ConfigureAwait(false),

                Request.PayloadOneofCase.UploadControllerPause
                    => InteropUploadController.HandlePause(request.UploadControllerPause),

                Request.PayloadOneofCase.UploadControllerResume
                    => InteropUploadController.HandleResume(request.UploadControllerResume),

                Request.PayloadOneofCase.UploadControllerFree
                    => InteropUploadController.HandleFree(request.UploadControllerFree),

                Request.PayloadOneofCase.DownloadToStream
                    => InteropFileDownloader.HandleDownloadToStream(request.DownloadToStream, callerState),

                Request.PayloadOneofCase.FileDownloaderFree
                    => InteropFileDownloader.HandleFree(request.FileDownloaderFree),

                Request.PayloadOneofCase.DownloadControllerAwaitCompletion
                    => await InteropDownloadController.HandleAwaitCompletion(request.DownloadControllerAwaitCompletion).ConfigureAwait(false),

                Request.PayloadOneofCase.DownloadControllerPause
                    => InteropDownloadController.HandlePause(request.DownloadControllerPause),

                Request.PayloadOneofCase.DownloadControllerResume
                    => InteropDownloadController.HandleResume(request.DownloadControllerResume),

                Request.PayloadOneofCase.DownloadControllerFree
                    => InteropDownloadController.HandleFree(request.DownloadControllerFree),

                Request.PayloadOneofCase.None or _
                    => throw new ArgumentException($"Unknown request type: {request.PayloadCase}", nameof(requestBytes)),
            };

            responseCallback.InvokeWithResponse(callerState, response is not null ? new Response { Value = Any.Pack(response) } : new Response());
        }
        catch (Exception e)
        {
            var error = e.ToErrorMessage(InteropErrorConverter.SetDomainAndCodes);

            responseCallback.InvokeWithResponse(callerState, new Response { Error = error });
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "proton_drive_sdk_handle_response", CallConvs = [typeof(CallConvCdecl)])]
    public static void OnResponseReceived(nint state, InteropArray<byte> responseBytes)
    {
        var response = CallbackResponse.Parser.ParseFrom(responseBytes.AsReadOnlySpan());

        switch (response.PayloadCase)
        {
            case CallbackResponse.PayloadOneofCase.StreamRead:
                InteropStream.HandleReadResponse(state, response.StreamRead);
                break;

            case CallbackResponse.PayloadOneofCase.StreamWrite:
                InteropStream.HandleWriteResponse(state, response.StreamWrite);
                break;

            case CallbackResponse.PayloadOneofCase.None:
            default:
                throw new ArgumentException($"Unknown request type: {response.PayloadCase}", nameof(responseBytes));
        }
    }
}
