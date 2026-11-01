'use strict';

/* ============================== Константы ============================== */

const STORE_KEY = 'chronometer.v1';
const COLORS = ['#f03e3e', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5', '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e', '#fab005', '#fd7e14', '#a9672f', '#868e96'];
const PERIODS = { week: 'Эта неделя', lastweek: 'Прошлая неделя', this: 'Этот месяц', prev: 'Прошлый месяц', year: 'Этот год', custom: 'Свой период' };
const NO_COLOR = '#adb5bd';
const HOUR = 36e5;
const LONG_RUN = 4 * HOUR; // после стольких часов таймера присылаем напоминание

/* ============================== Утилиты ============================== */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const monthOf = (s) => s.slice(0, 7);
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const monthEnd = (mk) => { const [y, m] = mk.split('-').map(Number); return `${mk}-${pad(daysInMonth(y, m))}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseAmount = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const round2 = (n) => Math.round(n * 100) / 100;
const $ = (sel, root = document) => root.querySelector(sel);

function icon(name, cls = '') {
  return ICONS[name] ? `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>` : '';
}
const glyph = (name) => (ICONS[name] ? icon(name) : esc(name || '?'));
const badge = (iconName, color, size = '') => `<span class="cico ${size}" style="background:${color}">${glyph(iconName)}</span>`;

function shiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
  return s[0].toUpperCase() + s.slice(1);
}

const shortDate = (s) => parseISO(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: monthOf(s).slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' });

function dayLabel(s) {
  const t = today();
  if (s === t) return 'Сегодня';
  if (s === addDays(t, -1)) return 'Вчера';
  const d = parseISO(s);
  const opts = { day: 'numeric', month: 'long', weekday: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const fmt = (amount) => money.format(round2(amount));

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ---------- Время ---------- */

const dayOf = (ts) => iso(new Date(ts));
const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const atTime = (day, hhmm) => { const d = parseISO(day); const [h, m] = hhmm.split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
const dayStart = (day) => parseISO(day).getTime();
const weekStart = (s) => addDays(s, -((parseISO(s).getDay() + 6) % 7));

/** 1:24:07 — для таймера и записей. */
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
/** 12:05 — часы и минуты для итогов. */
function hrs(ms) {
  const m = Math.round(Math.max(0, ms) / 6e4);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}
const hoursDec = (ms) => String(round2(ms / HOUR)).replace('.', ',');

/** Понимает «1:30», «1h30», «1ч 30м», «45м», «1,5» и «2» (до 24 — часы, больше — минуты). Возвращает мс или NaN. */
function parseDuration(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(',', '.');
  if (!s) return NaN;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return ((+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0))) * 1000;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return (s.includes('.') || n <= 24 ? n * 3600 : n * 60) * 1000; }
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|ч)[a-zа-я]*)?\s*(?:(\d+)\s*(?:m|м)?[a-zа-я]*)?$/);
  if (m && (m[1] || m[2])) return (parseFloat(m[1] || 0) * 3600 + (+(m[2] || 0)) * 60) * 1000;
  return NaN;
}

function toast(msg, act = null) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${act ? `<button type="button">${esc(act.label)}</button>` : ''}`;
  el.classList.toggle('has-act', Boolean(act));
  if (act) el.querySelector('button').onclick = () => { el.classList.remove('show', 'has-act'); act.fn(); };
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show', 'has-act'), act ? 5000 : 2400);
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

/* ============================== Данные ============================== */

function emptyDb() {
  return {
    version: 1,
    clients: [],
    projects: [],
    labels: [],
    entries: [],
    settings: { theme: 'auto', name: '', rate: 0 },
  };
}

function demoDb() {
  const d = emptyDb();
  const cA = { id: uid(), name: 'ООО «Аспект»' }, cU = { id: uid(), name: 'Университет' };
  d.clients.push(cA, cU);
  const P = (name, color, clientId, billable, rate) => ({ id: uid(), name, color, clientId, billable, rate, archived: false });
  const pC = P('Хронометр', '#7950f2', '', false, 0), pS = P('Аспирантура', '#228be6', cU.id, false, 0);
  const pA = P('Аспект', '#fd7e14', cA.id, true, 1500), pM = P('Монетка', '#40c057', '', false, 0);
  d.projects.push(pC, pS, pA, pM);
  const lC = { id: uid(), name: 'созвон', color: '#fab005' }, lR = { id: uid(), name: 'ревью', color: '#15aabf' }, lD = { id: uid(), name: 'отчёт', color: '#e64980' };
  d.labels.push(lC, lR, lD);
  const DAYS = [
    [[pA, 'Анализ требований', [], 135], [pA, 'Созвон с заказчиком', [lC], 45], [pC, 'Модель данных', [], 150], [pM, 'Ревью PR', [lR], 50]],
    [[pS, 'Статья, глава 2', [], 210], [pC, 'Экран таймера', [], 120], [pA, 'Доработка модуля', [], 95]],
    [[pA, 'Отчётность за неделю', [lD], 60], [pS, 'Обзор литературы', [], 140], [pC, 'Свайпы в журнале', [], 110], [pM, 'Синхронизация', [], 40]],
    [[pC, 'PWA и Service Worker', [], 180], [pA, 'Созвон с заказчиком', [lC], 30], [pA, 'Исправление ошибок', [], 120]],
    [[pS, 'Эксперимент, расчёты', [], 165], [pA, 'Доработка модуля', [], 150], [pC, 'Отчёты и PDF', [lR], 70]],
  ];
  const now = Date.now();
  for (let back = 15; back >= 0; back--) {
    const day = addDays(today(), -back), dow = parseISO(day).getDay();
    if ((dow === 0 || dow === 6) && back !== 0) continue;
    let t = atTime(day, '09:30');
    for (const [p, note, labels, min] of DAYS[back % DAYS.length]) {
      if (t + min * 6e4 > now - 90 * 6e4) break;
      d.entries.push({ id: uid(), note, projectId: p.id, labels: labels.map((l) => l.id), billable: p.billable, start: t, end: t + min * 6e4 });
      t += (min + 15) * 6e4;
    }
  }
  d.entries.push({ id: uid(), note: 'Вёрстка экрана отчётов', projectId: pC.id, labels: [], billable: false, start: now - (84 * 60 + 7) * 1000, end: null });
  d.isDemo = true;
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* повреждённые данные или недоступное хранилище — начинаем с демо */ }
  return demoDb();
}

function normalize(d) {
  const base = emptyDb();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  for (const k of ['clients', 'projects', 'labels', 'entries']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.deleted || typeof out.deleted !== 'object') out.deleted = {};
  for (const e of out.entries) {
    if (!Array.isArray(e.labels)) e.labels = [];
    if (e.end === undefined) e.end = null;
  }
  // Таймер может идти только один. Если после синхронизации их несколько (запущены на разных
  // устройствах), оставляем самый поздний, а остальные завершаем в момент его старта.
  const running = out.entries.filter((e) => e.end === null).sort((a, b) => b.start - a.start);
  for (const e of running.slice(1)) e.end = Math.max(e.start, running[0].start);
  return out;
}

function save() {
  Sync.stamp(db);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch { toast('Не удалось сохранить: хранилище браузера недоступно'); }
  Sync.schedule();
}

let db = load();
const ui = {
  view: 'timer', week: weekStart(today()), projTab: 'projects', days: 14,
  draft: { note: '', projectId: '', labels: [], billable: false },
  rep: { period: 'week', from: '', to: '', client: '', project: '', label: '', bill: '' },
  warned: new Set(),
};

/* ============================== Расчёты ============================== */

const projById = (id) => db.projects.find((p) => p.id === id);
const clientById = (id) => db.clients.find((c) => c.id === id);
const labelById = (id) => db.labels.find((l) => l.id === id);
const entryById = (id) => db.entries.find((e) => e.id === id);
const running = () => db.entries.find((e) => e.end === null);
const durOf = (e) => (e.end ?? Date.now()) - e.start;
const colorOf = (e) => projById(e.projectId)?.color || NO_COLOR;
const rateOf = (e) => projById(e.projectId)?.rate || Number(db.settings.rate) || 0;
const amountOf = (e) => (e.billable ? round2((durOf(e) / HOUR) * rateOf(e)) : 0);
const sumDur = (list) => list.reduce((s, e) => s + durOf(e), 0);
const sumAmount = (list) => list.reduce((s, e) => s + amountOf(e), 0);
const entriesIn = (from, to) => db.entries.filter((e) => { const d = dayOf(e.start); return d >= from && d <= to; });

function fieldsOf(e) {
  return { note: e.note, projectId: e.projectId, labels: [...e.labels], billable: e.billable };
}

function lastFinished() {
  return db.entries.reduce((best, e) => (e.end !== null && (!best || e.end > best.end) ? e : best), null);
}

/** Последняя запись с каждым описанием, самые свежие первыми — для подсказок и «Недавних». */
function recentNotes(limit = 40) {
  const seen = new Set(), out = [];
  for (const e of [...db.entries].sort((a, b) => b.start - a.start)) {
    const k = e.note.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

const findByNote = (note) => recentNotes(500).find((e) => e.note.trim().toLowerCase() === note.trim().toLowerCase());

function notesDatalist() {
  return `<datalist id="notes">${recentNotes().map((e) => `<option value="${esc(e.note)}">${esc(projById(e.projectId)?.name || '')}</option>`).join('')}</datalist>`;
}

function projectTitle(p) {
  if (!p) return 'Без проекта';
  const c = clientById(p.clientId);
  return c ? `${p.name} · ${c.name}` : p.name;
}

function startTimer(fields) {
  const now = Date.now();
  const r = running();
  if (r) r.end = now;
  db.entries.push({ id: uid(), note: fields.note || '', projectId: fields.projectId || '', labels: [...(fields.labels || [])], billable: Boolean(fields.billable), start: now, end: null });
  save(); render();
}

function stopTimer() {
  const r = running();
  if (!r) return;
  r.end = Date.now();
  ui.draft = fieldsOf(r); // следующий запуск по умолчанию продолжает ту же работу
  // Случайное двойное нажатие «старт — стоп» не должно оставлять в журнале пустых записей.
  if (durOf(r) < 5000) {
    db.entries = db.entries.filter((e) => e !== r);
    save(); render();
    toast('Запись короче 5 секунд — не сохранена');
    return;
  }
  save(); render();
  toast(`Записано ${clock(durOf(r))}`);
}

function continueEntry(e) {
  startTimer(e);
  toast(`Продолжаю «${e.note || projectTitle(projById(e.projectId))}»`);
}

function deleteEntry(e) {
  const i = db.entries.indexOf(e);
  if (i < 0) return;
  db.entries.splice(i, 1);
  save(); render();
  toast('Запись удалена', { label: 'Отменить', fn: () => { delete db.deleted?.[e.id]; db.entries.push(e); save(); render(); } });
}

function periodRange(rep) {
  const t = today(), mk = monthOf(t), y = t.slice(0, 4), ws = weekStart(t);
  const span = (from, to) => ({ from, to, label: `${shortDate(from)} — ${shortDate(to)}` });
  switch (rep.period) {
    case 'week': return span(ws, addDays(ws, 6));
    case 'lastweek': return span(addDays(ws, -7), addDays(ws, -1));
    case 'this': return { from: `${mk}-01`, to: monthEnd(mk), label: monthLabel(mk) };
    case 'prev': { const p = shiftMonth(mk, -1); return { from: `${p}-01`, to: monthEnd(p), label: monthLabel(p) }; }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} год` };
    default: {
      const from = rep.from || `${mk}-01`, to = rep.to || t;
      const sameMonth = monthOf(from) === monthOf(to) && from.endsWith('-01') && to === monthEnd(monthOf(to));
      return sameMonth ? { from, to, label: monthLabel(monthOf(from)) } : span(from, to);
    }
  }
}

function reportData() {
  const r = ui.rep;
  const range = periodRange(r);
  let list = entriesIn(range.from, range.to);
  if (r.client) list = list.filter((e) => (projById(e.projectId)?.clientId || 'none') === r.client);
  if (r.project) list = list.filter((e) => (e.projectId || 'none') === r.project);
  if (r.label) list = list.filter((e) => e.labels.includes(r.label));
  if (r.bill) list = list.filter((e) => e.billable === (r.bill === 'yes'));
  list.sort((a, b) => b.start - a.start);
  return { range, list, total: sumDur(list), billable: sumDur(list.filter((e) => e.billable)), amount: sumAmount(list) };
}

function reportFilterText() {
  const r = ui.rep, parts = [];
  if (r.client) parts.push(r.client === 'none' ? 'Без клиента' : clientById(r.client)?.name);
  if (r.project) parts.push(r.project === 'none' ? 'Без проекта' : projById(r.project)?.name);
  if (r.label) parts.push(`#${labelById(r.label)?.name || ''}`);
  if (r.bill) parts.push(r.bill === 'yes' ? 'Оплачиваемые' : 'Неоплачиваемые');
  return parts.filter(Boolean).join(' · ');
}

function byProject(list) {
  const m = new Map();
  for (const e of list) {
    const k = e.projectId || '';
    const it = m.get(k) || { id: k, label: projectTitle(projById(k)), color: projById(k)?.color || NO_COLOR, value: 0, amount: 0 };
    it.value += durOf(e);
    it.amount += amountOf(e);
    m.set(k, it);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

/* ============================== Графики ============================== */

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v);
}

function donut(items, center = '') {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 62, c = 2 * Math.PI * r, gap = items.length > 1 ? 1.5 : 0;
  let off = 0;
  const arcs = total > 0
    ? items.map((i) => {
      const len = (i.value / total) * c;
      const el = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${i.color}" stroke-width="20"
        stroke-dasharray="${Math.max(len - gap, 0.1)} ${c - Math.max(len - gap, 0.1)}" stroke-dashoffset="${-off}"><title>${esc(i.label)}: ${hrs(i.value)}</title></circle>`;
      off += len;
      return el;
    }).join('')
    : `<circle r="${r}" cx="80" cy="80" fill="none" stroke="var(--surface-2)" stroke-width="20"/>`;
  return `<svg width="170" height="170" viewBox="0 0 160 160" role="img" aria-label="Время по проектам">
    <g transform="rotate(-90 80 80)">${arcs}</g>
    <text x="80" y="75" text-anchor="middle" font-size="11" fill="var(--muted)">Всего</text>
    <text x="80" y="95" text-anchor="middle" font-size="16" font-weight="800" fill="var(--text)">${esc(center)}</text>
  </svg>`;
}

function legend(items) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return `<div class="legend">${items.map((i) => `
    <div class="li"><span class="pdot" style="--c:${i.color}"></span><span>${esc(i.label)}</span>
      <span class="v num">${hrs(i.value)}</span><span class="p num">${Math.round((i.value / total) * 100)}%</span></div>`).join('')}</div>`;
}

/** Столбцы с разбивкой по проектам. buckets: [{ label, parts: [{ color, value, label }] }], значения в мс. */
function stackChart(buckets) {
  const W = 620, H = 220, L = 40, B = 26, T = 10;
  const totals = buckets.map((b) => b.parts.reduce((s, p) => s + p.value, 0) / HOUR);
  const max = niceMax(Math.max(...totals, 0));
  const gw = (W - L) / buckets.length, bw = Math.max(3, Math.min(28, gw * 0.62));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    s += `<line class="grid-line" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${round2(v)} ч</text>`;
  }
  const step = Math.ceil(buckets.length / 12);
  buckets.forEach((b, i) => {
    const cx = L + gw * i + gw / 2;
    let acc = 0;
    for (const p of b.parts) {
      const h = p.value / HOUR;
      s += `<rect x="${cx - bw / 2}" y="${y(acc + h)}" width="${bw}" height="${Math.max(y(acc) - y(acc + h), 0)}" fill="${p.color}"><title>${esc(b.label)} · ${esc(p.label)}: ${hrs(p.value)}</title></rect>`;
      acc += h;
    }
    if (i % step === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Часы по периоду">${s}</svg></div>`;
}

function reportBuckets(range, list) {
  const days = Math.round((dayStart(range.to) - dayStart(range.from)) / 864e5) + 1;
  const keyOf = days <= 31 ? (d) => d : days <= 190 ? weekStart : monthOf;
  const keys = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) { const k = keyOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const label = (k) => (days <= 7 ? parseISO(k).toLocaleDateString('ru-RU', { weekday: 'short' })
    : days <= 31 ? String(parseISO(k).getDate()) : days <= 190 ? shortDate(k) : monthLabel(k).slice(0, 3));
  const map = new Map(keys.map((k) => [k, new Map()]));
  for (const e of list) {
    const parts = map.get(keyOf(dayOf(e.start)));
    if (!parts) continue;
    const p = parts.get(e.projectId) || { color: colorOf(e), label: projectTitle(projById(e.projectId)), value: 0 };
    p.value += durOf(e);
    parts.set(e.projectId, p);
  }
  return keys.map((k) => ({ label: label(k), parts: [...map.get(k).values()] }));
}

/* ============================== Общие фрагменты ============================== */

function topbar(title, sub = '', right = '', extra = '') {
  return `<header class="topbar"><div class="row1"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="toolbar">${right}</div></div>${extra}</header>`;
}

const emptyState = (ic, text, action = '') => `<div class="empty">${icon(ic)}${text}${action ? `<div style="margin-top:12px">${action}</div>` : ''}</div>`;

function tagsHtml(e) {
  return e.labels.map(labelById).filter(Boolean)
    .map((l) => `<span class="tag" style="background:${l.color}22;color:${l.color}">#${esc(l.name)}</span>`).join('');
}

function projectChip(target) {
  const p = projById(target.projectId);
  return `<button class="pchip ${p ? '' : 'none'}" data-act="pick-details" title="Проект и теги">
    <span class="pdot" style="--c:${p?.color || NO_COLOR}"></span><span class="nm">${esc(p ? projectTitle(p) : 'Проект')}</span>
    ${target.labels.length ? `<span class="muted">· ${target.labels.length} ${plural(target.labels.length, 'тег', 'тега', 'тегов')}</span>` : ''}</button>
    <button class="pchip ${target.billable ? 'toggle-on' : 'none'}" data-act="bill-toggle" title="Оплачиваемое время">₽</button>`;
}

function entryRow(e) {
  const p = projById(e.projectId), tags = tagsHtml(e);
  return `<li class="swipe-row" data-id="${e.id}">
    <div class="under"><span class="l-act">${icon('play')} Продолжить</span><span class="r-act">Удалить ${icon('trash-2')}</span></div>
    <div class="row entry" data-act="edit-entry" data-id="${e.id}">
      <span class="pdot" style="--c:${colorOf(e)}"></span>
      <span class="mid"><div class="t">${esc(e.note || 'Без описания')}</div><div class="s">${esc(projectTitle(p))}</div>${tags ? `<div class="tags">${tags}</div>` : ''}</span>
      <span class="side"><span class="dur">${clock(durOf(e))}</span><span class="when">${e.billable ? '<span class="bill">₽</span> ' : ''}${hm(e.start)}–${e.end === null ? 'сейчас' : hm(e.end)}</span></span>
      <button class="icon-btn" data-act="continue" data-id="${e.id}" title="Продолжить" aria-label="Продолжить">${icon('play')}</button>
    </div></li>`;
}

function groupedEntries(list) {
  const days = new Map();
  for (const e of [...list].sort((a, b) => b.start - a.start)) {
    const d = dayOf(e.start);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  return [...days].map(([d, items]) => `<div class="day"><span>${esc(dayLabel(d))}</span><span class="num">${hrs(sumDur(items))}</span></div>
    <ul class="list">${items.map(entryRow).join('')}</ul>`).join('');
}

/* ============================== Разделы ============================== */

function viewTimer() {
  const r = running(), t = today(), ws = weekStart(t);
  const target = r || ui.draft;
  const done = db.entries.filter((e) => e.end !== null);
  const from = addDays(t, -(ui.days - 1));
  const shown = done.filter((e) => dayOf(e.start) >= from);
  const more = done.length > shown.length;
  const recent = r ? [] : recentNotes(6).filter((e) => e.note !== target.note).slice(0, 5);
  return `${topbar('Таймер', `Сегодня ${hrs(sumDur(entriesIn(t, t)))} · за неделю ${hrs(sumDur(entriesIn(ws, addDays(ws, 6))))}`, `<span data-sync-slot="btn">${Sync.button()}</span>`)}
  <div class="content stack">
    <div class="card timer-card ${r ? 'running' : ''}">
      <div class="timer-row">
        <input type="text" id="t-note" class="desc" placeholder="Над чем работаете?" value="${esc(target.note)}" autocomplete="off" enterkeyhint="go" list="notes">${notesDatalist()}
        ${!r && (target.note || target.projectId) ? `<button class="icon-btn" data-act="clear-draft" title="Новая задача" aria-label="Очистить">${icon('x')}</button>` : ''}
        <div class="right">
          <span class="clock" data-live>${r ? clock(durOf(r)) : '0:00:00'}</span>
          ${r ? `<button class="runbtn stop" data-act="stop" aria-label="Остановить">${icon('square')}</button>`
            : `<button class="runbtn" data-act="start" aria-label="Запустить">${icon('play')}</button>`}
        </div>
      </div>
      <div class="toolbar">${projectChip(target)}${r ? `<span class="small muted">с ${hm(r.start)}</span>` : ''}</div>
      ${recent.length ? `<div class="recent"><span class="small muted">Недавние</span><div class="chips">${recent.map((e) => `<button class="chip" data-act="use-recent" data-id="${e.id}"><span class="pdot" style="--c:${colorOf(e)}"></span> ${esc(e.note)}</button>`).join('')}</div></div>` : ''}
    </div>
    <div class="card">
      ${shown.length ? groupedEntries(shown) : emptyState('timer', 'Записей пока нет. Запустите таймер или добавьте время вручную.', `<button class="btn" data-act="new-entry">${icon('plus')} Добавить вручную</button>`)}
      ${more ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-act="more-days">Показать ещё</button></div>` : ''}
    </div>
    <p class="small muted" style="text-align:center">Свайп записи вправо — продолжить, влево — удалить</p>
  </div>`;
}

function viewCalendar() {
  const ws = ui.week, days = [...Array(7)].map((_, i) => addDays(ws, i)), t = today();
  const from = dayStart(ws), to = dayStart(addDays(ws, 7));
  const list = db.entries.filter((e) => e.start < to && (e.end ?? Date.now()) > from);
  // Записи режем по дням, чтобы работа после полуночи попадала в обе колонки.
  const segs = days.map((d) => {
    const a = dayStart(d), b = dayStart(addDays(d, 1));
    return list.map((e) => ({ e, s: Math.max(e.start, a), f: Math.min(e.end ?? Date.now(), b), a }))
      .filter((x) => x.f > x.s);
  });
  let minH = 8, maxH = 19;
  for (const col of segs) for (const x of col) {
    minH = Math.min(minH, Math.floor((x.s - x.a) / HOUR));
    maxH = Math.max(maxH, Math.ceil((x.f - x.a) / HOUR));
  }
  const HH = 44, height = (maxH - minH) * HH;
  const hours = [...Array(maxH - minH + 1)].map((_, i) => `<span style="top:${i * HH}px">${minH + i}</span>`).join('');
  const nav = `<div class="month-nav"><button data-act="week" data-d="-1" aria-label="Предыдущая неделя">${icon('chevron-left')}</button>
    <span>${shortDate(ws)} — ${shortDate(addDays(ws, 6))}</span><button data-act="week" data-d="1" aria-label="Следующая неделя">${icon('chevron-right')}</button></div>
    ${ws !== weekStart(t) ? '<button class="btn" data-act="week-today">Сегодня</button>' : ''}`;
  const total = segs.flat().reduce((s, x) => s + (x.f - x.s), 0);
  return `${topbar('Календарь', `За неделю ${hrs(total)}`, nav)}
  <div class="content"><div class="card" style="padding:12px">
    <div class="week" style="--hh:${HH}px">
      <span></span>
      ${days.map((d, i) => `<div class="wh ${d === t ? 'today' : ''}">${parseISO(d).toLocaleDateString('ru-RU', { weekday: 'short' })}<b>${parseISO(d).getDate()}</b><span class="num">${hrs(segs[i].reduce((s, x) => s + (x.f - x.s), 0))}</span></div>`).join('')}
      <div class="hours" style="height:${height}px">${hours}</div>
      ${days.map((d, i) => `<div class="wcol" style="height:${height}px" data-act="cal-new" data-day="${d}" data-minh="${minH}">
        ${segs[i].map(({ e, s, f, a }) => `<button class="blk ${e.end === null ? 'live' : ''}" data-act="edit-entry" data-id="${e.id}"
          style="top:${((s - a) / HOUR - minH) * HH}px;height:${Math.max(((f - s) / HOUR) * HH - 2, 14)}px;--c:${colorOf(e)}"
          title="${esc(`${e.note || 'Без описания'} · ${projectTitle(projById(e.projectId))} · ${hm(s)}–${hm(f)}`)}"><b>${esc(e.note || projById(e.projectId)?.name || 'Без описания')}</b>${hm(s)}–${hm(f)}</button>`).join('')}
      </div>`).join('')}
    </div>
    <p class="small muted" style="margin:12px 4px 0">Нажмите на пустое место в колонке, чтобы добавить запись на это время.</p>
  </div></div>`;
}

function viewReports() {
  const r = ui.rep;
  const { range, list, total, billable, amount } = reportData();
  const projects = byProject(list);
  const days = Math.max(1, Math.round((dayStart(range.to < today() ? range.to : today()) - dayStart(range.from)) / 864e5) + 1);
  const opt = (v, cur, text) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(text)}</option>`;
  return `${topbar('Отчёты', esc(range.label), `<button class="btn" data-act="rep-csv">${icon('download')} CSV</button>
    <button class="btn primary" data-act="rep-pdf" data-kind="summary">${icon('file-text')} PDF</button>`)}
  <div class="content stack">
    <div class="card no-print">
      <div class="filters">
        <label class="f">Период<select id="rep-period">${Object.entries(PERIODS).map(([k, v]) => opt(k, r.period, v)).join('')}</select></label>
        ${r.period === 'custom' ? `<label class="f">С<input type="date" id="rep-from" value="${esc(range.from)}"></label><label class="f">По<input type="date" id="rep-to" value="${esc(range.to)}"></label>` : ''}
        <label class="f">Клиент<select id="rep-client">${opt('', r.client, 'Все клиенты')}${db.clients.map((c) => opt(c.id, r.client, c.name)).join('')}${opt('none', r.client, 'Без клиента')}</select></label>
        <label class="f">Проект<select id="rep-project">${opt('', r.project, 'Все проекты')}${db.projects.map((p) => opt(p.id, r.project, p.name)).join('')}${opt('none', r.project, 'Без проекта')}</select></label>
        <label class="f">Тег<select id="rep-label">${opt('', r.label, 'Любой')}${db.labels.map((l) => opt(l.id, r.label, `#${l.name}`)).join('')}</select></label>
        <label class="f">Оплата<select id="rep-bill">${opt('', r.bill, 'Всё время')}${opt('yes', r.bill, 'Оплачиваемое')}${opt('no', r.bill, 'Неоплачиваемое')}</select></label>
      </div>
    </div>
    <div class="card">
      <div class="muted small">${esc([range.label, reportFilterText()].filter(Boolean).join(' · '))}</div>
      <div class="big num">${hrs(total)}</div>
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><span class="muted small">Оплачиваемые</span><b class="num">${hrs(billable)}</b></div>
        <div class="kpi"><span class="muted small">Сумма</span><b class="num">${esc(fmt(amount))}</b></div>
        <div class="kpi"><span class="muted small">В среднем в день</span><b class="num">${hrs(total / days)}</b></div>
        <div class="kpi"><span class="muted small">Записей</span><b class="num">${list.length}</b></div>
      </div>
    </div>
    ${list.length ? `<div class="card"><h2>По дням</h2>${stackChart(reportBuckets(range, list))}</div>
    <div class="card"><h2>По проектам</h2><div class="donut-wrap">${donut(projects, hrs(total))}${legend(projects)}</div></div>
    <div class="card">
      <div class="section-title"><h2>Записи</h2><div class="toolbar"><button class="btn sm" data-act="rep-pdf" data-kind="detailed">${icon('file-text')} Подробный PDF</button></div></div>
      ${groupedEntries(list)}
    </div>` : `<div class="card">${emptyState('search', 'За этот период записей нет')}</div>`}
  </div>`;
}

function viewProjects() {
  const tab = ui.projTab;
  const seg = `<div class="seg" style="max-width:420px">
    ${[['projects', 'Проекты'], ['clients', 'Клиенты'], ['labels', 'Теги']].map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" data-act="proj-tab" data-t="${k}">${v}</button>`).join('')}</div>`;
  const add = { projects: ['new-project', 'Новый проект'], clients: ['new-client', 'Новый клиент'], labels: ['new-label', 'Новый тег'] }[tab];
  const mk = monthOf(today()), monthList = entriesIn(`${mk}-01`, monthEnd(mk));
  let body;
  if (tab === 'projects') {
    const row = (p) => `<li class="row" data-act="edit-project" data-id="${p.id}">
      <span class="cico sm" style="background:${p.color}">${icon('folder')}</span>
      <span class="mid"><div class="t">${esc(p.name)}</div><div class="s">${esc([clientById(p.clientId)?.name || 'Без клиента', p.billable ? `${fmt(p.rate || db.settings.rate || 0)}/ч` : ''].filter(Boolean).join(' · '))}</div></span>
      <span class="amt num">${hrs(sumDur(monthList.filter((e) => e.projectId === p.id)))}<div class="s">в этом месяце</div></span></li>`;
    const active = db.projects.filter((p) => !p.archived), arch = db.projects.filter((p) => p.archived);
    body = active.length ? `<ul class="list">${active.map(row).join('')}</ul>` : emptyState('folder', 'Проектов пока нет');
    if (arch.length) body += `<div class="day">Архив</div><ul class="list">${arch.map(row).join('')}</ul>`;
  } else if (tab === 'clients') {
    body = db.clients.length ? `<ul class="list">${db.clients.map((c) => {
      const ps = db.projects.filter((p) => p.clientId === c.id);
      return `<li class="row" data-act="edit-client" data-id="${c.id}">${badge('users', '#868e96', 'sm')}
        <span class="mid"><div class="t">${esc(c.name)}</div><div class="s">${ps.length} ${plural(ps.length, 'проект', 'проекта', 'проектов')}</div></span>
        <span class="amt num">${hrs(sumDur(monthList.filter((e) => ps.some((p) => p.id === e.projectId))))}<div class="s">в этом месяце</div></span></li>`;
    }).join('')}</ul>` : emptyState('users', 'Клиентов пока нет');
  } else {
    body = db.labels.length ? `<ul class="list">${db.labels.map((l) => `<li class="row" data-act="edit-label" data-id="${l.id}">${badge('tag', l.color, 'sm')}
      <span class="mid"><div class="t">#${esc(l.name)}</div></span><span class="amt num">${hrs(sumDur(monthList.filter((e) => e.labels.includes(l.id))))}<div class="s">в этом месяце</div></span></li>`).join('')}</ul>` : emptyState('tag', 'Тегов пока нет');
  }
  return `${topbar('Проекты', '', `<button class="btn primary" data-act="${add[0]}">${icon('plus')} ${add[1]}</button>`)}
  <div class="content stack">${seg}<div class="card">${body}</div></div>`;
}

function viewMore() {
  const t = db.settings.theme;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return `${topbar('Ещё')}
  <div class="content stack">
    <div class="card" data-sync-slot="card">${Sync.card()}</div>
    <div class="card">
      <h2>Настройки</h2>
      <label class="f">Имя в отчётах<input type="text" id="set-name" value="${esc(db.settings.name)}" placeholder="Иванов Иван"></label>
      <label class="f">Ставка по умолчанию, ₽/ч<input type="number" id="set-rate" min="0" step="50" value="${esc(db.settings.rate || '')}" placeholder="0"></label>
      <div class="f"><span class="lbl">Тема</span><div class="seg" style="margin-top:4px;max-width:360px">
        ${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, v]) => `<button class="${t === k ? 'on' : ''}" data-act="theme" data-t="${k}">${v}</button>`).join('')}</div></div>
      ${notif === 'default' ? `<button class="btn" data-act="ask-notify">${icon('bell')} Напоминать, если таймер идёт больше 4 часов</button>` : ''}
    </div>
    <div class="card">
      <h2>Данные</h2>
      <div class="toolbar">
        <button class="btn" data-act="export-csv">${icon('download')} Все записи в CSV</button>
        <button class="btn" data-act="export-json">${icon('download')} Резервная копия</button>
        <button class="btn" data-act="import-json">${icon('upload')} Восстановить</button>
      </div>
      <div class="toolbar">
        <button class="btn ghost" data-act="load-demo">Загрузить демо-данные</button>
        <button class="btn danger" data-act="wipe">${icon('trash-2')} Удалить всё</button>
      </div>
    </div>
    <p class="small muted">Хронометр хранит данные в браузере на этом устройстве и работает без интернета. Горячие клавиши: <b>S</b> — старт/стоп, <b>N</b> — добавить запись.</p>
  </div>`;
}

const VIEWS = { timer: viewTimer, calendar: viewCalendar, reports: viewReports, projects: viewProjects, more: viewMore };

/*
 * На телефоне разделы лежат рядом в ленте Swiper и листаются свайпом за пальцем;
 * у каждого раздела своя вертикальная прокрутка. На ПК — один раздел в <main>, как обычно.
 * Строки журнала исключены из листания: у них свой свайп «продолжить / удалить».
 */
const PAGES = ['timer', 'calendar', 'reports', 'projects', 'more'];
const phone = matchMedia('(max-width: 760px)');
const stale = new Set();
let pager = null;
const pageEl = (v) => $(`.page[data-page="${v}"]`);
const markNav = () => document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));

/** Перерисовывает раздел, если данные менялись с прошлой отрисовки (нужно соседям перед свайпом). */
function renderPage(v) {
  if (!v || !stale.has(v)) return;
  pageEl(v).innerHTML = VIEWS[v]();
  stale.delete(v);
}

function render() {
  markNav();
  const focus = document.activeElement?.id === 't-note' ? $('#t-note').selectionStart : null;
  if (!pager) {
    const y = window.scrollY;
    $('#main').innerHTML = VIEWS[ui.view]();
    window.scrollTo(0, y);
  } else {
    const page = pageEl(ui.view);
    const y = page.scrollTop;
    page.innerHTML = VIEWS[ui.view]();
    page.scrollTop = y;
    for (const v of PAGES) if (v !== ui.view) stale.add(v);
    stale.delete(ui.view);
    const i = PAGES.indexOf(ui.view);
    if (pager.activeIndex !== i) pager.slideTo(i, 0, false);
  }
  if (focus !== null && $('#t-note')) { const n = $('#t-note'); n.focus(); n.setSelectionRange(focus, focus); }
}

function go(view) {
  ui.view = view;
  if (pager) pageEl(view).scrollTop = 0;
  else window.scrollTo(0, 0);
  render();
}

function setupPager() {
  const main = $('#main');
  if (phone.matches && !pager && window.Swiper) {
    main.classList.add('paged');
    main.innerHTML = `<div class="swiper pager"><div class="swiper-wrapper">${PAGES.map((v) =>
      `<section class="swiper-slide page" data-page="${v}"></section>`).join('')}</div></div>`;
    PAGES.forEach((v) => stale.add(v));
    pager = new Swiper(main.firstElementChild, {
      initialSlide: Math.max(PAGES.indexOf(ui.view), 0),
      speed: 320,
      threshold: 6,
      touchAngle: 35,
      resistanceRatio: 0.55,
      longSwipesRatio: 0.3,
      noSwipingSelector: 'input, select, textarea, .seg, .chips, .swipe-row',
      on: {
        sliderFirstMove(sw) { renderPage(PAGES[sw.activeIndex - 1]); renderPage(PAGES[sw.activeIndex + 1]); },
        slideChange(sw) { ui.view = PAGES[sw.activeIndex]; renderPage(ui.view); markNav(); },
      },
    });
  } else if (!phone.matches && pager) {
    pager.destroy(true, true);
    pager = null;
    main.classList.remove('paged');
  }
  render();
}
phone.addEventListener('change', setupPager);

function applyTheme() {
  const t = db.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/* ============================== Свайп записей ============================== */

let sw = null, swallowClick = false;

document.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.swipe-row > .row');
  if (!row || e.button > 0) return;
  sw = { row, li: row.parentElement, x: e.clientX, y: e.clientY, dx: 0, on: false, pid: e.pointerId };
});

document.addEventListener('pointermove', (e) => {
  if (!sw || e.pointerId !== sw.pid) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
    if (Math.abs(dx) < 10) return;
    sw.on = true;
    sw.li.classList.add('dragging');
    try { sw.row.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  sw.dx = dx;
  sw.row.style.transform = `translateX(${dx}px)`;
  sw.li.classList.toggle('go-right', dx > 0);
  sw.li.classList.toggle('go-left', dx < 0);
});

function endSwipe(e) {
  if (!sw || e.pointerId !== sw.pid) return;
  const { li, row, dx, on } = sw;
  sw = null;
  if (!on) return;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 60);
  li.classList.remove('dragging');
  const limit = Math.min(110, li.offsetWidth * 0.3);
  const ent = entryById(li.dataset.id);
  if (ent && dx > limit) { row.style.transform = ''; li.classList.remove('go-right'); continueEntry(ent); }
  else if (ent && dx < -limit) { row.style.transform = 'translateX(-100%)'; setTimeout(() => deleteEntry(ent), 180); }
  else { row.style.transform = ''; setTimeout(() => li.classList.remove('go-right', 'go-left'), 220); }
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);
document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);

/* ============================== Модальные окна ============================== */

const modal = $('#modal');

function openModal(title, body, { onSubmit, onDelete, submitText = 'Сохранить', onOpen, cls = '' } = {}) {
  modal.className = `modal ${cls}`;
  modal.innerHTML = `<form novalidate>
    <div class="mh"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    ${body}
    <div class="actions">${onDelete ? `<button type="button" class="btn danger" data-del>${icon('trash-2')} Удалить</button>` : ''}
      <span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button>
      <button type="submit" class="btn primary">${esc(submitText)}</button></div></form>`;
  const form = $('form', modal);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (onSubmit(new FormData(form), form) === false) return;
    modal.close(); save(); render();
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) modal.close();
    if (e.target.closest('[data-del]') && onDelete() !== false) { modal.close(); save(); render(); }
  });
  modal.showModal();
  onOpen?.(form);
}

