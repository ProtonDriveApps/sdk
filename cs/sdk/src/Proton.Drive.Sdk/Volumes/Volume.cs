using Proton.Drive.Sdk.Volumes.Api;

namespace Proton.Drive.Sdk.Volumes;

internal sealed class Volume(VolumeId id, ShareId rootShareId, LinkId rootFolderId, VolumeState state, long? maxSpace)
{
    internal Volume(VolumeDto dto)
        : this(dto.Id, dto.Root.ShareId, dto.Root.LinkId, dto.State, dto.MaxSpace)
    {
    }

    public VolumeId Id { get; } = id;

    public ShareId RootShareId { get; } = rootShareId;

    public LinkId RootFolderId { get; } = rootFolderId;

    public VolumeState State { get; } = state;

    public long? MaxSpace { get; } = maxSpace;
}
