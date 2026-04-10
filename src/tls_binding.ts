/**
 * tls_binding.ts — RFC 5705 TLS Exporter binding for TTTPS
 *
 * Implements Section 7.1 of draft-helmprotocol-tttps-02:
 *   binding_key = TLS-Exporter("EXPORTER-tttps-pot-binding",
 *                               pot_record_without_sig, 32)
 *
 * Both client and server derive the same 32-byte key from the
 * shared TLS session master secret. A PoT frame generated in
 * session A cannot be replayed into session B.
 *
 * Node.js API: tls.TLSSocket.exportKeyingMaterial()
 * Available since Node.js 13.x (LTS 14+)
 * RFC 5705 compliant.
 */

import * as tls from "tls";

/** Label defined in draft-helmprotocol-tttps-02 Section 7.1 */
export const TTTPS_EXPORTER_LABEL = "EXPORTER-tttps-pot-binding";
export const TTTPS_BINDING_KEY_LENGTH = 32; // octets per RFC 5705

export interface BindingKeyResult {
  bindingKey: Buffer;   // 32 bytes, session-specific
  sessionId: string;    // hex, for debugging only
}

export class TLSBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TLSBindingError";
  }
}

/**
 * Derive the 32-byte binding key from a TLS session and a PoT record.
 *
 * @param socket          - Active TLS socket (must be in CONNECTED state)
 * @param potWithoutSig   - PoT record bytes WITHOUT the Ed25519 signature
 *                          (first 79 bytes of the 143-byte record:
 *                           Version[1] + Tier[1] + Reserved[1] +
 *                           Timestamp[8] + Confidence[4] +
 *                           Nonce[32] + GRGCommit[32])
 * @returns 32-byte binding key
 */
export function computeBindingKey(
  socket: tls.TLSSocket,
  potWithoutSig: Buffer
): BindingKeyResult {
  if (!socket.encrypted) {
    throw new TLSBindingError("Socket is not a TLS socket");
  }

  // exportKeyingMaterial(length, label, context, useContextFlag?)
  // context = pot_record_without_sig per RFC 5705 Section 4
  const bindingKey = socket.exportKeyingMaterial(
    TTTPS_BINDING_KEY_LENGTH,
    TTTPS_EXPORTER_LABEL,
    potWithoutSig     // context bound to this specific PoT record
  );

  const sessionId = (socket as any).getSession?.()?.toString("hex").slice(0, 16) ?? "unknown";

  return {
    bindingKey: Buffer.from(bindingKey),
    sessionId,
  };
}

/**
 * Verify that a received binding_key matches the expected value
 * for this TLS session and PoT record.
 *
 * This is the normative check from draft-helmprotocol-tttps-02 Section 7.1:
 *   "The verifier MUST recompute expected_key via TLS-Exporter
 *    and verify it matches the binding_key in the PoT frame header."
 *
 * @param socket            - Active TLS socket (same session as sender)
 * @param potWithoutSig     - PoT record bytes WITHOUT signature (79 bytes)
 * @param receivedBindingKey - 32-byte binding_key from the received PoT frame
 * @returns true if binding is valid, false if cross-session replay detected
 */
export function verifyBindingKey(
  socket: tls.TLSSocket,
  potWithoutSig: Buffer,
  receivedBindingKey: Buffer
): boolean {
  if (receivedBindingKey.length !== TTTPS_BINDING_KEY_LENGTH) {
    return false;
  }

  const { bindingKey: expected } = computeBindingKey(socket, potWithoutSig);

  // Constant-time comparison (prevents timing attacks)
  return timingSafeEqual(expected, receivedBindingKey);
}

/**
 * Constant-time Buffer comparison.
 * Node.js crypto.timingSafeEqual requires equal-length buffers.
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  const { timingSafeEqual } = require("crypto");
  return timingSafeEqual(a, b);
}