function fail(form, msg, field) {
  toast(msg);
  if (field) form.elements[field]?.focus();
  return false;
}

function projectOptions(selected) {
  const opt = (p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`;
  const active = db.projects.filter((p) => !p.archived || p.id === selected);
  const groups = [...db.clients.map((c) => [c.name, active.filter((p) => p.clientId === c.id)]), ['Без клиента', active.filter((p) => !clientById(p.clientId))]]
    .filter(([, ps]) => ps.length);
  return `<option value="">Без проекта</option>${groups.map(([name, ps]) => `<optgroup label="${esc(name)}">${ps.map(opt).join('')}</optgroup>`).join('')}`;
}

/** Выбор тегов чипами; выбранные id хранятся в скрытом поле через запятую. */
function labelPicker(selected) {
  return `<input type="hidden" name="labels" value="${esc(selected.join(','))}"><div class="chips">${db.labels.map((l) =>
    `<button type="button" class="chip ${selected.includes(l.id) ? 'on' : ''}" data-lbl="${l.id}">#${esc(l.name)}</button>`).join('')
    || '<span class="small muted">Тегов пока нет — их можно создать в разделе «Проекты».</span>'}</div>`;
}

function bindLabels(form) {
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lbl]');
    if (!b) return;
    const set = new Set(form.elements.labels.value.split(',').filter(Boolean));
    if (set.has(b.dataset.lbl)) set.delete(b.dataset.lbl); else set.add(b.dataset.lbl);
    form.elements.labels.value = [...set].join(',');
    b.classList.toggle('on');
  });
}

function colorPicker(name, value) {
  return `<input type="hidden" name="${name}" value="${value}"><div class="swatches">${COLORS.map((c) =>
    `<button type="button" class="swatch ${c === value ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')}</div>`;
}

function bindColor(form, field = 'color') {
  form.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    if (!c) return;
    form.elements[field].value = c.dataset.color;
    form.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === c));
  });
}

