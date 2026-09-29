import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProofBadge, ProofSection } from './src/proof/ProofSection';
import { checkProof } from './src/proof/rules';
import { compactProof } from './src/proof/types';
import { applyEventsToStops, createEvent, routeProgress as formatRouteProgress, upsertEvent } from './src/queue';
import { loadEvents as loadStoredEvents, saveEvents } from './src/storage';
import type { DeliveryEvent, DeliveryProof, Stop, StopStatus } from './src/types';

const STOPS: Stop[] = [
  {
    id: 'stop-1',
    customer: 'La Plăcinte Centru',
    address: 'Bd. Ștefan cel Mare 64',
    items: ['Apă minerală 0.5L × 4', 'Cafea boabe 1kg × 2', 'Șervețele horeca × 5'],
    total: 842,
    status: 'pending',
  },
  {
    id: 'stop-2',
    customer: 'Andy’s Pizza Botanica',
    address: 'Str. Independenței 12',
    items: ['Bere blondă 0.5L × 6', 'Suc de mere 1L × 3'],
    total: 1_220,
    status: 'pending',
  },
  {
    id: 'stop-3',
    customer: 'Coffee Break',
    address: 'Str. București 33',
    items: ['Cafea boabe 1kg × 3', 'Șervețele horeca × 2'],
    total: 716,
    status: 'pending',
  },
];

