using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk;

public sealed class NodeWithSameNameExistsException : ValidationException
{
    public NodeWithSameNameExistsException()
    {
    }

    public NodeWithSameNameExistsException(string? message)
        : base(message)
    {
    }

    public NodeWithSameNameExistsException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal NodeWithSameNameExistsException(VolumeId volumeId, ProtonApiException<DetailedApiResponse> innerException)
        : this(volumeId, innerException.Response)
    {
    }

    internal NodeWithSameNameExistsException(VolumeId volumeId, DetailedApiResponse? response)
        : this(volumeId, response, innerException: null)
    {
    }

    private NodeWithSameNameExistsException(VolumeId volumeId, DetailedApiResponse? response = null, Exception? innerException = null)
        : base(response?.ErrorMessage, innerException, response?.Code)
    {
        if (response is null)
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