/** Ручная запись или правка существующей. `preset` — { day, time } для новой записи из календаря. */
function entryModal(entry = null, preset = {}) {
  const live = entry && entry.end === null;
  const last = lastFinished();
  const day = entry ? dayOf(entry.start) : preset.day || today();
  // Новая запись без пресета продолжает день: с конца последней записи до текущего момента.
  const fromLast = !entry && !preset.time && last && dayOf(last.end) === today() && Date.now() - last.end > 6e4 && Date.now() - last.end < 12 * HOUR;
  const startT = entry ? hm(entry.start) : preset.time || (fromLast ? hm(last.end) : hm(Date.now() - HOUR));
  const endT = entry && !live ? hm(entry.end) : preset.time ? hm(atTime(day, preset.time) + HOUR) : hm(Date.now());
  const e = entry || (last ? fieldsOf(last) : { note: '', projectId: '', labels: [], billable: false });
  openModal(entry ? 'Запись' : 'Новая запись', `
    <label class="f">Описание<input type="text" name="note" value="${esc(e.note)}" placeholder="Над чем работали?" autocomplete="off" list="notes">${notesDatalist()}</label>
    <label class="f">Проект<select name="projectId">${projectOptions(e.projectId)}</select></label>
    <div class="f"><span class="lbl">Теги</span>${labelPicker(e.labels)}</div>
    <div class="two">
      <label class="f">Дата<input type="date" name="day" value="${day}" required></label>
      <label class="f">Длительность<input type="text" name="dur" value="${live ? '' : hrs(atTime(day, endT) - atTime(day, startT) + (endT <= startT ? 864e5 : 0))}" placeholder="${live ? 'идёт' : '1:30'}" ${live ? 'disabled' : ''} inputmode="text"></label>
    </div>
    <div class="two">
      <label class="f">Начало<input type="time" name="start" value="${startT}" required></label>
      <label class="f">Конец<input type="time" name="end" value="${live ? '' : endT}" ${live ? 'disabled' : ''}></label>
    </div>
    <label class="switch"><input type="checkbox" name="billable" ${e.billable ? 'checked' : ''}> Оплачиваемое время</label>`, {
    submitText: entry ? 'Сохранить' : 'Добавить',
    onOpen(form) {
      bindLabels(form);
      const el = form.elements;
      const sync = () => {
        if (live || !el.start.value || !el.end.value) return;
        let d = atTime(el.day.value || day, el.end.value) - atTime(el.day.value || day, el.start.value);
        if (d <= 0) d += 864e5;
        el.dur.value = hrs(d);
      };
      el.start.addEventListener('change', sync);
      el.end.addEventListener('change', sync);
      el.dur.addEventListener('change', () => {
        const d = parseDuration(el.dur.value);
        if (!Number.isFinite(d) || d <= 0) return;
        el.end.value = hm(atTime(el.day.value || day, el.start.value || '09:00') + d);
        el.dur.value = hrs(d);
      });
      el.projectId.addEventListener('change', () => { if (!entry) el.billable.checked = Boolean(projById(el.projectId.value)?.billable); });
      // Выбрали прежнее описание — подтягиваем его проект, теги и оплату.
      el.note.addEventListener('input', () => {
        const prev = findByNote(el.note.value);
        if (!prev || prev === entry) return;
        el.projectId.value = prev.projectId;
        el.labels.value = prev.labels.join(',');
        form.querySelectorAll('[data-lbl]').forEach((b) => b.classList.toggle('on', prev.labels.includes(b.dataset.lbl)));
        el.billable.checked = prev.billable;
      });
      if (!entry) { el.note.focus(); el.note.select(); }
    },
    onSubmit(fd, form) {
      const d = fd.get('day');
      if (!d || !fd.get('start')) return fail(form, 'Укажите дату и время начала', 'start');
      const start = atTime(d, fd.get('start'));
      let end = null;
      if (!live) {
        if (!fd.get('end')) return fail(form, 'Укажите время окончания', 'end');
        end = atTime(d, fd.get('end'));
        if (end <= start) end += 864e5; // работа через полночь
      } else if (start > Date.now()) return fail(form, 'Таймер не может начаться в будущем', 'start');
      const rec = { note: String(fd.get('note') || '').trim(), projectId: fd.get('projectId') || '', labels: String(fd.get('labels') || '').split(',').filter(Boolean), billable: fd.get('billable') === 'on', start, end };
      if (entry) Object.assign(entry, rec);
      else { db.entries.push({ id: uid(), ...rec }); toast(`Добавлено ${hrs(end - start)}`); }
    },
    onDelete: entry ? () => { modal.close(); deleteEntry(entry); return false; } : null,
  });
}

