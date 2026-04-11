//! Roughtime wire format — draft-ietf-ntp-roughtime-19 TLV parser

pub const ROUGHTIME_MAGIC: u64 = 0x4d49544847554f52;

pub mod tags {
    pub const NONC: u32 = u32::from_le_bytes(*b"NONC");
    pub const PAD:  u32 = 0xff444150;
    pub const VER:  u32 = u32::from_le_bytes(*b"VER\0");
    pub const SREP: u32 = u32::from_le_bytes(*b"SREP");
    pub const SIG:  u32 = u32::from_le_bytes(*b"SIG\0");
    pub const CERT: u32 = u32::from_le_bytes(*b"CERT");
    pub const INDX: u32 = u32::from_le_bytes(*b"INDX");
    pub const PATH: u32 = u32::from_le_bytes(*b"PATH");
    pub const MIDP: u32 = u32::from_le_bytes(*b"MIDP");
    pub const RADI: u32 = u32::from_le_bytes(*b"RADI");
    pub const ROOT: u32 = u32::from_le_bytes(*b"ROOT");
    pub const DELE: u32 = u32::from_le_bytes(*b"DELE");
    pub const PUBK: u32 = u32::from_le_bytes(*b"PUBK");
    pub const MINT: u32 = u32::from_le_bytes(*b"MINT");
    pub const MAXT: u32 = u32::from_le_bytes(*b"MAXT");
}

#[derive(Debug, Clone)]
pub struct RoughtimeResponse {
    pub midp: u64,
    pub radi: u32,
    pub root: [u8; 32],
    pub sig:  [u8; 64],
    pub pubk: [u8; 32],
    pub mint: u64,
    pub maxt: u64,
    pub indx: u32,
    pub path: Vec<[u8; 32]>,
}

fn parse_msg(data: &[u8]) -> Option<std::collections::HashMap<u32, Vec<u8>>> {
    if data.len() < 4 { return None; }
    let num = u32::from_le_bytes(data[0..4].try_into().ok()?) as usize;
    if num == 0 || num > 64 { return None; }
    let header_size = 4 + (num - 1) * 4 + num * 4;
    if data.len() < header_size { return None; }

    let mut offsets = vec![0u32; num];
    for i in 1..num {
        let o = 4 + (i - 1) * 4;
        offsets[i] = u32::from_le_bytes(data[o..o+4].try_into().ok()?);
    }
    let mut tag_list = Vec::with_capacity(num);
    let tags_base = 4 + (num - 1) * 4;
    for i in 0..num {
        let o = tags_base + i * 4;
        tag_list.push(u32::from_le_bytes(data[o..o+4].try_into().ok()?));
    }
    let values_start = header_size;
    let mut map = std::collections::HashMap::new();
    for i in 0..num {
        let start = values_start + offsets[i] as usize;
        let end = if i + 1 < num { values_start + offsets[i+1] as usize } else { data.len() };
        if start <= data.len() && end <= data.len() && start <= end {
            map.insert(tag_list[i], data[start..end].to_vec());
        }
    }
    Some(map)
}

fn get_fixed<const N: usize>(map: &std::collections::HashMap<u32, Vec<u8>>, tag: u32) -> Option<[u8; N]> {
    let v = map.get(&tag)?;
    if v.len() != N { return None; }
    v.as_slice().try_into().ok()
}

fn get_u32_le(map: &std::collections::HashMap<u32, Vec<u8>>, tag: u32) -> Option<u32> {
    let b: [u8; 4] = get_fixed(map, tag)?;
    Some(u32::from_le_bytes(b))
}

fn get_u64_le(map: &std::collections::HashMap<u32, Vec<u8>>, tag: u32) -> Option<u64> {
    let b: [u8; 8] = get_fixed(map, tag)?;
    Some(u64::from_le_bytes(b))
}

