using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropPhotosDownloader
{
    public static IMessage HandleDownloadToStream(DrivePhotosClientDownloadToStreamRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<PhotosFileDownloader>(request.DownloaderHandle);

        var writeFunction = new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.WriteAction);

        var seekAction = request.SeekAction != 0
            ? new InteropAction<nint, InteropArray<byte>, nint>(request.SeekAction)
            : (InteropAction<nint, InteropArray<byte>, nint>?)null;

        var cancelAction = request.CancelAction != 0 ? new InteropAction<nint>(request.CancelAction) : (InteropAction<nint>?)null;
        var stream = new InteropStream(bindingsHandle, writeFunction, seekAction, cancelAction);

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

        var downloader = Interop.GetFromHandle<PhotosFileDownloader>(request.DownloaderHandle);

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var downloadController = downloader.DownloadToFile(
            request.FilePath,
            (bytesCompleted, bytesInTotal) => progressAction.InvokeProgressUpdate(bindingsHandle, bytesCompleted, bytesInTotal),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage? HandleFree(DrivePhotosClientDownloaderFreeRequest request)
    {
        var fileDownloader = Interop.FreeHandle<PhotosFileDownloader>(request.FileDownloaderHandle);

        fileDownloader.Dispose();

        return null;
    }
}
