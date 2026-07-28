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
                case Nodes.AlbumNode albumNode:
                    result.Album = Nodes.Node.ToInterop(albumNode);
                    break;
                case Nodes.PhotoNode photoNode:
                    result.Photo = Nodes.Node.ToInterop(photoNode);
                    break;
                case Nodes.FolderNode folderNode:
                    result.Folder = Nodes.Node.ToInterop(folderNode);
                    break;

                case Nodes.FileNode fileNode:
                    result.File = Nodes.Node.ToInterop(fileNode);
                    break;
            }

            return result;
        }

        private static AlbumNode ToInterop(Nodes.AlbumNode albumNode)
        {
            var albumNodeProto = new AlbumNode
            {
                Uid = albumNode.Uid.ToString(),
                TreeEventScopeId = albumNode.TreeEventScopeId.ToString(),
                Name = albumNode.Name.ToInterop(),
                CreationTime = albumNode.CreationTime.ToUniversalTime().ToTimestamp(),
                TrashTime = albumNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                NameAuthor = albumNode.NameAuthor.ToInterop(),
                KeyAuthor = albumNode.KeyAuthor.ToInterop(),
                OwnedBy = albumNode.OwnedBy.ToInterop(),
                IsShared = albumNode.IsShared,
                IsSharedByUrl = albumNode.IsSharedByUrl,
                PhotoCount = albumNode.PhotoCount,
            };

            if (albumNode.ParentUid != null)
            {
                albumNodeProto.ParentUid = albumNode.ParentUid.ToString();
            }

            if (albumNode.CoverPhotoUid is { } coverPhotoUid)
            {
                albumNodeProto.CoverPhotoNodeUid = coverPhotoUid.ToString();
            }

            if (albumNode.LastActivityTime is { } lastActivityTime)
            {
                albumNodeProto.LastActivityTime = lastActivityTime.ToUniversalTime().ToTimestamp();
            }

            albumNodeProto.Errors.AddRange(albumNode.Errors.Select(ToInterop));

            return albumNodeProto;
        }

        private static PhotoNode ToInterop(Nodes.PhotoNode photoNode)
        {
            var photoNodeProto = new PhotoNode
            {
                Uid = photoNode.Uid.ToString(),
                TreeEventScopeId = photoNode.TreeEventScopeId.ToString(),
                Name = photoNode.Name.ToInterop(),
                MediaType = photoNode.MediaType,
                CreationTime = photoNode.CreationTime.ToUniversalTime().ToTimestamp(),
                TrashTime = photoNode.TrashTime?.ToUniversalTime().ToTimestamp(),
                NameAuthor = photoNode.NameAuthor.ToInterop(),
                KeyAuthor = photoNode.KeyAuthor.ToInterop(),
                TotalStorageSize = photoNode.TotalStorageSize,
                OwnedBy = photoNode.OwnedBy.ToInterop(),
                IsShared = photoNode.IsShared,
                IsSharedByUrl = photoNode.IsSharedByUrl,
                CaptureTime = photoNode.CaptureTime.ToUniversalTime().ToTimestamp(),
            };

            if (photoNode.ParentUid != null)
            {
                photoNodeProto.ParentUid = photoNode.ParentUid.ToString();
            }

            photoNodeProto.ActiveRevision = photoNode.ActiveRevision.ToInterop();
            photoNodeProto.AlbumUids.AddRange(photoNode.AlbumUids.Select(albumUid => albumUid.ToString()));
            photoNodeProto.Errors.AddRange(photoNode.Errors.Select(ToInterop));

            return photoNodeProto;
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
                KeyAuthor = folderNode.KeyAuthor.ToInterop(),
                OwnedBy = folderNode.OwnedBy.ToInterop(),
                IsShared = folderNode.IsShared,
                IsSharedByUrl = folderNode.IsSharedByUrl,
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
                KeyAuthor = fileNode.KeyAuthor.ToInterop(),
                TotalStorageSize = fileNode.TotalStorageSize,
                OwnedBy = fileNode.OwnedBy.ToInterop(),
                IsShared = fileNode.IsShared,
                IsSharedByUrl = fileNode.IsSharedByUrl,
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
                State = (RevisionState)(int)revision.State,
                CreationTime = revision.CreationTime.ToUniversalTime().ToTimestamp(),
                StorageSize = revision.StorageSize,
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

            if (revision.ClaimedAdditionalMetadata is not null)
            {
                protoRevision.ClaimedAdditionalMetadata.AddRange(
                    revision.ClaimedAdditionalMetadata.Select(m => new AdditionalMetadataProperty
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
                if (author.EmailAddress != null)
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
