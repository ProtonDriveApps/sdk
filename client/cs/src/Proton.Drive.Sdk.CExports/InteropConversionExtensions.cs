using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropConversionExtensions
{
    extension(Nodes.Node node)
    {
        public Node ToInterop()
        {
            var result = new Node();

            switch (node)
            {
                case Nodes.FolderNode folderNode:
                    result.Folder = Nodes.Node.ToInterop(folderNode);
                    break;
                case Nodes.FileNode fileNode:
                    result.File = Nodes.Node.ToInterop(fileNode);
                    break;
            }

            return result;
        }

        private static FolderNode ToInterop(Nodes.FolderNode folderNode)
        {
            var folderNodeProto = new FolderNode
            {
                Uid = folderNode.Uid.ToString(),
                TreeEventScopeId = folderNode.TreeEventScopeId.ToString(),
                Name = folderNode.Name.ToInterop(),
                CreationTime = folderNode.CreationTime.ToUniversalTime().ToTimestamp(),
                TrashTime = folderNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                NameAuthor = folderNode.NameAuthor.ToInterop(),
                Author = folderNode.Author.ToInterop(),
                OwnedBy = folderNode.OwnedBy.ToInterop(),
            };

            if (folderNode.ParentUid != null)
            {
                folderNodeProto.ParentUid = folderNode.ParentUid.ToString();
            }

            folderNodeProto.Errors.AddRange(folderNode.Errors.Select(ToInterop));

            return folderNodeProto;
        }

        private static FileNode ToInterop(Nodes.FileNode fileNode)
        {
            var fileNodeProto = new FileNode
            {
                Uid = fileNode.Uid.ToString(),
                TreeEventScopeId = fileNode.TreeEventScopeId.ToString(),
                Name = fileNode.Name.ToInterop(),
                MediaType = fileNode.MediaType,
                CreationTime = fileNode.CreationTime.ToUniversalTime().ToTimestamp(),
                TrashTime = fileNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                NameAuthor = fileNode.NameAuthor.ToInterop(),
                Author = fileNode.Author.ToInterop(),
                TotalSizeOnCloudStorage = fileNode.TotalSizeOnCloudStorage,
                OwnedBy = fileNode.OwnedBy.ToInterop(),
            };

            if (fileNode.ParentUid != null)
            {
                fileNodeProto.ParentUid = fileNode.ParentUid.ToString();
            }

            fileNodeProto.ActiveRevision = fileNode.ActiveRevision.ToInterop();

            fileNodeProto.Errors.AddRange(fileNode.Errors.Select(ToInterop));

            return fileNodeProto;
        }
    }

    extension(Devices.Device device)
    {
        public Device ToInterop()
        {
#pragma warning disable CS0612, CS0618 // Device.ShareId is deprecated but must still be propagated
            var result = new Device
            {
                Uid = device.Uid.ToString(),
                Type = (DeviceType)(int)device.Type,
                Name = device.Name.ToInterop(),
                RootFolderUid = device.RootFolderUid.ToString(),
                CreationTime = device.CreationTime.ToUniversalTime().ToTimestamp(),
                ShareId = device.ShareId,
            };
#pragma warning restore CS0612, CS0618

            if (device.LastSyncTime is { } lastSyncTime)
            {
                result.LastSyncTime = lastSyncTime.ToUniversalTime().ToTimestamp();
            }

            return result;
        }
    }

    extension(ProtonDriveError error)
    {
        public DriveError ToInterop()
        {
            var driveError = new DriveError
            {
                InnerError = error.InnerError?.ToInterop(),
            };

            if (error.Message != null)
            {
                driveError.Message = error.Message;
            }

            return driveError;
        }
    }

    extension(IReadOnlyDictionary<NodeUid, Result<Exception>> results)
    {
        public NodeResultListResponse ToInterop()
        {
            return new NodeResultListResponse
            {
                Results =
                {
                    results.Select(pair =>
                    {
                        var result = new NodeResultPair
                        {
                            NodeUid = pair.Key.ToString(),
                        };

                        if (pair.Value.TryGetError(out var exception))
                        {
                            result.Error = exception.ToProtoError(InteropDriveErrorConverter.SetDomainAndCodes);
                        }

                        return result;
                    }),
                },
            };
        }
    }

    extension(Revision revision)
    {
        public FileRevision ToInterop()
        {
            var protoRevision = new FileRevision
            {
                Uid = revision.Uid.ToString(),
                CreationTime = revision.CreationTime.ToUniversalTime().ToTimestamp(),
                SizeOnCloudStorage = revision.SizeOnCloudStorage,
                ClaimedSize = revision.ClaimedSize ?? 0,
                ClaimedModificationTime = revision.ClaimedModificationTime?.ToUniversalTime().ToTimestamp(),
            };

            if (revision.ClaimedDigests is { } claimedDigests)
            {
                protoRevision.ClaimedDigests = new FileContentDigests
                {
                    Sha1Verified = claimedDigests.Sha1Verified,
                };

                if (claimedDigests.Sha1 is { } sha1)
                {
                    protoRevision.ClaimedDigests.Sha1 = ByteString.CopyFrom(sha1.Span);
                }
            }

            protoRevision.Thumbnails.AddRange(
                revision.Thumbnails.Select(t => new ThumbnailHeader
                {
                    Id = t.Id,
                    Type = (ThumbnailType)(int)t.Type,
                }));

            if (revision.AdditionalClaimedMetadata is not null)
            {
                protoRevision.AdditionalClaimedMetadata.AddRange(
                    revision.AdditionalClaimedMetadata.Select(m => new AdditionalMetadataProperty
                    {
                        Name = m.Name,
                        Utf8JsonValue = ByteString.CopyFromUtf8(m.Value.ToString()),
                    }));
            }

            if (revision.ContentAuthor.HasValue)
            {
                protoRevision.ContentAuthor = revision.ContentAuthor.Value.ToInterop();
            }

            return protoRevision;
        }
    }

    extension(Result<Sdk.Author, Nodes.SignatureVerificationError> result)
    {
        public AuthorResult ToInterop()
        {
            var authorResult = new AuthorResult();

            if (result.TryGetValueElseError(out var author, out var error))
            {
                var authorResultValue = new Author();
                if (authorResultValue.EmailAddress != null)
                {
                    authorResultValue.EmailAddress = author.EmailAddress;
                }

                authorResult.Value = authorResultValue;
            }
            else
            {
                var claimedAuthor = new Author();
                if (error.ClaimedAuthor.EmailAddress != null)
                {
                    claimedAuthor.EmailAddress = error.ClaimedAuthor.EmailAddress;
                }

                authorResult.Error = new SignatureVerificationError
                {
                    ClaimedAuthor = claimedAuthor,
                };

                if (error.Message != null)
                {
                    // TODO change message to be a DriveError
                    authorResult.Error.Message = error.FlattenMessage();
                }
            }

            return authorResult;
        }
    }

    extension(Nodes.OwnedBy? ownedBy)
    {
        public OwnedBy ToInterop()
        {
            if (ownedBy is null)
            {
                return new OwnedBy();
            }

            var result = new OwnedBy();
            if (ownedBy.Email != null)
            {
                result.Email = ownedBy.Email;
            }

            if (ownedBy.Organization != null)
            {
                result.Organization = ownedBy.Organization;
            }

            return result;
        }
    }

    extension(Result<string, ProtonDriveError> result)
    {
        public StringResult ToInterop()
        {
            var stringResult = new StringResult();
            if (result.TryGetValueElseError(out var value, out var error))
            {
                stringResult.Value = value;
            }
            else
            {
                stringResult.Error = error.ToInterop();
            }

            return stringResult;
        }
    }
}
