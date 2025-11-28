using Google.Protobuf.WellKnownTypes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropDriveErrorConverter
{
    private const int UnknownDecryptionErrorPrimaryCode = 0;
    private const int ShareMetadataDecryptionErrorPrimaryCode = 1;
    private const int NodeMetadataDecryptionErrorPrimaryCode = 2;
    private const int FileContentsDecryptionErrorPrimaryCode = 3;
    private const int UploadKeyMismatchErrorPrimaryCode = 4;

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

            case IntegrityException:
                error.Domain = ErrorDomain.DataIntegrity;
                break;

            case NodeWithSameNameExistsException e:
                error.Domain = ErrorDomain.BusinessLogic;

                var additionalData = new NodeNameConflictErrorData();
                if (e.ConflictingNodeIsFileDraft is { } conflictingNodeIsFileDraft)
                {
                    additionalData.ConflictingNodeIsFileDraft = conflictingNodeIsFileDraft;
                }

                if (e.ConflictingNodeUid is { } conflictingNodeUid)
                {
                    additionalData.ConflictingNodeUid = conflictingNodeUid.ToString();
                }

                if (e.ConflictingRevisionUid is { } conflictingRevisionUid)
                {
                    additionalData.ConflictingRevisionUid = conflictingRevisionUid.ToString();
                }

                error.AdditionalData = Any.Pack(additionalData);
                break;

            default:
                InteropErrorConverter.SetDomainAndCodes(error, exception);
                break;
        }
    }
}
