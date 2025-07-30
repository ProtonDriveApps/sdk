using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Sdk;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropDownloadController
{
    private static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out DownloadController downloadController)
    {
        if (handle == 0)
        {
            downloadController = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        downloadController = gcHandle.Target as DownloadController;

        return downloadController is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "download_controller_set_completion_callback", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeDownloadToStream(nint downloadControllerHandle, void* callerState, InteropAsyncVoidCallback asyncCallback)
    {
        try
        {
            if (!TryGetFromHandle(downloadControllerHandle, out var downloadController))
            {
                return -1;
            }

            return asyncCallback.InvokeFor(callerState, _ => InteropGetCompletion(downloadController));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "download_controller_pause", CallConvs = [typeof(CallConvCdecl)])]
    private static int NativePause(nint downloadControllerHandle)
    {
        try
        {
            if (!TryGetFromHandle(downloadControllerHandle, out var downloadController))
            {
                return -1;
            }

            downloadController.Pause();

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "download_controller_resume", CallConvs = [typeof(CallConvCdecl)])]
    private static int NativeResume(nint downloadControllerHandle)
    {
        try
        {
            if (!TryGetFromHandle(downloadControllerHandle, out var downloadController))
            {
                return -1;
            }

            downloadController.Resume();

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "download_controller_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint downloadControllerHandle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(downloadControllerHandle);

            if (gcHandle.Target is not DownloadController)
            {
                return;
            }

            gcHandle.Free();
        }
        catch
        {
            // Ignore
        }
    }

    private static async ValueTask<Result<InteropArray<byte>>> InteropGetCompletion(DownloadController downloadController)
    {
        try
        {
            await downloadController.Completion.ConfigureAwait(false);

            return Result<InteropArray<byte>>.Success;
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }
}
