using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropUploadController
{
    private static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out UploadController uploadController)
    {
        if (handle == 0)
        {
            uploadController = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        uploadController = gcHandle.Target as UploadController;

        return uploadController is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "upload_controller_set_completion_callback", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeSetCompletionCallback(nint uploadControllerHandle, void* callerState, InteropAsyncVoidCallback asyncCallback)
    {
        try
        {
            if (!TryGetFromHandle(uploadControllerHandle, out var uploadController))
            {
                return -1;
            }

            return asyncCallback.InvokeFor(callerState, _ => InteropGetCompletion(uploadController));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "upload_controller_pause", CallConvs = [typeof(CallConvCdecl)])]
    private static int NativePause(nint uploadControllerHandle)
    {
        try
        {
            if (!TryGetFromHandle(uploadControllerHandle, out var uploadController))
            {
                return -1;
            }

            uploadController.Pause();

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "upload_controller_resume", CallConvs = [typeof(CallConvCdecl)])]
    private static int NativeResume(nint uploadControllerHandle)
    {
        try
        {
            if (!TryGetFromHandle(uploadControllerHandle, out var uploadController))
            {
                return -1;
            }

            uploadController.Resume();

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "upload_controller_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint uploadControllerHandle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(uploadControllerHandle);

            if (gcHandle.Target is not UploadController)
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

    private static async ValueTask<Result<InteropArray<byte>>> InteropGetCompletion(UploadController uploadController)
    {
        try
        {
            await uploadController.Completion.ConfigureAwait(false);

            return Result<InteropArray<byte>>.Success;
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }
}
