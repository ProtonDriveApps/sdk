namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Owner of the node (who owns the volume where the node is located).
/// </summary>
/// <param name="Email">Email of the owner for regular and photo volumes, null otherwise.</param>
/// <param name="Organization">Organization name for org. volumes, null otherwise.</param>
public sealed record OwnedBy(string? Email = null, string? Organization = null);
