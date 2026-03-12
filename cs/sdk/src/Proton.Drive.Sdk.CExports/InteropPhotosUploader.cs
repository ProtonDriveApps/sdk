using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropPhotosUploader
{
    public static IMessage HandleUploadFromStream(DrivePhotosClientUploadFromStreamRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var stream = new InteropStream(uploader.FileSize, bindingsHandle, new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.ReadAction));

        var thumbnails = request.Thumbnails.Select(t =>
        {
            unsafe
            {
                var thumbnailType = (Nodes.ThumbnailType)t.Type;
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.DataPointer, (nint)t.DataLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var expectedSha1Provider = request.HasSha1Function ?
            InteropFileUploader.CreateSha1Provider(bindingsHandle, request.Sha1Function) : null;

        var uploadController = uploader.UploadFromStream(
            stream,
            thumbnails,
            (progress, total) => progressAction.InvokeProgressUpdate(bindingsHandle, progress, total),
            expectedSha1Provider,
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage HandleUploadFromFile(DrivePhotosClientUploadFromFileRequest request, nint bindingsHandle)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var thumbnails = request.Thumbnails.Select(t =>
        {
            unsafe
            {
                var thumbnailType = (Nodes.ThumbnailType)t.Type;
                return new Nodes.Thumbnail(thumbnailType, new InteropArray<byte>((byte*)t.DataPointer, (nint)t.DataLength).ToArray());
            }
        });

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);
        var expectedSha1Provider = request.HasSha1Function ?
            InteropFileUploader.CreateSha1Provider(bindingsHandle, request.Sha1Function) : null;

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var uploadController = uploader.UploadFromFile(
            request.FilePath,
            thumbnails,
            (progress, total) => progressAction.InvokeProgressUpdate(bindingsHandle, progress, total),
            expectedSha1Provider,
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage? HandleFree(DrivePhotosClientUploaderFreeRequest request)
    {
        var fileUploader = Interop.FreeHandle<FileUploader>(request.FileUploaderHandle);

        fileUploader.Dispose();

        return null;
    }
}
