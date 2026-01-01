use super::author::Author;
use super::member::{MemberRole, Membership};
use super::revisions::Revision;
use crate::utils::either::Either;
use std::error::Error;

struct FolderInfo {
    claimed_modification_time: chrono::DateTime<chrono::offset::Utc>,
}

struct NodeDetails {
    uid: String,
    parent_uid: Option<String>,
    key_author: Author,
    name_author: Author,
    direct_role: MemberRole,
    membership: Option<Membership>,
    node_type: NodeType,
    media_type: Option<String>,
    is_shared: bool,
    deprecated_share_id: Option<String>,
    creation_time: chrono::DateTime<chrono::offset::Utc>,
    trash_time: chrono::DateTime<chrono::offset::Utc>,
    total_storage_size: Option<u64>,
    folder: Option<FolderInfo>,
    tree_event_scope_id: String,
}

/// Node representing a file or folder in the system.
///
/// This is a happy path representation of the node. It is used in the SDK to
/// represent the node in a way that is easy to work with. Whenever any field
/// cannot be decrypted, it is returned as `DegradedNode` type.
///
/// SDK never returns this entity directly but wrapped in `MaybeNode`.
///
/// Note on naming: Node is reserved by JS/DOM, thus we need exception how the
/// entity is called.
struct NodeEntity {
    details: NodeDetails,
    name: String,
    active_revision: Option<Revision>,
}

/// Degraded node representing a file or folder in the system.
///
/// This is a degraded path representation of the node. It is used in the SDK to
/// represent the node in a way that is easy to work with. Whenever any field
/// cannot be decrypted, it is returned as `DegradedNode` type.
///
/// SDK never returns this entity directly but wrapped in `MaybeNode`.
///
/// The node can be still used around, but it is not guaranteed that all
/// properties are decrypted, or that all actions can be performed on it.
///
/// For example, if the node has issue decrypting the name, the name will be
/// set as `Error` and potentially rename or move actions will not be
/// possible, but download and upload new revision will still work.
struct DegradedNode {
    details: NodeDetails,
    name: Result<String, &'static dyn Error>,
    active_revision: Result<Revision, &'static dyn Error>,

    /// If the error is not related to any specific field, it is set here.
    ///
    /// For example, if the node has issue decrypting the name, the name will be
    /// set as `Error` while this will be empty.
    ///
    /// On the other hand, if the node has issue decrypting the node key, but
    /// the name is still working, this will include the node key error, while
    /// the name will be set to the decrypted value.
    errors: Option<Vec<String>>,
}

/// Node representing a file or folder in the system.
///
/// This covers both happy path and degraded path. It is used in the SDK to
/// represent the node in a way that is easy to work with. Whenever any field
/// cannot be decrypted, it is returned as `DegradedNode` type.
type MaybeNode = Either<NodeEntity, DegradedNode>;

struct MissingNode {
    uid: String,
}

/// Node representing a file or folder in the system, or missing node.
///
/// In most cases, SDK returns `MaybeNode`, but in some specific cases, when
/// client is requesting specific nodes, SDK must return `MissingNode` type
/// to indicate the case when the node is not available. That can be when
/// the node does not exist, or when the node is not available for the user
/// (e.g. unshared with the user).
type MaybeMissingNode = Either<NodeEntity, MissingNode>;

#[derive(Debug)]
enum NodeType {
    File,
    Folder,
    /// Album is a special type available only in Photos section.
    ///
    /// The SDK does not support any album-specific actions, but it can load
    /// the node and do general operations on it, such as sharing. However,
    /// you should not rely on that anything can work. It is not guaranteed that
    /// and in the future specific Photos SDK will support albums.
    ///
    /// @deprecated This type is not part of the public API.
    Album,
}
impl NodeType {
    pub fn to_string(&self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Folder => "folder",
            Self::Album => "album",
        }
    }
}

/// Invalid name error represents node name that includes invalid characters.
#[derive(Debug)]
struct InvalidNameError {
    /// Placeholder instead of node name that client can use to display.
    name: String,
    error: String,
}
impl std::fmt::Display for InvalidNameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_fmt(format_args!(
            "InvalidNameError: {} {}",
            self.error, self.name
        ))
    }
}
impl Error for InvalidNameError {}
