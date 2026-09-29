/**
 * Proof of delivery attached to a delivery event.
 * Shared contract with the backend / dashboard: keep this shape exactly.
 * `signature` is a JSON string `{"w":number,"h":number,"d":string}` where `d` is an SVG path.
 */
export type DeliveryProof = { photoUri?: string; signature?: string };

export type SignatureData = { w: number; h: number; d: string };

export function encodeSignature(signature: SignatureData): string {
  return JSON.stringify({ w: signature.w, h: signature.h, d: signature.d });
}

export function parseSignature(value?: string): SignatureData | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SignatureData>;
    if (typeof parsed.w !== 'number' || typeof parsed.h !== 'number' || typeof parsed.d !== 'string' || !parsed.d) {
      return null;
    }
    return { w: parsed.w, h: parsed.h, d: parsed.d };
  } catch {
    return null;
  }
}

/** Returns the proof only if it carries something, so empty objects never reach the queue. */
export function compactProof(proof: DeliveryProof): DeliveryProof | undefined {
  const next: DeliveryProof = {};
  if (proof.photoUri) next.photoUri = proof.photoUri;
  if (proof.signature) next.signature = proof.signature;
  return next.photoUri || next.signature ? next : undefined;
}
