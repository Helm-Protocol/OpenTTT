//! Roughtime async UDP client — draft-ietf-ntp-roughtime-19
//!
//! Queries real Roughtime servers (Google, Cloudflare) via UDP port 2002.
//! Builds the nonce chain for Inflow-to-Proof (Theorem 0, §5.1.1).

use tokio::net::UdpSocket;
use tokio::time::{timeout, Duration};
use rand::RngCore;
use sha2::{Digest, Sha512};

use super::types::{RoughtimeAttestation, RoughtimeChain, RoughtimePubkey, ROUGHTIME_SERVERS};
use super::chain::build_chain;
use super::wire::{build_roughtime_request, parse_roughtime_response};

const RESPONSE_TIMEOUT: Duration = Duration::from_secs(5);
const RECV_BUF: usize = 4096;

#[derive(Debug)]
pub enum RoughtimeClientError {
    Io(std::io::Error),
    Timeout,
    ParseFailed,
    ChainBuildFailed(super::chain::ChainError),
    InsufficientServers { got: usize, min: usize },
}

impl std::fmt::Display for RoughtimeClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e)   => write!(f, "IO: {}", e),
            Self::Timeout => write!(f, "timeout"),
            Self::ParseFailed => write!(f, "response parse failed"),
            Self::ChainBuildFailed(e) => write!(f, "chain: {:?}", e),
            Self::InsufficientServers { got, min } =>
                write!(f, "only {} of {} servers responded", got, min),
        }
    }
}

impl From<std::io::Error> for RoughtimeClientError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}

/// Query one Roughtime server via UDP
/// Returns RoughtimeAttestation on success
pub async fn query_server(
    host: &str,
    port: u16,
    pubkey: &[u8; 32],
    server_name: &str,
    nonce: [u8; 32],
    blind: [u8; 32],
) -> Result<RoughtimeAttestation, RoughtimeClientError> {
    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    let addr = format!("{}:{}", host, port);
    socket.connect(&addr).await?;

    let request = build_roughtime_request(&nonce);
    timeout(RESPONSE_TIMEOUT, socket.send(&request)).await
        .map_err(|_| RoughtimeClientError::Timeout)??;

    let mut buf = vec![0u8; RECV_BUF];
    let n = timeout(RESPONSE_TIMEOUT, socket.recv(&mut buf)).await
        .map_err(|_| RoughtimeClientError::Timeout)??;

    let raw_response = buf[..n].to_vec();
    let parsed = parse_roughtime_response(&raw_response)
        .ok_or(RoughtimeClientError::ParseFailed)?;

    Ok(RoughtimeAttestation {
        server_pubkey: RoughtimePubkey(*pubkey),
        server_name:   server_name.to_string(),
        midp:          parsed.midp,
        radi:          parsed.radi,
        sig:           parsed.sig,
        root:          parsed.root,
        nonce,
        blind,
        indx:          parsed.indx,
        path:          parsed.path,
        raw_response,
    })
}

/// Build a k-server Roughtime chain (nonce linkage per draft-19 §5.4)
/// nonce_0 = CSPRNG
/// nonce_i = SHA-512(response_{i-1} || blind_{i-1})[..32]
pub async fn build_roughtime_chain(
    min_k: usize,
) -> Result<RoughtimeChain, RoughtimeClientError> {
    let servers = ROUGHTIME_SERVERS;
    let mut rng = rand::thread_rng();

    let mut nonce = [0u8; 32];
    rng.fill_bytes(&mut nonce);

    let mut attestations = Vec::with_capacity(servers.len());

    for server in servers {
        let mut blind = [0u8; 32];
        rng.fill_bytes(&mut blind);

        // Decode pubkey hex
        let pubkey_bytes = match hex::decode(server.pubkey_hex) {
            Ok(b) if b.len() == 32 => {
                let mut k = [0u8; 32];
                k.copy_from_slice(&b);
                k
            }
            _ => { continue; }
        };

        match query_server(server.host, server.port, &pubkey_bytes, server.name, nonce, blind).await {
            Ok(att) => {
                // Derive next nonce: SHA-512(raw_response || blind)[..32]
                let mut h = Sha512::new();
                h.update(&att.raw_response);
                h.update(&att.blind);
                let hash = h.finalize();
                nonce = hash[..32].try_into().unwrap();
                attestations.push(att);
            }
            Err(e) => {
                tracing::warn!("Roughtime server {} failed: {}", server.name, e);
            }
        }
    }

    if attestations.len() < min_k {
        return Err(RoughtimeClientError::InsufficientServers {
            got: attestations.len(),
            min: min_k,
        });
    }

    build_chain(attestations).map_err(RoughtimeClientError::ChainBuildFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::build_roughtime_request;
    use crate::wire::ROUGHTIME_MAGIC;

    #[test]
    fn test_request_has_correct_magic() {
        let req = build_roughtime_request(&[0u8; 32]);
        let magic = u64::from_le_bytes(req[0..8].try_into().unwrap());
        assert_eq!(magic, ROUGHTIME_MAGIC);
    }

    #[test]
    fn test_request_minimum_size() {
        assert_eq!(build_roughtime_request(&[0u8; 32]).len(), 1024);
    }

    #[test]
    fn test_nonce_chain_derivation() {
        // Verify nonce derivation: SHA-512(response || blind)[..32]
        let response = vec![0xabu8; 64];
        let blind    = [0xcdu8; 32];
        let mut h = Sha512::new();
        h.update(&response);
        h.update(&blind);
        let hash = h.finalize();
        let next_nonce: [u8; 32] = hash[..32].try_into().unwrap();
        assert_ne!(next_nonce, [0u8; 32]);
    }

    #[test]
    fn test_pubkey_hex_decode() {
        // All ROUGHTIME_SERVERS pubkeys must decode to 32 bytes
        for server in ROUGHTIME_SERVERS {
            let bytes = hex::decode(server.pubkey_hex).expect("valid hex");
            assert_eq!(bytes.len(), 32, "{} pubkey wrong length", server.name);
        }
    }
}
