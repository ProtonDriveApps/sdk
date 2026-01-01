use crate::utils::either::Either;
use chrono::{DateTime, Utc};

pub(crate) trait Key {
    fn get_version(&self) -> u64;
    fn get_fingerprint(&self) -> String;
    fn get_sha256_fingerprints(&self) -> Vec<String>;
    fn get_key_id(&self) -> String;
    fn get_key_ids(&self) -> Vec<String>;
    fn is_private_key(&self) -> bool;
    fn get_creation_time(&self) -> DateTime<Utc>;
    fn get_expiration_time(&self) -> Option<Either<DateTime<Utc>, u64>>;
    fn get_user_ids(&self) -> Vec<String>;
    fn is_weak(&self) -> bool;
    fn equals(&self, other: &'static dyn Key, ignore_other_certs: bool) -> bool;
    // TODO: is_v4, is_v6
    fn get_subkeys(&self) -> Vec<&'static dyn SubKey>;
}

pub trait SubKey {
    fn get_algorithm_info(&self) -> String;
    fn get_key_id(&self) -> String;
}

#[derive(Debug, Copy, Clone)]
pub struct PublicKey {}
impl Key for PublicKey {
    fn get_version(&self) -> u64 {
        todo!()
    }

    fn get_fingerprint(&self) -> String {
        todo!()
    }

    fn get_sha256_fingerprints(&self) -> Vec<String> {
        todo!()
    }

    fn get_key_id(&self) -> String {
        todo!()
    }

    fn get_key_ids(&self) -> Vec<String> {
        todo!()
    }

    fn is_private_key(&self) -> bool {
        false
    }

    fn get_creation_time(&self) -> DateTime<Utc> {
        todo!()
    }

    fn get_expiration_time(&self) -> Option<Either<DateTime<Utc>, u64>> {
        todo!()
    }

    fn get_user_ids(&self) -> Vec<String> {
        todo!()
    }

    fn is_weak(&self) -> bool {
        todo!()
    }

    fn equals(&self, other: &'static dyn Key, ignore_other_certs: bool) -> bool {
        if !other.is_private_key() {
            // TODO: Handle
            return true;
        }
        false
    }

    fn get_subkeys(&self) -> Vec<&'static dyn SubKey> {
        todo!()
    }
}

#[derive(Debug, Copy, Clone)]
pub struct PrivateKey {}
impl Key for PrivateKey {
    fn get_version(&self) -> u64 {
        todo!()
    }

    fn get_fingerprint(&self) -> String {
        todo!()
    }

    fn get_sha256_fingerprints(&self) -> Vec<String> {
        todo!()
    }

    fn get_key_id(&self) -> String {
        todo!()
    }

    fn get_key_ids(&self) -> Vec<String> {
        todo!()
    }

    fn is_private_key(&self) -> bool {
        true
    }

    fn get_creation_time(&self) -> DateTime<Utc> {
        todo!()
    }

    fn get_expiration_time(&self) -> Option<Either<DateTime<Utc>, u64>> {
        todo!()
    }

    fn get_user_ids(&self) -> Vec<String> {
        todo!()
    }

    fn is_weak(&self) -> bool {
        todo!()
    }

    fn equals(&self, other: &'static dyn Key, ignore_other_certs: bool) -> bool {
        todo!()
    }

    fn get_subkeys(&self) -> Vec<&'static dyn SubKey> {
        todo!()
    }
}

pub struct SessionKey {
    data: Vec<u8>,
    algorithm: String,
    aead_algorithm: String,
}
