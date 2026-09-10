using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Move;

public readonly record struct NodeMoveResult(NodeUid NodeUid, Result<Exception> Result);
