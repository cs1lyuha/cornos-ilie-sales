// Smoke tests: run with `npm test` (node's built-in test runner, no extra deps).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');

let server;
let baseUrl;
let tmpDir;
let dataFile;

function start() {
  return new Promise((resolve) => {
    server = createApp({ dataFile, dashboardDir: path.join(tmpDir, 'no-dashboard') }).listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

function stop() {
  return new Promise((resolve) => server.close(resolve));
}

function post(events) {
  return fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
}

const event = (overrides = {}) => ({
  id: 'event-1',
  stopId: 'stop-1',
  status: 'delivered',
  note: '',
  createdAt: '2026-09-29T10:00:00.000Z',
  ...overrides,
});

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-server-'));
  dataFile = path.join(tmpDir, 'data', 'events.json');
  await start();
});

after(async () => {
  await stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GET /health and GET /route', async () => {
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { ok: true });
  const route = await (await fetch(`${baseUrl}/route`)).json();
  assert.equal(route.length, 3);
  assert.deepEqual(route.map((stop) => stop.id), ['stop-1', 'stop-2', 'stop-3']);
  assert.ok(route.every((stop) => stop.status === 'pending' && Array.isArray(stop.items) && typeof stop.total === 'number'));
});

test('POST /events is idempotent by id', async () => {
  const first = await post([event()]);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { accepted: ['event-1'] });

  // Re-send the same id (e.g. retry after a lost response) plus a duplicate inside the batch.
  const again = await post([event(), event()]);
  assert.deepEqual(await again.json(), { accepted: ['event-1'] });

  const all = await (await fetch(`${baseUrl}/events`)).json();
  assert.equal(all.filter((item) => item.id === 'event-1').length, 1);
});

test('later event supersedes current status, history kept, sorted desc, extra fields kept', async () => {
  const proof = { signature: 'M10 10 L20 20', photoUri: 'file:///photo.jpg' };
  const res = await post([event({ id: 'event-2', status: 'refused', note: 'closed', createdAt: '2026-09-29T11:00:00.000Z', proof })]);
  assert.deepEqual(await res.json(), { accepted: ['event-2'] });

  const all = await (await fetch(`${baseUrl}/events`)).json();
  assert.deepEqual(all.map((item) => item.id), ['event-2', 'event-1']);
  assert.deepEqual(all[0].proof, proof);

  const status = await (await fetch(`${baseUrl}/status`)).json();
  assert.equal(status['stop-1'].id, 'event-2');
  assert.equal(status['stop-1'].status, 'refused');
});

test('POST /events validates input', async () => {
  for (const bad of [
    event({ id: 'bad-1', status: 'lost' }),
    event({ id: '' }),
    event({ id: 'bad-3', stopId: undefined }),
    event({ id: 'bad-4', createdAt: 'yesterday' }),
  ]) {
    const res = await post([bad]);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const notArray = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: 'nope' }),
  });
  assert.equal(notArray.status, 400);
  const malformed = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(malformed.status, 400);

  // A batch with one invalid event is rejected as a whole; nothing is stored.
  const mixed = await post([event({ id: 'good-5' }), event({ id: 'bad-5', status: 'nope' })]);
  assert.equal(mixed.status, 400);
  const all = await (await fetch(`${baseUrl}/events`)).json();
  assert.ok(!all.some((item) => item.id === 'good-5' || item.id.startsWith('bad-')));
});

test('serves ../dashboard statically only when it exists', async () => {
  assert.equal((await fetch(`${baseUrl}/dashboard/index.html`)).status, 404);
  const dashboardDir = path.join(tmpDir, 'dashboard');
  fs.mkdirSync(dashboardDir);
  fs.writeFileSync(path.join(dashboardDir, 'index.html'), '<h1>dash</h1>');
  const other = createApp({ dataFile: path.join(tmpDir, 'other.json'), dashboardDir }).listen(0);
  await new Promise((resolve) => other.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${other.address().port}/dashboard/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /dash/);
  } finally {
    await new Promise((resolve) => other.close(resolve));
  }
});

test('events persist to disk across restarts', async () => {
  await stop();
  assert.ok(fs.existsSync(dataFile));
  await start();
  const all = await (await fetch(`${baseUrl}/events`)).json();
  assert.deepEqual(all.map((item) => item.id), ['event-2', 'event-1']);
});
