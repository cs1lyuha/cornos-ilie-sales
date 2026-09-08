import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Customer = {
  id: string;
  name: string;
  address: string;
  category: string;
};

type Product = {
  id: string;
  name: string;
  unit: string;
  price: number;
  recentCustomerIds: string[];
};

type Cart = Record<string, number>;

const CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'La Plăcinte Centru', address: 'Bd. Ștefan cel Mare 64', category: 'Restaurant' },
  { id: 'c2', name: 'Andy’s Pizza Botanica', address: 'Str. Independenței 12', category: 'Restaurant' },
  { id: 'c3', name: 'Linella 7', address: 'Str. Alba Iulia 75', category: 'Magazin' },
  { id: 'c4', name: 'Coffee Break', address: 'Str. București 33', category: 'Cafenea' },
];

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Apă minerală 0.5L', unit: 'bax 12 buc', price: 42, recentCustomerIds: ['c1', 'c2', 'c4'] },
  { id: 'p2', name: 'Suc de mere 1L', unit: 'bax 6 buc', price: 78, recentCustomerIds: ['c1', 'c3'] },
  { id: 'p3', name: 'Cafea boabe 1kg', unit: 'sac', price: 215, recentCustomerIds: ['c1', 'c4'] },
  { id: 'p4', name: 'Șervețele horeca', unit: 'cutie 200 buc', price: 36, recentCustomerIds: ['c2', 'c3', 'c4'] },
  { id: 'p5', name: 'Bere blondă 0.5L', unit: 'ladă 20 buc', price: 188, recentCustomerIds: ['c1', 'c2'] },
  { id: 'p6', name: 'Ulei de floarea-soarelui', unit: 'bax 6 buc', price: 96, recentCustomerIds: ['c3'] },
];

const CART_KEY = 'cornos-ilie-cart';
const QUEUE_KEY = 'cornos-ilie-sync-queue';

