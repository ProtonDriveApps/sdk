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

    internal NodeWithSameNameExistsException(VolumeId volumeId, ProtonApiException<RevisionConflictResponse> innerException)
        : base(innerException.Message, innerException)
    {
        if (innerException.Response is not { } response)
        {
            return;
        }

        ConflictingNodeIsFileDraft = response.Conflict is { RevisionId: null, DraftRevisionId: not null };

        if (response.Conflict is { LinkId: { } linkId })
        {
            var conflictingNodeUid = new NodeUid(volumeId, linkId);

            ConflictingNodeUid = conflictingNodeUid;

            if (response.Conflict.RevisionId is { } revisionId)
            {
                ConflictingRevisionUid = new RevisionUid(conflictingNodeUid, revisionId);
            }
            else if (response.Conflict.DraftRevisionId is { } draftRevisionId)
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
