pub type Author = Result<Option<String>, UnverifiedAuthorError>;
// TODO: pub type AnonymousUser -> Option::None; null in TS.

#[derive(Debug)]
pub struct UnverifiedAuthorError {
    pub claimed_author: String,
    pub error: String,
}

impl std::fmt::Display for UnverifiedAuthorError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_fmt(format_args!(
            "Unverified Author: {} {}",
            self.error, self.claimed_author
        ))
    }
}

impl std::error::Error for UnverifiedAuthorError {}
