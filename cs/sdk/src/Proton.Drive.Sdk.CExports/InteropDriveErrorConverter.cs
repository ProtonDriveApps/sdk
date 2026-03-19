using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropDriveErrorConverter
{
    private const int UnknownDecryptionErrorPrimaryCode = 0;
    private const int NodeMetadataDecryptionErrorPrimaryCode = 2;
    private const int FileContentsDecryptionErrorPrimaryCode = 3;
    private const int UploadKeyMismatchErrorPrimaryCode = 4;
    private const int ManifestSignatureVerificationErrorPrimaryCode = 5;
    private const int ContentUploadIntegrityErrorPrimaryCode = 6;

    public static void SetDomainAndCodes(Error error, Exception exception)
    {
        switch (exception)
        {
            case NodeMetadataDecryptionException e:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = NodeMetadataDecryptionErrorPrimaryCode;
                error.SecondaryCode = (long)e.Part;
                break;

            case FileContentsDecryptionException:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = FileContentsDecryptionErrorPrimaryCode;
                break;

            case NodeKeyAndSessionKeyMismatchException:
            case SessionKeyAndDataPacketMismatchException:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = UploadKeyMismatchErrorPrimaryCode;
                break;

            case DataIntegrityException:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ManifestSignatureVerificationErrorPrimaryCode;
                break;

            case MissingContentBlockIntegrityException e:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ContentUploadIntegrityErrorPrimaryCode;
                error.AdditionalData = Any.Pack(ToAdditionalData(e));
                break;

            case ContentSizeMismatchIntegrityException e:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ContentUploadIntegrityErrorPrimaryCode;
                error.AdditionalData = Any.Pack(ToAdditionalData(e));
                break;

            case ThumbnailCountMismatchIntegrityException e:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ContentUploadIntegrityErrorPrimaryCode;
                error.AdditionalData = Any.Pack(ToAdditionalData(e));
                break;

            case ChecksumMismatchIntegrityException e:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ContentUploadIntegrityErrorPrimaryCode;
                error.AdditionalData = Any.Pack(ToAdditionalData(e));
                break;

            case IntegrityException:
                error.Domain = ErrorDomain.DataIntegrity;
                error.PrimaryCode = ContentUploadIntegrityErrorPrimaryCode;
                break;

            case NodeWithSameNameExistsException e:
                error.Domain = ErrorDomain.BusinessLogic;
                error.AdditionalData = Any.Pack(ToAdditionalData(e));
                break;

            default:
                error.PrimaryCode = UnknownDecryptionErrorPrimaryCode;
                InteropErrorConverter.SetDomainAndCodes(error, exception);
                break;
        }
    }

    private static MissingContentBlockErrorData ToAdditionalData(MissingContentBlockIntegrityException e)
    {
        var data = new MissingContentBlockErrorData();
        if (e.BlockNumber is { } blockNumber)
        {
            data.BlockNumber = blockNumber;
        }

        return data;
    }

    private static ContentSizeMismatchErrorData ToAdditionalData(ContentSizeMismatchIntegrityException e)
    {
        var data = new ContentSizeMismatchErrorData();
        if (e.UploadedSize is { } uploadedSize)
        {
            data.UploadedSize = uploadedSize;
        }

        if (e.ExpectedSize is { } expectedSize)
        {
            data.ExpectedSize = expectedSize;
        }

        return data;
    }

    private static ThumbnailCountMismatchErrorData ToAdditionalData(ThumbnailCountMismatchIntegrityException e)
    {
        var data = new ThumbnailCountMismatchErrorData();
        if (e.UploadedBlockCount is { } uploadedBlockCount)
        {
            data.UploadedBlockCount = uploadedBlockCount;
        }

        if (e.ExpectedBlockCount is { } expectedBlockCount)
        {
            data.ExpectedBlockCount = expectedBlockCount;
        }

        return data;
    }

    private static ChecksumMismatchErrorData ToAdditionalData(ChecksumMismatchIntegrityException e)
    {
        var data = new ChecksumMismatchErrorData();
        if (e.ActualChecksum is not null)
        {
            data.ActualChecksum = ByteString.CopyFrom(e.ActualChecksum);
        }

        if (e.ExpectedChecksum is not null)
        {
            data.ExpectedChecksum = ByteString.CopyFrom(e.ExpectedChecksum);
        }

        return data;
    }

    private static NodeNameConflictErrorData ToAdditionalData(NodeWithSameNameExistsException e)
    {
        var data = new NodeNameConflictErrorData();
        if (e.ConflictingNodeIsFileDraft is { } conflictingNodeIsFileDraft)
        {
            data.ConflictingNodeIsFileDraft = conflictingNodeIsFileDraft;
        }

        if (e.ConflictingNodeUid is { } conflictingNodeUid)
        {
            data.ConflictingNodeUid = conflictingNodeUid.ToString();
        }

        if (e.ConflictingRevisionUid is { } conflictingRevisionUid)
        {
            data.ConflictingRevisionUid = conflictingRevisionUid.ToString();
        }

        return data;
    }
}
