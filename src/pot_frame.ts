/**
 * pot_frame.ts — TTTPS PoT Frame encoder/decoder
 *
 * Wire format per draft-helmprotocol-tttps-02 Section 7.1:
 *
 *   +----------------------------------+
 *   |  binding_key  (32 bytes)         |  ← TLS Exporter output
 *   +----------------------------------+
 *   |  pot_record   (143 bytes)        |  ← Section 4.1
 *   |    Version[1] Tier[1] Res[1]     |
 *   |    Timestamp[8]                  |
 *   |    Confidence[4]                 |
 *   |    Nonce[32]                     |
 *   |    GRGCommit[32]                 |
 *   |    Ed25519Sig[64]                |
 *   +----------------------------------+
 *   Total: 175 bytes
 *
 * pot_record_without_sig = first 79 bytes of pot_record
 * (used as TLS Exporter context)
 */

export const POT_RECORD_SIZE       = 143;  // bytes
export const POT_WITHOUT_SIG_SIZE  = 79;   // bytes (143 - 64 sig)
export const BINDING_KEY_SIZE      = 32;   // bytes
export const POT_FRAME_SIZE        = 175;  // bytes (32 + 143)

export interface PotFrame {
  bindingKey:    Buffer;   // 32 bytes
  potRecord:     Buffer;   // 143 bytes
  // Parsed fields (for convenience)
  version:       number;   // 4 bits
  tier:          number;   // 4 bits
  reserved:      number;   // 8 bits
  timestamp:     bigint;   // 64 bits, nanoseconds since epoch
  confidence:    number;   // 32 bits, ppm
  nonce:         Buffer;   // 32 bytes
  grgCommit:     Buffer;   // 32 bytes
  ed25519Sig:    Buffer;   // 64 bytes
}

export class PotFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PotFrameError";
  }
}

/**
 * Encode a PoT frame (175 bytes) from components.
 */
export function encodePotFrame(
  bindingKey: Buffer,
  potRecord: Buffer
): Buffer {
  if (bindingKey.length !== BINDING_KEY_SIZE) {
    throw new PotFrameError(
      `binding_key must be ${BINDING_KEY_SIZE} bytes, got ${bindingKey.length}`
    );
  }
  if (potRecord.length !== POT_RECORD_SIZE) {
    throw new PotFrameError(
      `pot_record must be ${POT_RECORD_SIZE} bytes, got ${potRecord.length}`
    );
  }

  const frame = Buffer.allocUnsafe(POT_FRAME_SIZE);
  bindingKey.copy(frame, 0);
  potRecord.copy(frame, BINDING_KEY_SIZE);
  return frame;
}

/**
 * Decode a PoT frame (175 bytes) into components.
 */
export function decodePotFrame(frame: Buffer): PotFrame {
  if (frame.length !== POT_FRAME_SIZE) {
    throw new PotFrameError(
      `PoT frame must be ${POT_FRAME_SIZE} bytes, got ${frame.length}`
    );
  }

  const bindingKey = frame.subarray(0, BINDING_KEY_SIZE);
  const potRecord  = frame.subarray(BINDING_KEY_SIZE, POT_FRAME_SIZE);

  // Parse pot_record fields (big-endian per Section 4.1)
  let offset = 0;

  // Byte 0: Version[4 bits] | Tier[4 bits]
  const versionTier = potRecord.readUInt8(offset++);
  const version  = (versionTier >> 4) & 0x0F;
  const tier     = versionTier & 0x0F;

  // Byte 1: Source Count (ignored in frame, stored separately)
  const _sourceCount = potRecord.readUInt8(offset++);

  // Byte 2: Reserved
  const reserved = potRecord.readUInt8(offset++);

  // Bytes 3-10: Timestamp (64-bit BE, nanoseconds)
  const timestamp = potRecord.readBigUInt64BE(offset);
  offset += 8;

  // Bytes 11-14: Confidence (32-bit BE, ppm)
  const confidence = potRecord.readUInt32BE(offset);
  offset += 4;

  // Bytes 15-46: Nonce (32 bytes)
  const nonce = Buffer.from(potRecord.subarray(offset, offset + 32));
  offset += 32;

  // Bytes 47-78: GRG Commitment (32 bytes)
  const grgCommit = Buffer.from(potRecord.subarray(offset, offset + 32));
  offset += 32;

  // Bytes 79-142: Ed25519 Signature (64 bytes)
  const ed25519Sig = Buffer.from(potRecord.subarray(offset, offset + 64));

  return {
    bindingKey:  Buffer.from(bindingKey),
    potRecord:   Buffer.from(potRecord),
    version,
    tier,
    reserved,
    timestamp,
    confidence,
    nonce,
    grgCommit,
    ed25519Sig,
  };
}

/**
 * Extract the portion of pot_record EXCLUDING the signature.
 * This is used as the TLS Exporter context (Section 7.1).
 * = first 79 bytes of the 143-byte pot_record
 */
export function potRecordWithoutSig(potRecord: Buffer): Buffer {
  if (potRecord.length !== POT_RECORD_SIZE) {
    throw new PotFrameError(`pot_record must be ${POT_RECORD_SIZE} bytes`);
  }
  return Buffer.from(potRecord.subarray(0, POT_WITHOUT_SIG_SIZE));
}

/**
 * Validate basic frame structure without TLS verification.
 * (Full verification requires a TLS socket — see tls_binding.ts)
 */
export function validatePotFrameStructure(frame: Buffer): void {
  if (frame.length !== POT_FRAME_SIZE) {
    throw new PotFrameError(`Expected ${POT_FRAME_SIZE} bytes, got ${frame.length}`);
  }
  const parsed = decodePotFrame(frame);
  if (parsed.version !== 1) {
    throw new PotFrameError(`Unknown PoT version: ${parsed.version}. Expected 1.`);
  }
  if (parsed.tier > 3) {
    throw new PotFrameError(`Invalid tier: ${parsed.tier}. Valid range 0-3.`);
  }
  if (parsed.reserved !== 0) {
    throw new PotFrameError(`Reserved field must be 0x00, got 0x${parsed.reserved.toString(16)}`);
  }
}
