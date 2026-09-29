import { StyleSheet, Text, View } from 'react-native';

import { PhotoProof } from './PhotoProof';
import { SignaturePad } from './SignaturePad';
import type { DeliveryProof } from './types';

type Props = {
  proof: DeliveryProof;
  /** Receives only the changed field; merge it with a functional state update. */
  onChange: (patch: Partial<DeliveryProof>) => void;
  /** Parent ScrollView should set `scrollEnabled={!signing}`. */
  onSigningChange?: (signing: boolean) => void;
};

/** Photo + customer signature block for the delivery detail screen. */
export function ProofSection({ proof, onChange, onSigningChange }: Props) {
  return (
    <View>
      <Text style={styles.title}>Dovada livrării</Text>
      <Text style={styles.label}>Semnătura clientului · obligatorie pentru livrat integral / parțial</Text>
      <SignaturePad
        value={proof.signature}
        onChange={(signature) => onChange({ signature })}
        onDrawingChange={onSigningChange}
      />
      <Text style={styles.label}>Poză · pentru refuz (sau motivul în notă)</Text>
      <PhotoProof uri={proof.photoUri} onChange={(photoUri) => onChange({ photoUri })} />
    </View>
  );
}

/** Small "📷 / ✍️" marker for route stops that carry proof. */
export function ProofBadge({ proof }: { proof?: DeliveryProof }) {
  if (!proof?.photoUri && !proof?.signature) return null;
  return (
    <Text style={styles.badge} accessibilityLabel="Dovadă atașată">
      {[proof.photoUri ? '📷' : null, proof.signature ? '✍️' : null].filter(Boolean).join(' ')} dovadă
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { color: '#101827', fontSize: 17, fontWeight: '800', marginTop: 22 },
  label: { color: '#4e5b72', fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  badge: { color: '#387255', fontSize: 11, fontWeight: '700', marginTop: 4 },
});
