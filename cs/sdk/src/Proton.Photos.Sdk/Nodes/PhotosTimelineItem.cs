using Proton.Drive.Sdk.Nodes;

namespace Proton.Photos.Sdk.Nodes;

public sealed record PhotosTimelineItem(NodeUid Uid, DateTime CaptureTime);
