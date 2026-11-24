import { z } from 'zod';

/**
 * Capture-scoped reference `c_<8 hex>:<id>` (P02). The scope is the first eight hex digits of the
 * capture hash, so a ref taken from one capture cannot resolve in another: node ids are assigned
 * per document session, and `n34` may be a different `.map()` instance after HMR or a re-capture.
 * The same form qualifies finding ids (`c_1a2b3c4d:f_n34_text_clipped`).
 */
export const NODE_REF_PATTERN = /^(c_[0-9a-f]{8}):(.+)$/;
export const nodeRefSchema = z.string().regex(NODE_REF_PATTERN, 'must be c_<8 hex digits>:<id>');
export type NodeRef = string;
export interface ParsedNodeRef { scope: string; id: string }

/** Scope of a capture, or null when the stored hash is not hexadecimal (a foreign or hand-made Report). */
export function captureScope(captureHash: string): string | null {
  const match = /^[0-9a-f]{8}/.exec(captureHash);
  return match ? `c_${match[0]}` : null;
}

export function formatNodeRef(captureHash: string, id: string): NodeRef | null {
  const scope = captureScope(captureHash);
  return scope ? `${scope}:${id}` : null;
}

export function parseNodeRef(ref: string): ParsedNodeRef | null {
  const match = NODE_REF_PATTERN.exec(ref);
  return match ? { scope: match[1]!, id: match[2]! } : null;
}
