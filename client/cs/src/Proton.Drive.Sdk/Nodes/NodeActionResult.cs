using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>The outcome of a node operation (move, trash, restore, delete) for a single node, streamed one per node as the operation completes.</summary>
public readonly record struct NodeActionResult(NodeUid NodeUid, Result<Exception> Result);
