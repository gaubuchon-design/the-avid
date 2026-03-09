// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Delta Compressor
// ═══════════════════════════════════════════════════════════════════════════
//
// WAN-optimized delta compression for bin operations. Uses compact binary
// encoding via DataView/ArrayBuffer rather than JSON to minimize bandwidth.
//
// Binary format per operation:
//   [1 byte: op type] [variable: op-specific fields]
//
// Strings are length-prefixed (2-byte uint16 length + UTF-8 bytes).
// The top-level buffer begins with a 4-byte uint32 operation count.
//

import type { BinOp, HLC } from './BinCRDT';

// ─── Op type codes ──────────────────────────────────────────────────────────

const OP_ADD_ASSET = 0x01;
const OP_REMOVE_ASSET = 0x02;
const OP_MOVE_ASSET = 0x03;
const OP_RENAME_ASSET = 0x04;
const OP_UPDATE_METADATA = 0x05;

// ─── Text encoder / decoder ─────────────────────────────────────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ─── Structural delta types ─────────────────────────────────────────────────

export interface StructuralDelta {
  added: any[];
  removed: string[];
  changed: { id: string; fields: Record<string, any> }[];
}

// ─── DeltaCompressor ────────────────────────────────────────────────────────

export class DeltaCompressor {
  // ── Binary encode/decode ──────────────────────────────────────────────

  /**
   * Compress an array of BinOps into a compact ArrayBuffer.
   *
   * Layout:
   *   [4 bytes: op count]
   *   For each op:
   *     [1 byte : type tag]
   *     [HLC    : wallMs(8) + counter(4) + nodeId(string)]
   *     [string : assetId]
   *     [op-specific payload]
   */
  compress(ops: BinOp[]): ArrayBuffer {
    // First pass: compute total byte length
    let totalBytes = 4; // op count header

    const encodedOps: Uint8Array[] = [];

    for (const op of ops) {
      const encoded = this.encodeOp(op);
      encodedOps.push(encoded);
      totalBytes += encoded.byteLength;
    }

    // Assemble buffer
    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, ops.length, true); // little-endian
    let offset = 4;

    for (const encoded of encodedOps) {
      bytes.set(encoded, offset);
      offset += encoded.byteLength;
    }

