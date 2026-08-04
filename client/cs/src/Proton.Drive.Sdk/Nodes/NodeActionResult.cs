using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public readonly record struct NodeActionResult(NodeUid NodeUid, Result<Exception> Result);
