using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Google.Protobuf.WellKnownTypes;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropMessageHandler
{
    [UnmanagedCallersOnly(EntryPoint = "proton_drive_sdk_handle_request", CallConvs = [typeof(CallConvCdecl)])]
    public static async void OnRequestReceived(InteropArray<byte> requestBytes, nint bindingsHandle, InteropAction<nint, InteropArray<byte>> responseAction)
    {
        try
        {
            var request = Request.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            var response = request.PayloadCase switch
            {
                Request.PayloadOneofCase.DriveClientCreate
                    => InteropProtonDriveClient.HandleCreate(request.DriveClientCreate, bindingsHandle),

                Request.PayloadOneofCase.DriveClientCreateFromSession
                    => InteropProtonDriveClient.HandleCreate(request.DriveClientCreateFromSession),

                Request.PayloadOneofCase.DriveClientFree
                    => InteropProtonDriveClient.HandleFree(request.DriveClientFree),

                Request.PayloadOneofCase.DriveClientGetFileUploader
                    => await InteropProtonDriveClient.HandleGetFileUploaderAsync(request.DriveClientGetFileUploader).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetFileRevisionUploader
                    => await InteropProtonDriveClient.HandleGetFileRevisionUploaderAsync(request.DriveClientGetFileRevisionUploader).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetFileDownloader
                    => await InteropProtonDriveClient.HandleGetFileDownloaderAsync(request.DriveClientGetFileDownloader).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetAvailableName
                    => await InteropProtonDriveClient.HandleGetAvailableNameAsync(request.DriveClientGetAvailableName).ConfigureAwait(false),

                Request.PayloadOneofCase.DriveClientGetThumbnails
                    => await InteropProtonDriveClient.HandleGetThumbnailsAsync(request.DriveClientGetThumbnails).ConfigureAwait(false),

                Request.PayloadOneofCase.UploadFromStream
                    => InteropFileUploader.HandleUploadFromStream(request.UploadFromStream, bindingsHandle),

                Request.PayloadOneofCase.UploadFromFile
                    => InteropFileUploader.HandleUploadFromFile(request.UploadFromFile, bindingsHandle),

                Request.PayloadOneofCase.FileUploaderFree
                    => InteropFileUploader.HandleFree(request.FileUploaderFree),

                Request.PayloadOneofCase.UploadControllerIsPaused
                    => InteropUploadController.HandleIsPaused(request.UploadControllerIsPaused),

                Request.PayloadOneofCase.UploadControllerAwaitCompletion
                    => await InteropUploadController.HandleAwaitCompletion(request.UploadControllerAwaitCompletion).ConfigureAwait(false),

                Request.PayloadOneofCase.UploadControllerPause
                    => InteropUploadController.HandlePause(request.UploadControllerPause),

                Request.PayloadOneofCase.UploadControllerResume
                    => InteropUploadController.HandleResume(request.UploadControllerResume),

                Request.PayloadOneofCase.UploadControllerFree
                    => InteropUploadController.HandleFree(request.UploadControllerFree),

                Request.PayloadOneofCase.DownloadToStream
                    => InteropFileDownloader.HandleDownloadToStream(request.DownloadToStream, bindingsHandle),

                Request.PayloadOneofCase.DownloadToFile
                    => InteropFileDownloader.HandleDownloadToFile(request.DownloadToFile, bindingsHandle),

                Request.PayloadOneofCase.FileDownloaderFree
                    => InteropFileDownloader.HandleFree(request.FileDownloaderFree),

                Request.PayloadOneofCase.DownloadControllerIsPaused
                    => InteropDownloadController.HandleIsPaused(request.DownloadControllerIsPaused),

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

            responseAction.InvokeWithMessage(bindingsHandle, response is not null ? new Response { Value = Any.Pack(response) } : new Response());
        }
        catch (Exception e)
        {
            var error = e.ToErrorMessage(InteropDriveErrorConverter.SetDomainAndCodes);

            responseAction.InvokeWithMessage(bindingsHandle, new Response { Error = error });
        }
    }
}
