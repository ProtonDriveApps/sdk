using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileDownloader
{
    public static IMessage HandleDownloadToStream(DownloadToStreamRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<FileDownloader>(request.DownloaderHandle);

        var stream = new InteropStream(bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.WriteAction));

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var downloadController = downloader.DownloadToStream(
            stream,
            (completed, total) => progressAction.InvokeProgressUpdate(bindingsHandle, total, completed),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage HandleDownloadToFile(DownloadToFileRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<FileDownloader>(request.DownloaderHandle);

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var downloadController = downloader.DownloadToFile(
            request.FilePath,
            (completed, total) => progressAction.InvokeProgressUpdate(bindingsHandle, total, completed),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage? HandleFree(FileDownloaderFreeRequest request)
    {
        var fileDownloader = Interop.FreeHandle<FileDownloader>(request.FileDownloaderHandle);

        fileDownloader.Dispose();

        return null;
    }
}
