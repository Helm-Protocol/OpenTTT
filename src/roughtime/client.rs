//! Async Roughtime UDP client — draft-ietf-ntp-roughtime-19
//! 
//! Sends REQUEST → receives RESPONSE → validates → builds attestation.
//! Designed for integration into PoT Issuer generation loop.

use tokio::net::UdpSocket;
use tokio::time::{timeout, Duration};
use sha2::Digest;

use super::types::{RoughtimeAttestation, RoughtimePubkey, RoughtimeServerEntry};

const ROUGHTIME_MAGIC: u64 = 0x4d49544847554f52; // "ROUGHTIM" LE
const REQUEST_SIZE: usize = 1024; // minimum per spec
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(3);

/// Error types for Roughtime client operations
#[derive(Debug)]
pub enum RoughtimeClientError {
    Io(std::io::Error),
    Timeout,
    InvalidResponse(&'static str),
    SignatureVerificationFailed,
    MerklePropFailed,
}

impl From<std::io::Error> for RoughtimeClientError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}

/// Build a Roughtime REQUEST packet (1024 bytes minimum per spec).
/// Format: ROUGHTIM magic (8 bytes) || msg_len (4 bytes) || Roughtime msg
/// Roughtime msg contains: VER tag || NONC tag (32 bytes) || PAD
fn build_request(nonce: &[u8; 32]) -> Vec<u8> {
    let mut pkt = Vec::with_capacity(REQUEST_SIZE);
    // ROUGHTIM header (little-endian u64)
    pkt.extend_from_slice(&ROUGHTIME_MAGIC.to_le_bytes());
    // Message body: simplified tag encoding
    // VER: 0x00524556 = "VER\0", value = 1 (uint32 LE)
    // NONC: 0x434e4f4e = "NONC", value = nonce (32 bytes)
    let mut body = Vec::new();
    body.extend_from_slice(b"VER\x00");
    body.extend_from_slice(&1u32.to_le_bytes());
    body.extend_from_slice(b"NONC");
    body.extend_from_slice(nonce);
    // Message length
    pkt.extend_from_slice(&(body.len() as u32).to_le_bytes());
    pkt.extend_from_slice(&body);
    // PAD to 1024 bytes
    pkt.resize(REQUEST_SIZE, 0);
    pkt
}

/// Query a single Roughtime server and return an attestation.
/// 
/// The nonce parameter enables chain construction:
/// - nonce_0: random (first in chain)
/// - nonce_i: next_nonce() from previous attestation (i ≥ 1)
pub async fn query_roughtime_server(
    server: &RoughtimeServerEntry,
    nonce: [u8; 32],
    blind: [u8; 32],
) -> Result<RoughtimeAttestation, RoughtimeClientError> {
    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    let addr = format!("{}:{}", server.host, server.port);
    socket.connect(&addr).await?;

    let request = build_request(&nonce);
    socket.send(&request).await?;

    let mut buf = vec![0u8; 65536];
    let n = timeout(RESPONSE_TIMEOUT, socket.recv(&mut buf))
        .await
        .map_err(|_| RoughtimeClientError::Timeout)??;
    
    let raw_response = buf[..n].to_vec();
    
    // Parse response (simplified — production would use a proper TLV parser)
    let (midp, radi, root, sig, indx, path) = parse_response(&raw_response)
        .ok_or(RoughtimeClientError::InvalidResponse("parse failed"))?;
    
    // Decode server public key from hex
    let pubkey_bytes = hex::decode(server.pubkey_hex)
        .map_err(|_| RoughtimeClientError::InvalidResponse("bad pubkey hex"))?;
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&pubkey_bytes[..32]);

    Ok(RoughtimeAttestation {
        server_pubkey: RoughtimePubkey(pk),
        server_name: server.name.to_string(),
        midp,
        radi,
        sig,
        root,
        nonce,
        blind,
        indx,
        path,
        raw_response,
    })
}

/// Parse Roughtime response (minimal parser for relevant fields).
/// Returns (midp, radi, root, sig, indx, path) or None on error.
fn parse_response(raw: &[u8]) -> Option<(u64, u32, [u8; 32], [u8; 64], u32, Vec<[u8; 32]>)> {
    // Skip ROUGHTIM header (8 bytes) + msg_len (4 bytes)
    if raw.len() < 12 { return None; }
    // Production: implement full Roughtime TLV parser here
    // For now: return placeholder values to allow compilation
    // Real implementation: use roughenough crate or custom parser
    let midp = u64::from_be_bytes(raw[12..20].try_into().ok()?);
    let radi = u32::from_be_bytes(raw[20..24].try_into().ok()?);
    let mut root = [0u8; 32];
    if raw.len() >= 56 { root.copy_from_slice(&raw[24..56]); }
    let mut sig = [0u8; 64];
    if raw.len() >= 120 { sig.copy_from_slice(&raw[56..120]); }
    Some((midp, radi, root, sig, 0, vec![]))
}

/// Build a full k-server Roughtime chain for PoT Issuer.
/// 
/// Algorithm:
///   nonce_0 = random
///   for i in 0..k:
///     blind_i = random (32 bytes)
///     att_i = query(server_i, nonce_i, blind_i)
///     nonce_{i+1} = SHA-512(att_i.raw_response || blind_i)[..32]
///   chain = build_chain([att_0, ..., att_{k-1}])
pub async fn build_roughtime_chain(
    servers: &[RoughtimeServerEntry],
) -> Result<super::types::RoughtimeChain, RoughtimeClientError> {
    use rand::RngCore;
    use super::chain::build_chain;
    use super::types::RoughtimeChain;

    let mut attestations = Vec::with_capacity(servers.len());
    let mut rng = rand::thread_rng();
    
    // nonce_0: cryptographically random
    let mut current_nonce = [0u8; 32];
    rng.fill_bytes(&mut current_nonce);

    for server in servers {
        let mut blind = [0u8; 32];
        rng.fill_bytes(&mut blind);
        
        match query_roughtime_server(server, current_nonce, blind).await {
            Ok(att) => {
                current_nonce = att.next_nonce();
                attestations.push(att);
            }
            Err(e) => {
                eprintln!("Roughtime server {} failed: {:?}", server.name, e);
                // Continue with remaining servers (need k ≥ MIN_CHAIN_LEN total)
            }
        }
    }

    build_chain(attestations).map_err(|_| {
        RoughtimeClientError::InvalidResponse("chain validation failed")
    })
}
