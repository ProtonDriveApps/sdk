namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// A node access event to report to the server.
/// </summary>
/// <param name="NodeUid">The accessed node.</param>
/// <param name="AccessTime">
/// When the node was accessed, in UTC or with a known offset. Defaults to the moment of the call when omitted.
/// </param>
public readonly record struct RecentlyAccessedReportItem(NodeUid NodeUid, DateTimeOffset? AccessTime = null);
