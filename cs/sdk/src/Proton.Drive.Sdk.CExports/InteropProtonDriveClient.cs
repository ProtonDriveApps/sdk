using System.Text.Json;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.CExports;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProtonDriveClient
{
    public static IMessage HandleCreate(DriveClientCreateRequest request, nint bindingsHandle)
    {
        if (!request.BaseUrl.EndsWith('/'))
        {
            throw new UriFormatException("Base URL must end with a '/'");
        }

        var protonDriveClientOptions = new Sdk.ProtonDriveClientOptions(
            request.ClientOptions.HasBindingsLanguage ? request.ClientOptions.BindingsLanguage : null,
            request.ClientOptions.HasUid ? request.ClientOptions.Uid : null,
            request.ClientOptions.HasApiCallTimeout ? request.ClientOptions.ApiCallTimeout : null,
            request.ClientOptions.HasStorageCallTimeout ? request.ClientOptions.StorageCallTimeout : null);

        var httpClientFactory = new InteropHttpClientFactory(
            bindingsHandle,
            request.BaseUrl,
            protonDriveClientOptions.BindingsLanguage,
            new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.HttpClient.RequestFunction),
            new InteropFunction<nint, InteropArray<byte>, nint, nint>(request.HttpClient.ResponseContentReadAction),
            new InteropAction<nint>(request.HttpClient.CancellationAction));

        var accountClient = new InteropAccountClient(bindingsHandle, new InteropAction<nint, InteropArray<byte>, nint>(request.AccountRequestAction));

        ICacheRepository entityCacheRepository = request.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.EntityCachePath)
            : new InMemoryCacheRepository();

        ICacheRepository secretCacheRepository = request.HasSecretCachePath
            ? SqliteCacheRepository.OpenFile(request.SecretCachePath)
            : new InMemoryCacheRepository();

        if (request.HasSecretCacheEncryptionKey)
        {
            secretCacheRepository = new EncryptedCacheRepository(
                secretCacheRepository,
                request.SecretCacheEncryptionKey.ToByteArray());
        }

        ITelemetry telemetry = request.Telemetry.ToTelemetry(bindingsHandle) is { } interopTelemetry
            ? new DriveInteropTelemetryDecorator(interopTelemetry)
            : NullTelemetry.Instance;

        var featureFlagProvider = request.HasFeatureEnabledFunction
            ? new InteropFeatureFlagProvider(bindingsHandle, new InteropFunction<nint, InteropArray<byte>, int>(request.FeatureEnabledFunction))
            : AlwaysDisabledFeatureFlagProvider.Instance;

        var client = new ProtonDriveClient(
            httpClientFactory,
            accountClient,
            entityCacheRepository,
            secretCacheRepository,
            featureFlagProvider,
            telemetry,
            protonDriveClientOptions);

        return new Int64Value
        {
            Value = Interop.AllocHandle(client),
        };
    }

    public static IMessage HandleCreate(DriveClientCreateFromSessionRequest request)
    {
        var session = Interop.GetFromHandle<ProtonApiSession>(request.SessionHandle);

        var client = new ProtonDriveClient(session);

        return new Int64Value { Value = Interop.AllocHandle(client) };
    }

    public static async ValueTask<IMessage> HandleCreateFolderAsync(DriveClientCreateFolderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var createdFolder = await client.CreateFolderAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.FolderName,
            request.LastModificationTime?.ToDateTime(),
            cancellationToken).ConfigureAwait(false);

        return new FolderNode
        {
            Uid = createdFolder.Uid.ToString(),
            ParentUid = createdFolder.ParentUid.ToString(),
            TreeEventScopeId = createdFolder.TreeEventScopeId,
            Name = createdFolder.Name,
            CreationTime = createdFolder.CreationTime.ToUniversalTime().ToTimestamp(),
            TrashTime = createdFolder.TrashTime?.ToUniversalTime().ToTimestamp(),
            NameAuthor = ParseAuthorResult(createdFolder.NameAuthor),
            Author = ParseAuthorResult(createdFolder.Author),
        };
    }

    public static async ValueTask<IMessage> HandleGetFileUploaderAsync(DriveClientGetFileUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var additionalMetadata = request.AdditionalMetadata is { Count: > 0 }
            ? request.AdditionalMetadata.Select(x =>
                new Proton.Drive.Sdk.Nodes.AdditionalMetadataProperty(x.Name, JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;

        var expectedSha1 = request.HasExpectedSha1 ? request.ExpectedSha1.Memory : default(ReadOnlyMemory<byte>?);

        var fileUploader = await client.GetFileUploaderAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.Name,
            request.MediaType,
            request.Size,
            request.LastModificationTime.ToDateTime(),
            additionalMetadata,
            request.OverrideExistingDraftByOtherClient,
            expectedSha1,
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetFileRevisionUploaderAsync(DriveClientGetFileRevisionUploaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var additionalMetadata = request.AdditionalMetadata.Count > 0
            ? request.AdditionalMetadata.Select(x =>
                new Proton.Drive.Sdk.Nodes.AdditionalMetadataProperty(x.Name, JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;

        var expectedSha1 = request.HasExpectedSha1 ? request.ExpectedSha1.Memory : default(ReadOnlyMemory<byte>?);

        var fileUploader = await client.GetFileRevisionUploaderAsync(
            RevisionUid.Parse(request.CurrentActiveRevisionUid),
            request.Size,
            request.LastModificationTime.ToDateTime(),
            additionalMetadata,
            expectedSha1,
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage> HandleGetAvailableNameAsync(DriveClientGetAvailableNameRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var availableName = await client.GetAvailableNameAsync(
            NodeUid.Parse(request.ParentFolderUid),
            request.Name,
            cancellationToken).ConfigureAwait(false);

        return new StringValue { Value = availableName };
    }

    public static async ValueTask<IMessage> HandleGetThumbnailsAsync(DriveClientGetThumbnailsRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var thumbnailsEnumerable = client.EnumerateThumbnailsAsync(
            request.FileUids.Select(NodeUid.Parse),
            (Proton.Drive.Sdk.Nodes.ThumbnailType)request.Type,
            cancellationToken);

        var thumbnails = await thumbnailsEnumerable
            .Select(x => new FileThumbnail
            {
                FileUid = x.FileUid.ToString(),
                Data = ByteString.CopyFrom(x.Data.Span),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new FileThumbnailList { Thumbnails = { thumbnails } };
    }

    public static async ValueTask<IMessage> HandleEnumerateFolderChildrenAsync(DriveClientEnumerateFolderChildrenRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var childrenEnumerable = client.EnumerateFolderChildrenAsync(
            NodeUid.Parse(request.FolderUid),
            cancellationToken);

        var children = await childrenEnumerable
            .Select(ConvertToNodeResult)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new FolderChildrenList { Children = { children } };
    }

    public static async ValueTask<IMessage> HandleGetMyFilesFolderAsync(DriveClientGetMyFilesFolderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var folderNode = await client.GetMyFilesFolderAsync(cancellationToken).ConfigureAwait(false);

        return new FolderNode
        {
            Uid = folderNode.Uid.ToString(),
            ParentUid = folderNode.ParentUid?.ToString() ?? string.Empty,
            TreeEventScopeId = folderNode.TreeEventScopeId,
            Name = folderNode.Name,
            CreationTime = folderNode.CreationTime.ToUniversalTime().ToTimestamp(),
            TrashTime = folderNode.TrashTime?.ToUniversalTime().ToTimestamp(),
            NameAuthor = ParseAuthorResult(folderNode.NameAuthor),
            Author = ParseAuthorResult(folderNode.Author),
        };
    }

    public static async ValueTask<IMessage> HandleGetFileDownloaderAsync(DriveClientGetFileDownloaderRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var fileUploader = await client.GetFileDownloaderAsync(RevisionUid.Parse(request.RevisionUid), cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(fileUploader) };
    }

    public static async ValueTask<IMessage?> HandleRenameAsync(DriveClientRenameRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        await client.RenameNodeAsync(
            NodeUid.Parse(request.NodeUid),
            request.NewName,
            request.NewMediaType,
            cancellationToken).ConfigureAwait(false);
        return null;
    }

    public static async ValueTask<IMessage> HandleTrashNodesAsync(DriveClientTrashNodesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var results = await client.TrashNodesAsync(
            request.NodeUids.Select(NodeUid.Parse),
            cancellationToken).ConfigureAwait(false);

        var response = new TrashNodesResponse
        {
            Results =
            {
                results.Select(pair =>
                {
                    var result = new NodeResultPair
                    {
                        NodeUid = pair.Key.ToString(),
                    };

                    if (pair.Value.TryGetError(out var error))
                    {
                        result.Error = error;
                    }

                    return result;
                }),
            },
        };

        return response;
    }

    public static IMessage? HandleFree(DriveClientFreeRequest request)
    {
        Interop.FreeHandle<ProtonDriveClient>(request.ClientHandle);

        return null;
    }

    public static AuthorResult ParseAuthorResult(Result<Proton.Drive.Sdk.Author, Proton.Drive.Sdk.Nodes.SignatureVerificationError> result)
    {
        var authorResult = new AuthorResult();

        if (result.TryGetValueElseError(out var author, out var error))
        {
            authorResult.Value = new Author
            {
                EmailAddress = author.EmailAddress,
            };
        }
        else
        {
            authorResult.Error = new SignatureVerificationError
            {
                ClaimedAuthor = new Author
                {
                    EmailAddress = error.ClaimedAuthor.EmailAddress,
                },
                Message = error.Message,
            };
        }

        return authorResult;
    }

    public static NodeResult ConvertToNodeResult(Result<Proton.Drive.Sdk.Nodes.Node, Proton.Drive.Sdk.Nodes.DegradedNode> result)
    {
        var nodeResult = new NodeResult();

        if (result.TryGetValueElseError(out var node, out var degradedNode))
        {
            nodeResult.Value = ConvertToNode(node);
        }
        else
        {
            nodeResult.Error = ConvertToDegradedNode(degradedNode);
        }

        return nodeResult;
    }

    private static Node ConvertToNode(Proton.Drive.Sdk.Nodes.Node node)
    {
        var result = new Node();

        switch (node)
        {
            case Proton.Drive.Sdk.Nodes.FolderNode folderNode:
                result.Folder = new FolderNode
                {
                    Uid = folderNode.Uid.ToString(),
                    ParentUid = folderNode.ParentUid?.ToString() ?? string.Empty,
                    TreeEventScopeId = folderNode.TreeEventScopeId,
                    Name = folderNode.Name,
                    CreationTime = folderNode.CreationTime.ToUniversalTime().ToTimestamp(),
                    TrashTime = folderNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                    NameAuthor = ParseAuthorResult(folderNode.NameAuthor),
                    Author = ParseAuthorResult(folderNode.Author),
                };
                break;

            case Proton.Drive.Sdk.Nodes.FileNode fileNode:
                var fileNodeProto = new FileNode
                {
                    Uid = fileNode.Uid.ToString(),
                    ParentUid = fileNode.ParentUid?.ToString() ?? string.Empty,
                    TreeEventScopeId = fileNode.TreeEventScopeId,
                    Name = fileNode.Name,
                    MediaType = fileNode.MediaType,
                    CreationTime = fileNode.CreationTime.ToUniversalTime().ToTimestamp(),
                    TrashTime = fileNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                    NameAuthor = ParseAuthorResult(fileNode.NameAuthor),
                    Author = ParseAuthorResult(fileNode.Author),
                    TotalSizeOnCloudStorage = fileNode.TotalSizeOnCloudStorage,
                    ActiveRevision = new FileRevision
                    {
                        Uid = fileNode.ActiveRevision.Uid.ToString(),
                        CreationTime = fileNode.ActiveRevision.CreationTime.ToUniversalTime().ToTimestamp(),
                        SizeOnCloudStorage = fileNode.ActiveRevision.SizeOnCloudStorage,
                        ClaimedSize = fileNode.ActiveRevision.ClaimedSize ?? 0,
                        ClaimedModificationTime = fileNode.ActiveRevision.ClaimedModificationTime?.ToUniversalTime().ToTimestamp(),
                        ClaimedDigests = new FileContentDigests(),
                    },
                };

                if (fileNode.ActiveRevision.ClaimedDigests.Sha1.HasValue)
                {
                    fileNodeProto.ActiveRevision.ClaimedDigests.Sha1 = ByteString.CopyFrom(fileNode.ActiveRevision.ClaimedDigests.Sha1.Value.Span);
                }

                fileNodeProto.ActiveRevision.Thumbnails.AddRange(
                    fileNode.ActiveRevision.Thumbnails.Select(t => new ThumbnailHeader
                    {
                        Id = t.Id,
                        Type = (ThumbnailType)(int)t.Type,
                    }));

                if (fileNode.ActiveRevision.AdditionalClaimedMetadata is not null)
                {
                    fileNodeProto.ActiveRevision.AdditionalClaimedMetadata.AddRange(
                        fileNode.ActiveRevision.AdditionalClaimedMetadata.Select(m => new AdditionalMetadataProperty
                        {
                            Name = m.Name,
                            Utf8JsonValue = ByteString.CopyFromUtf8(m.Value.ToString()),
                        }));
                }

                if (fileNode.ActiveRevision.ContentAuthor.HasValue)
                {
                    fileNodeProto.ActiveRevision.ContentAuthor = ParseAuthorResult(fileNode.ActiveRevision.ContentAuthor.Value);
                }

                result.File = fileNodeProto;
                break;
        }

        return result;
    }

    private static DegradedNode ConvertToDegradedNode(Proton.Drive.Sdk.Nodes.DegradedNode degradedNode)
    {
        var result = new DegradedNode();

        switch (degradedNode)
        {
            case Proton.Drive.Sdk.Nodes.DegradedFolderNode degradedFolderNode:
                var degradedFolder = new DegradedFolderNode
                {
                    Uid = degradedFolderNode.Uid.ToString(),
                    ParentUid = degradedFolderNode.ParentUid?.ToString() ?? string.Empty,
                    TreeEventScopeId = degradedFolderNode.TreeEventScopeId,
                    Name = ConvertStringToStringResult(degradedFolderNode.Name),
                    CreationTime = degradedFolderNode.CreationTime.ToUniversalTime().ToTimestamp(),
                    TrashTime = degradedFolderNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                    NameAuthor = ParseAuthorResult(degradedFolderNode.NameAuthor),
                    Author = ParseAuthorResult(degradedFolderNode.Author),
                };

                degradedFolder.Errors.AddRange(degradedFolderNode.Errors.Select(ConvertToDriveError));
                result.Folder = degradedFolder;
                break;

            case Proton.Drive.Sdk.Nodes.DegradedFileNode degradedFileNode:
                var degradedFile = new DegradedFileNode
                {
                    Uid = degradedFileNode.Uid.ToString(),
                    ParentUid = degradedFileNode.ParentUid?.ToString() ?? string.Empty,
                    TreeEventScopeId = degradedFileNode.TreeEventScopeId,
                    Name = ConvertStringToStringResult(degradedFileNode.Name),
                    MediaType = degradedFileNode.MediaType,
                    CreationTime = degradedFileNode.CreationTime.ToUniversalTime().ToTimestamp(),
                    TrashTime = degradedFileNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                    NameAuthor = ParseAuthorResult(degradedFileNode.NameAuthor),
                    Author = ParseAuthorResult(degradedFileNode.Author),
                    TotalStorageQuotaUsage = degradedFileNode.TotalStorageQuotaUsage,
                };

                if (degradedFileNode.ActiveRevision is not null)
                {
                    degradedFile.ActiveRevision = new DegradedRevision
                    {
                        Uid = degradedFileNode.ActiveRevision.Uid.ToString(),
                        CreationTime = degradedFileNode.ActiveRevision.CreationTime.ToUniversalTime().ToTimestamp(),
                        SizeOnCloudStorage = degradedFileNode.ActiveRevision.SizeOnCloudStorage,
                        ClaimedSize = degradedFileNode.ActiveRevision.ClaimedSize ?? 0,
                        ClaimedModificationTime = degradedFileNode.ActiveRevision.ClaimedModificationTime?.ToUniversalTime().ToTimestamp(),
                        CanDecrypt = degradedFileNode.ActiveRevision.CanDecrypt,
                    };

                    if (degradedFileNode.ActiveRevision.ClaimedDigests.HasValue)
                    {
                        degradedFile.ActiveRevision.ClaimedDigests = new FileContentDigests();
                        if (degradedFileNode.ActiveRevision.ClaimedDigests.Value.Sha1.HasValue)
                        {
                            degradedFile.ActiveRevision.ClaimedDigests.Sha1 =
                                ByteString.CopyFrom(degradedFileNode.ActiveRevision.ClaimedDigests.Value.Sha1.Value.Span);
                        }
                    }

                    degradedFile.ActiveRevision.Thumbnails.AddRange(
                        degradedFileNode.ActiveRevision.Thumbnails.Select(t => new ThumbnailHeader
                        {
                            Id = t.Id,
                            Type = (ThumbnailType)(int)t.Type,
                        }));

                    if (degradedFileNode.ActiveRevision.AdditionalClaimedMetadata is not null)
                    {
                        degradedFile.ActiveRevision.AdditionalClaimedMetadata.AddRange(
                            degradedFileNode.ActiveRevision.AdditionalClaimedMetadata.Select(m => new AdditionalMetadataProperty
                            {
                                Name = m.Name,
                                Utf8JsonValue = ByteString.CopyFromUtf8(m.Value.ToString()),
                            }));
                    }

                    if (degradedFileNode.ActiveRevision.ContentAuthor.HasValue)
                    {
                        degradedFile.ActiveRevision.ContentAuthor = ParseAuthorResult(degradedFileNode.ActiveRevision.ContentAuthor.Value);
                    }

                    degradedFile.ActiveRevision.Errors.AddRange(degradedFileNode.ActiveRevision.Errors.Select(ConvertToDriveError));
                }

                degradedFile.Errors.AddRange(degradedFileNode.Errors.Select(ConvertToDriveError));
                result.File = degradedFile;
                break;
        }

        return result;
    }

    private static DriveError ConvertToDriveError(ProtonDriveError error)
    {
        return new DriveError
        {
            Message = error.Message ?? string.Empty,
            InnerError = error.InnerError != null ? ConvertToDriveError(error.InnerError) : null,
        };
    }

    private static StringResult ConvertStringToStringResult(Result<string, ProtonDriveError> result)
    {
        var stringResult = new StringResult();
        if (result.TryGetValueElseError(out var value, out var error))
        {
            stringResult.Value = value;
        }
        else
        {
            stringResult.Error = ConvertToDriveError(error);
        }

        return stringResult;
    }
}
