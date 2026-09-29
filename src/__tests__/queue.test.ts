import { applyEventsToStops, createEvent, routeProgress, upsertEvent } from '../queue';
import type { DeliveryEvent, Stop } from '../types';

const NOW = new Date('2026-09-29T10:00:00.000Z');

function stop(id: string, status: Stop['status'] = 'pending'): Stop {
  return { id, customer: `Client ${id}`, address: 'Str. Test 1', items: ['Apă × 1'], total: 100, status };
}

function event(stopId: string, status: DeliveryEvent['status'], id = `event-${stopId}-${status}`): DeliveryEvent {
  return { id, stopId, status, note: '', createdAt: NOW.toISOString() };
}

describe('createEvent', () => {
  it('builds an event with a time-based id, ISO timestamp and trimmed note', () => {
    expect(createEvent('stop-1', 'delivered', '  lipsesc 2 baxuri  ', { now: NOW })).toEqual({
      id: expect.stringMatching(new RegExp(`^event-${NOW.getTime()}-`)),
      stopId: 'stop-1',
      status: 'delivered',
      note: 'lipsesc 2 baxuri',
      createdAt: '2026-09-29T10:00:00.000Z',
    });
  });

  it('defaults to the current time', () => {
    const before = Date.now();
    const created = createEvent('stop-1', 'refused', '');
    const at = Date.parse(created.createdAt);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(created.id).toMatch(new RegExp(`^event-${at}-[a-z0-9]+$`));
  });

  it('omits proof unless provided', () => {
    expect(createEvent('stop-1', 'delivered', '', { now: NOW })).not.toHaveProperty('proof');
    const proof = { photoUri: 'file:///photo.jpg', signature: 'data:image/png;base64,AAA' };
    expect(createEvent('stop-1', 'delivered', '', { now: NOW, proof }).proof).toEqual(proof);
  });
});

describe('upsertEvent', () => {
  it('appends an event for a new stop', () => {
    const first = event('stop-1', 'delivered');
    const second = event('stop-2', 'partial');
    expect(upsertEvent([first], second)).toEqual([first, second]);
  });

  it('replaces the previous event when a stop is re-confirmed', () => {
    const other = event('stop-2', 'delivered');
    const old = event('stop-1', 'delivered');
    const replacement = event('stop-1', 'refused');

    const next = upsertEvent([old, other], replacement);

    expect(next).toEqual([other, replacement]);
    expect(next.filter((item) => item.stopId === 'stop-1')).toHaveLength(1);
  });

  it('does not mutate the input queue', () => {
    const queue = [event('stop-1', 'delivered')];
    upsertEvent(queue, event('stop-1', 'partial'));
    expect(queue).toEqual([event('stop-1', 'delivered')]);
  });
});

describe('applyEventsToStops', () => {
  it('sets the status of stops that have an event and leaves the others untouched', () => {
    const stops = [stop('stop-1'), stop('stop-2'), stop('stop-3')];
    const result = applyEventsToStops(stops, [event('stop-2', 'partial'), event('stop-3', 'refused')]);
    expect(result.map((item) => item.status)).toEqual(['pending', 'partial', 'refused']);
    expect(result[0]).toBe(stops[0]);
  });

  it('ignores events for unknown stops and does not mutate the stops', () => {
    const stops = [stop('stop-1')];
    expect(applyEventsToStops(stops, [event('stop-x', 'delivered')])).toEqual(stops);
    applyEventsToStops(stops, [event('stop-1', 'delivered')]);
    expect(stops[0].status).toBe('pending');
  });
});

describe('routeProgress', () => {
  it('counts every non-pending stop as completed', () => {
    expect(routeProgress([stop('a'), stop('b'), stop('c')])).toBe('0/3');
    expect(routeProgress([stop('a', 'delivered'), stop('b', 'refused'), stop('c')])).toBe('2/3');
    expect(routeProgress([stop('a', 'partial')])).toBe('1/1');
  });

  it('handles an empty route', () => {
    expect(routeProgress([])).toBe('0/0');
  });
});
