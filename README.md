# Cornos Ilie - Mobile delivery proof

[![CI](https://github.com/cs1lyuha/cornos-ilie-sales/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cs1lyuha/cornos-ilie-sales/actions/workflows/ci.yml)

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
- Proof of delivery: customer signature and camera photo (see **Dovada livrării**).
- Every event is written to AsyncStorage before the UI leaves the delivery screen.
- The header shows pending offline events; tapping it simulates a later sync.
- The flow works with airplane mode enabled because the delivery decision does not require a network request.

## Demo data

The brief did not include an API, authentication, database schema, or real catalog. The app therefore uses three local stops and a local event queue. Queue logic lives in `src/queue.ts` and persistence in `src/storage.ts`; the future API adapter should build on them while preserving this event shape:

```ts
{
  id: string;
  stopId: string;
  status: 'delivered' | 'partial' | 'refused';
  note: string;
  createdAt: string;
  proof?: { photoUri?: string; signature?: string };
}
```

## Teste

```bash
npm test            # Jest (jest-expo) + React Native Testing Library
npm run typecheck   # tsc --noEmit
```

- `src/__tests__/queue.test.ts` - pure queue logic (`src/queue.ts`): event creation, one current event per stop, applying events to stops, route progress.
- `src/__tests__/storage.test.ts` - AsyncStorage wrapper (`src/storage.ts`), including corrupted or unreadable data.
- `__tests__/App.test.tsx` - the full flow: open a stop, add a note, confirm, check status, offline counter, stored event and reload after re-mount.

CI (`.github/workflows/ci.yml`) runs `npm ci`, the typecheck and the tests on every push and pull request to `main`.

## Verification path

1. Start the app.
2. Open any stop.
3. Turn on airplane mode.
4. Let the customer sign in the signature box, then tap **Livrat integral**.
5. Return to the route: the stop remains marked as delivered and shows the ✍️ marker.
6. Tap the offline counter to simulate synchronization.

## Dovada livrării

The delivery screen has a **Dovada livrării** block with a signature pad and a **Fă o poză** button.

| Outcome | Required before the button is enabled |
| --- | --- |
| Livrat integral | customer signature |
| Livrat parțial | customer signature **and** a note saying what was missing |
| Refuzat | a photo **or** a note with the reason (a refusing customer will not sign) |

Buttons stay disabled until their rule is satisfied, and each button shows an inline hint with what is missing.

- **Signature** (`src/proof/SignaturePad.tsx`): drawn with `react-native-svg` + `PanResponder`, no WebView. Stored as a JSON string `{"w":number,"h":number,"d":string}` where `d` is an SVG path in pad pixels, so a server or dashboard can render it with `<svg viewBox="0 0 w h"><path d="…" fill="none" stroke="#000"/></svg>`. **Șterge semnătura** clears it.
- **Photo** (`src/proof/PhotoProof.tsx`): `expo-image-picker` camera at quality 0.5, with retake/remove. If camera permission is denied, or no camera is available (simulator), the screen explains it and the driver can use the note instead. On web the photo is kept as a data URI only if it is small enough for browser storage.
- **Offline**: the proof is written to AsyncStorage inside the delivery event before the screen closes, together with the status and note. Route stops with proof show a `📷` / `✍️` marker.
- Camera permission text (Romanian) is set through the `expo-image-picker` plugin in `app.json`; microphone permission is disabled. A new native build is needed for the permission text to apply (Expo Go uses its own).
- Known limit: on native, `photoUri` is a local `file://` path in the app cache. The sync step must upload the file itself; copying it into permanent storage (`expo-file-system`) is a follow-up.

## Scope boundary

This is the mobile slice only. Real route download, authentication, retries, and server conflict resolution are intentionally left as the next integration step because no backend contract was provided.

The delivery event contract is:

```ts
{
  id: string;
  stopId: string;
  status: 'delivered' | 'partial' | 'refused';
  note: string;
  createdAt: string;
  proof?: { photoUri?: string; signature?: string };
}
```