/** Проект, теги и оплачиваемость для идущего таймера или следующего запуска. */
function detailsModal() {
  const target = running() || ui.draft;
  const proj = (p, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-proj="${p ? p.id : ''}" data-bill="${p?.billable ? 1 : 0}">
    <span class="pdot" style="--c:${p?.color || NO_COLOR}"></span> ${esc(p ? projectTitle(p) : 'Без проекта')}</button>`;
  openModal('Проект и теги', `
    <input type="hidden" name="projectId" value="${esc(target.projectId)}">
    <div class="f"><span class="lbl">Проект</span><div class="chips">${proj(null, !target.projectId)}${db.projects.filter((p) => !p.archived).map((p) => proj(p, p.id === target.projectId)).join('')}</div></div>
    <div class="f"><span class="lbl">Теги</span>${labelPicker(target.labels)}</div>
    <label class="switch"><input type="checkbox" name="billable" ${target.billable ? 'checked' : ''}> Оплачиваемое время</label>`, {
    submitText: 'Готово',
    onOpen(form) {
      bindLabels(form);
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-proj]');
        if (!b) return;
        form.elements.projectId.value = b.dataset.proj;
        form.elements.billable.checked = b.dataset.bill === '1';
        form.querySelectorAll('[data-proj]').forEach((x) => x.classList.toggle('on', x === b));
      });
    },
    onSubmit(fd) {
      target.projectId = fd.get('projectId') || '';
      target.labels = String(fd.get('labels') || '').split(',').filter(Boolean);
      target.billable = fd.get('billable') === 'on';
    },
  });
}

function projectModal(p = null) {
  const v = p || { name: '', color: COLORS[(db.projects.length * 3 + 3) % COLORS.length], clientId: '', billable: false, rate: '', archived: false };
  openModal(p ? 'Проект' : 'Новый проект', `
    <label class="f">Название<input type="text" name="name" value="${esc(v.name)}" required autocomplete="off"></label>
    <label class="f">Клиент<select name="clientId"><option value="">Без клиента</option>${db.clients.map((c) => `<option value="${c.id}" ${c.id === v.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="f"><span class="lbl">Цвет</span>${colorPicker('color', v.color)}</div>
    <label class="switch"><input type="checkbox" name="billable" ${v.billable ? 'checked' : ''}> Оплачиваемый проект</label>
    <label class="f">Ставка, ₽/ч<input type="number" name="rate" min="0" step="50" value="${esc(v.rate || '')}" placeholder="${db.settings.rate ? `по умолчанию ${db.settings.rate}` : '0'}"></label>
    ${p ? `<label class="switch"><input type="checkbox" name="archived" ${v.archived ? 'checked' : ''}> В архиве — не предлагать в таймере</label>` : ''}`, {
    onOpen(form) { bindColor(form); if (!p) form.elements.name.focus(); },
    onSubmit(fd, form) {
      const name = String(fd.get('name') || '').trim();
      if (!name) return fail(form, 'Введите название проекта', 'name');
      const rate = parseAmount(fd.get('rate'));
      const rec = { name, clientId: fd.get('clientId') || '', color: fd.get('color'), billable: fd.get('billable') === 'on', rate: Number.isFinite(rate) ? rate : 0, archived: fd.get('archived') === 'on' };
      if (p) Object.assign(p, rec);
      else { db.projects.push({ id: uid(), ...rec }); toast(`Проект «${name}» создан`); }
    },
    onDelete: p ? () => {
      const n = db.entries.filter((e) => e.projectId === p.id).length;
      if (n && !confirm(`У проекта ${n} ${plural(n, 'запись', 'записи', 'записей')}. Они останутся без проекта. Удалить?`)) return false;
      for (const e of db.entries) if (e.projectId === p.id) e.projectId = '';
      db.projects = db.projects.filter((x) => x !== p);
    } : null,
  });
}

function clientModal(c = null) {
  openModal(c ? 'Клиент' : 'Новый клиент', `<label class="f">Название<input type="text" name="name" value="${esc(c?.name || '')}" required autocomplete="off"></label>`, {
    onOpen(form) { form.elements.name.focus(); },
    onSubmit(fd, form) {
      const name = String(fd.get('name') || '').trim();
      if (!name) return fail(form, 'Введите название клиента', 'name');
      if (c) c.name = name; else db.clients.push({ id: uid(), name });
    },
    onDelete: c ? () => {
      for (const p of db.projects) if (p.clientId === c.id) p.clientId = '';
      db.clients = db.clients.filter((x) => x !== c);
    } : null,
  });
}

function labelModal(l = null) {
  openModal(l ? 'Тег' : 'Новый тег', `
    <label class="f">Название<input type="text" name="name" value="${esc(l?.name || '')}" required autocomplete="off"></label>
    <div class="f"><span class="lbl">Цвет</span>${colorPicker('color', l?.color || COLORS[(db.labels.length * 5 + 1) % COLORS.length])}</div>`, {
    onOpen(form) { bindColor(form); form.elements.name.focus(); },
    onSubmit(fd, form) {
      const name = String(fd.get('name') || '').trim().replace(/^#/, '');
      if (!name) return fail(form, 'Введите название тега', 'name');
      if (l) Object.assign(l, { name, color: fd.get('color') }); else db.labels.push({ id: uid(), name, color: fd.get('color') });
    },
    onDelete: l ? () => {
      for (const e of db.entries) e.labels = e.labels.filter((id) => id !== l.id);
      db.labels = db.labels.filter((x) => x !== l);
    } : null,
  });
}

/* ============================== Экспорт ============================== */

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function entriesCsv(list) {
  const head = ['Дата', 'Начало', 'Конец', 'Часы', 'Описание', 'Проект', 'Клиент', 'Теги', 'Оплачиваемое', 'Сумма'];
  const rows = [...list].sort((a, b) => a.start - b.start).map((e) => {
    const p = projById(e.projectId);
    return [dayOf(e.start), hm(e.start), e.end ? hm(e.end) : '', hoursDec(durOf(e)), e.note, p?.name || '', clientById(p?.clientId)?.name || '',
      e.labels.map((id) => labelById(id)?.name).filter(Boolean).join(', '), e.billable ? 'да' : 'нет', String(amountOf(e)).replace('.', ',')];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

let pdfLib = null;
function loadPdf() {
  const add = (src) => new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: () => reject(new Error('Не удалось загрузить модуль PDF — проверьте интернет')) });
    document.head.append(s);
  });
  pdfLib ||= add('vendor/pdfmake.min.js').then(() => add('vendor/vfs_fonts.js')).catch((e) => { pdfLib = null; throw e; });
  return pdfLib;
}

/* ---------- PDF-отчёт ---------- */

const PDF = { ink: '#1c1c1a', muted: '#6e6e69', line: '#e4e4df', bar: '#2f3b52', accent: '#fbbf24' };
const PDF_SLICES = ['#7950f2', '#f03e3e', '#e64980', '#4c6ef5', '#15aabf', '#40c057', '#fab005', '#fd7e14', '#a9672f', '#868e96'];
const ddmmyyyy = (s) => parseISO(s).toLocaleDateString('ru-RU');

/** Столбцы часов по дням (или неделям / месяцам для длинных периодов) — SVG для pdfmake. */
function pdfBarChart(range, list) {
  const days = Math.round((dayStart(range.to) - dayStart(range.from)) / 864e5) + 1;
  const keyOf = days <= 62 ? (d) => d : days <= 190 ? weekStart : monthOf;
  const label = days <= 62 ? (k) => parseISO(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
    : days <= 190 ? (k) => `с ${parseISO(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : (k) => monthLabel(k);
  const keys = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) { const k = keyOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const e of list) { const k = keyOf(dayOf(e.start)); if (sums.has(k)) sums.set(k, sums.get(k) + durOf(e)); }
  const W = 515, H = 250, L = 40, B = 62, T = 8;
  const max = niceMax(Math.max(...sums.values(), 0) / HOUR);
  const gw = (W - L) / keys.length, bw = Math.max(2, gw * 0.78);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const fs = keys.length > 40 ? 6 : 7.5;
  let s = '';
  for (let i = 0; i <= 5; i++) {
    const v = (max / 5) * i;
    s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${PDF.line}" stroke-width="0.6"/>`;
    s += `<text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="7.5" fill="${PDF.muted}">${round2(v)} ч</text>`;
  }
  keys.forEach((k, i) => {
    const x = L + gw * i + (gw - bw) / 2, v = sums.get(k) / HOUR;
    if (v > 0) s += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" fill="${PDF.bar}"/>`;
    const cx = L + gw * i + gw / 2;
    s += `<text x="${cx}" y="${H - B + 12}" text-anchor="end" font-size="${fs}" fill="${PDF.muted}" transform="rotate(-45 ${cx} ${H - B + 12})">${esc(label(k))}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

/** Кольцевая диаграмма с итогом в центре. items: [{ value, color }]. */
function pdfDonut(items, center) {
  const S = 150, c = S / 2, R = 70, r = 44;
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const pt = (rad, a) => `${(c + rad * Math.sin(a)).toFixed(2)} ${(c - rad * Math.cos(a)).toFixed(2)}`;
  let a0 = 0, s = '';
  for (const it of items) {
    // Полный круг SVG-дугой не нарисовать — делим сектор на половины.
    const sweep = (it.value / total) * 2 * Math.PI, parts = sweep > Math.PI ? 2 : 1;
    for (let p = 0; p < parts; p++) {
      const a = a0 + (sweep / parts) * p, b = a + sweep / parts, large = b - a > Math.PI ? 1 : 0;
      s += `<path d="M ${pt(R, a)} A ${R} ${R} 0 ${large} 1 ${pt(R, b)} L ${pt(r, b)} A ${r} ${r} 0 ${large} 0 ${pt(r, a)} Z" fill="${it.color}"/>`;
    }
    a0 += sweep;
  }
  s += `<text x="${c}" y="${c + 5}" text-anchor="middle" font-size="13" fill="${PDF.ink}">${esc(center)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`;
}

/** Раздел «кольцо + таблица»: rows — [{ label, value, amount, color }]. */
function pdfBreakdown(title, rows, total, withAmount) {
  const pct = (v) => `${((v / (total || 1)) * 100).toFixed(2).replace('.', ',')}%`;
  const dot = (color) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3.5" fill="${color}"/></svg>`, width: 8, margin: [0, 2, 0, 0] });
  // Одним неразрывным блоком, чтобы заголовок не оставался внизу страницы без диаграммы.
  return [{ unbreakable: true, stack: [
    { text: title, style: 'h2' },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: PDF.line }], margin: [0, 0, 0, 10] },
    {
      columns: [
        { svg: pdfDonut(rows, clock(total)), width: 150 },
        {
          width: '*', margin: [16, 4, 0, 0],
          table: {
            widths: [10, '*', 54, ...(withAmount ? [62] : []), 42],
            body: rows.map((x) => [dot(x.color), x.label, { text: clock(x.value), alignment: 'right' },
              ...(withAmount ? [{ text: x.amount ? fmt(x.amount) : '—', alignment: 'right' }] : []), { text: pct(x.value), alignment: 'right', color: PDF.muted }]),
          },
          layout: { hLineWidth: (i) => (i === 0 ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => PDF.line, paddingTop: () => 5, paddingBottom: () => 5 },
        },
      ],
      margin: [0, 0, 0, 22],
    },
  ] }];
}

async function exportPdf(kind) {
  toast('Готовлю PDF…');
  try { await loadPdf(); } catch (e) { toast(e.message); return; }
  const { range, list, total, billable, amount } = reportData();
  const withAmount = amount > 0;
  const paint = (rows) => rows.map((x, i) => ({ ...x, color: x.color && x.color !== NO_COLOR ? x.color : PDF_SLICES[i % PDF_SLICES.length] }));

  const projects = paint(byProject(list));
  const weeks = new Map();
  for (const e of list) {
    const w = weekStart(dayOf(e.start));
    const a = w < range.from ? range.from : w, b = addDays(w, 6) > range.to ? range.to : addDays(w, 6);
    const it = weeks.get(w) || { label: `${ddmmyyyy(a)} – ${ddmmyyyy(b)}`, value: 0, amount: 0, start: w };
    it.value += durOf(e); it.amount += amountOf(e);
    weeks.set(w, it);
  }
  const weekRows = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start)).map((x, i) => ({ ...x, color: PDF_SLICES[i % PDF_SLICES.length] }));
  const notes = new Map();
  for (const e of list) {
    const k = `${e.note.trim() || 'Без описания'}\u0000${e.projectId}`;
    const it = notes.get(k) || { note: e.note.trim() || 'Без описания', project: projectTitle(projById(e.projectId)), value: 0, amount: 0 };
    it.value += durOf(e); it.amount += amountOf(e);
    notes.set(k, it);
  }
  const noteRows = [...notes.values()].sort((a, b) => b.value - a.value);

  const th = (t, right) => ({ text: t, style: 'th', alignment: right ? 'right' : 'left' });
  const num = (t, bold = false) => ({ text: t, alignment: 'right', bold });
  const tableLayout = { hLineWidth: (i, node) => (i === 1 || i === node.table.body.length ? 0.8 : 0.4), vLineWidth: () => 0, hLineColor: () => PDF.line, paddingTop: () => 5, paddingBottom: () => 5 };
  const logo = (await (await fetch('icon.svg')).text()).trim();

  const content = [
    {
      columns: [
        [
          { text: kind === 'detailed' ? 'Подробный отчёт' : 'Сводный отчёт', fontSize: 22 },
          { text: `${ddmmyyyy(range.from)} – ${ddmmyyyy(range.to)}`, color: PDF.muted, margin: [0, 6, 0, 0] },
          { text: [{ text: 'Итого: ', color: PDF.muted }, { text: clock(total), fontSize: 16 }], margin: [0, 6, 0, 0] },
          ...(billable && billable !== total ? [{ text: [{ text: 'Оплачиваемое: ', color: PDF.muted }, `${clock(billable)}${withAmount ? ` · ${fmt(amount)}` : ''}`], margin: [0, 3, 0, 0] }]
            : withAmount ? [{ text: [{ text: 'Сумма: ', color: PDF.muted }, fmt(amount)], margin: [0, 3, 0, 0] }] : []),
        ],
        {
          width: 'auto',
          columns: [{ svg: logo, width: 36 }, { text: 'Хронометр', fontSize: 18, bold: true, margin: [8, 8, 0, 0], width: 'auto' }],
        },
      ],
    },
    { text: [db.settings.name, reportFilterText()].filter(Boolean).join(' · '), color: PDF.muted, margin: [0, 4, 0, 0] },
    list.length ? { svg: pdfBarChart(range, list), width: 515, margin: [0, 18, 0, 22] } : { text: 'За этот период записей нет.', margin: [0, 24, 0, 0] },
  ];
  if (list.length) {
    content.push(...pdfBreakdown('Проекты', projects, total, withAmount));
    if (weekRows.length > 1) content.push(...pdfBreakdown('Недели', weekRows, total, withAmount));
    content.push(
      { text: 'Описание', style: 'h2' },
      {
        table: {
          headerRows: 1, widths: ['*', 130, 58, ...(withAmount ? [64] : [])],
          body: [[th('Описание'), th('Проект'), th('Время', true), ...(withAmount ? [th('Сумма', true)] : [])],
            ...noteRows.map((x) => [x.note, { text: x.project, color: PDF.muted }, num(clock(x.value)), ...(withAmount ? [num(x.amount ? fmt(x.amount) : '—')] : [])]),
            [{ text: 'Итого', bold: true }, '', num(clock(total), true), ...(withAmount ? [num(fmt(amount), true)] : [])]],
        },
        layout: tableLayout, margin: [0, 0, 0, 22],
      },
    );
    if (kind === 'detailed') {
      content.push({ text: 'Записи', style: 'h2', pageBreak: 'before' }, {
        table: {
          headerRows: 1, widths: [50, '*', 92, 56, 48, ...(withAmount ? [58] : [])],
          body: [[th('Дата'), th('Описание'), th('Проект'), th('Время'), th('Длит.', true), ...(withAmount ? [th('Сумма', true)] : [])],
            ...[...list].reverse().map((e) => [ddmmyyyy(dayOf(e.start)), e.note || '—', { text: projById(e.projectId)?.name || '—', color: PDF.muted },
              `${hm(e.start)}–${e.end ? hm(e.end) : '…'}`, num(clock(durOf(e))), ...(withAmount ? [num(e.billable ? fmt(amountOf(e)) : '—')] : [])]),
            [{ text: 'Итого', bold: true, colSpan: 4 }, '', '', '', num(clock(total), true), ...(withAmount ? [num(fmt(amount), true)] : [])]],
        },
        layout: tableLayout,
      });
    }
  }
  const doc = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 48], content,
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: PDF.ink },
    styles: { h2: { fontSize: 13, margin: [0, 0, 0, 6] }, th: { bold: true, fontSize: 8.5, color: PDF.muted } },
    footer: (cur, all) => ({ text: `Хронометр · сформирован ${new Date().toLocaleDateString('ru-RU')} · стр. ${cur} из ${all}`, alignment: 'center', fontSize: 7.5, color: '#8f8f8a', margin: [0, 18, 0, 0] }),
    info: { title: `${kind === 'detailed' ? 'Подробный' : 'Сводный'} отчёт ${range.label}` },
  };
  const blob = await new Promise((resolve) => pdfMake.createPdf(doc).getBlob(resolve));
  const name = `otchet-${range.from}_${range.to}${kind === 'detailed' ? '-podrobno' : ''}.pdf`;
  const file = new File([blob], name, { type: 'application/pdf' });
  if (phone.matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Отчёт о работе' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(name, blob, 'application/pdf');
  toast('PDF сохранён');
}

