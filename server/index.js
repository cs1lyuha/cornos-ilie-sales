// Minimal delivery-event backend. No database: events persist to data/events.json.
//
// API contract (shared with the mobile app and the dispatcher dashboard):
//   GET  /health  -> { ok: true }
//   GET  /route   -> Stop[] (status always 'pending'; see /status for live state)
//   POST /events  { events: DeliveryEvent[] } -> { accepted: string[] }  (idempotent by id)
//   GET  /events  -> DeliveryEvent[] sorted by createdAt desc (full history)
//   GET  /status  -> { [stopId]: DeliveryEvent }  latest event per stop (extra, optional)
//   /dashboard    -> static files from ../dashboard when that directory exists
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { STOPS } = require('./stops');

const STATUSES = new Set(['delivered', 'partial', 'refused']);
const DEFAULT_DATA_FILE = path.join(__dirname, 'data', 'events.json');
const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');

function createStore(dataFile) {
  let events = [];
  if (fs.existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (Array.isArray(parsed)) events = parsed;
    } catch (error) {
      console.warn(`Could not read ${dataFile}, starting empty:`, error.message);
    }
  }
  const ids = new Set(events.map((event) => event.id));

  function persist() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(events, null, 2));
    fs.renameSync(tmp, dataFile); // atomic replace, never a half-written file
  }

  return {
    // Adds events whose id is new; returns every id that is now stored (new + already known).
    add(batch) {
      const accepted = [];
      let changed = false;
      for (const event of batch) {
        if (!ids.has(event.id)) {
          ids.add(event.id);
          events.push(event);
          changed = true;
        }
        if (!accepted.includes(event.id)) accepted.push(event.id);
      }
      if (changed) persist();
      return accepted;
    },
    all() {
      // Newest first; stable for equal timestamps (later-received first).
      return events
        .map((event, index) => ({ event, index }))
        .sort((a, b) => Date.parse(b.event.createdAt) - Date.parse(a.event.createdAt) || b.index - a.index)
        .map(({ event }) => event);
    },
    // A later event for a stop supersedes earlier ones for its current status; history is kept.
    currentByStop() {
      const current = {};
      for (const event of [...this.all()].reverse()) current[event.stopId] = event;
      return current;
    },
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Returns a list of human-readable problems; empty list means the event is valid.
function validateEvent(event, index) {
  const where = `events[${index}]`;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return [`${where} must be an object`];
  const errors = [];
  if (!isNonEmptyString(event.id)) errors.push(`${where}.id is required`);
  if (!isNonEmptyString(event.stopId)) errors.push(`${where}.stopId is required`);
  if (!STATUSES.has(event.status)) errors.push(`${where}.status must be one of delivered|partial|refused`);
  if (event.note !== undefined && typeof event.note !== 'string') errors.push(`${where}.note must be a string`);
  if (event.createdAt !== undefined && (typeof event.createdAt !== 'string' || Number.isNaN(Date.parse(event.createdAt)))) {
    errors.push(`${where}.createdAt must be an ISO date string`);
  }
  if (event.proof !== undefined && (event.proof === null || typeof event.proof !== 'object' || Array.isArray(event.proof))) {
    errors.push(`${where}.proof must be an object`);
  }
  return errors;
}

function createApp({ dataFile = DEFAULT_DATA_FILE, dashboardDir = DASHBOARD_DIR } = {}) {
  const store = createStore(dataFile);
  const app = express();

  app.use(cors());
  // Proof of delivery (signature / photo data URIs) can be large.
  app.use(express.json({ limit: '15mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/route', (_req, res) => res.json(STOPS.map((stop) => ({ ...stop, items: [...stop.items], status: 'pending' }))));

  app.get('/events', (_req, res) => res.json(store.all()));

  app.get('/status', (_req, res) => res.json(store.currentByStop()));

  app.post('/events', (req, res) => {
    const batch = req.body && req.body.events;
    if (!Array.isArray(batch)) return res.status(400).json({ error: 'Body must be { events: DeliveryEvent[] }' });
    const errors = batch.flatMap((event, index) => validateEvent(event, index));
    if (errors.length) return res.status(400).json({ error: 'Invalid events', details: errors });
    // Keep every field as sent (e.g. proof); only fill defaults for optional contract fields.
    const normalized = batch.map((event) => ({
      ...event,
      note: event.note ?? '',
      createdAt: event.createdAt ?? new Date().toISOString(),
    }));
    return res.json({ accepted: store.add(normalized) });
  });

  if (fs.existsSync(dashboardDir) && fs.statSync(dashboardDir).isDirectory()) {
    app.use('/dashboard', express.static(dashboardDir));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Malformed JSON / oversized bodies -> 4xx JSON instead of an HTML stack trace.
  app.use((error, _req, res, _next) => {
    const status = error.status || error.statusCode || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4000;
  createApp().listen(port, () => {
    console.log(`Delivery server listening on http://localhost:${port}`);
    if (fs.existsSync(DASHBOARD_DIR)) console.log(`Dashboard: http://localhost:${port}/dashboard/`);
  });
}

module.exports = { createApp, validateEvent };
