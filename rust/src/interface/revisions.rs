use crate::crypto::digest::Digest;
use crate::interface::author::Author;

#[derive(Debug)]
pub enum RevisionState {
    Active,
    Superseded,
}
impl RevisionState {
    pub fn to_string(&self) -> &'static str {
        match self {
            RevisionState::Active => "active",
            RevisionState::Superseded => "superseded",
        }
    }
}

#[derive(Debug)]
pub struct Revision {
    uid: String,
    state: RevisionState,
    creation_time: chrono::DateTime<chrono::offset::Utc>,
    content_author: Author,
    /// Encrypted size of the revision, as stored on the server.
    storage_size: u64,
    /// Raw size of the revision, as stored in extended attributes.
    claimed_size: Option<u64>,
    claimed_modification_time: chrono::DateTime<chrono::offset::Utc>,
    claimed_digests: Option<Digest>,
    // TODO: Claimed Additional Metadata -> Optional<dyn Metadata>? In ts it is typed as object in TS.
}