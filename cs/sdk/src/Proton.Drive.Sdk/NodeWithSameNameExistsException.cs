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
        ConflictingNodeUid = response.Conflict.LinkId is not null
            ? new NodeUid(volumeId, response.Conflict.LinkId.Value)
            : null;
    }

    public bool? ConflictingNodeIsFileDraft { get; }
    public NodeUid? ConflictingNodeUid { get; }
}
