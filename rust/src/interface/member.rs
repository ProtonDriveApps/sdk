use crate::interface::author::Author;

#[derive(Debug)]
pub struct Membership {
    role: MemberRole,
    /// Date when the node was shared with the user.
    invite_time: chrono::DateTime<chrono::offset::Utc>,
    /// Author who shared the node with the user.
    ///
    /// If the author cannot be verified, it means that the invitation could
    /// be forged by bad actor. User should be warned before accepting
    /// the invitation or opening the shared content.
    shared_by: Author,
    // TODO: accepted_by: Author,
}
#[derive(Debug)]
pub enum MemberRole {
    Viewer,
    Editor,
    Admin,
    Inherited,
}
impl MemberRole {
    pub fn to_string(&self) -> &'static str {
        match self {
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Admin => "admin",
            Self::Inherited => "inherited",
        }
    }
}
