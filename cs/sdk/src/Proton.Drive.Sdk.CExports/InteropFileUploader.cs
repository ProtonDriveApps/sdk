using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using DotNext.Buffers;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;

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

    [UnmanagedCallersOnly(EntryPoint = "upload_from_stream", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe nint NativeUploadFromStream(
        nint fileUploaderHandle,
        InteropArray<InteropThumbnail> interopThumbnails,
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

            var stream = new InteropStream(uploader.FileSize, callerState, readCallback);

            var thumbnails = GetThumbnailsFromInteropArray(interopThumbnails);

            var uploadController = uploader.UploadFromStream(
                stream,
                thumbnails,
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

    private static unsafe Thumbnail[] GetThumbnailsFromInteropArray(InteropArray<InteropThumbnail> interopThumbnails)
    {
        var thumbnails = new Thumbnail[interopThumbnails.Length];
        var interopThumbnailsSpan = interopThumbnails.AsReadOnlySpan();

        for (var i = 0; i < thumbnails.Length; ++i)
        {
            var interopThumbnail = interopThumbnailsSpan[i];
            var thumbnailContent = UnmanagedMemory.AsMemory(interopThumbnail.Content.Pointer, (int)interopThumbnail.Content.Length);
            thumbnails[i] = new Thumbnail(interopThumbnail.Type, thumbnailContent);
        }

        return thumbnails;
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct InteropThumbnail
    {
        public readonly ThumbnailType Type;
        public readonly InteropArray<byte> Content;
    }
}
