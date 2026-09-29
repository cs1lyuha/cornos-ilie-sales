import AsyncStorage from '@react-native-async-storage/async-storage';

// Real sync with the delivery server (see server/). Offline-first: nothing here is on the save path,
// events are always written to AsyncStorage first and only removed once the server accepted their id.

// Must be read with static dot notation so Expo inlines it at build time.
// Android emulator: http://10.0.2.2:4000 · real phone: http://<PC LAN IP>:4000
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 5_000;
const ROUTE_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500; // 500 ms, 1 s between the 3 attempts
const SYNCED_STATUS_KEY = 'cornos-ilie-synced-status';

type Outcome = 'delivered' | 'partial' | 'refused';
type StopStatus = 'pending' | Outcome;

export type SyncableEvent = { id: string; stopId: string; status: Outcome; createdAt: string };
export type RouteStop = { id: string; status: StopStatus };

export type SyncResult = {
  ok: boolean; // request reached the server and it answered
  attempted: number; // events sent (0 = queue was empty, no request made)
  accepted: string[];
  error?: string;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new HttpError(response.status, `HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout după ${timeoutMs / 1000}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Retries network errors, timeouts, 5xx, 408 and 429 with exponential backoff; other 4xx fail fast.
async function fetchJsonWithRetry<T>(path: string, init: RequestInit, attempts = MAX_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchJson<T>(path, init);
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof HttpError) || error.status >= 500 || error.status === 408 || error.status === 429;
      if (!retryable || attempt === attempts - 1) break;
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** POSTs events to the server. Never throws; returns the ids the server stored. */
export async function syncEvents(events: SyncableEvent[]): Promise<SyncResult> {
  if (events.length === 0) return { ok: true, attempted: 0, accepted: [] };
  try {
    const body = await fetchJsonWithRetry<{ accepted?: unknown }>('/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
    const sent = new Set(events.map((event) => event.id));
    const accepted = Array.isArray(body.accepted)
      ? body.accepted.filter((id): id is string => typeof id === 'string' && sent.has(id))
      : [];
    return { ok: true, attempted: events.length, accepted };
  } catch (error) {
    return { ok: false, attempted: events.length, accepted: [], error: errorMessage(error) };
  }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Latest event per stop wins (by createdAt). */
export function applyEvents<S extends RouteStop>(stops: S[], events: SyncableEvent[]): S[] {
  const latest = new Map<string, SyncableEvent>();
  for (const event of events) {
    const current = latest.get(event.stopId);
    if (!current || event.createdAt >= current.createdAt) latest.set(event.stopId, event);
  }
  return stops.map((stop) => {
    const event = latest.get(stop.id);
    return event ? { ...stop, status: event.status } : stop;
  });
}

let inFlight: Promise<SyncResult & { remaining: SyncableEvent[] }> | null = null;

/**
 * Syncs the AsyncStorage queue under `storageKey`: sends it, then re-reads the queue (events saved
 * while the request was in flight are kept) and removes only the accepted ids. Concurrent calls share
 * one request. Accepted statuses are remembered so the route still shows them after a restart offline.
 */
export function syncQueue<E extends SyncableEvent>(storageKey: string): Promise<SyncResult & { remaining: E[] }> {
  inFlight ??= (async () => {
    const queue = await readJson<SyncableEvent[]>(storageKey, []);
    const result = await syncEvents(queue);
    const latestQueue = result.attempted ? await readJson<SyncableEvent[]>(storageKey, []) : queue;
    if (result.accepted.length === 0) return { ...result, remaining: latestQueue };
    const accepted = new Set(result.accepted);
    const remaining = latestQueue.filter((event) => !accepted.has(event.id));
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(remaining));
    } catch (error) {
      // Queue untouched on disk: the events get re-sent next time, which the server dedupes by id.
      return { ...result, ok: false, accepted: [], remaining: latestQueue, error: errorMessage(error) };
    }
    await rememberSyncedStatuses(queue.filter((event) => accepted.has(event.id))).catch(() => undefined);
    return { ...result, remaining };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight as Promise<SyncResult & { remaining: E[] }>;
}

type SyncedStatuses = Record<string, { status: Outcome; createdAt: string }>;

async function rememberSyncedStatuses(events: SyncableEvent[]) {
  const statuses = await readJson<SyncedStatuses>(SYNCED_STATUS_KEY, {});
  for (const event of events) {
    const current = statuses[event.stopId];
    if (!current || event.createdAt >= current.createdAt) {
      statuses[event.stopId] = { status: event.status, createdAt: event.createdAt };
    }
  }
  await AsyncStorage.setItem(SYNCED_STATUS_KEY, JSON.stringify(statuses));
}

function isStopLike(value: unknown): value is RouteStop & { items: unknown[] } {
  const stop = value as { id?: unknown; items?: unknown } | null;
  return !!stop && typeof stop.id === 'string' && Array.isArray(stop.items);
}

/**
 * Route of the day from GET /route plus the server's current status per stop (GET /status).
 * Offline: returns `fallback` with the last known synced statuses. Never throws, never retries
 * (one quick attempt so startup is not delayed; the local route is shown meanwhile).
 */
export async function loadRoute<S extends RouteStop>(fallback: S[]): Promise<{ stops: S[]; fromServer: boolean }> {
  const [route, serverStatus] = await Promise.all([
    fetchJson<unknown>('/route', {}, ROUTE_TIMEOUT_MS).catch(() => null),
    fetchJson<Record<string, SyncableEvent>>('/status', {}, ROUTE_TIMEOUT_MS).catch(() => null),
  ]);
  const fromServer = Array.isArray(route) && route.length > 0 && route.every(isStopLike);
  const stops = fromServer ? (route as unknown as S[]) : fallback;

  let statuses: SyncedStatuses;
  if (serverStatus && typeof serverStatus === 'object') {
    statuses = {};
    for (const [stopId, event] of Object.entries(serverStatus)) {
      if (event && typeof event.status === 'string') statuses[stopId] = { status: event.status, createdAt: event.createdAt };
    }
    await AsyncStorage.setItem(SYNCED_STATUS_KEY, JSON.stringify(statuses)).catch(() => undefined);
  } else {
    statuses = await readJson<SyncedStatuses>(SYNCED_STATUS_KEY, {});
  }
  return {
    stops: stops.map((stop) => (statuses[stop.id] ? { ...stop, status: statuses[stop.id].status } : stop)),
    fromServer,
  };
}
