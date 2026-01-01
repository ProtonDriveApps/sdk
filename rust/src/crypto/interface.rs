pub trait Key {}

#[derive(Debug, Copy, Clone)]
pub struct PublicKey {}
impl Key for PublicKey {}

#[derive(Debug, Copy, Clone)]
pub struct PrivateKey {}
impl Key for PrivateKey {}