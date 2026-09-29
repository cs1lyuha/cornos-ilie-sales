/*
 * Dashboard dispecer — vanilla JS, fără build.
 *
 * Contract API (server/ din alt branch):
 *   GET /route  -> Stop[]           { id, customer, address, items, total, status }
 *   GET /events -> DeliveryEvent[]  { id, stopId, status, note, createdAt, proof?: { photoUri?, signature? } }
 *
 * Moduri:
 *   servit la /dashboard  -> API pe aceeași origine
 *   ?api=http://host:4000 -> API explicit (salvat și în localStorage)
 *   ?demo=1               -> date simulate, fără server
 */
'use strict';

(function () {
  const POLL_MS = 3000;
  const FETCH_TIMEOUT_MS = 2500;
  const HIGHLIGHT_MS = 6000;
  const FEED_LIMIT = 100;
  const STORAGE_KEY = 'cornos-dashboard-api';
  const DEFAULT_API = 'http://localhost:4000';

  const STATUS = {
    delivered: { label: 'Livrat integral', short: 'Livrat', icon: '✓' },
    partial: { label: 'Livrat parțial', short: 'Parțial', icon: '½' },
    refused: { label: 'Refuzat', short: 'Refuzat', icon: '×' },
    pending: { label: 'De livrat', short: 'De livrat', icon: '•' },
  };

  const params = new URLSearchParams(location.search);
  const DEMO = params.get('demo') === '1';
  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';

  const $ = (id) => document.getElementById(id);
  const el = {
    conn: $('conn'),
    connLabel: $('conn-label'),
    connTime: $('conn-time'),
    settings: $('settings'),
    settingsForm: $('settings-form'),
    apiInput: $('api-input'),
    apiLabel: $('api-label'),
    demoBanner: $('demo-banner'),
    demoReset: $('demo-reset'),
    demoOffline: $('demo-offline'),
    kpiDone: $('kpi-done'),
    kpiTotal: $('kpi-total'),
    kpiMeter: $('kpi-meter'),
    kpiMeterFill: $('kpi-meter-fill'),
    kpiDelivered: $('kpi-delivered'),
    kpiPartial: $('kpi-partial'),
    kpiRefused: $('kpi-refused'),
    kpiValue: $('kpi-value'),
    kpiPartialValue: $('kpi-partial-value'),
    stops: $('stops'),
    stopsEmpty: $('stops-empty'),
    feed: $('feed'),
    feedEmpty: $('feed-empty'),
    announcer: $('announcer'),
    stopTpl: $('stop-tpl'),
  };

  // ---------- Utilitare ----------

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* stocare blocată */ }
  }

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function resolveApiBase() {
    const fromQuery = params.get('api');
    if (fromQuery !== null && fromQuery.trim() !== '') return normalizeBase(fromQuery);
    const stored = safeStorageGet(STORAGE_KEY);
    if (stored) return normalizeBase(stored);
    // Servit de server la /dashboard -> aceeași origine.
    if (isHttp && location.pathname.includes('/dashboard')) return '';
    return DEFAULT_API;
  }

  const moneyFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
  const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const shortTimeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
  const dateTimeFmt = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function formatMoney(n) {
    return moneyFmt.format(Number(n) || 0);
  }

  function pluralProduse(n) {
    if (n === 1) return '1 produs';
    const rest = n % 100;
    return n !== 0 && (rest === 0 || rest >= 20) ? `${n} de produse` : `${n} produse`;
  }

  function parseDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatWhen(d) {
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? shortTimeFmt.format(d) : dateTimeFmt.format(d);
  }

  function formatRelative(d) {
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return 'chiar acum';
    const min = Math.round(sec / 60);
    if (min < 60) return `acum ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `acum ${h} h`;
    return `acum ${Math.round(h / 24)} z`;
  }

  function statusKey(s) {
    return Object.prototype.hasOwnProperty.call(STATUS, s) ? s : 'pending';
  }

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function announce(message) {
    const line = h('p', null, message);
    el.announcer.appendChild(line);
    while (el.announcer.childNodes.length > 5) el.announcer.removeChild(el.announcer.firstChild);
  }

  // ---------- Randare fragmente ----------

  function chip(status, useShort) {
    const key = statusKey(status);
    const info = STATUS[key];
    const node = h('span', `chip chip--${key}`);
    const icon = h('span', 'chip__icon', info.icon);
    icon.setAttribute('aria-hidden', 'true');
    node.append(icon, document.createTextNode(useShort ? info.short : info.label));
    if (useShort) node.title = info.label;
    return node;
  }

  function timeNode(iso) {
    const d = parseDate(iso);
    const node = h('time', 'time');
    if (!d) { node.textContent = '—'; return node; }
    node.dateTime = d.toISOString();
    node.textContent = `${formatWhen(d)} · ${formatRelative(d)}`;
    node.title = d.toLocaleString('ro-RO');
    return node;
  }

  function parseSignature(raw) {
    if (!raw) return null;
    try {
      const sig = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const w = Number(sig && sig.w);
      const hgt = Number(sig && sig.h);
      const d = sig && typeof sig.d === 'string' ? sig.d : '';
      if (!(w > 0) || !(hgt > 0) || !d) return null;
      return { w, h: hgt, d };
    } catch {
      return null;
    }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function signatureNode(raw, withLabel) {
    const sig = parseSignature(raw);
    if (!sig) return null;
    const wrap = h('span', 'sig');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${sig.w} ${sig.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Semnătura clientului');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'Semnătura clientului';
    const path = document.createElementNS(SVG_NS, 'path');
    // setAttribute pe 'd' nu execută nimic: datele din API nu ajung în innerHTML.
    path.setAttribute('d', sig.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(title, path);
    wrap.appendChild(svg);
    if (withLabel) wrap.appendChild(h('span', 'sig__label', 'semnat'));
    return wrap;
  }

  function photoBadge(proof) {
    if (!proof || !proof.photoUri) return null;
    const badge = h('span', 'badge');
    const icon = h('span', null, '📷');
    icon.setAttribute('aria-hidden', 'true');
    badge.append(icon, document.createTextNode('poză atașată'));
    badge.title = 'Poza e stocată pe telefonul șoferului';
    return badge;
  }

  function noteNode(note) {
    const text = (note || '').trim();
    return text ? h('span', 'note', text) : h('span', 'note note--empty', 'Fără notă');
  }

  // ---------- Stare ----------

  const state = {
    firstLoad: true,
    seenEventIds: new Set(),
    lastStopEvent: new Map(), // stopId -> event id afișat
    stopNodes: new Map(),
    feedNodes: new Map(),
    lastOkAt: null,
    connection: 'connecting',
  };

  function sortEvents(events) {
    return events.slice().sort((a, b) => {
      const ta = parseDate(a.createdAt)?.getTime() ?? 0;
      const tb = parseDate(b.createdAt)?.getTime() ?? 0;
      return tb - ta;
    });
  }

  function latestByStop(events) {
    const map = new Map();
    for (const ev of events) if (!map.has(ev.stopId)) map.set(ev.stopId, ev);
    return map;
  }

  function flash(node) {
    node.classList.add('is-new');
    setTimeout(() => node.classList.remove('is-new'), HIGHLIGHT_MS);
  }

  // ---------- KPI ----------

  function renderKpis(stops, latest) {
    let delivered = 0, partial = 0, refused = 0, value = 0, partialValue = 0;
    for (const stop of stops) {
      const ev = latest.get(stop.id);
      const status = statusKey(ev ? ev.status : stop.status);
      const total = Number(stop.total) || 0;
      if (status === 'delivered') { delivered += 1; value += total; }
      else if (status === 'partial') { partial += 1; partialValue += total; }
      else if (status === 'refused') refused += 1;
    }
    const done = delivered + partial + refused;
    el.kpiDone.textContent = done;
    el.kpiTotal.textContent = stops.length;
    el.kpiDelivered.textContent = delivered;
    el.kpiPartial.textContent = partial;
    el.kpiRefused.textContent = refused;
    el.kpiValue.textContent = formatMoney(value);
    el.kpiPartialValue.textContent = formatMoney(partialValue);
    const pct = stops.length ? Math.round((done / stops.length) * 100) : 0;
    el.kpiMeterFill.style.width = `${pct}%`;
    el.kpiMeter.setAttribute('aria-valuemax', String(stops.length));
    el.kpiMeter.setAttribute('aria-valuenow', String(done));
    el.kpiMeter.setAttribute('aria-valuetext', `${done} din ${stops.length} opriri finalizate`);
  }

  // ---------- Opriri ----------

  function renderStops(stops, latest) {
    const keep = new Set();
    stops.forEach((stop, index) => {
      keep.add(stop.id);
      let node = state.stopNodes.get(stop.id);
      if (!node) {
        node = el.stopTpl.content.firstElementChild.cloneNode(true);
        state.stopNodes.set(stop.id, node);
      }
      const ev = latest.get(stop.id);
      const status = statusKey(ev ? ev.status : stop.status);
      const items = Array.isArray(stop.items) ? stop.items : [];

      node.dataset.status = status;
      node.querySelector('.stop__num').textContent = status === 'pending' ? String(index + 1) : STATUS[status].icon;
      node.querySelector('.stop__customer').textContent = `${index + 1}. ${stop.customer || stop.id}`;
      node.querySelector('.chip').replaceWith(chip(status, false));
      node.querySelector('.stop__meta').textContent =
        `${stop.address || 'Adresă necunoscută'} · ${pluralProduse(items.length)} · ${formatMoney(stop.total)} MDL`;

      const itemsBox = node.querySelector('.stop__items');
      itemsBox.hidden = items.length === 0;
      itemsBox.querySelector('summary').textContent = 'Produse comandate';
      const ul = itemsBox.querySelector('ul');
      const itemsKey = JSON.stringify(items);
      if (ul.dataset.key !== itemsKey) {
        ul.replaceChildren(...items.map((item) => h('li', null, item)));
        ul.dataset.key = itemsKey;
      }

      const evBox = node.querySelector('.stop__event');
      if (ev) {
        const parts = [timeNode(ev.createdAt), noteNode(ev.note)];
        const sig = signatureNode(ev.proof && ev.proof.signature, true);
        if (sig) parts.push(sig);
        const photo = photoBadge(ev.proof);
        if (photo) parts.push(photo);
        evBox.replaceChildren(...parts);
      } else {
        evBox.replaceChildren();
      }

      const shownId = ev ? ev.id : null;
      if (!state.firstLoad && shownId && state.lastStopEvent.get(stop.id) !== shownId) flash(node);
      state.lastStopEvent.set(stop.id, shownId);

      // Ordinea din rută; appendChild mută nodul existent fără a-l recrea.
      if (el.stops.children[index] !== node) el.stops.insertBefore(node, el.stops.children[index] || null);
    });
    for (const [id, node] of state.stopNodes) {
      if (!keep.has(id)) { node.remove(); state.stopNodes.delete(id); }
    }
    el.stopsEmpty.textContent = 'Nicio oprire în rută.';
    el.stopsEmpty.hidden = stops.length > 0;
    el.stops.setAttribute('aria-busy', 'false');
  }

  // ---------- Feed ----------

  function buildFeedItem(ev, stopName) {
    const li = h('li', 'feed__item');
    li.dataset.id = ev.id;
    li.appendChild(chip(ev.status, true));
    const title = h('div', 'feed__title');
    const name = h('span', 'feed__name', stopName);
    title.append(name, timeNode(ev.createdAt));
    const detail = h('div', 'feed__detail');
    detail.appendChild(noteNode(ev.note));
    const sig = signatureNode(ev.proof && ev.proof.signature, false);
    if (sig) detail.appendChild(sig);
    const photo = photoBadge(ev.proof);
    if (photo) detail.appendChild(photo);
    li.append(title, detail);
    return li;
  }

  function renderFeed(events, stopsById) {
    const shown = events.slice(0, FEED_LIMIT);
    const keep = new Set();
    const fresh = [];
    shown.forEach((ev, index) => {
      keep.add(ev.id);
      const stop = stopsById.get(ev.stopId);
      const stopName = stop ? stop.customer : ev.stopId;
      let node = state.feedNodes.get(ev.id);
      if (!node) {
        node = buildFeedItem(ev, stopName);
        state.feedNodes.set(ev.id, node);
        if (!state.firstLoad && !state.seenEventIds.has(ev.id)) {
          const tag = h('span', 'new-tag', 'nou');
          node.querySelector('.feed__name').appendChild(tag);
          setTimeout(() => tag.remove(), HIGHLIGHT_MS);
          flash(node);
          fresh.push(`${stopName}: ${STATUS[statusKey(ev.status)].label}`);
        }
      } else {
        // Actualizează doar timpul relativ.
        node.querySelector('.feed__title time').replaceWith(timeNode(ev.createdAt));
      }
      if (el.feed.children[index] !== node) el.feed.insertBefore(node, el.feed.children[index] || null);
    });
    for (const [id, node] of state.feedNodes) {
      if (!keep.has(id)) { node.remove(); state.feedNodes.delete(id); }
    }
    for (const ev of events) state.seenEventIds.add(ev.id);
    el.feedEmpty.hidden = shown.length > 0;
    if (fresh.length) announce(`Eveniment nou — ${fresh.reverse().join('; ')}`);
  }

  function render(data) {
    const stops = data.route;
    const events = sortEvents(data.events);
    const latest = latestByStop(events);
    const stopsById = new Map(stops.map((s) => [s.id, s]));
    renderKpis(stops, latest);
    renderStops(stops, latest);
    renderFeed(events, stopsById);
    state.firstLoad = false;
  }

  // ---------- Conexiune ----------

  function setConnection(kind, detail) {
    const previous = state.connection;
    state.connection = kind;
    el.conn.className = `conn conn--${kind}`;
    const last = state.lastOkAt ? timeFmt.format(state.lastOkAt) : null;
    if (kind === 'online' || kind === 'demo') {
      el.connLabel.textContent = kind === 'demo' ? 'Demo live' : 'Online';
      el.connTime.textContent = `actualizat ${last}`;
      el.conn.title = '';
    } else if (kind === 'offline') {
      el.connLabel.textContent = 'Offline';
      el.connTime.textContent = last ? `ultima actualizare ${last}` : 'server indisponibil';
      el.conn.title = detail || '';
      if (!state.lastOkAt) {
        // Nu avem încă date: explică de ce panoul e gol.
        el.stopsEmpty.textContent = `Serverul nu răspunde (${el.apiLabel.textContent}). Se reîncearcă la fiecare 3 s — verifică adresa în Setări.`;
        el.stopsEmpty.hidden = false;
      }
    }
    if (previous !== kind && kind !== 'connecting') {
      announce(kind === 'offline'
        ? 'Conexiunea cu serverul s-a pierdut. Se reîncearcă automat.'
        : 'Conectat. Datele se actualizează automat.');
    }
  }

  // ---------- Surse de date ----------

  function createHttpSource(base) {
    async function getJSON(path) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(base + path, {
          signal: ctrl.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        const body = await res.json();
        if (!Array.isArray(body)) throw new Error(`${path}: răspuns neașteptat`);
        return body;
      } catch (err) {
        if (err && err.name === 'AbortError') throw new Error(`${path}: timeout`);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      async load() {
        const [route, events] = await Promise.all([getJSON('/route'), getJSON('/events')]);
        return { route, events };
      },
    };
  }

  function createDemoSource() {
    const stops = [
      { id: 'stop-1', customer: 'La Plăcinte Centru', address: 'Bd. Ștefan cel Mare 64', items: ['Apă minerală 0.5L × 4', 'Cafea boabe 1kg × 2', 'Șervețele horeca × 5'], total: 842 },
      { id: 'stop-2', customer: 'Andy’s Pizza Botanica', address: 'Str. Independenței 12', items: ['Bere blondă 0.5L × 6', 'Suc de mere 1L × 3'], total: 1220 },
      { id: 'stop-3', customer: 'Coffee Break', address: 'Str. București 33', items: ['Cafea boabe 1kg × 3', 'Șervețele horeca × 2'], total: 716 },
    ];
    const sig = (d) => JSON.stringify({ w: 300, h: 120, d });
    // Scenariu: [secunde de la start, eveniment]
    const script = [
      [-540, { stopId: 'stop-1', status: 'delivered', note: 'Predat la bar, a semnat managerul.', proof: { photoUri: 'file:///demo/stop-1.jpg', signature: sig('M20 80 C 40 20, 60 20, 70 70 S 100 110, 120 50 C 130 30, 150 30, 160 70 L 175 60 C 190 40, 210 90, 230 55 S 265 40, 280 70') } }],
      [5, { stopId: 'stop-2', status: 'partial', note: 'Lipsă 2 × suc de mere, restul predat.', proof: { signature: sig('M25 70 Q 50 10, 75 70 T 125 70 M 130 40 L 150 95 L 170 35 M 185 75 C 205 50, 225 50, 240 80 S 270 90, 285 60') } }],
      [14, { stopId: 'stop-3', status: 'refused', note: 'Client închis, revenim mâine dimineață.', proof: { photoUri: 'file:///demo/stop-3.jpg' } }],
    ];
    // ?skip=20 derulează scenariul înainte (util pentru capturi de ecran).
    const skip = Math.max(0, Number(params.get('skip')) || 0);
    let startedAt = Date.now() - skip * 1000;
    let offline = false;
    return {
      reset() { startedAt = Date.now(); },
      setOffline(value) { offline = value; },
      async load() {
        await new Promise((r) => setTimeout(r, 120)); // latență simulată
        if (offline) throw new Error('demo: conexiune întreruptă (simulat)');
        const elapsed = (Date.now() - startedAt) / 1000;
        const events = script
          .filter(([at]) => at <= elapsed)
          .map(([at, ev], i) => ({
            id: `demo-${startedAt}-${i}`,
            createdAt: new Date(startedAt + at * 1000).toISOString(),
            ...ev,
          }))
          .reverse();
        const latest = latestByStop(events);
        const route = stops.map((s) => ({ ...s, status: latest.has(s.id) ? latest.get(s.id).status : 'pending' }));
        return { route, events };
      },
    };
  }

  // ---------- Setări ----------

  const apiBase = resolveApiBase();
  const source = DEMO ? createDemoSource() : createHttpSource(apiBase);

  el.apiInput.value = apiBase;
  el.apiLabel.textContent = DEMO ? 'demo (date locale)' : (apiBase || `${location.origin} (aceeași origine)`);

  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = normalizeBase(el.apiInput.value);
    if (value && !/^https?:\/\//i.test(value)) {
      el.apiInput.setCustomValidity('Adresa trebuie să înceapă cu http:// sau https://');
      el.apiInput.reportValidity();
      return;
    }
    el.apiInput.setCustomValidity('');
    safeStorageSet(STORAGE_KEY, value);
    const next = new URL(location.href);
    next.searchParams.delete('demo');
    if (value) next.searchParams.set('api', value); else next.searchParams.delete('api');
    location.assign(next.toString());
  });
  el.apiInput.addEventListener('input', () => el.apiInput.setCustomValidity(''));

  const demoUrl = new URL(location.href);
  demoUrl.searchParams.set('demo', '1');
  $('demo-link').href = demoUrl.toString();

  if (DEMO) {
    el.demoBanner.hidden = false;
    $('demo-link').textContent = 'Repornește demo';
    el.demoReset.addEventListener('click', () => {
      source.reset();
      state.firstLoad = true;
      state.seenEventIds.clear();
      state.lastStopEvent.clear();
      tickNow();
    });
    el.demoOffline.addEventListener('click', () => {
      const next = el.demoOffline.getAttribute('aria-pressed') !== 'true';
      el.demoOffline.setAttribute('aria-pressed', String(next));
      el.demoOffline.textContent = next ? 'Restabilește conexiunea' : 'Simulează pierderea conexiunii';
      source.setOffline(next);
      tickNow();
    });
  }

  // ---------- Buclă de polling ----------

  let timer = null;
  let inFlight = false;

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    clearTimeout(timer);
    try {
      const data = await source.load();
      state.lastOkAt = new Date();
      render(data);
      setConnection(DEMO ? 'demo' : 'online');
    } catch (err) {
      setConnection('offline', err && err.message);
    } finally {
      inFlight = false;
      timer = setTimeout(tick, POLL_MS);
    }
  }

  function tickNow() {
    clearTimeout(timer);
    void tick();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tickNow();
  });

  tick();
})();
