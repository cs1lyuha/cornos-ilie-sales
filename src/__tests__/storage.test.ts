import AsyncStorage from '@react-native-async-storage/async-storage';

import { EVENTS_KEY, loadEvents, saveEvents } from '../storage';
import type { DeliveryEvent } from '../types';

const EVENT: DeliveryEvent = {
  id: 'event-1',
  stopId: 'stop-1',
  status: 'delivered',
  note: 'ok',
  createdAt: '2026-09-29T10:00:00.000Z',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('storage', () => {
  it('returns an empty queue when nothing is stored', async () => {
    await expect(loadEvents()).resolves.toEqual([]);
  });

  it('round-trips events through AsyncStorage under the events key', async () => {
    const withProof: DeliveryEvent = { ...EVENT, id: 'event-2', stopId: 'stop-2', proof: { signature: 'sig' } };
    await saveEvents([EVENT, withProof]);

    expect(JSON.parse((await AsyncStorage.getItem(EVENTS_KEY)) ?? 'null')).toEqual([EVENT, withProof]);
    await expect(loadEvents()).resolves.toEqual([EVENT, withProof]);
  });

  it('saving an empty queue clears the stored events', async () => {
    await saveEvents([EVENT]);
    await saveEvents([]);
    await expect(loadEvents()).resolves.toEqual([]);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['a JSON object', '{"id":"event-1"}'],
    ['a JSON string', '"hello"'],
    ['JSON null', 'null'],
  ])('treats %s as an empty queue', async (_label, raw) => {
    await AsyncStorage.setItem(EVENTS_KEY, raw);
    await expect(loadEvents()).resolves.toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', async () => {
    const raw = JSON.stringify([EVENT, null, 42, { ...EVENT, status: 'lost' }, { id: 'event-3' }]);
    await AsyncStorage.setItem(EVENTS_KEY, raw);
    await expect(loadEvents()).resolves.toEqual([EVENT]);
  });

  it('returns an empty queue when AsyncStorage fails to read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk error'));
    await expect(loadEvents()).resolves.toEqual([]);
  });

  it('propagates write errors so the UI does not report an unsaved event as saved', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveEvents([EVENT])).rejects.toThrow('disk full');
  });
});
