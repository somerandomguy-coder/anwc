/**
 * Synchronous SHA-256 for the browser build, so hashes and references computed
 * in the studio equal the ones the CLI computes with node:crypto.
 */
const K = new Uint32Array(64);
const INITIAL = new Uint32Array(8);
{
  let found = 0;
  for (let candidate = 2; found < 64; candidate++) {
    let prime = true;
    for (let d = 2; d * d <= candidate; d++) if (candidate % d === 0) { prime = false; break; }
    if (!prime) continue;
    const fraction = (root: number) => ((root - Math.floor(root)) * 2 ** 32) >>> 0;
    if (found < 8) INITIAL[found] = fraction(Math.sqrt(candidate));
    K[found++] = fraction(Math.cbrt(candidate));
  }
}

function sha256Hex(text: string): string {
  const input = new TextEncoder().encode(text);
  const length = (((input.length + 8) >> 6) + 1) * 64;
  const bytes = new Uint8Array(length);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(length - 8, Math.floor(input.length / 2 ** 29));
  view.setUint32(length - 4, (input.length << 3) >>> 0);

  const h = new Uint32Array(INITIAL);
  const w = new Uint32Array(64);
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      w[i] = w[i - 16]! + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, last] = h as unknown as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (last + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      last = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, last].forEach((value, i) => { h[i] = h[i]! + value; });
  }
  return Array.from(h, (value) => value.toString(16).padStart(8, '0')).join('');
}

export function createHash(algorithm: string) {
  if (algorithm !== 'sha256') throw new Error(`Unsupported hash in the studio: ${algorithm}`);
  let buffer = '';
  return {
    update(data: string) {
      buffer += data;
      return this;
    },
    digest(_encoding?: string): string {
      return sha256Hex(buffer);
    }
  };
}

export default { createHash };
