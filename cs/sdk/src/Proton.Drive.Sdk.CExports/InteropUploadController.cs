using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropUploadController
{
    public static IMessage HandleIsPaused(UploadControllerIsPausedRequest request)
    {
        var uploadController = Interop.GetFromHandle<UploadController>(request.UploadControllerHandle);

        return new BoolValue { Value = uploadController.IsPaused };
    }

    public static async ValueTask<IMessage?> HandleAwaitCompletion(UploadControllerAwaitCompletionRequest request)
    {
        var uploadController = Interop.GetFromHandle<UploadController>(request.UploadControllerHandle);

        var (nodeUid, revisionUid) = await uploadController.Completion.ConfigureAwait(false);

        return new UploadResult { NodeUid = nodeUid.ToString(), RevisionUid = revisionUid.ToString() };
    }

    public static IMessage? HandlePause(UploadControllerPauseRequest request)
    {
        var uploadController = Interop.GetFromHandle<UploadController>(request.UploadControllerHandle);

        uploadController.Pause();

        return null;
    }

    public static IMessage? HandleResume(UploadControllerResumeRequest request)
    {
        var uploadController = Interop.GetFromHandle<UploadController>(request.UploadControllerHandle);

        uploadController.Resume();

        return null;
    }

    public static IMessage? HandleFree(UploadControllerFreeRequest request)
    {
        Interop.FreeHandle<UploadController>(request.UploadControllerHandle);

        return null;
    }
}
