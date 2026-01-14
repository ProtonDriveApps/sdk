using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Photos.Sdk.Nodes;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropPhotosDownloader
{
    public static IMessage HandleDownloadToStream(DrivePhotosClientDownloadToStreamRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<PhotosDownloader>(request.DownloaderHandle);

        var stream = new InteropStream(bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.WriteAction));

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var downloadController = downloader.DownloadToStream(
            stream,
            (bytesCompleted, bytesInTotal) => progressAction.InvokeProgressUpdate(bindingsHandle, bytesCompleted, bytesInTotal),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage HandleDownloadToFile(DrivePhotosClientDownloadToFileRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<PhotosDownloader>(request.DownloaderHandle);

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var downloadController = downloader.DownloadToFile(
            request.FilePath,
            (bytesCompleted, bytesInTotal) => progressAction.InvokeProgressUpdate(bindingsHandle, bytesCompleted, bytesInTotal),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage? HandleFree(DrivePhotosClientDownloaderFreeRequest request)
    {
        var fileDownloader = Interop.FreeHandle<PhotosDownloader>(request.FileDownloaderHandle);

        fileDownloader.Dispose();

        return null;
    }
}
