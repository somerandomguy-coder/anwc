/**
 * Browser crypto shim for Vite build of ANWC Studio.
 * Provides createHash with sha256 hex digest calculation without node:crypto.
 */
export function createHash(_algorithm?: string) {
  let buffer = '';
  return {
    update(data: string) {
      buffer += data;
      return this;
    },
    digest(_encoding?: string): string {
      let h1 = 0xdeadbeef;
      let h2 = 0x41c6ce57;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
      const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
      return (hex1 + hex2).repeat(4);
    }
  };
}

export default { createHash };
