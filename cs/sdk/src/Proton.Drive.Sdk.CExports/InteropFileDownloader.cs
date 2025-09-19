using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileDownloader
{
    public static IMessage HandleDownloadToStream(DownloadToStreamRequest request, nint callerState)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var downloader = Interop.GetFromHandle<FileDownloader>(request.DownloaderHandle);

        var stream = new InteropStream(callerState, (nint)request.WriteCallback);

        var progressUpdateCallback = new ProgressUpdateCallback((nint)request.ProgressCallback, callerState);

        var downloadController = downloader.DownloadToStream(stream, progressUpdateCallback.UpdateProgress, cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(downloadController) };
    }

    public static IMessage? HandleFree(FileDownloaderFreeRequest request)
    {
        Interop.FreeHandle<FileDownloader>(request.FileDownloaderHandle);

        return null;
    }
}
