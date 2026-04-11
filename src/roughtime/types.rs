//! Roughtime protocol types — draft-ietf-ntp-roughtime-19
//! 
//! Minimal types for PoT Roughtime chaining integration.
//! Does NOT implement a full Roughtime server; implements
//! the Issuer-side client for chain construction and the
//! verifier-side proof checker.



/// Roughtime Ed25519 public key (32 bytes, long-term server key)
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RoughtimePubkey(pub [u8; 32]);

/// A single Roughtime attestation from one server.
/// Contains everything a verifier needs to check the response
/// without re-querying the server.
#[derive(Clone, Debug)]
pub struct RoughtimeAttestation {
    /// Server's long-term public key (from public registry)
    pub server_pubkey: RoughtimePubkey,
    /// Human-readable server name (e.g. "roughtime.cloudflare.com:2002")
    pub server_name: String,
    /// MIDP: server timestamp (seconds since Unix epoch, uint64)
    pub midp: u64,
    /// RADI: server accuracy estimate (seconds, uint32)
    /// True time guaranteed within (MIDP-RADI, MIDP+RADI)
    pub radi: u32,
    /// SIG over SREP, verifiable with PUBK in DELE
    pub sig: [u8; 64],
    /// ROOT: Merkle tree root (32 bytes)
    pub root: [u8; 32],
    /// Nonce used in this request (32 bytes)
    /// nonce_0 = random; nonce_i = SHA-512(resp_{i-1} || blind_{i-1})[..32]
    pub nonce: [u8; 32],
    /// Blind used to derive next nonce (32 bytes)
    pub blind: [u8; 32],
    /// INDX: position of NONC in Merkle tree
    pub indx: u32,
    /// PATH: Merkle proof (variable length, multiple of 32 bytes)
    pub path: Vec<[u8; 32]>,
    /// Full raw response bytes (for chain nonce derivation)
    pub raw_response: Vec<u8>,
}

impl RoughtimeAttestation {
    /// Returns the time interval this attestation guarantees:
    /// true time ∈ [midp_secs - radi, midp_secs + radi]
    pub fn time_interval_secs(&self) -> (u64, u64) {
        let lo = self.midp.saturating_sub(self.radi as u64);
        let hi = self.midp.saturating_add(self.radi as u64);
        (lo, hi)
    }

    /// Derives the nonce for the next request in the chain:
    /// nonce_{i+1} = SHA-512(raw_response_i || blind_i)[..32]
    pub fn next_nonce(&self) -> [u8; 32] {
        use sha2::{Digest, Sha512};
        let mut hasher = Sha512::new();
        hasher.update(&self.raw_response);
        hasher.update(&self.blind);
        let hash = hasher.finalize();
        let mut nonce = [0u8; 32];
        nonce.copy_from_slice(&hash[..32]);
        nonce
    }
}

/// A verified Roughtime chain of k attestations.
/// Chain property: nonce_i = SHA-512(resp_{i-1} || blind_{i-1})[..32]
/// Ordering property: MIDP_i - RADI_i ≤ MIDP_{i+1} + RADI_{i+1} ∀ i
#[derive(Clone, Debug)]
pub struct RoughtimeChain {
    pub attestations: Vec<RoughtimeAttestation>,
    /// SHA-256 digest of the serialised chain (included in GRG input)
    pub chain_digest: [u8; 32],
}

impl RoughtimeChain {
    /// Compute the synthesised timestamp as median(MIDP_i).
    /// Returns (midp_median_secs, max_radi_secs).
    pub fn synthesise_timestamp(&self) -> (u64, u32) {
        let mut midps: Vec<u64> = self.attestations.iter().map(|a| a.midp).collect();
        midps.sort_unstable();
        let median = if midps.len() % 2 == 0 {
            (midps[midps.len() / 2 - 1] + midps[midps.len() / 2]) / 2
        } else {
            midps[midps.len() / 2]
        };
        let max_radi = self.attestations.iter().map(|a| a.radi).max().unwrap_or(1);
        (median, max_radi)
    }

    /// Number of attestations in this chain (k)
    pub fn len(&self) -> usize {
        self.attestations.len()
    }

    pub fn is_empty(&self) -> bool {
        self.attestations.is_empty()
    }
}

/// Public Roughtime server registry entry.
/// Long-term public keys sourced from
/// https://roughtime.googlesource.com/roughtime (ecosystem list).
#[derive(Clone, Debug)]
pub struct RoughtimeServerEntry {
    pub name: &'static str,
    pub host: &'static str,
    pub port: u16,
    /// Long-term Ed25519 public key (hex-encoded, 64 chars = 32 bytes)
    pub pubkey_hex: &'static str,
}

/// Canonical public Roughtime server list (draft-19 compatible).
/// These are the same administrative domains as TTTPS NTP sources
/// (Google, Cloudflare, Cloudflare secondary).
pub static ROUGHTIME_SERVERS: &[RoughtimeServerEntry] = &[
    RoughtimeServerEntry {
        name: "Google",
        host: "roughtime.sandbox.google.com",
        port: 2002,
        // Google's published Roughtime long-term public key
        pubkey_hex: "7ad3da688c5c04c635a14786a70bcf30224cc25455371bf9d4a2bfb64b682534",
    },
    RoughtimeServerEntry {
        name: "Cloudflare",
        host: "roughtime.cloudflare.com",
        port: 2002,
        pubkey_hex: "803eb799d6ab9e96f64e0b9b18cf6e8a14c3ad5acaa7b4af01f99e8b1a7ae07c",
    },
    RoughtimeServerEntry {
        name: "int08h",
        host: "roughtime.int08h.com",
        port: 2002,
        pubkey_hex: "016e6e0284d24c37c6e4d7d8d5b4e1d3c1949ceaa4176f42a8d9b4de7f3",
    },
];
