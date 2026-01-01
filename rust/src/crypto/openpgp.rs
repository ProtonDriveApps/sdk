use crate::crypto::interface::{PrivateKey, PublicKey, SessionKey};
use crate::interface::author::UnverifiedAuthorError;
use crate::utils::either::Either;
use base64::{prelude::BASE64_STANDARD, Engine};
use rand::RngCore;
use std::error::Error;

struct KeyPacket {
    key: Vec<u8>,
}

struct GeneratedKey {
    key: PrivateKey,
    armored_key: String,
}

struct PGPData<T> {
    signature: Option<T>,
    data: Option<T>,
}

enum VerificationStatus {
    NotSigned,
    SignedAndValid,
    SignedAndInvalid,
}

struct VerificationResponse {
    verified: VerificationStatus,
    data: Option<Vec<u8>>,
    errors: Option<Vec<&'static dyn Error>>,
}

pub(crate) trait OpenPGPCrypto {
    /// Generate a random passphrase.
    ///
    /// 32 random bytes are generated and encoded into a base64 string.
    fn generate_passphrase(&self) -> String {
        BASE64_STANDARD.encode(rand::rng().fill_bytes(&mut vec![0u8; 32]))
    }

    fn generate_session_key(
        &self,
        encryption_keys: Vec<PrivateKey>,
    ) -> Result<PrivateKey, UnverifiedAuthorError>;
    fn encrypt_session_key(
        &self,
        session_key: SessionKey,
        encryption_keys: Either<PublicKey, Vec<PublicKey>>,
    ) -> Result<KeyPacket, &'static dyn Error>;
    fn encrypt_session_key_with_password(
        &self,
        session_key: SessionKey,
        password: String,
    ) -> Result<KeyPacket, &'static dyn Error>;

    /// Generate a new key pair locked by a passphrase.
    ///
    /// The key pair is generated using the Curve25519 algorithm.
    fn generate_key(&self, passphrase: String) -> Result<PrivateKey, &'static dyn Error>;

    fn encrypt_armored(
        &self,
        data: Vec<u8>,
        encryption_keys: Vec<PrivateKey>,
        session_key: Option<SessionKey>,
    ) -> Result<PGPData<String>, &'static dyn Error>;
    fn encrypt_and_sign(
        &self,
        data: Vec<u8>,
        encryption_keys: Vec<PrivateKey>,
        session_key: SessionKey,
        signing_key: PrivateKey,
    ) -> Result<PGPData<Vec<u8>>, &'static dyn Error>;
    fn encrypt_and_sign_armored(
        &self,
        data: Vec<u8>,
        encryption_keys: Vec<PrivateKey>,
        session_key: Option<SessionKey>,
        signing_key: PrivateKey,
    ) -> Result<PGPData<String>, &'static dyn Error>;
    fn encrypt_and_sign_detached(
        &self,
        data: Vec<u8>,
        encryption_keys: Vec<PrivateKey>,
        session_key: SessionKey,
        signing_key: PrivateKey,
    ) -> Result<PGPData<String>, &'static dyn Error>;
    fn encrypt_and_sign_detached_armored(
        &self,
        data: Vec<u8>,
        encryption_keys: Vec<PrivateKey>,
        session_key: SessionKey,
        signing_key: PrivateKey,
    ) -> Result<PGPData<String>, &'static dyn Error>;
    fn sign(
        &self,
        data: Vec<u8>,
        signing_key: PrivateKey,
        signature_context: String,
    ) -> Result<PGPData<Vec<u8>>, &'static dyn Error>;
    fn sign_armored(
        &self,
        data: Vec<u8>,
        signing_key: Either<PrivateKey, Vec<PrivateKey>>,
    ) -> Result<PGPData<Vec<u8>>, &'static dyn Error>;
    fn verify(
        &self,
        data: Vec<u8>,
        signature: Vec<u8>,
        verification_keys: Either<PublicKey, Vec<PublicKey>>,
    ) -> Result<VerificationResponse, &'static dyn Error>;
    fn verify_armored(
        &self,
        data: Vec<u8>,
        signature: String,
        verification_keys: Either<PublicKey, Vec<PublicKey>>,
        signature_context: Option<String>,
    ) -> Result<VerificationResponse, &'static dyn Error>;
    fn decrypt_session_key(
        &self,
        data: Vec<u8>,
        decryption_keys: Either<PrivateKey, Vec<PrivateKey>>,
    ) -> Result<SessionKey, &'static dyn Error>;
    fn decrypt_armored_session_key(
        &self,
        data: String,
        decryption_keys: Either<PrivateKey, Vec<PrivateKey>>,
    ) -> Result<SessionKey, &'static dyn Error>;
    fn decrypt_key(
        &self,
        key: String,
        passphrase: String,
    ) -> Result<PrivateKey, &'static dyn Error>;
    fn decrypt_and_verify(
        &self,
        data: Vec<u8>,
        verification_keys: Either<PublicKey, Vec<PublicKey>>,
    ) -> Result<VerificationResponse, &'static dyn Error>;
    fn decrypt_and_verify_detached(
        &self,
        data: Vec<u8>,
        signature: Option<Vec<u8>>,
        session_key: SessionKey,
        verification_keys: Option<Either<PublicKey, Vec<PublicKey>>>,
    ) -> Result<VerificationResponse, &'static dyn Error>;
    fn decrypt_armored(
        &self,
        data: String,
        decryption_keys: Either<PrivateKey, Vec<PrivateKey>>,
    ) -> Result<Vec<u8>, &'static dyn Error>;
    fn decrypt_armored_and_verify(
        &self,
        data: String,
        decryption_keys: Either<PrivateKey, Vec<PrivateKey>>,
        verification_keys: Either<PublicKey, Vec<PublicKey>>,
    ) -> Result<VerificationResponse, &'static dyn Error>;
    fn decrypt_armored_and_verify_detached(
        &self,
        data: String,
        signature: Option<Vec<u8>>,
        session_key: SessionKey,
        verification_keys: Either<PublicKey, Vec<PublicKey>>,
    ) -> Result<Vec<u8>, &'static dyn Error>;
    fn decrypt_armored_with_password(
        &self,
        data: String,
        password: String,
    ) -> Result<Vec<u8>, &'static dyn Error>;
}
