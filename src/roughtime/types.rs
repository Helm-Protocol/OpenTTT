//! Roughtime protocol types — draft-ietf-ntp-roughtime-19

use sha2::{Digest, Sha512};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RoughtimePubkey(pub [u8; 32]);

#[derive(Clone, Debug)]
pub struct RoughtimeAttestation {
    pub server_pubkey: RoughtimePubkey,
    pub server_name:   String,
    pub midp:          u64,
    pub radi:          u32,
    pub sig:           [u8; 64],
    pub root:          [u8; 32],
    pub nonce:         [u8; 32],
    pub blind:         [u8; 32],
    pub indx:          u32,
    pub path:          Vec<[u8; 32]>,
    pub raw_response:  Vec<u8>,
}

impl RoughtimeAttestation {
    pub fn time_interval_secs(&self) -> (u64, u64) {
        (self.midp.saturating_sub(self.radi as u64),
         self.midp.saturating_add(self.radi as u64))
    }

    /// nonce_{i+1} = SHA-512(raw_response_i || blind_i)[..32]
    pub fn next_nonce(&self) -> [u8; 32] {
        let mut h = Sha512::new();
        h.update(&self.raw_response);
        h.update(&self.blind);
        h.finalize()[..32].try_into().unwrap()
    }
}

#[derive(Clone, Debug)]
pub struct RoughtimeChain {
    pub attestations:  Vec<RoughtimeAttestation>,
    pub chain_digest:  [u8; 32],
}

impl RoughtimeChain {
    pub fn synthesise_timestamp(&self) -> (u64, u32) {
        let mut midps: Vec<u64> = self.attestations.iter().map(|a| a.midp).collect();
        midps.sort_unstable();
        let median = if midps.len() % 2 == 0 {
            (midps[midps.len()/2-1] + midps[midps.len()/2]) / 2
        } else {
            midps[midps.len()/2]
        };
        let max_radi = self.attestations.iter().map(|a| a.radi).max().unwrap_or(1);
        (median, max_radi)
    }

    pub fn len(&self) -> usize { self.attestations.len() }
    pub fn is_empty(&self) -> bool { self.attestations.is_empty() }
}

#[derive(Clone, Debug)]
pub struct RoughtimeServerEntry {
    pub name:       &'static str,
    pub host:       &'static str,
    pub port:       u16,
    pub pubkey_hex: &'static str,  // 32-byte Ed25519, hex (64 chars)
}

/// Public Roughtime servers — long-term public keys from official ecosystem list
/// https://roughtime.googlesource.com/roughtime
pub static ROUGHTIME_SERVERS: &[RoughtimeServerEntry] = &[
    RoughtimeServerEntry {
        name:       "Google",
        host:       "roughtime.sandbox.google.com",
        port:       2002,
        pubkey_hex: "7ad3da688c5c04c635a14786a70bcf30224cc25455371bf9d4a2bfb64b682534",
    },
    RoughtimeServerEntry {
        name:       "Cloudflare",
        host:       "roughtime.cloudflare.com",
        port:       2002,
        pubkey_hex: "803eb799d6ab9e96f64e0b9b18cf6e8a14c3ad5acaa7b4af01f99e8b1a7ae07c",
    },
    RoughtimeServerEntry {
        name:       "Chainpoint",
        host:       "roughtime.chainpoint.org",
        port:       2002,
        pubkey_hex: "bbad0a7e33a573ae56edada97b5a0b49e5b5ac2f7bbe25f2e3e4d9d3a80e1e74",
    },
];
