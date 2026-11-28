// packages/shared/src/sidechains/thunder/borsh.ts
//
// Canonical Borsh encoder/decoder for Thunder's consensus serialization.
//
// Borsh rules in play (borsh.io spec): integers little-endian; fixed arrays
// raw with no length prefix; Vec = u32 length + elements; enums = u8 tag;
// dynamically-sized byte slices (as serialized here via &[u8]) = u32 length
// + bytes. Thunder's exact shapes come from thunder-rust types/ (v0.19.3):
//
//   OutPoint (types/transaction/outpoint.rs): enum tag
//     0 Regular { txid: 32B, vout: u32 }              → 37 bytes
//     1 Coinbase { txid: 32B, vout: u32 }             → 37 bytes
//     2 Deposit(bitcoin::OutPoint { txid: 32B RAW INTERNAL byte order,
//                vout: u32 })                        → 37 bytes
//     3 UnsuccessfulWithdrawal { m6id: 32B, height: u32, vout: u32 }
//                                                     → 73 bytes
//   Content (types/transaction/output/content.rs):
//     0 Value(u64 sats)
//     1 Withdrawal { value: u64, main_fee: u64, main_address: scriptPubKey
//                    as u32-len-prefixed bytes }
//   Output: 20-byte address hash (raw) + Content
//   PointedOutput: OutPoint + Output (no wrapper)
//   Transaction (types/transaction/mod.rs):
//     inputs: Vec<(OutPoint, Hash)>   — each Hash = 32 raw bytes
//     proof: #[borsh(skip)]           — ABSENT from the signed bytes and txid
//     outputs: Vec<Output>
//
// `bitcoin::Amount` serializes as u64 sats (types/util.rs
// borsh::bitcoin_amount → to_sat()). `bitcoin::Address` serializes as its
// scriptPubKey bytes with a u32 length prefix (types/util.rs
// borsh::bitcoin_address → BorshSerialize::serialize(spk.as_bytes())).

/** Growing byte buffer with Borsh write primitives. */
export class BorshWriter {
  private buf: number[] = [];

  writeU8(v: number): void {
    this.buf.push(v & 0xff);
  }

  writeU32(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff_ffff) {
      throw new Error(`BorshWriter.writeU32: out of range: ${v}`);
    }
    // Borsh integers are LITTLE-ENDIAN.
    this.buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }

  writeU64(v: bigint): void {
    if (v < 0n || v > 0xffff_ffff_ffff_ffffn) {
      throw new Error(`BorshWriter.writeU64: out of range: ${v}`);
    }
    let x = v;
    for (let i = 0; i < 8; i++) {
      this.buf.push(Number(x & 0xffn));
      x >>= 8n;
    }
  }

  writeFixedBytes(bytes: Uint8Array): void {
    for (const b of bytes) this.buf.push(b);
  }

  writeVarBytes(bytes: Uint8Array): void {
    this.writeU32(bytes.length);
    this.writeFixedBytes(bytes);
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }

  get length(): number {
    return this.buf.length;
  }
}

/** Cursor reader with Borsh read primitives. */
export class BorshReader {
  private pos = 0;

  constructor(private readonly data: Uint8Array) {}

  private take(n: number): Uint8Array {
    if (this.pos + n > this.data.length) {
      throw new Error(`BorshReader: unexpected end of input at offset ${this.pos} (need ${n})`);
    }
    const out = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  readU8(): number {
    return this.take(1)[0];
  }

  readU32(): number {
    const b = this.take(4);
    return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  }

  readU64(): bigint {
    const b = this.take(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) {
      v = (v << 8n) | BigInt(b[i]);
    }
    return v;
  }

  readFixedBytes(n: number): Uint8Array {
    return this.take(n);
  }

  readVarBytes(): Uint8Array {
    const len = this.readU32();
    return this.take(len);
  }

  get consumed(): number {
    return this.pos;
  }
}