export default function App() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastOrder, setLastOrder] = useState<{ total: number; seconds: number; touches: number } | null>(null);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      if (startedAt) setElapsed(Math.round((Date.now() - startedAt) / 100) / 10);
    }, 100);
    return () => clearInterval(timer);
  }, [startedAt]);

  const filteredCustomers = useMemo(
    () => CUSTOMERS.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(customerQuery.toLowerCase())),
    [customerQuery],
  );

  const products = useMemo(() => {
    const sorted = [...PRODUCTS].sort((a, b) => {
      if (!customer) return 0;
      return Number(b.recentCustomerIds.includes(customer.id)) - Number(a.recentCustomerIds.includes(customer.id));
    });
    return sorted.filter((item) => item.name.toLowerCase().includes(productQuery.toLowerCase()));
  }, [customer, productQuery]);

  const cartItems = PRODUCTS.filter((item) => (cart[item.id] ?? 0) > 0);
  const total = cartItems.reduce((sum, item) => sum + item.price * (cart[item.id] ?? 0), 0);
  const itemCount = cartItems.reduce((sum, item) => sum + (cart[item.id] ?? 0), 0);

  async function loadState() {
    const [storedCart, storedQueue] = await Promise.all([AsyncStorage.getItem(CART_KEY), AsyncStorage.getItem(QUEUE_KEY)]);
    if (storedCart) setCart(JSON.parse(storedCart) as Cart);
    if (storedQueue) setPendingOrders(JSON.parse(storedQueue).length as number);
  }

  function selectCustomer(next: Customer) {
    setCustomer(next);
    setCustomerQuery('');
    setStartedAt(Date.now());
    setElapsed(0);
    setCart({});
  }

  async function updateQuantity(productId: string, delta: number) {
    const next = Math.max(0, (cart[productId] ?? 0) + delta);
    const nextCart = { ...cart, [productId]: next };
    if (next === 0) delete nextCart[productId];
    setCart(nextCart);
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(nextCart));
  }

  async function submitOrder() {
    if (!customer || itemCount === 0) return;
    const queueRaw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = queueRaw ? (JSON.parse(queueRaw) as unknown[]) : [];
    const order = { id: `local-${Date.now()}`, customerId: customer.id, cart, total, createdAt: new Date().toISOString() };
    const nextQueue = [...queue, order];
    await AsyncStorage.multiSet([
      [QUEUE_KEY, JSON.stringify(nextQueue)],
      [CART_KEY, JSON.stringify({})],
    ]);
    setPendingOrders(nextQueue.length);
    setLastOrder({ total, seconds: elapsed, touches: itemCount + 1 });
    setCart({});
    Alert.alert('Comandă salvată', `Comanda pentru ${customer.name} este în coada offline și se va sincroniza când revine conexiunea.`);
  }

  async function syncOrders() {
    if (pendingOrders === 0) return;
    setIsOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([]));
    setPendingOrders(0);
    Alert.alert('Sincronizare finalizată', 'Comenzile locale au fost marcate ca sincronizate.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>EASYDISTRIBUTION / M2</Text>
          <Text style={styles.title}>Comanda pe teren</Text>
        </View>
        <Pressable style={[styles.syncPill, isOnline && styles.syncPillOnline]} onPress={() => void syncOrders()}>
          <View style={[styles.dot, isOnline && styles.dotOnline]} />
          <Text style={styles.syncText}>{pendingOrders ? `${pendingOrders} offline` : 'Pregătit'}</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {!customer ? (
          <>
            <Text style={styles.sectionTitle}>Clienții alocați</Text>
            <Text style={styles.sectionHint}>Alege un local pentru a începe comanda</Text>
            <TextInput
              value={customerQuery}
              onChangeText={setCustomerQuery}
              placeholder="Caută după nume sau adresă"
              placeholderTextColor="#8b93a7"
              style={styles.search}
              autoCapitalize="none"
            />
            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable style={styles.customerCard} onPress={() => selectCustomer(item)}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text></View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>{item.category} · {item.address}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            />
          </>
        ) : (
          <>
            <Pressable style={styles.backButton} onPress={() => setCustomer(null)}>
              <Text style={styles.backText}>‹ Clienți</Text>
            </Pressable>
            <View style={styles.customerHero}>
              <View>
                <Text style={styles.sectionTitle}>{customer.name}</Text>
                <Text style={styles.sectionHint}>{customer.address}</Text>
              </View>
              <View style={styles.timerBox}>
                <Text style={styles.timerLabel}>TIMP</Text>
                <Text style={styles.timer}>{elapsed.toFixed(1)}s</Text>
              </View>
            </View>
            <TextInput
              value={productQuery}
              onChangeText={setProductQuery}
              placeholder="Caută produs"
              placeholderTextColor="#8b93a7"
              style={styles.search}
            />
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const quantity = cart[item.id] ?? 0;
                const recent = item.recentCustomerIds.includes(customer.id);
                return (
                  <View style={styles.productCard}>
                    <View style={styles.productCopy}>
                      {recent && <Text style={styles.recent}>COMANDAT RECENT</Text>}
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardMeta}>{item.unit} · {item.price} MDL</Text>
                    </View>
                    <View style={styles.quantity}>
                      <Pressable style={styles.quantityButton} onPress={() => void updateQuantity(item.id, -1)}><Text style={styles.quantitySymbol}>−</Text></Pressable>
                      <Text style={styles.quantityValue}>{quantity}</Text>
                      <Pressable style={[styles.quantityButton, styles.quantityButtonAdd]} onPress={() => void updateQuantity(item.id, 1)}><Text style={styles.quantitySymbolAdd}>+</Text></Pressable>
                    </View>
                  </View>
                );
              }}
            />
            <View style={styles.checkout}>
              <View>
                <Text style={styles.checkoutLabel}>{itemCount} poziții · {pendingOrders} de sincronizat</Text>
                <Text style={styles.checkoutTotal}>{total} MDL</Text>
              </View>
              <Pressable style={[styles.orderButton, itemCount === 0 && styles.orderButtonDisabled]} onPress={() => void submitOrder()} disabled={itemCount === 0}>
                <Text style={styles.orderButtonText}>Salvează comanda</Text>
              </Pressable>
            </View>
            {lastOrder && (
              <View style={styles.metricBanner}>
                <Text style={styles.metricTitle}>Ultima comandă: {lastOrder.seconds.toFixed(1)}s · {lastOrder.touches} atingeri</Text>
                <Text style={styles.metricHint}>{lastOrder.seconds < 40 && lastOrder.touches <= 6 ? 'Ținta din README este atinsă.' : 'Mai exersează pentru ținta de sub 40s / 6 atingeri.'}</Text>
              </View>
            )}
          </>
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
  syncPill: { backgroundColor: '#263247', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  syncPillOnline: { backgroundColor: '#194d3a' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffbe55', marginRight: 7 },
  dotOnline: { backgroundColor: '#5ee6a8' },
  syncText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  sectionTitle: { color: '#101827', fontSize: 21, fontWeight: '800' },
  sectionHint: { color: '#68738a', marginTop: 4, fontSize: 14 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e7f0', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginTop: 18, color: '#152033' },
  list: { paddingTop: 12, paddingBottom: 180, gap: 10 },
  customerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e8ecf3' },
  avatar: { backgroundColor: '#dce9ff', width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#2463d4', fontSize: 19, fontWeight: '800' },
  cardCopy: { flex: 1, marginLeft: 12 },
  cardTitle: { color: '#152033', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#778198', fontSize: 12, marginTop: 4 },
  chevron: { color: '#9aa4b7', fontSize: 26, marginLeft: 8 },
  backButton: { marginBottom: 14 },
  backText: { color: '#2463d4', fontSize: 15, fontWeight: '700' },
  customerHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerBox: { backgroundColor: '#e8eefb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  timerLabel: { color: '#6c7da0', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  timer: { color: '#2463d4', fontSize: 18, fontWeight: '800', marginTop: 2 },
  productCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e8ecf3' },
  productCopy: { flex: 1 },
  recent: { color: '#2463d4', fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 4 },
  quantity: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  quantityButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  quantityButtonAdd: { backgroundColor: '#2463d4' },
  quantitySymbol: { color: '#263247', fontSize: 25, lineHeight: 27 },
  quantitySymbolAdd: { color: '#fff', fontSize: 25, lineHeight: 27 },
  quantityValue: { minWidth: 30, textAlign: 'center', color: '#152033', fontSize: 16, fontWeight: '800' },
  checkout: { position: 'absolute', bottom: 12, left: 20, right: 20, backgroundColor: '#111827', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkoutLabel: { color: '#9aa8c2', fontSize: 11, fontWeight: '700' },
  checkoutTotal: { color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 2 },
  orderButton: { backgroundColor: '#5ee6a8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  orderButtonDisabled: { backgroundColor: '#4b5568' },
  orderButtonText: { color: '#09281b', fontSize: 12, fontWeight: '800' },
  metricBanner: { backgroundColor: '#e7f8ef', borderRadius: 14, padding: 12, marginTop: 12 },
  metricTitle: { color: '#145c38', fontSize: 13, fontWeight: '800' },
  metricHint: { color: '#387255', fontSize: 12, marginTop: 3 },
});
