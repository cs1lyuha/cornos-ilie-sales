import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DeliveryEvent } from './types';

export const EVENTS_KEY = 'cornos-ilie-delivery-events';

const OUTCOMES = ['delivered', 'partial', 'refused'];

function isDeliveryEvent(value: unknown): value is DeliveryEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.stopId === 'string' &&
    typeof event.status === 'string' &&
    OUTCOMES.includes(event.status) &&
    typeof event.note === 'string' &&
    typeof event.createdAt === 'string'
  );
}

/**
 * Reads the offline event queue. Never throws: missing, unreadable or corrupted
 * data yields an empty queue, and malformed entries are dropped.
 */
export async function loadEvents(): Promise<DeliveryEvent[]> {
  try {
    const stored = await AsyncStorage.getItem(EVENTS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isDeliveryEvent) : [];
  } catch {
    return [];
  }
}

/** Persists the whole offline event queue. Errors propagate to the caller. */
export async function saveEvents(events: DeliveryEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}
