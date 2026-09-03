namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Role of the user on a node, granting a set of permissions.
/// </summary>
public enum MemberRole
{
    /// <summary>
    /// The role is inherited from an ancestor node; the node is not shared directly with the user.
    /// </summary>
    Inherited = 0,

    /// <summary>
    /// The user can view the node but not modify it.
    /// </summary>
    Viewer = 1,

    /// <summary>
    /// The user can view and modify the node.
    /// </summary>
    Editor = 2,

    /// <summary>
    /// The user can view, modify and manage sharing of the node.
    /// </summary>
    Admin = 3,
}
