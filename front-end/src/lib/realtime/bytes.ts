/**
 * Socket.IO delivers binary payloads to the browser as ArrayBuffer, but the
 * server emits Uint8Array and the tests send Buffers — so normalise before
 * anything reaches Yjs, which accepts only Uint8Array.
 *
 * Returns null for anything that isn't binary; callers drop those frames
 * rather than throwing, matching the server's own toBytes().
 */
export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}
