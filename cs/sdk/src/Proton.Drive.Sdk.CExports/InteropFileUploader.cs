using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropFileUploader
{
    public static IMessage HandleUploadFromStream(UploadFromStreamRequest request, nint callerState)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var uploader = Interop.GetFromHandle<FileUploader>(request.UploaderHandle);

        var stream = new InteropStream(uploader.FileSize, callerState, new InteropAction<nint, InteropArray<byte>, nint>(request.ReadAction));

        var thumbnails = request.Thumbnails.Select(t => new Nodes.Thumbnail((ThumbnailType)t.Type, t.ToByteArray()));

        var progressAction = new InteropAction<nint, InteropArray<byte>>(request.ProgressAction);

        var uploadController = uploader.UploadFromStream(
            stream,
            thumbnails,
            (completed, total) => progressAction.InvokeProgressUpdate(callerState, total, completed),
            cancellationToken);

        return new Int64Value { Value = Interop.AllocHandle(uploadController) };
    }

    public static IMessage? HandleFree(FileUploaderFreeRequest request)
    {
        Interop.FreeHandle<FileUploader>(request.FileUploaderHandle);

        return null;
    }
}
