using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileUploader
{
    public static IMessage HandleUploadFromStream(UploadFromStreamRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var stream = new InteropStream(uploader.FileSize, bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.ReadAction));

        var thumbnails = request.Thumbnails.Select(t =>
        {
            unsafe
            {
                var thumbnailType = (Proton.Drive.Sdk.Nodes.ThumbnailType)t.Type;
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.ContentPointer, (nint)t.ContentLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var uploadController = uploader.UploadFromStream(
            stream,
            thumbnails,
            (completed, total) => progressAction.InvokeProgressUpdate(bindingsHandle, total, completed),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage HandleUploadFromFile(UploadFromFileRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var thumbnails = request.Thumbnails.Select(t =>
        {
            unsafe
            {
                var thumbnailType = (Proton.Drive.Sdk.Nodes.ThumbnailType)t.Type;
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.ContentPointer, (nint)t.ContentLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var uploadController = uploader.UploadFromFile(
            request.FilePath,
            thumbnails,
            (completed, total) => progressAction.InvokeProgressUpdate(bindingsHandle, total, completed),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage? HandleFree(FileUploaderFreeRequest request)
    {
        Interop.FreeHandle<FileUploader>(request.FileUploaderHandle);

        return null;
    }
}
