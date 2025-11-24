namespace Proton.Drive.Sdk.Nodes;

public sealed record FileThumbnail(NodeUid FileUid, ReadOnlyMemory<byte> Data);
