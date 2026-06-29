using System.ComponentModel;
using Proton.Drive.Sdk.Events;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes.Events;

internal static class VolumeEventDtoExtensions
{
    public static DriveEvent ToDriveEvent(this VolumeEventDto volumeEvent, VolumeId volumeId)
    {
        var nodeUid = new NodeUid(volumeId, volumeEvent.Link.Id);
        NodeUid? parentNodeUid = volumeEvent.Link.ParentId is { } parentLinkId
            ? new NodeUid(volumeId, parentLinkId)
            : null;

        return volumeEvent.Type switch
        {
            VolumeEventType.Create or VolumeEventType.Update or VolumeEventType.UpdateMetadata => new NodeUpdatedEvent(
                volumeEvent.Id,
                nodeUid,
                parentNodeUid,
                volumeEvent.Link.IsTrashed,
                volumeEvent.Link.IsShared),
            VolumeEventType.Delete => new NodeDeletedEvent(volumeEvent.Id, nodeUid, parentNodeUid),

            _ => throw new InvalidEnumArgumentException(nameof(volumeEvent), (int)volumeEvent.Type, typeof(VolumeEventType)),
        };
    }
}
