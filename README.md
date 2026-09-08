# Cornos Ilie Sales

Expo / React Native MVP for the M2 field-sales app from the Slack brief.

## What is included

- Assigned-customer list with search.
- Customer detail and product search.
- Recently ordered products are promoted to the top.
- Large `+` / `-` quantity controls designed for one-handed use.
- Orders are stored locally with AsyncStorage, so the core flow works offline.
- A local sync queue and sync button simulate the future backend handoff.
- Stopwatch and touch-count proxy show whether the order meets the brief target: under 40 seconds and at most 6 touches.

## Run

```bash
npm install
npx expo start
```

Open the project in Expo Go or an Android emulator.

## Current assumptions

The backend, auth, real product catalog, and conflict rules were not provided. This version uses explicit demo data and a deterministic local queue so the user experience and data boundaries can be validated before Taran's visit/history module is integrated.

## Next integration boundary

The current order shape is:

```ts
{
  id: string;
  customerId: string;
  cart: Record<string, number>;
  total: number;
  createdAt: string;
}
```

The queue can later be replaced by an API adapter without changing the field-sales screens.
