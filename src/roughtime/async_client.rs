//! Roughtime async UDP client — draft-ietf-ntp-roughtime-19
//! Full implementation: query → parse → build chain → return RoughtimeChain

use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::timeout;
use rand::RngCore;

use super::types::{RoughtimeAttestation, RoughtimeChain, RoughtimePubkey, ROUGHTIME_SERVERS};
use super::chain::{build_chain_unchecked, ChainError};
use super::wire::{build_roughtime_request, parse_roughtime_response};

const QUERY_TIMEOUT: Duration = Duration::from_secs(4);
const MIN_CHAIN: usize = 3;

#[derive(Debug)]
pub enum AsyncClientError {
    Io(std::io::Error),
    Timeout { server: String },
    ParseFailed { server: String },
    ChainBuildFailed(ChainError),
    InsufficientServers { got: usize, needed: usize },
}

impl From<std::io::Error> for AsyncClientError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}

impl std::fmt::Display for AsyncClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e)  => write!(f, "IO: {}", e),
            Self::Timeout { server } => write!(f, "timeout: {}", server),
            Self::ParseFailed { server } => write!(f, "parse failed: {}", server),
            Self::ChainBuildFailed(e) => write!(f, "chain: {:?}", e),
            Self::InsufficientServers { got, needed } =>
                write!(f, "only {}/{} servers responded", got, needed),
        }
    }
}

/// Query one Roughtime server via UDP and parse the response.
/// nonce: the 32-byte nonce for this request (chain-linked or random).
/// blind: random 32 bytes used to derive the next nonce.
pub async fn query_one_server(
    host:  &str,
    port:  u16,
    nonce: [u8; 32],
    blind: [u8; 32],
    pubkey_hex: &str,
) -> Result<RoughtimeAttestation, AsyncClientError> {
    // Bind local UDP socket
    let sock = UdpSocket::bind("0.0.0.0:0").await?;
    let addr = format!("{}:{}", host, port);
    sock.connect(&addr).await?;

    // Send REQUEST (1024 bytes minimum per spec)
    let req = build_roughtime_request(&nonce);
    sock.send(&req).await?;

    // Receive RESPONSE with timeout
    let mut buf = vec![0u8; 65536];
    let n = timeout(QUERY_TIMEOUT, sock.recv(&mut buf))
        .await
        .map_err(|_| AsyncClientError::Timeout { server: addr.clone() })??;

    let raw_response = buf[..n].to_vec();

    // Parse TLV response (wire.rs)
    let parsed = parse_roughtime_response(&raw_response)
        .ok_or_else(|| AsyncClientError::ParseFailed { server: addr.clone() })?;

    // Validate DELE timing: MIDP must be in [MINT, MAXT]
    if parsed.midp < parsed.mint || parsed.midp > parsed.maxt {
        return Err(AsyncClientError::ParseFailed { server: addr.clone() });
    }

    // Decode server pubkey
    let pk_bytes = hex::decode(pubkey_hex)
        .map_err(|_| AsyncClientError::ParseFailed { server: addr.clone() })?;
    let mut pk = [0u8; 32];
    if pk_bytes.len() == 32 { pk.copy_from_slice(&pk_bytes); }

    Ok(RoughtimeAttestation {
        server_pubkey: RoughtimePubkey(pk),
        server_name:   format!("{}:{}", host, port),
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

/// Build a k-server Roughtime chain using async UDP queries.
///
/// Chain construction (draft-19 §5.4):
///   nonce_0 = CSPRNG
///   for i in 0..k:
///     blind_i = CSPRNG
///     att_i   = query(server_i, nonce_i, blind_i)
///     nonce_{i+1} = SHA-512(att_i.raw_response || blind_i)[0:32]
///
/// Servers are tried sequentially to build the nonce chain.
/// Failures are skipped; chain succeeds if ≥ MIN_CHAIN servers respond.
pub async fn build_roughtime_chain_async() -> Result<RoughtimeChain, AsyncClientError> {
    let mut rng = rand::thread_rng();
    let mut attestations = Vec::with_capacity(ROUGHTIME_SERVERS.len());

    let mut current_nonce = [0u8; 32];
    rng.fill_bytes(&mut current_nonce);

    for server in ROUGHTIME_SERVERS {
        let mut blind = [0u8; 32];
        rng.fill_bytes(&mut blind);

        match query_one_server(server.host, server.port, current_nonce, blind, server.pubkey_hex).await {
            Ok(att) => {
                // Next nonce: SHA-512(raw_response || blind)[0:32] — per draft-19
                current_nonce = att.next_nonce();
                attestations.push(att);
            }
            Err(e) => {
                tracing::warn!("Roughtime server {} failed: {}", server.name, e);
                // Continue — degrade gracefully
            }
        }
    }

    if attestations.len() < MIN_CHAIN {
        return Err(AsyncClientError::InsufficientServers {
            got:    attestations.len(),
            needed: MIN_CHAIN,
        });
    }

    build_chain_unchecked(attestations).map_err(AsyncClientError::ChainBuildFailed)
}

/// Synthesise timestamp from chain (median of MIDP values, seconds → nanoseconds)
pub fn chain_to_timestamp_ns(chain: &RoughtimeChain) -> u64 {
    let (median_secs, _) = chain.synthesise_timestamp();
    median_secs * 1_000_000_000
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::build_roughtime_request;

    #[test]
    fn test_request_build_for_async_client() {
        let nonce = [0x55u8; 32];
        let pkt = build_roughtime_request(&nonce);
        assert_eq!(pkt.len(), 1024);
    }

    #[test]
    fn test_nonce_derivation_deterministic() {
        // next_nonce is deterministic for same raw_response + blind
        use crate::types::RoughtimeAttestation;
        let att = RoughtimeAttestation {
            server_pubkey: crate::types::RoughtimePubkey([0u8;32]),
            server_name: "test".to_string(),
            midp: 0, radi: 1,
            sig: [0u8;64], root: [0u8;32],
            nonce: [0u8;32], blind: [0u8;32],
            indx: 0, path: vec![],
            raw_response: b"test_response_bytes".to_vec(),
        };
        let n1 = att.next_nonce();
        let n2 = att.next_nonce();
        assert_eq!(n1, n2, "next_nonce must be deterministic");
    }

    #[test]
    fn test_async_client_error_display() {
        let e = AsyncClientError::Timeout { server: "roughtime.cloudflare.com:2002".to_string() };
        assert!(e.to_string().contains("timeout"));
    }
}
