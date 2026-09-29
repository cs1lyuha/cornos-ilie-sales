import type { DeliveryEvent, DeliveryOutcome, DeliveryProof, Stop } from './types';

export type CreateEventOptions = {
  /** Clock override, mainly for tests. Defaults to the current time. */
  now?: Date;
  proof?: DeliveryProof;
};

/** Builds a delivery event for a stop. The note is trimmed. */
export function createEvent(
  stopId: string,
  status: DeliveryOutcome,
  note: string,
  options: CreateEventOptions = {},
): DeliveryEvent {
  const now = options.now ?? new Date();
  const event: DeliveryEvent = {
    id: `event-${now.getTime()}`,
    stopId,
    status,
    note: note.trim(),
    createdAt: now.toISOString(),
  };
  if (options.proof) event.proof = options.proof;
  return event;
}

/**
 * Adds an event to the queue, keeping only one current event per stop:
 * re-confirming a stop replaces its previous event (the new one goes last).
 */
export function upsertEvent(events: DeliveryEvent[], event: DeliveryEvent): DeliveryEvent[] {
  return [...events.filter((item) => item.stopId !== event.stopId), event];
}

/** Returns stops with their status taken from the matching queued event, if any. */
export function applyEventsToStops(stops: Stop[], events: DeliveryEvent[]): Stop[] {
  return stops.map((stop) => {
    const event = events.find((item) => item.stopId === stop.id);
    return event ? { ...stop, status: event.status } : stop;
  });
}

/** Route progress label, e.g. "1/3" = one of three stops has an outcome. */
export function routeProgress(stops: Stop[]): string {
  const completed = stops.filter((stop) => stop.status !== 'pending').length;
  return `${completed}/${stops.length}`;
}
