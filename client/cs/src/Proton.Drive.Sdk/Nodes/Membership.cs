using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Membership information of a node that is shared directly with the user.
/// It is available only on nodes with direct access; children do not inherit it.
/// </summary>
public sealed record Membership
{
    /// <summary>
    /// Role granted to the user by this membership.
    /// </summary>
    public required MemberRole Role { get; init; }

    /// <summary>
    /// Date when the node was shared with the user.
    /// </summary>
    public required DateTime InviteTime { get; init; }

    /// <summary>
    /// Author who shared the node with the user, or a <see cref="SignatureVerificationError"/>
    /// with the claimed inviter when the invitation signature could not be verified (possibly forged).
    /// </summary>
    public required Result<Author, SignatureVerificationError> SharedBy { get; init; }
}
