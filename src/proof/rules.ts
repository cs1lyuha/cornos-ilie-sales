import type { DeliveryProof } from './types';

export type DeliveryOutcome = 'delivered' | 'partial' | 'refused';

export type ProofCheck = { ok: boolean; hint: string };

/**
 * Proof rules per outcome:
 * - delivered: customer signature required.
 * - partial:   customer signature + note describing what was not delivered.
 * - refused:   photo OR note (a refusing customer will not sign).
 */
export function checkProof(outcome: DeliveryOutcome, proof: DeliveryProof, note: string): ProofCheck {
  const hasSignature = Boolean(proof.signature);
  const hasPhoto = Boolean(proof.photoUri);
  const hasNote = note.trim().length > 0;

  switch (outcome) {
    case 'delivered':
      return hasSignature
        ? { ok: true, hint: 'Toate produsele au fost predate' }
        : { ok: false, hint: 'Necesită semnătura clientului' };
    case 'partial':
      if (!hasSignature && !hasNote) return { ok: false, hint: 'Necesită semnătura clientului și o notă' };
      if (!hasSignature) return { ok: false, hint: 'Necesită semnătura clientului' };
      if (!hasNote) return { ok: false, hint: 'Scrie în notă ce lipsește' };
      return { ok: true, hint: 'Semnat, detaliile sunt în notă' };
    case 'refused':
      return hasPhoto || hasNote
        ? { ok: true, hint: hasPhoto ? 'Poza este atașată ca dovadă' : 'Motivul este salvat în notă' }
        : { ok: false, hint: 'Necesită o poză sau motivul în notă' };
  }
}
