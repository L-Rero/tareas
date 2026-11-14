/* Datos de Tareas de casa: estado local, detección de cambios, unión entre dispositivos e importación.
 * Las piezas compartidas con Gastos (cifrado, sincronización y hogar) están en common.js, sync.js y setup.js. */

const blank = () => ({ v: 1, people: [], tasks: [], log: [], rewards: [], claims: [], del: {}, seeded: 0 });
let S = blank();
const listas = s => [s.people, s.tasks, s.log, s.rewards, s.claims];

/* Detección automática de cambios: cada elemento lleva «u» (cuándo cambió) y los borrados quedan anotados en «del». */
const CACHE = new Map();
function rebase() { CACHE.clear(); listas(S).forEach(L => L.forEach(x => CACHE.set(x.id, noU(x)))); }
function stamp() {
  const now = Date.now(), seen = new Set();
  listas(S).forEach(L => L.forEach(x => {
    if (!x.id) x.id = uid(); seen.add(x.id); const j = noU(x);
    if (CACHE.get(x.id) !== j || S.del[x.id] || !x.u) { x.u = now; delete S.del[x.id]; CACHE.set(x.id, j); }
  }));
  for (const k of [...CACHE.keys()]) if (!seen.has(k)) { S.del[k] = now; CACHE.delete(k); }
  const old = now - 400 * 864e5; Object.keys(S.del).forEach(k => { if (S.del[k] < old) delete S.del[k]; });
}
function merge(L, R) {
  const del = Object.assign({}, L.del);
  Object.keys(R.del || {}).forEach(k => { if (!(del[k] >= R.del[k])) del[k] = R.del[k]; });
  const m = k => mergeList(L[k], R[k], del);
  return { v: 1, people: m('people'), tasks: m('tasks'), log: m('log'), rewards: m('rewards'), claims: m('claims'), del, seeded: Math.max(L.seeded || 0, R.seeded || 0) };
}
/* Documentos cifrados en el servidor. Todos empiezan por «t-» para no mezclarse con los de Gastos. */
function docsOf(s, known) {
  const d = { 't-meta': { people: [...s.people].sort(byId), tasks: [...s.tasks].sort(byId), rewards: [...s.rewards].sort(byId), del: s.del, seeded: s.seeded || 0 },
    't-claims': { items: [...s.claims].sort(byId) } };
  const by = {}; s.log.forEach(e => { const k = 't-log-' + String(e.date || '0000').slice(0, 4); (by[k] = by[k] || []).push(e); });
  Object.keys(known || {}).forEach(k => { if (k.startsWith('t-log-') && !by[k]) by[k] = []; });
  Object.keys(by).forEach(k => d[k] = { items: by[k].sort(byId) });
  return d;
}
function fromDocs(p) {
  const r = { people: [], tasks: [], log: [], rewards: [], claims: [], del: {}, seeded: 0 };
  const m = p['t-meta']; if (m) Object.assign(r, { people: m.people || [], tasks: m.tasks || [], rewards: m.rewards || [], del: m.del || {}, seeded: m.seeded || 0 });
  if (p['t-claims']) r.claims = p['t-claims'].items || [];
  Object.keys(p).filter(k => k.startsWith('t-log-')).forEach(k => r.log = r.log.concat(p[k].items || []));
  return r;
}

/* Tareas iniciales: un hogar nuevo empieza con la lista de la app nativa (ids fijos: si dos móviles las crean a la vez, no se duplican). */
function sembrarSiHaceFalta() {
  if (S.seeded || S.tasks.length) { if (!S.seeded && S.tasks.length) { S.seeded = 1; save(); } return; }
  const hoy = Fechas.hoy();
  TAREAS_INICIALES.forEach(([id, name, emoji, base, every, once]) => S.tasks.push({ id, name, emoji, base, every: once ? null : every, once: !!once, createdAt: hoy }));
  S.seeded = 1; save(); if (typeof render === 'function') render();
}

/* Persona elegida por defecto en este dispositivo (preferencia local, no se sincroniza). */
const yo = { get: () => { try { return localStorage.getItem('tareas.persona') || ''; } catch (e) { return ''; } }, set: id => { try { localStorage.setItem('tareas.persona', id); } catch (e) {} } };

/* Accesos cómodos */
const personas = () => [...S.people].sort((a, b) => (a.order - b.order) || cmpNombre(a.name, b.name));
const persona = id => S.people.find(p => p.id === id) || null;
const putItem = (k, x) => { const L = S[k], i = L.findIndex(y => y.id === x.id); if (i >= 0) L[i] = Object.assign({}, L[i], x); else L.push(x); save(); };
const delItem = (k, id) => { S[k] = S[k].filter(y => y.id !== id); save(); };

/* ───── Importar desde la app nativa (consulta SQL) o desde un archivo de exportación ───── */
const camel = o => { if (Array.isArray(o)) return o.map(camel); if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach(k => r[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = camel(o[k])); return r; } return o; };
function normalizarImport(raw) {
  let o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(o) && o.length === 1) o = o[0];                        // resultado del editor SQL
  if (o && o.json_build_object) o = o.json_build_object;
  if (o && o.datos) o = o.datos;
  if (typeof o === 'string') o = JSON.parse(o);
  o = camel(o);
  if (!o || !['people', 'tasks', 'log', 'rewards', 'claims'].some(k => Array.isArray(o[k]))) throw new Error('El texto no contiene datos de Tareas de casa.');
  const iso = t => { const d = new Date(t); return t && !isNaN(d) ? d.toISOString() : Fechas.marca(); };
  const fecha = t => String(t || '').slice(0, 10);
  return {
    people: (o.people || []).map((p, i) => ({ id: String(p.id), name: String(p.name || 'Sin nombre').slice(0, 24), emoji: p.emoji || '', color: colorValido(p.color), photo: p.photo || null, home: normalizarDias((p.home || [0, 1, 2, 3, 4, 5, 6]).map(Number)), order: Number.isFinite(+p.order) ? +p.order : i + 1 })),
    tasks: (o.tasks || []).map(t => ({ id: String(t.id), name: String(t.name || 'Tarea').slice(0, 60), emoji: t.emoji || '✅', base: Math.max(1, +t.base || 1), every: t.once ? null : Math.max(1, +t.every || 7), once: !!t.once, createdAt: fecha(t.createdAt) || Fechas.hoy() })),
    log: (o.log || []).map(e => ({ id: String(e.id), taskId: String(e.taskId), taskName: e.taskName || '', emoji: e.emoji || '', person: String(e.person), personName: e.personName || '', date: fecha(e.date), points: +e.points || 0, base: +e.base || 0, bonusPct: +e.bonusPct || 0, awayPct: +e.awayPct || 0, every: e.every ?? null, once: !!e.once, createdAt: iso(e.createdAt) })),
    rewards: (o.rewards || []).map(r => ({ id: String(r.id), name: String(r.name || 'Recompensa').slice(0, 60), emoji: r.emoji || '🎁', type: r.type === 'reach' ? 'reach' : 'every', period: r.period === 'total' ? 'total' : 'month', points: Math.max(1, +r.points || 100), who: (r.who || []).map(String), since: fecha(r.since) || '0000-00-00' })),
    claims: (o.claims || []).map(c => ({ id: String(c.id), rewardId: String(c.rewardId), rewardName: c.rewardName || '', emoji: c.emoji || '🎁', person: String(c.person), personName: c.personName || '', bucket: String(c.bucket), n: +c.n || 1, threshold: +c.threshold || 0, claimedAt: iso(c.claimedAt) })),
  };
}
