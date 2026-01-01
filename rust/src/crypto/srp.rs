use std::error::Error;

struct SRPResult {
    expected_server_proof: String,
    client_proof: String,
    client_ephemeral: String,
}

struct SRPVerifier {
    modulus_id: String,
    version: u64,
    salt: String,
    verifier: String,
}

pub(crate) trait SRPModule {
    fn get_srp(
        &self,
        version: u64,
        modulus: String,
        server_ephemeral: String,
        salt: String,
        password: String,
    ) -> Result<SRPResult, &'static dyn Error>;
    fn get_srp_verifier(&self, password: String) -> Result<SRPVerifier, &'static dyn Error>;
    fn compute_key_password(
        &self,
        password: String,
        salt: String,
    ) -> Result<String, &'static dyn Error>;
}
