use crate::crypto::interface::*;

struct KeyListEntry {
    id: String,
    key: &'static dyn Key,
}

struct ProtonDriveAccountAddress {
    email: String,
    address_id: String,
    primary_key_index: u64,
    keys: Vec<KeyListEntry>,
}

impl<'t> ProtonDriveAccountAddress {
    pub fn new(email: &'t str, address_id: &'t str) -> Self {
        Self {
            email: String::from(email),
            address_id: String::from(address_id),
            primary_key_index: 0,
            keys: Vec::new(),
        }
    }
}

trait ProtonDriveAccount {
    fn get_own_primary_address() -> Result<ProtonDriveAccountAddress, &'static str> {
        Err("address not set")
    }
    fn get_own_address(email_or_address_id: String) -> Option<ProtonDriveAccountAddress> {
        None
    }
    fn has_proton_account(email: &str) -> bool {
        true
    }
    fn get_public_keys(email: &str) -> Vec<PublicKey> {
        Vec::new()
    }
}

struct ManagedAccount {}
impl ProtonDriveAccount for ManagedAccount {
    fn get_own_primary_address() -> Result<ProtonDriveAccountAddress, &'static str> {
        Err("address not set")
    }
}
