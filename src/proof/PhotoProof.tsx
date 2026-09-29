import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  uri?: string;
  onChange: (uri: string | undefined) => void;
};

/** Browser storage (localStorage) is ~5 MB, so a web photo is kept as a data URI only if it is small. */
const MAX_WEB_BASE64_LENGTH = 1_500_000;

export function PhotoProof({ uri, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function takePhoto() {
    setMessage(null);
    setBlocked(false);
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setBlocked(!permission.canAskAgain);
          setMessage(
            permission.canAskAgain
              ? 'Fără acces la cameră nu poți atașa poza. Apasă din nou și permite accesul.'
              : 'Accesul la cameră este blocat. Activează-l din Setări sau scrie motivul în notă.',
          );
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        exif: false,
        // On web the picker returns a blob: URL that dies with the tab; keep base64 to store it offline.
        base64: Platform.OS === 'web',
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (Platform.OS === 'web') {
        if (!asset.base64) {
          setMessage('Poza nu a putut fi citită în browser. Scrie motivul în notă.');
          return;
        }
        if (asset.base64.length > MAX_WEB_BASE64_LENGTH) {
          setMessage('Poza este prea mare pentru stocarea offline din browser. Folosește aplicația pe telefon sau scrie motivul în notă.');
          return;
        }
        onChange(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
        return;
      }
      onChange(asset.uri);
    } catch {
      setMessage('Camera nu este disponibilă pe acest dispozitiv. Scrie motivul în notă.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      {uri ? (
        <View style={styles.row}>
          <Image source={{ uri }} style={styles.thumbnail} accessibilityLabel="Poza dovezii de livrare" />
          <View style={styles.actions}>
            <Text style={styles.done}>Poză atașată 📷</Text>
            <View style={styles.buttonsRow}>
              <Pressable style={styles.secondaryButton} onPress={() => void takePhoto()} disabled={busy}>
                <Text style={styles.secondaryText}>Refă poza</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, styles.removeButton]} onPress={() => onChange(undefined)} disabled={busy}>
                <Text style={[styles.secondaryText, styles.removeText]}>Șterge</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <Pressable style={[styles.cameraButton, busy && styles.busy]} onPress={() => void takePhoto()} disabled={busy}>
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.cameraText}>{busy ? 'Se deschide camera…' : 'Fă o poză'}</Text>
        </Pressable>
      )}
      {message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
          {blocked ? (
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={styles.settingsLink}>Deschide Setări</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfd7e6', borderRadius: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  busy: { opacity: 0.6 },
  cameraIcon: { fontSize: 18, marginRight: 8 },
  cameraText: { color: '#2463d4', fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#e2e7f0' },
  thumbnail: { width: 76, height: 76, borderRadius: 10, backgroundColor: '#e8ecf3' },
  actions: { flex: 1, marginLeft: 12 },
  done: { color: '#152033', fontSize: 13, fontWeight: '800' },
  buttonsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondaryButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#e8eefb' },
  secondaryText: { color: '#2463d4', fontSize: 12, fontWeight: '700' },
  removeButton: { backgroundColor: '#ffe0e0' },
  removeText: { color: '#b42318' },
  messageBox: { backgroundColor: '#fff4e5', borderRadius: 10, padding: 10, marginTop: 8 },
  messageText: { color: '#8a4b0f', fontSize: 12 },
  settingsLink: { color: '#2463d4', fontSize: 12, fontWeight: '800', marginTop: 6 },
});
