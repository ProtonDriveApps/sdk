using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropDownloadController
{
    public static IMessage HandleIsPaused(DownloadControllerIsPausedRequest request)
    {
        var downloadController = Interop.GetFromHandle<DownloadController>(request.DownloadControllerHandle);

        return new BoolValue { Value = downloadController.IsPaused };
    }

    public static async ValueTask<IMessage?> HandleAwaitCompletion(DownloadControllerAwaitCompletionRequest request)
    {
        var downloadController = Interop.GetFromHandle<DownloadController>(request.DownloadControllerHandle);

        await downloadController.Completion.ConfigureAwait(false);

        return null;
    }

    public static IMessage? HandlePause(DownloadControllerPauseRequest request)
    {
        var downloadController = Interop.GetFromHandle<DownloadController>(request.DownloadControllerHandle);

        downloadController.Pause();

        return null;
    }

    public static IMessage? HandleResume(DownloadControllerResumeRequest request)
    {
        var downloadController = Interop.GetFromHandle<DownloadController>(request.DownloadControllerHandle);

        downloadController.Resume();

        return null;
    }

    public static IMessage? HandleIsDownloadCompleteWithVerificationIssue(DownloadControllerIsDownloadCompleteWithVerificationIssueRequest request)
    {
        var downloadController = Interop.GetFromHandle<DownloadController>(request.DownloadControllerHandle);

        return new BoolValue { Value = downloadController.GetIsDownloadCompleteWithVerificationIssue() };
    }

    public static async ValueTask<IMessage?> HandleFree(DownloadControllerFreeRequest request)
    {
        var downloadController = Interop.FreeHandle<DownloadController>(request.DownloadControllerHandle);

        await downloadController.DisposeAsync().ConfigureAwait(false);

        return null;
    }
}