    return buffer;
  }

  /**
   * Decompress an ArrayBuffer back into BinOps.
   */
  decompress(buffer: ArrayBuffer): BinOp[] {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const count = view.getUint32(0, true);
    const ops: BinOp[] = [];
    let offset = 4;

    for (let i = 0; i < count; i++) {
      const { op, bytesRead } = this.decodeOp(bytes, view, offset);
      ops.push(op);
      offset += bytesRead;
    }

    return ops;
  }

  // ── Structural delta ──────────────────────────────────────────────────

  /**
   * Compute the structural difference between two states.
   * Each state element is expected to have an `id` field (or `assetId`).
   */
  computeDelta(
    before: any[],
    after: any[],
  ): StructuralDelta {
    const beforeMap = new Map<string, any>();
    for (const item of before) {
      const id = item.id ?? item.assetId;
      if (id) beforeMap.set(id, item);
    }

    const afterMap = new Map<string, any>();
    for (const item of after) {
      const id = item.id ?? item.assetId;
      if (id) afterMap.set(id, item);
    }

    // Added: in after but not in before
    const added: any[] = [];
    for (const [id, item] of afterMap) {
      if (!beforeMap.has(id)) {
        added.push(item);
      }
    }

    // Removed: in before but not in after
    const removed: string[] = [];
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) {
        removed.push(id);
      }
    }

    // Changed: in both but with different field values
    const changed: { id: string; fields: Record<string, any> }[] = [];
    for (const [id, afterItem] of afterMap) {
      const beforeItem = beforeMap.get(id);
      if (!beforeItem) continue;

      const changedFields: Record<string, any> = {};
      let hasChanges = false;

      // Compare all fields in afterItem
      for (const key of Object.keys(afterItem)) {
        if (key === 'id' || key === 'assetId') continue;
        if (!deepEqual(beforeItem[key], afterItem[key])) {
          changedFields[key] = afterItem[key];
          hasChanges = true;
        }
      }

      // Check for removed fields
      for (const key of Object.keys(beforeItem)) {
        if (key === 'id' || key === 'assetId') continue;
        if (!(key in afterItem)) {
          changedFields[key] = undefined;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        changed.push({ id, fields: changedFields });
      }
    }

    return { added, removed, changed };
  }

  /**
   * Apply a structural delta to a state array, producing a new state.
   */
  applyDelta(
    state: any[],
    delta: StructuralDelta,
  ): any[] {
    // Start by removing
    const removeSet = new Set(delta.removed);
    let result = state.filter((item) => {
      const id = item.id ?? item.assetId;
      return !removeSet.has(id);
    });

    // Apply changes
    result = result.map((item) => {
      const id = item.id ?? item.assetId;
      const change = delta.changed.find((c) => c.id === id);
      if (!change) return item;

      const updated = { ...item };
      for (const [key, value] of Object.entries(change.fields)) {
        if (value === undefined) {
          delete updated[key];
        } else {
          updated[key] = value;
        }
      }
      return updated;
    });

    // Add new items
    result = result.concat(delta.added);

    return result;
  }

  // ── Private: binary encoding helpers ──────────────────────────────────

  private encodeOp(op: BinOp): Uint8Array {
    const parts: Uint8Array[] = [];

    // Type tag
    parts.push(new Uint8Array([this.opTypeTag(op.type)]));

    // HLC
    parts.push(this.encodeHLC(op.hlc));

    // assetId
    parts.push(this.encodeString(op.assetId));

    // Op-specific payload
    switch (op.type) {
      case 'add-asset':
        parts.push(this.encodeFloat64(op.position));
        parts.push(this.encodeString(JSON.stringify(op.assetData ?? null)));
        break;

      case 'remove-asset':
        // No additional payload
        break;

      case 'move-asset':
        parts.push(this.encodeFloat64(op.newPosition));
        break;

      case 'rename-asset':
        parts.push(this.encodeString(op.newName));
        break;

      case 'update-metadata':
        parts.push(this.encodeString(op.field));
        parts.push(this.encodeString(JSON.stringify(op.value ?? null)));
        break;
    }

    // Concatenate all parts
    const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    return result;
  }

  private decodeOp(
    bytes: Uint8Array,
    view: DataView,
    startOffset: number,
  ): { op: BinOp; bytesRead: number } {
    let offset = startOffset;

    // Type tag
    const tag = bytes[offset];
    offset += 1;

    // HLC
    const { hlc, bytesRead: hlcBytes } = this.decodeHLC(bytes, view, offset);
    offset += hlcBytes;

    // assetId
    const { str: assetId, bytesRead: assetIdBytes } = this.decodeString(bytes, view, offset);
    offset += assetIdBytes;

    let op: BinOp;

    switch (tag) {
      case OP_ADD_ASSET: {
        const position = view.getFloat64(offset, true);
        offset += 8;
        const { str: dataJson, bytesRead: dataBytes } = this.decodeString(bytes, view, offset);
        offset += dataBytes;
        op = {
          type: 'add-asset',
          assetId,
          position,
          assetData: JSON.parse(dataJson),
          hlc,
        };
        break;
      }

      case OP_REMOVE_ASSET:
        op = { type: 'remove-asset', assetId, hlc };
        break;

      case OP_MOVE_ASSET: {
        const newPosition = view.getFloat64(offset, true);
        offset += 8;
        op = { type: 'move-asset', assetId, newPosition, hlc };
        break;
      }

      case OP_RENAME_ASSET: {
        const { str: newName, bytesRead: nameBytes } = this.decodeString(bytes, view, offset);
        offset += nameBytes;
        op = { type: 'rename-asset', assetId, newName, hlc };
        break;
      }

      case OP_UPDATE_METADATA: {
        const { str: field, bytesRead: fieldBytes } = this.decodeString(bytes, view, offset);
        offset += fieldBytes;
        const { str: valueJson, bytesRead: valBytes } = this.decodeString(bytes, view, offset);
        offset += valBytes;
        op = {
          type: 'update-metadata',
          assetId,
          field,
          value: JSON.parse(valueJson),
          hlc,
        };
        break;
      }

      default:
        throw new Error(`Unknown op type tag: 0x${tag.toString(16)}`);
    }

    return { op, bytesRead: offset - startOffset };
  }

  private opTypeTag(type: BinOp['type']): number {
    switch (type) {
      case 'add-asset':
        return OP_ADD_ASSET;
      case 'remove-asset':
        return OP_REMOVE_ASSET;
      case 'move-asset':
        return OP_MOVE_ASSET;
      case 'rename-asset':
        return OP_RENAME_ASSET;
      case 'update-metadata':
        return OP_UPDATE_METADATA;
    }
  }

  // ── String encoding: [2-byte uint16 length] [UTF-8 bytes] ────────────

  private encodeString(str: string): Uint8Array {
    const encoded = textEncoder.encode(str);
    const result = new Uint8Array(2 + encoded.byteLength);
    const dv = new DataView(result.buffer, result.byteOffset, result.byteLength);
    dv.setUint16(0, encoded.byteLength, true);
    result.set(encoded, 2);
    return result;
  }

  private decodeString(
    bytes: Uint8Array,
    view: DataView,
    offset: number,
  ): { str: string; bytesRead: number } {
    const len = view.getUint16(offset, true);
    const strBytes = bytes.subarray(offset + 2, offset + 2 + len);
    return { str: textDecoder.decode(strBytes), bytesRead: 2 + len };
  }

  // ── HLC encoding: [8-byte wallMs] [4-byte counter] [string nodeId] ───

  private encodeHLC(hlc: HLC): Uint8Array {
    const nodeIdEncoded = textEncoder.encode(hlc.nodeId);
    const result = new Uint8Array(8 + 4 + 2 + nodeIdEncoded.byteLength);
    const dv = new DataView(result.buffer, result.byteOffset, result.byteLength);

    // wallMs as two 32-bit parts (BigInt not used for broader compat)
    dv.setUint32(0, Math.floor(hlc.wallMs / 0x100000000), true); // high
    dv.setUint32(4, hlc.wallMs >>> 0, true); // low
    dv.setUint32(8, hlc.counter, true);
    dv.setUint16(12, nodeIdEncoded.byteLength, true);
    result.set(nodeIdEncoded, 14);

    return result;
  }

  private decodeHLC(
    bytes: Uint8Array,
    view: DataView,
    offset: number,
  ): { hlc: HLC; bytesRead: number } {
    const high = view.getUint32(offset, true);
    const low = view.getUint32(offset + 4, true);
    const wallMs = high * 0x100000000 + (low >>> 0);
    const counter = view.getUint32(offset + 8, true);
    const nodeIdLen = view.getUint16(offset + 12, true);
    const nodeIdBytes = bytes.subarray(offset + 14, offset + 14 + nodeIdLen);
    const nodeId = textDecoder.decode(nodeIdBytes);

    return {
      hlc: { wallMs, counter, nodeId },
      bytesRead: 14 + nodeIdLen,
    };
  }

  // ── Float64 encoding ──────────────────────────────────────────────────

  private encodeFloat64(value: number): Uint8Array {
    const buf = new Uint8Array(8);
    const dv = new DataView(buf.buffer);
    dv.setFloat64(0, value, true);
    return buf;
  }
}

// ─── Deep equality helper ───────────────────────────────────────────────────

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const deltaCompressor = new DeltaCompressor();
