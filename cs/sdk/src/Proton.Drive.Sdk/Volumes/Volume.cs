using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Volumes;

internal sealed class Volume(VolumeId id, ShareId rootShareId, NodeUid rootFolderId, VolumeState state, long? maxSpace)
{
    internal Volume(VolumeDto dto)
        : this(dto.Id, dto.Root.ShareId, new NodeUid(dto.Id, dto.Root.LinkId), dto.State, dto.MaxSpace)
    {
    }

    public VolumeId Id { get; } = id;

    public ShareId RootShareId { get; } = rootShareId;

    public NodeUid RootFolderId { get; } = rootFolderId;

    public VolumeState State { get; } = state;

    public long? MaxSpace { get; } = maxSpace;
}