pub fn parse_roughtime_response(packet: &[u8]) -> Option<RoughtimeResponse> {
    if packet.len() < 12 { return None; }
    let magic = u64::from_le_bytes(packet[0..8].try_into().ok()?);
    if magic != ROUGHTIME_MAGIC { return None; }
    let msg_len = u32::from_le_bytes(packet[8..12].try_into().ok()?) as usize;
    if packet.len() < 12 + msg_len { return None; }

    let outer = parse_msg(&packet[12..12+msg_len])?;
    let sig:  [u8; 64] = get_fixed(&outer, tags::SIG)?;
    let indx: u32      = get_u32_le(&outer, tags::INDX).unwrap_or(0);

    let path_raw = outer.get(&tags::PATH).map(|v| v.as_slice()).unwrap_or(&[]);
    let path: Vec<[u8; 32]> = path_raw.chunks_exact(32)
        .map(|c| c.try_into().unwrap())
        .collect();

    let srep_data = outer.get(&tags::SREP)?;
    let srep = parse_msg(srep_data)?;
    let midp: u64   = get_u64_le(&srep, tags::MIDP)?;
    let radi: u32   = get_u32_le(&srep, tags::RADI)?;
    let root: [u8; 32] = get_fixed(&srep, tags::ROOT)?;

    let (pubk, mint, maxt) = if let Some(cert_data) = outer.get(&tags::CERT) {
        if let Some(cert) = parse_msg(cert_data) {
            if let Some(dele_data) = cert.get(&tags::DELE) {
                if let Some(dele) = parse_msg(dele_data) {
                    let pk: [u8; 32] = get_fixed(&dele, tags::PUBK).unwrap_or([0u8; 32]);
                    let mi = get_u64_le(&dele, tags::MINT).unwrap_or(0);
                    let ma = get_u64_le(&dele, tags::MAXT).unwrap_or(u64::MAX);
                    (pk, mi, ma)
                } else { ([0u8;32], 0, u64::MAX) }
            } else { ([0u8;32], 0, u64::MAX) }
        } else { ([0u8;32], 0, u64::MAX) }
    } else { ([0u8;32], 0, u64::MAX) };

    Some(RoughtimeResponse { midp, radi, root, sig, pubk, mint, maxt, indx, path })
}

pub fn build_roughtime_request(nonce: &[u8; 32]) -> Vec<u8> {
    let mut msg = Vec::new();
    msg.extend_from_slice(&2u32.to_le_bytes());
    msg.extend_from_slice(&4u32.to_le_bytes()); // offset[1] = 4 (size of VER value)
    msg.extend_from_slice(&tags::VER.to_le_bytes());
    msg.extend_from_slice(&tags::NONC.to_le_bytes());
    msg.extend_from_slice(&1u32.to_le_bytes()); // VER = 1
    msg.extend_from_slice(nonce);
    let msg_len = msg.len() as u32;
    let mut pkt = Vec::with_capacity(1024);
    pkt.extend_from_slice(&ROUGHTIME_MAGIC.to_le_bytes());
    pkt.extend_from_slice(&msg_len.to_le_bytes());
    pkt.extend_from_slice(&msg);
    pkt.resize(1024, 0);
    pkt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_request_size() {
        assert_eq!(build_roughtime_request(&[0u8;32]).len(), 1024);
    }

    #[test]
    fn test_build_request_magic() {
        let pkt = build_roughtime_request(&[0u8;32]);
        assert_eq!(u64::from_le_bytes(pkt[0..8].try_into().unwrap()), ROUGHTIME_MAGIC);
    }

    #[test]
    fn test_build_request_nonce_embedded() {
        let nonce = [0xabu8; 32];
        let pkt = build_roughtime_request(&nonce);
        // nonce at: magic(8)+msg_len(4)+num_tags(4)+offset(4)+VER(4)+NONC(4)+VER_val(4) = 32
        assert_eq!(&pkt[32..64], &nonce);
    }

    #[test]
    fn test_parse_empty_none() {
        assert!(parse_roughtime_response(&[]).is_none());
    }

    #[test]
    fn test_parse_wrong_magic_none() {
        let mut p = vec![0u8; 100];
        p[0..8].copy_from_slice(&0xDEADBEEFu64.to_le_bytes());
        assert!(parse_roughtime_response(&p).is_none());
    }

    #[test]
    fn test_tag_constants_ascii() {
        assert_eq!(tags::NONC, u32::from_le_bytes(*b"NONC"));
        assert_eq!(tags::MIDP, u32::from_le_bytes(*b"MIDP"));
        assert_eq!(tags::RADI, u32::from_le_bytes(*b"RADI"));
        assert_eq!(tags::ROOT, u32::from_le_bytes(*b"ROOT"));
        assert_eq!(tags::SREP, u32::from_le_bytes(*b"SREP"));
    }
}
