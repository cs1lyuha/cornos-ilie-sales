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
- The header shows pending offline events; tapping it syncs them to the backend (see below). Sync also runs in the background after each save and every 30 s while events are pending.
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

## Backend & sync

`server/` is a small standalone Node + Express backend (no database, events persist to `server/data/events.json`).

```bash
cd server && npm install
npm start          # http://localhost:4000 (override with PORT=...)
npm test           # node --test smoke tests: idempotency + validation
```

API: `GET /health`, `GET /route` (the 3 demo stops), `POST /events` with `{ events: DeliveryEvent[] }` → `{ accepted: string[] }` (idempotent by event `id`, 400 on invalid status / missing id / stopId), `GET /events` (full history, newest first), `GET /status` (latest event per stop). If a `dashboard/` folder exists it is served at `/dashboard`.

The app sync lives in `src/sync.ts`: it POSTs the local queue with a 5 s timeout and 3 attempts (exponential backoff), removes only the ids the server accepted and keeps everything else on the phone. Saving a delivery never waits for the network. On start the app loads `GET /route` and falls back to the local demo stops when offline.

Point the app at the server with `EXPO_PUBLIC_API_URL` (default `http://localhost:4000`), e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start`, or put it in a `.env` file:

- iOS simulator / web: `http://localhost:4000`
- Android emulator: `http://10.0.2.2:4000` (the emulator's alias for the PC)
- Real phone (Expo Go): `http://<PC LAN IP>:4000` on the same Wi-Fi; allow port 4000 in the PC firewall.

Restart Expo after changing the variable (it is inlined at bundle time). Plain `http` is fine for local development; a production build should use HTTPS.

## Verification path

1. Start the app.
2. Open any stop.
3. Turn on airplane mode.
4. Add a note and tap **Livrat integral**.
5. Return to the route: the stop remains marked as delivered.
6. Start the server (`cd server && npm start`), turn airplane mode off and tap the offline counter: the alert reports how many events were synced.

## Scope boundary

This is the mobile slice only. Signature capture, photo proof, authentication, and server conflict resolution beyond "latest event per stop wins" are intentionally left as the next integration step.

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
