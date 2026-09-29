# Cornos Ilie - Mobile delivery proof

Expo / React Native MVP for the individual mobile brief:

> Delivery confirmation screen that must work without internet.

## Run in three commands

```bash
git clone https://github.com/cs1lyuha/cornos-ilie-sales.git
cd cornos-ilie-sales && npm install
npx expo start
```

Open the project in Expo Go or an Android emulator.

## What works

- Route-of-the-day list with delivery stops and progress.
- Delivery detail with order lines, value, and address.
- Three explicit outcomes: delivered in full, delivered partially, or refused.
- Optional note saved with the delivery event.
- Every event is written to AsyncStorage before the UI leaves the delivery screen.
- The header shows pending offline events; tapping it simulates a later sync.
- The flow works with airplane mode enabled because the delivery decision does not require a network request.

## Demo data

The brief did not include an API, authentication, database schema, or real catalog. The app therefore uses three local stops and a local event queue. The future API adapter should replace `AsyncStorage` in `App.tsx` while preserving this event shape:

```ts
{
  id: string;
  stopId: string;
  status: 'delivered' | 'partial' | 'refused';
  note: string;
  createdAt: string;
}
```

## Verification path

1. Start the app.
2. Open any stop.
3. Turn on airplane mode.
4. Add a note and tap **Livrat integral**.
5. Return to the route: the stop remains marked as delivered.
6. Tap the offline counter to simulate synchronization.

## Dashboard dispecer

`dashboard/` is a live web view for the dispatcher (vanilla HTML/CSS/JS, no build step, UI in Romanian).

- **With the server:** open `http://localhost:4000/dashboard` — the API is read from the same origin.
- **Without the server (demo):** open `dashboard/index.html?demo=1` (or `http://localhost:4000/dashboard/?demo=1`); built-in fake events arrive over the first ~15 s, and the banner can simulate a lost connection or restart the scenario.
- **Another API host:** `dashboard/index.html?api=http://192.168.1.20:4000`, or set it under **Setări** (stored in `localStorage`). Opened as a local file without `?api`, it defaults to `http://localhost:4000`, which requires CORS on the server.

It polls `GET /route` and `GET /events` every 3 s and shows: a connection indicator with the last update time; KPIs (stops done / total, delivered / partial / refused, value delivered in full plus partial value in MDL); every stop with its latest event (status chip with icon + text, time, note, signature thumbnail, `📷 poză atașată` badge); and a live feed of events, newest first, with new ones highlighted. Light and dark follow `prefers-color-scheme`.

## Scope boundary

This is the mobile slice only. Signature capture, photo proof, real route download, authentication, retries, and server conflict resolution are intentionally left as the next integration step because no backend contract was provided.

The delivery event contract is:

```ts
{
  id: string;
  stopId: string;
  status: 'delivered' | 'partial' | 'refused';
  note: string;
  createdAt: string;
}
```
