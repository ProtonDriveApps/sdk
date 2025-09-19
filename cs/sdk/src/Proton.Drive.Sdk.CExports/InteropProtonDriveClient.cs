using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProtonDriveClient
{
    internal static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out ProtonDriveClient client)
    {
        if (handle == 0)
        {
            client = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        client = gcHandle.Target as ProtonDriveClient;

        return client is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "drive_client_create", CallConvs = [typeof(CallConvCdecl)])]
    private static nint NativeCreate(nint sessionHandle)
    {
        try
        {
            if (!InteropProtonApiSession.TryGetFromHandle(sessionHandle, out var session))
            {
                return 0;
            }

            var client = new ProtonDriveClient(session);

            return GCHandle.ToIntPtr(GCHandle.Alloc(client));
        }
        catch
        {
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "get_file_uploader", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeGetFileUploader(
        nint clientHandle,
        InteropArray<byte> requestBytes,
        void* callerState,
        InteropAsyncValueCallback<nint> resultCallback)
    {
        try
        {
            if (!TryGetFromHandle(clientHandle, out var client))
            {
                return -1;
            }

            return resultCallback.InvokeFor(callerState, ct => InteropGetFileUploaderAsync(client, requestBytes, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "get_revision_uploader", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeGetRevisionUploader(
        nint clientHandle,
        InteropArray<byte> requestBytes,
        void* callerState,
        InteropAsyncValueCallback<nint> resultCallback)
    {
        try
        {
            if (!TryGetFromHandle(clientHandle, out var client))
            {
                return -1;
            }

            return resultCallback.InvokeFor(callerState, ct => InteropGetRevisionUploaderAsync(client, requestBytes, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "drive_client_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint handle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(handle);

            if (gcHandle.Target is not ProtonDriveClient)
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

    private static async ValueTask<Result<nint, InteropArray<byte>>> InteropGetFileUploaderAsync(
        ProtonDriveClient client,
        InteropArray<byte> requestBytes,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = FileUploaderProvisionRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            if (!NodeUid.TryParse(request.ParentFolderUid, out var parentUid))
            {
                return -1;
            }

            var uploader = await client.GetFileUploaderAsync(
                parentUid.Value,
                request.Name,
                request.MediaType,
                request.FileSize,
                DateTimeOffset.FromUnixTimeSeconds(request.LastModificationDate).DateTime,
                overrideExistingDraftByOtherClient: request.CreateNewRevisionIfExists,
                cancellationToken).ConfigureAwait(false);

            return GCHandle.ToIntPtr(GCHandle.Alloc(uploader));
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure<nint>(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }

    private static async ValueTask<Result<nint, InteropArray<byte>>> InteropGetRevisionUploaderAsync(
        ProtonDriveClient client,
        InteropArray<byte> requestBytes,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = FileRevisionUploaderProvisionRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            if (!RevisionUid.TryParse(request.CurrentActiveRevisionUid, out var currentActiveRevisionUid))
            {
                return -1;
            }

            var uploader = await client.GetFileRevisionUploaderAsync(
                currentActiveRevisionUid.Value,
                request.FileSize,
                DateTimeOffset.FromUnixTimeSeconds(request.LastModificationDate).DateTime,
                cancellationToken).ConfigureAwait(false);

            return GCHandle.ToIntPtr(GCHandle.Alloc(uploader));
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure<nint>(e, InteropDriveErrorConverter.SetDomainAndCodes);
        }
    }
}
