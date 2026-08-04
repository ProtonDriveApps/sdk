using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>The outcome of updating the tags on a single photo, streamed one per photo as the update completes.</summary>
public readonly record struct PhotoUpdateResult(NodeUid NodeUid, Result<Exception> Result);
