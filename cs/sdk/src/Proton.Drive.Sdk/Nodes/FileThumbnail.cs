namespace Proton.Drive.Sdk.Nodes;

public sealed record FileThumbnail(NodeUid FileUid, ThumbnailType Type, ReadOnlyMemory<byte> Data);
