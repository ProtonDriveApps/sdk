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

        var readFunction = new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.ReadAction);
        var cancelAction = request.CancelAction != 0 ? new InteropAction<nint>(request.CancelAction) : (InteropAction<nint>?)null;
        var stream = new InteropStream(uploader.FileSize, bindingsHandle, readFunction, cancelAction);

        var thumbnails = request.Thumbnails.Select(t =>
        {
            unsafe
            {
                var thumbnailType = (Proton.Drive.Sdk.Nodes.ThumbnailType)t.Type;
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.DataPointer, (nint)t.DataLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var uploadController = uploader.UploadFromStream(
            stream,
            thumbnails,
            (progress, total) => progressAction.InvokeProgressUpdate(bindingsHandle, progress, total),
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
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.DataPointer, (nint)t.DataLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var uploadController = uploader.UploadFromFile(
            request.FilePath,
            thumbnails,
            (progress, total) => progressAction.InvokeProgressUpdate(bindingsHandle, progress, total),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage? HandleFree(FileUploaderFreeRequest request)
    {
        var fileUploader = Interop.FreeHandle<FileUploader>(request.FileUploaderHandle);

        fileUploader.Dispose();

        return null;
    }
}
