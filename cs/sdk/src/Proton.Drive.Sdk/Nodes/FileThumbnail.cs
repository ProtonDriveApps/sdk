using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed record FileThumbnail(
    NodeUid FileUid,
    Result<ReadOnlyMemory<byte>, ProtonDriveError> Result);