async function importJson() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.entries) || !Array.isArray(data.projects)) throw new Error('format');
    if (!confirm('Заменить текущие данные данными из резервной копии?')) return;
    db = normalize(data);
    save(); applyTheme(); render();
    toast('Данные восстановлены');
  } catch {
    toast('Файл не похож на резервную копию Хронометра');
  }
}

/* ============================== Уведомления ============================== */

async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icon.svg', badge: 'icon.svg' });
    else new Notification(title, { body, tag, icon: 'icon.svg' });
  } catch { /* уведомления недоступны */ }
}

/** Раз в секунду обновляет бегущий таймер без перерисовки раздела, раз в минуту проверяет долгий таймер. */
function tick() {
  const r = running();
  const text = r ? clock(durOf(r)) : '0:00:00';
  document.querySelectorAll('[data-live]').forEach((el) => { el.textContent = text; });
  document.title = r ? `${text} · ${r.note || 'Хронометр'}` : 'Хронометр — учёт рабочего времени';
  if (r && durOf(r) > LONG_RUN && !ui.warned.has(r.id)) {
    ui.warned.add(r.id);
    notify('Таймер идёт уже больше 4 часов', r.note || projectTitle(projById(r.projectId)), r.id);
  }
}

/* ============================== События ============================== */

document.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav-item');
  if (nav) { go(nav.dataset.view); return; }
  const el = e.target.closest('[data-act]');
  if (!el || modal.contains(el)) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'start': startTimer({ ...ui.draft, note: $('#t-note')?.value.trim() || ui.draft.note }); break;
    case 'stop': stopTimer(); break;
    case 'continue': { const ent = entryById(id); if (ent) continueEntry(ent); break; }
    case 'edit-entry': { const ent = entryById(id); if (ent) entryModal(ent); break; }
    case 'new-entry': entryModal(); break;
    case 'pick-details': detailsModal(); break;
    case 'use-recent': { const ent = entryById(id); if (ent) { ui.draft = fieldsOf(ent); render(); } break; }
    case 'clear-draft': ui.draft = { note: '', projectId: '', labels: [], billable: false }; render(); $('#t-note')?.focus(); break;
    case 'bill-toggle': { const t = running() || ui.draft; t.billable = !t.billable; if (running()) save(); render(); break; }
    case 'more-days': ui.days += 30; render(); break;
    case 'week': ui.week = addDays(ui.week, 7 * Number(el.dataset.d)); render(); break;
    case 'week-today': ui.week = weekStart(today()); render(); break;
    case 'cal-new': {
      const rect = el.getBoundingClientRect();
      const h = Number(el.dataset.minh) + Math.max(0, e.clientY - rect.top) / 44;
      const q = Math.floor(h * 4) / 4;
      entryModal(null, { day: el.dataset.day, time: `${pad(Math.min(Math.floor(q), 23))}:${pad((q % 1) * 60)}` });
      break;
    }
    case 'proj-tab': ui.projTab = el.dataset.t; render(); break;
    case 'new-project': projectModal(); break;
    case 'edit-project': projectModal(projById(id)); break;
    case 'new-client': clientModal(); break;
    case 'edit-client': clientModal(clientById(id)); break;
    case 'new-label': labelModal(); break;
    case 'edit-label': labelModal(labelById(id)); break;
    case 'rep-csv': { const { range, list } = reportData(); download(`otchet-${range.from}_${range.to}.csv`, entriesCsv(list), 'text/csv;charset=utf-8'); break; }
    case 'rep-pdf': exportPdf(el.dataset.kind); break;
    case 'theme': db.settings.theme = el.dataset.t; save(); applyTheme(); render(); break;
    case 'ask-notify':
      Notification.requestPermission().then((p) => { toast(p === 'granted' ? 'Уведомления включены' : 'Уведомления не разрешены'); render(); });
      break;
    case 'go-sync': go('more'); break;
    case 'sync': Sync.syncNow(true); break;
    case 'sync-disconnect':
      if (confirm('Отключить синхронизацию на этом устройстве? Данные здесь и в облаке сохранятся.')) Sync.disconnect();
      break;
    case 'sync-delete-cloud':
      if (confirm('Удалить копию данных из Google Диска? На этом устройстве данные останутся, другие устройства перестанут получать обновления.')) Sync.deleteCloudCopy();
      break;
    case 'export-csv': download(`hronometr-${today()}.csv`, entriesCsv(db.entries), 'text/csv;charset=utf-8'); break;
    case 'export-json': download(`hronometr-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json'); break;
    case 'import-json': importJson(); break;
    case 'load-demo':
      if (confirm(Sync.connected ? 'Заменить данные демонстрационными? Синхронизация включена — данные заменятся и на других устройствах.' : 'Заменить текущие данные демонстрационными?')) { db = demoDb(); save(); applyTheme(); render(); toast('Демо-данные загружены'); }
      break;
    case 'wipe':
      if (confirm(Sync.connected ? 'Удалить все данные? Синхронизация включена — данные удалятся и на других устройствах. Это нельзя отменить.' : 'Удалить все проекты, клиентов и записи? Это нельзя отменить.')) {
        db = { ...emptyDb(), settings: db.settings }; save(); render(); toast('Все данные удалены');
      }
      break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 't-note') return;
  const r = running(), target = r || ui.draft;
  target.note = e.target.value;
  // Выбрали прежнее описание из подсказок — подставляем его проект, теги и оплату (если проект ещё не выбран).
  const prev = !target.projectId && findByNote(e.target.value);
  if (prev && prev !== r) Object.assign(target, { projectId: prev.projectId, labels: [...prev.labels], billable: prev.billable });
  if (r) { clearTimeout(ui.nt); ui.nt = setTimeout(save, 800); }
  if (prev) { if (r) save(); render(); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (modal.contains(t)) return;
  const rep = ui.rep;
  switch (t.id) {
    case 'rep-client': rep.client = t.value; break;
    case 'rep-project': rep.project = t.value; break;
    case 'rep-label': rep.label = t.value; break;
    case 'rep-bill': rep.bill = t.value; break;
    case 'rep-period': {
      if (t.value === 'custom') { const r = periodRange(rep); Object.assign(rep, { from: r.from, to: r.to }); }
      rep.period = t.value;
      break;
    }
    case 'rep-from': rep.from = t.value; if (rep.to && rep.to < rep.from) rep.to = rep.from; break;
    case 'rep-to': rep.to = t.value; if (rep.from && rep.from > rep.to) rep.from = rep.to; break;
    case 'set-name': db.settings.name = t.value.trim(); save(); return;
    case 'set-rate': db.settings.rate = Math.max(0, parseAmount(t.value) || 0); save(); return;
    default: return;
  }
  render();
});

$('#fab').addEventListener('click', () => entryModal());
$('#nav-add').addEventListener('click', () => entryModal());

document.addEventListener('keydown', (e) => {
  if (e.target.id === 't-note' && e.key === 'Enter') {
    e.preventDefault();
    if (running()) { clearTimeout(ui.nt); save(); e.target.blur(); }
    else startTimer({ ...ui.draft, note: e.target.value.trim() });
    return;
  }
  if (modal.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (['n', 'т', '+'].includes(e.key)) { e.preventDefault(); entryModal(); }
  if (['s', 'ы'].includes(e.key)) { e.preventDefault(); if (running()) stopTimer(); else startTimer(ui.draft); }
});

/* ============================== Старт ============================== */

document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
$('#fab').innerHTML = icon('plus');

Sync.init();
try { if (!localStorage.getItem(STORE_KEY)) save(); } catch { /* хранилище недоступно — работаем в памяти */ }
if (lastFinished()) ui.draft = fieldsOf(lastFinished());
applyTheme();
setupPager();

// Ярлыки PWA «Старт» / «Стоп» из manifest.webmanifest.
const action = new URLSearchParams(location.search).get('do');
if (action) {
  history.replaceState(null, '', location.pathname);
  if (action === 'start' && !running()) startTimer(ui.draft);
  if (action === 'stop') stopTimer();
}

tick();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
