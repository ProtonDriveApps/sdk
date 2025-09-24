using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.CExports;
using Proton.Sdk.CExports.Logging;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProtonDriveClient
{
    public static IMessage HandleCreate(DriveClientCreateRequest request, nint state)
    {
        var httpClientFactory = new InteropHttpClientFactory(
            state,
            request.BaseUrl,
            request.BindingsLanguage,
            new InteropAction<nint, InteropArray<byte>, nint>(request.SendHttpRequestAction));

        var accountClient = new InteropAccountClient(state, new InteropAction<nint, InteropArray<byte>, nint>(request.AccountClient.RequestAction));

        var entityCacheRepository = request.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.EntityCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var secretCacheRepository = request.HasSecretCachePath
            ? SqliteCacheRepository.OpenFile(request.SecretCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var loggerProvider = Interop.GetFromHandle<InteropLoggerProvider>(request.LoggerProviderHandle);
        var loggerFactory = new LoggerFactory([loggerProvider]);

        var client = new ProtonDriveClient(httpClientFactory, accountClient, entityCacheRepository, secretCacheRepository, loggerFactory);

        return new Int64Value { Value = Interop.AllocHandle(client) };
    }

    public static IMessage HandleCreate(DriveClientCreateFromSessionRequest request)
    {
        var session = Interop.GetFromHandle<ProtonApiSession>(request.SessionHandle);

        var client = new ProtonDriveClient(session);

        return new Int64Value { Value = Interop.AllocHandle(client) };
    }

    public static async ValueTask<IMessage> HandleGetFileUploaderAsync(DriveClientGetFileUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var fileUploader = await client.GetFileUploaderAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.Name,
            request.MediaType,
            request.Size,
            request.LastModificationTime.ToDateTime(),
            request.OverrideExistingDraftByOtherClient,
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetFileRevisionUploaderAsync(DriveClientGetFileRevisionUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var fileUploader = await client.GetFileRevisionUploaderAsync(
            RevisionUid.Parse(request.CurrentActiveRevisionUid),
            request.FileSize,
            request.LastModificationTime.ToDateTime(),
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetFileDownloaderAsync(DriveClientGetFileDownloaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var fileUploader = await client.GetFileDownloaderAsync(RevisionUid.Parse(request.RevisionUid), cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static IMessage? HandleFree(DriveClientFreeRequest request)
    {
        Interop.FreeHandle<ProtonDriveClient>(request.ClientHandle);

        return null;
    }
}
