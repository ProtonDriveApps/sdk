using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk;

public sealed class NodeWithSameNameExistsException : ProtonDriveException
{
    public NodeWithSameNameExistsException()
    {
    }

    public NodeWithSameNameExistsException(string message)
        : base(message)
    {
    }

    public NodeWithSameNameExistsException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal NodeWithSameNameExistsException(VolumeId volumeId, ProtonApiException<RevisionErrorResponse> innerException)
        : base(innerException.Message, innerException)
    {
        if (innerException.Response is not { } response)
        {
            return;
        }

        var conflict = RevisionConflict.FromErrorResponse(response);

        ConflictingNodeIsFileDraft = conflict is { RevisionId: null, DraftRevisionId: not null };

        if (conflict is { LinkId: { } linkId })
        {
            var conflictingNodeUid = new NodeUid(volumeId, linkId);

            ConflictingNodeUid = conflictingNodeUid;

            if (conflict.RevisionId is { } revisionId)
            {
                ConflictingRevisionUid = new RevisionUid(conflictingNodeUid, revisionId);
            }
            else if (conflict.DraftRevisionId is { } draftRevisionId)
            {
                ConflictingRevisionUid = new RevisionUid(conflictingNodeUid, draftRevisionId);
                ConflictingNodeIsFileDraft = true;
            }
        }
    }

    public bool? ConflictingNodeIsFileDraft { get; }
    public NodeUid? ConflictingNodeUid { get; }
    public RevisionUid? ConflictingRevisionUid { get; }
}
