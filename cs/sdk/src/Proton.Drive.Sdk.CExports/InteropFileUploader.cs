using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileUploader
{
    private static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out FileUploader uploader)
    {
        if (handle == 0)
        {
            uploader = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        uploader = gcHandle.Target as FileUploader;

        return uploader is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "get_file_uploader", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeCreate(
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

            return resultCallback.InvokeFor(callerState, ct => InteropGetFileUploaderAsync(client, requestBytes, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "upload_from_stream", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe nint NativeUploadFromStream(
        nint fileUploaderHandle,
        InteropArray<byte> requestBytes,
        void* callerState,
        InteropReadCallback readCallback,
        InteropValueCallback<InteropArray<byte>> progressCallback,
        nint cancellationTokenSourceHandle)
    {
        try
        {
            if (!TryGetFromHandle(fileUploaderHandle, out var uploader))
            {
                return -1;
            }

            if (!InteropCancellationTokenSource.TryGetTokenFromHandle(cancellationTokenSourceHandle, out var cancellationToken))
            {
                return -1;
            }

            var request = FileUploadRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            if (!NodeUid.TryParse(request.ParentFolderUid, out var parentUid))
            {
                return -1;
            }

            var stream = new InteropStream(uploader.FileSize, callerState, readCallback);

            var uploadController = uploader.UploadFromStream(
                parentUid.Value,
                stream,
                request.HasThumbnail ? [new Thumbnail(ThumbnailType.Thumbnail, request.Thumbnail.ToByteArray())] : [],
                request.CreateNewRevisionIfExists,
                (completed, total) => progressCallback.UpdateProgress(callerState, completed, total),
                cancellationToken);

            return GCHandle.ToIntPtr(GCHandle.Alloc(uploadController));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "file_uploader_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint fileUploaderHandle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(fileUploaderHandle);

            if (gcHandle.Target is not FileUploader fileUploader)
            {
                return;
            }

            try
            {
                fileUploader.Dispose();
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

    private static async ValueTask<Result<nint, InteropArray<byte>>> InteropGetFileUploaderAsync(
        ProtonDriveClient client,
        InteropArray<byte> requestBytes,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = FileUploaderProvisionRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            var uploader = await client.GetFileUploaderAsync(
                request.Name,
                request.MediaType,
                DateTimeOffset.FromUnixTimeSeconds(request.LastModificationDate).DateTime,
                request.FileSize,
                cancellationToken).ConfigureAwait(false);

            return GCHandle.ToIntPtr(GCHandle.Alloc(uploader));
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure<nint>(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }
}