export default function App() {
  const [stops, setStops] = useState(STOPS);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [events, setEvents] = useState<DeliveryEvent[]>([]);
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<DeliveryProof>({});
  const [isSigning, setIsSigning] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => clearInterval(timer);
  }, [startedAt]);

  const selectedStop = stops.find((stop) => stop.id === selectedStopId);
  const pendingCount = events.length;
  const checks = {
    delivered: checkProof('delivered', proof, note),
    partial: checkProof('partial', proof, note),
    refused: checkProof('refused', proof, note),
  };
  const routeProgress = useMemo(() => formatRouteProgress(stops), [stops]);

  async function loadEvents() {
    const storedEvents = await loadStoredEvents();
    if (storedEvents.length === 0) return;
    setEvents(storedEvents);
    setStops((current) => applyEventsToStops(current, storedEvents));
  }

  function openStop(stop: Stop) {
    setSelectedStopId(stop.id);
    setNote('');
    setProof(stop.proof ?? {});
    setIsSigning(false);
    setStartedAt(Date.now());
    setElapsed(0);
  }

  async function saveDelivery(status: Exclude<StopStatus, 'pending'>) {
    if (!selectedStop || !checkProof(status, proof, note).ok) return;
    const event = createEvent(selectedStop.id, status, note, { proof: compactProof(proof) });
    const nextEvents = upsertEvent(events, event);
    try {
      await saveEvents(nextEvents);
    } catch {
      Alert.alert('Nu s-a putut salva', 'Memoria telefonului/browserului este plină. Încearcă fără poză sau eliberează spațiu.');
      return;
    }
    setEvents(nextEvents);
    setStops((current) => applyEventsToStops(current, [event]));
    setSelectedStopId(null);
    setNote('');
    Alert.alert(
      'Salvat offline',
      `${selectedStop.customer}: ${status === 'delivered' ? 'livrare confirmată' : status === 'partial' ? 'livrare parțială' : 'livrare refuzată'}. Evenimentul va fi sincronizat ulterior.`,
    );
  }

  async function syncEvents() {
    if (events.length === 0) return;
    setIsOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await saveEvents([]);
    setEvents([]);
    Alert.alert('Sincronizare simulată', 'Evenimentele locale au fost trimise către server.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>EASYDISTRIBUTION / M1</Text>
          <Text style={styles.title}>Livrările zilei</Text>
        </View>
        <Pressable style={[styles.connection, isOnline && styles.connectionOnline]} onPress={() => void syncEvents()}>
          <View style={[styles.connectionDot, isOnline && styles.connectionDotOnline]} />
          <Text style={styles.connectionText}>{pendingCount ? `${pendingCount} offline` : 'Offline-first'}</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {!selectedStop ? (
          <>
            <View style={styles.routeSummary}>
              <View>
                <Text style={styles.sectionTitle}>Ruta de azi</Text>
                <Text style={styles.sectionHint}>Confirmă fiecare oprire chiar și fără internet</Text>
              </View>
              <View style={styles.progressBox}>
                <Text style={styles.progressValue}>{routeProgress}</Text>
                <Text style={styles.progressLabel}>oprite</Text>
              </View>
            </View>
            <FlatList
              data={stops}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item, index }) => (
                <Pressable style={styles.stopCard} onPress={() => openStop(item)}>
                  <View style={[styles.stopNumber, item.status !== 'pending' && styles.stopNumberDone]}>
                    <Text style={styles.stopNumberText}>{item.status !== 'pending' ? '✓' : index + 1}</Text>
                  </View>
                  <View style={styles.stopCopy}>
                    <Text style={styles.cardTitle}>{item.customer}</Text>
                    <Text style={styles.cardMeta}>{item.address}</Text>
                    <Text style={styles.cardMeta}>{item.items.length} produse · {item.total} MDL</Text>
                    <ProofBadge proof={item.proof} />
                  </View>
                  <View style={[styles.statusBadge, item.status === 'delivered' && styles.statusDelivered, item.status === 'partial' && styles.statusPartial, item.status === 'refused' && styles.statusRefused]}>
                    <Text style={styles.statusText}>{item.status === 'pending' ? 'De livrat' : item.status === 'delivered' ? 'Livrat' : item.status === 'partial' ? 'Parțial' : 'Refuzat'}</Text>
                  </View>
                </Pressable>
              )}
            />
          </>
        ) : (
          <ScrollView scrollEnabled={!isSigning} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.detailScroll}>
            <Pressable style={styles.backButton} onPress={() => setSelectedStopId(null)}>
              <Text style={styles.backText}>‹ Ruta de azi</Text>
            </Pressable>
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{selectedStop.customer}</Text>
                <Text style={styles.sectionHint}>{selectedStop.address}</Text>
              </View>
              <View style={styles.timerBox}>
                <Text style={styles.timerLabel}>TIMP</Text>
                <Text style={styles.timer}>{elapsed.toFixed(1)}s</Text>
              </View>
            </View>
            <View style={styles.orderCard}>
              <Text style={styles.orderCardTitle}>Comanda {selectedStop.total} MDL</Text>
              {selectedStop.items.map((item) => <Text key={item} style={styles.itemLine}>• {item}</Text>)}
            </View>
            <Text style={styles.noteLabel}>Notă pentru sincronizare (obligatorie la parțial / refuz fără poză)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ex: lipsesc 2 baxuri de apă"
              placeholderTextColor="#8b93a7"
              style={styles.noteInput}
              multiline
            />
            <ProofSection
              key={selectedStop.id}
              proof={proof}
              onChange={(patch) => setProof((current) => ({ ...current, ...patch }))}
              onSigningChange={setIsSigning}
            />
            <Text style={styles.actionTitle}>Confirmă livrarea</Text>
            <Pressable
              style={[styles.actionButton, styles.deliveredButton, !checks.delivered.ok && styles.actionDisabled]}
              disabled={!checks.delivered.ok}
              accessibilityState={{ disabled: !checks.delivered.ok }}
              onPress={() => void saveDelivery('delivered')}
            >
              <Text style={styles.actionIcon}>✓</Text>
              <View><Text style={styles.actionText}>Livrat integral</Text><Text style={[styles.actionHint, !checks.delivered.ok && styles.actionHintMissing]}>{checks.delivered.hint}</Text></View>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.partialButton, !checks.partial.ok && styles.actionDisabled]}
              disabled={!checks.partial.ok}
              accessibilityState={{ disabled: !checks.partial.ok }}
              onPress={() => void saveDelivery('partial')}
            >
              <Text style={styles.actionIcon}>½</Text>
              <View><Text style={styles.actionText}>Livrat parțial</Text><Text style={[styles.actionHint, !checks.partial.ok && styles.actionHintMissing]}>{checks.partial.hint}</Text></View>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.refusedButton, !checks.refused.ok && styles.actionDisabled]}
              disabled={!checks.refused.ok}
              accessibilityState={{ disabled: !checks.refused.ok }}
              onPress={() => void saveDelivery('refused')}
            >
              <Text style={styles.actionIcon}>×</Text>
              <View><Text style={styles.actionText}>Refuzat</Text><Text style={[styles.actionHint, !checks.refused.ok && styles.actionHintMissing]}>{checks.refused.hint}</Text></View>
            </Pressable>
            <Text style={styles.offlineHint}>● Se salvează pe telefon înainte de sincronizare</Text>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { backgroundColor: '#111827', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#93a4c7', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 4 },
  connection: { backgroundColor: '#263247', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  connectionOnline: { backgroundColor: '#194d3a' },
  connectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffbe55', marginRight: 7 },
  connectionDotOnline: { backgroundColor: '#5ee6a8' },
  connectionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  routeSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#101827', fontSize: 21, fontWeight: '800' },
  sectionHint: { color: '#68738a', marginTop: 4, fontSize: 14 },
  progressBox: { backgroundColor: '#e8eefb', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  progressValue: { color: '#2463d4', fontSize: 18, fontWeight: '800' },
  progressLabel: { color: '#6c7da0', fontSize: 10 },
  list: { paddingTop: 16, paddingBottom: 100, gap: 10 },
  stopCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e8ecf3' },
  stopNumber: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#e8eefb', alignItems: 'center', justifyContent: 'center' },
  stopNumberDone: { backgroundColor: '#d9f5e7' },
  stopNumberText: { color: '#2463d4', fontSize: 16, fontWeight: '800' },
  stopCopy: { flex: 1, marginLeft: 12 },
  cardTitle: { color: '#152033', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#778198', fontSize: 12, marginTop: 4 },
  statusBadge: { backgroundColor: '#f0f2f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, marginLeft: 6 },
  statusDelivered: { backgroundColor: '#d9f5e7' },
  statusPartial: { backgroundColor: '#fff0c7' },
  statusRefused: { backgroundColor: '#ffe0e0' },
  statusText: { color: '#4e5b72', fontSize: 10, fontWeight: '800' },
  backButton: { marginBottom: 14 },
  backText: { color: '#2463d4', fontSize: 15, fontWeight: '700' },
  detailHeader: { flexDirection: 'row', alignItems: 'center' },
  timerBox: { backgroundColor: '#e8eefb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  timerLabel: { color: '#6c7da0', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  timer: { color: '#2463d4', fontSize: 18, fontWeight: '800', marginTop: 2 },
  orderCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#e8ecf3' },
  orderCardTitle: { color: '#152033', fontSize: 16, fontWeight: '800', marginBottom: 7 },
  itemLine: { color: '#68738a', fontSize: 13, marginTop: 5 },
  noteLabel: { color: '#4e5b72', fontSize: 12, fontWeight: '800', marginTop: 18 },
  noteInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e7f0', borderRadius: 14, padding: 14, minHeight: 58, marginTop: 8, color: '#152033', textAlignVertical: 'top' },
  actionTitle: { color: '#101827', fontSize: 17, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  actionButton: { borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  deliveredButton: { backgroundColor: '#d9f5e7' },
  partialButton: { backgroundColor: '#fff0c7' },
  refusedButton: { backgroundColor: '#ffe0e0' },
  actionIcon: { color: '#152033', fontSize: 24, fontWeight: '800', width: 38, textAlign: 'center' },
  actionText: { color: '#152033', fontSize: 15, fontWeight: '800' },
  actionHint: { color: '#68738a', fontSize: 12, marginTop: 3 },
  actionDisabled: { opacity: 0.55 },
  actionHintMissing: { color: '#b42318', fontWeight: '700' },
  detailScroll: { paddingBottom: 40 },
  offlineHint: { color: '#387255', fontSize: 12, textAlign: 'center', marginTop: 18, fontWeight: '700' },
});
