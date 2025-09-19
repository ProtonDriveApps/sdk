using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileUploader
{
    public static IMessage HandleUploadFromStream(UploadFromStreamRequest request, nint callerState)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var stream = new InteropStream(uploader.FileSize, callerState, (nint)request.ReadCallback);

        var thumbnails = request.Thumbnails.Select(t => new Nodes.Thumbnail((ThumbnailType)t.Type, t.ToByteArray()));

        var progressUpdateCallback = new ProgressUpdateCallback((nint)request.ProgressCallback, callerState);

        var uploadController = uploader.UploadFromStream(
            stream,
            thumbnails,
            (completed, total) => progressUpdateCallback.UpdateProgress(completed, total),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage? HandleFree(FileUploaderFreeRequest request)
    {
        Interop.FreeHandle<FileUploader>(request.FileUploaderHandle);

        return null;
    }
}
