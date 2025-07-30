using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;
using RevisionUid = Proton.Drive.Sdk.Nodes.RevisionUid;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileDownloader
{
    private static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out FileDownloader fileDownloader)
    {
        if (handle == 0)
        {
            fileDownloader = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        fileDownloader = gcHandle.Target as FileDownloader;

        return fileDownloader is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "get_file_downloader", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeGetFileDownloader(
        nint clientHandle,
        InteropArray<byte> requestBytes,
        void* callerState,
        InteropAsyncValueCallback<nint> resultCallback)
    {
        try
        {
            if (!InteropProtonDriveClient.TryGetFromHandle(clientHandle, out var client))
            {
                return -1;
            }

            return resultCallback.InvokeFor(callerState, ct => InteropGetFileDownloaderAsync(client, requestBytes, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "download_to_stream", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe nint NativeDownloadToStream(
        nint fileDownloaderHandle,
        void* callerState,
        InteropWriteCallback writeCallback,
        InteropValueCallback<InteropArray<byte>> progressCallback,
        nint cancellationTokenSourceHandle)
    {
        try
        {
            if (!TryGetFromHandle(fileDownloaderHandle, out var downloader))
            {
                return -1;
            }

            if (!InteropCancellationTokenSource.TryGetTokenFromHandle(cancellationTokenSourceHandle, out var cancellationToken))
            {
                return -1;
            }

            var stream = new InteropStream(callerState, writeCallback);

            var downloadController = downloader.DownloadToStream(
                stream,
                (completed, total) => progressCallback.UpdateProgress(completed, total),
                cancellationToken);

            return GCHandle.ToIntPtr(GCHandle.Alloc(downloadController));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "file_downloader_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint fileDownloaderHandle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(fileDownloaderHandle);

            if (gcHandle.Target is not FileDownloader fileDownloader)
            {
                return;
            }

            try
            {
                fileDownloader.Dispose();
            }
            finally
            {
                gcHandle.Free();
            }
        }
        catch
        {
            // Ignore
        }
    }

    private static async ValueTask<Result<nint, InteropArray<byte>>> InteropGetFileDownloaderAsync(
        ProtonDriveClient client,
        InteropArray<byte> requestBytes,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = FileDownloaderProvisionRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            if (!RevisionUid.TryParse(request.RevisionUid, out var revisionUid))
            {
                throw new ArgumentException($"Invalid revision UID {revisionUid}", nameof(requestBytes));
            }

            var downloader = await client.GetFileDownloaderAsync(revisionUid.Value, cancellationToken).ConfigureAwait(false);

            return GCHandle.ToIntPtr(GCHandle.Alloc(downloader));
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure<nint>(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }
}
