// sdk/tests/golay.test.ts
import { golayEncode, golayDecode } from "../vendor/helm-crypto";

describe("Golay(24,12) Extended Codec Re-Surgery Tests", () => {
    
    test("1. Roundtrip encode->decode (Original Identity)", () => {
        const data = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC]);
        const encoded = golayEncode(data);
        expect(encoded.length).toBe(data.length * 2); // 2x rate check
        
        const res = golayDecode(encoded);
        expect(res.data).toEqual(data);
        expect(res.corrected).toBe(0);
        expect(res.uncorrectable).toBe(false);
    });

    test("2. 1-bit Error Correction (Message bit)", () => {
        const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
        const encoded = golayEncode(data);
        
        // Flip 1 bit in message part (first byte)
        encoded[0] ^= 0x80; 
        
        const res = golayDecode(encoded);
        expect(res.data).toEqual(data);
        expect(res.corrected).toBe(1);
        expect(res.uncorrectable).toBe(false);
    });

    test("3. 2-bit Error Correction (Parity bits)", () => {
        const data = new Uint8Array([0xFF, 0xEE, 0xDD]);
        const encoded = golayEncode(data);
        
        // Flip 2 bits in parity part (third byte of first codeword)
        encoded[2] ^= 0x03;
        
        const res = golayDecode(encoded);
        expect(res.data).toEqual(data);
        expect(res.corrected).toBe(2);
        expect(res.uncorrectable).toBe(false);
    });

    test("4. 3-bit Error Correction (Mixed)", () => {
        const data = new Uint8Array([0x00, 0x11, 0x22]);
        const encoded = golayEncode(data);
        
        // Flip 1 msg bit + 2 parity bits
        encoded[0] ^= 0x01; // msg
        encoded[2] ^= 0x03; // 2 parity bits
        
        const res = golayDecode(encoded);
        expect(res.data).toEqual(data);
        expect(res.corrected).toBe(3);
        expect(res.uncorrectable).toBe(false);
    });

    test("5. 4-bit Error Detection (Uncorrectable)", () => {
        const data = new Uint8Array([0x55, 0x66, 0x77]);
        const encoded = golayEncode(data);
        
        // Flip 4 bits
        encoded[0] ^= 0x03; // 2 bits
        encoded[2] ^= 0x03; // 2 bits
        
        const res = golayDecode(encoded);
        expect(res.uncorrectable).toBe(true);
    });

    test("6. No Error (Zero Path)", () => {
        const data = new Uint8Array([0x00, 0x00, 0x00]);
        const encoded = golayEncode(data);
        const res = golayDecode(encoded);
        expect(res.data).toEqual(data);
        expect(res.corrected).toBe(0);
    });
});
