/* Lógica de Tareas de casa. Traducción directa de la app nativa (TareasCasa/Logica/*.swift).
 * Reglas de puntos: ver README. Todas las divisiones redondean hacia arriba. */

/* ───── Fechas «YYYY-MM-DD» (los días se cuentan en UTC para que los cambios de hora no afecten) ───── */
const Fechas = {
  utc: s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); },
  valida: s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Fechas.utc(s)),
  dias: (desde, hasta) => (Fechas.valida(desde) && Fechas.valida(hasta)) ? Math.round((Fechas.utc(hasta) - Fechas.utc(desde)) / 864e5) : 0,
  sumar: (n, s) => new Date(Fechas.utc(s) + n * 864e5).toISOString().slice(0, 10),
  mes: s => String(s).slice(0, 7),
  hoy: () => today(),
  marca: () => new Date().toISOString(),
};

/* ───── Puntos ───── */
const ceilDiv = (a, b) => a <= 0 ? 0 : Math.floor((a + b - 1) / b);
function reglaBonus(every) {
  if (every <= 1) return { periodo: 1, pct: 2 };
  if (every <= 4) return { periodo: 2, pct: 5 };
  if (every <= 10) return { periodo: 7, pct: 20 };
  if (every <= 22) return { periodo: 15, pct: 50 };
  return { periodo: 30, pct: 120 };
}
function ultimaVez(t, fecha, log) {
  let m = null; for (const e of log) if (e.taskId === t.id && e.date <= fecha && (!m || e.date > m)) m = e.date; return m;
}
const puntualHecha = (t, log) => !!t.once && log.some(e => e.taskId === t.id);
function valorTarea(t, fecha, log) {
  if (t.once) return { points: t.base, bonusPct: 0, elapsed: 0, overdue: 0, cycles: 0, tocaYa: true, subeEn: null };
  const every = t.every || 1, last = ultimaVez(t, fecha, log) || t.createdAt;
  const elapsed = Fechas.dias(last, fecha), overdue = Math.max(0, elapsed - every), r = reglaBonus(every);
  const cycles = ceilDiv(overdue, r.periodo), bonusPct = cycles * r.pct;
  return { points: ceilDiv(t.base * (100 + bonusPct), 100), bonusPct, elapsed, overdue, cycles, tocaYa: elapsed >= every,
    subeEn: elapsed < every ? every + 1 - elapsed : cycles * r.periodo + 1 - overdue };
}
const awayPct = home => 10 * (7 - new Set((home || []).filter(d => d >= 0 && d <= 6)).size);
const totalPuntos = (base, bonusPct, away) => ceilDiv(base * (100 + bonusPct) * (100 + away), 10000);
function nuevoRegistro(t, p, fecha, log) {
  const v = valorTarea(t, fecha, log), away = awayPct(p.home);
  return { id: uid(), taskId: t.id, taskName: t.name, emoji: t.emoji, person: p.id, personName: p.name, date: fecha,
    points: totalPuntos(t.base, v.bonusPct, away), base: t.base, bonusPct: v.bonusPct, awayPct: away,
    every: t.every ?? null, once: !!t.once, createdAt: Fechas.marca() };
}

/* ───── Pestaña Puntos ───── */
const cmpNombre = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
function filasPuntos(tasks, log, fecha) {
  return tasks.filter(t => !puntualHecha(t, log)).map(t => ({ tarea: t, valor: valorTarea(t, fecha, log) }))
    .sort((a, b) => b.valor.points - a.valor.points || cmpNombre(a.tarea.name, b.tarea.name));
}
function estadoFila(f) {
  if (f.tarea.once) return { k: 'puntual', txt: 'Puntual' };
  if (f.valor.bonusPct > 0) return { k: 'bonus', txt: '+' + f.valor.bonusPct + ' %' };
  if (f.valor.tocaYa) return { k: 'toca', txt: 'Toca ya' };
  return { k: 'aldia', txt: 'Al día' };
}
const frecuencia = t => t.once ? 'Una vez' : (t.every || 1) <= 1 ? 'Cada día' : 'Cada ' + t.every + ' días';
const detalleFila = f => f.valor.subeEn == null ? frecuencia(f.tarea) : frecuencia(f.tarea) + ' · sube en ' + f.valor.subeEn + ' días';
function puntualesHechas(tasks, log) {
  const key = e => e.date + '|' + e.createdAt;
  return tasks.filter(t => t.once).map(t => { const r = log.filter(e => e.taskId === t.id).sort((a, b) => key(b) < key(a) ? -1 : 1)[0]; return r ? { tarea: t, registro: r } : null; })
    .filter(Boolean).sort((a, b) => key(b.registro) < key(a.registro) ? -1 : 1);
}
function textoRegla(every) {
  return { 1: 'Si se retrasa, +2 % por cada día de retraso.', 2: 'Si se retrasa, +5 % cada 2 días.', 7: 'Si se retrasa, +20 % cada semana.', 15: 'Si se retrasa, +50 % cada 15 días.' }[reglaBonus(every).periodo] || 'Si se retrasa, +120 % cada mes.';
}
const REGLAS = ['📅 Cada día: +2 % por día de retraso', '2–4 días: +5 % cada 2 días', '5–10 días: +20 % cada semana', '11–22 días: +50 % cada 15 días', '23 días o más: +120 % cada mes', '🧳 +10 % por cada día fuera de casa', '⭐ Puntuales: siempre su base', '⬆️ Se redondea hacia arriba'];
function validarTarea(nombre, base, every, once) {
  const n = String(nombre).trim();
  if (!n) return 'Escribe un nombre.';
  if ([...n].length > 60) return 'El nombre puede tener como mucho 60 caracteres.';
  if (!(base > 0)) return 'Los puntos base tienen que ser más de 0.';
  if (!once && !(every > 0)) return 'Indica cada cuántos días toca.';
  return null;
}

/* ───── Habitaciones: cada tarea puede llevar «room» (el nombre de su habitación) ───── */
const SIN_HAB = 'Sin habitación';
const habDe = t => String((t && t.room) || '').trim();
const habitaciones = tasks => [...new Set(tasks.map(habDe).filter(Boolean))].sort(cmpNombre);
/* Agrupa en el orden de las habitaciones (alfabético) y deja «Sin habitación» al final; dentro de cada grupo se respeta el orden recibido. */
function agruparPorHabitacion(items, tareaDe) {
  const m = new Map(); items.forEach(x => { const h = habDe(tareaDe(x)); if (!m.has(h)) m.set(h, []); m.get(h).push(x); });
  return [...m.keys()].sort((a, b) => !a ? 1 : !b ? -1 : cmpNombre(a, b)).map(h => ({ hab: h, items: m.get(h) }));
}
function validarHabitacion(nombre) {
  const n = String(nombre).trim();
  if (!n) return 'Escribe el nombre de la habitación.';
  if ([...n].length > 30) return 'El nombre de la habitación puede tener como mucho 30 caracteres.';
  return null;
}

/* ───── Pestaña Registrar ───── */
const normalizarTexto = s => String(s).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function opcionesRegistrar(tasks, log, persona, fecha, busqueda) {
  const away = awayPct(persona.home), f = normalizarTexto(busqueda || '');
  return tasks.filter(t => !puntualHecha(t, log)).filter(t => !f || normalizarTexto(t.name).includes(f))
    .map(t => { const v = valorTarea(t, fecha, log); return { tarea: t, valor: v, puntos: totalPuntos(t.base, v.bonusPct, away) }; })
    .sort((a, b) => b.puntos - a.puntos || cmpNombre(a.tarea.name, b.tarea.name));
}
const estadoOpcion = o => o.tarea.once ? 'Puntual' : o.valor.tocaYa ? (o.valor.bonusPct > 0 ? 'Toca ya · +' + o.valor.bonusPct + ' %' : 'Toca ya') : 'Sube en ' + (o.valor.subeEn || 0) + ' días';
function agruparPorDia(regs) {
  const m = new Map(); regs.forEach(r => { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push(r); });
  return [...m.entries()].map(([fecha, l]) => ({ fecha, registros: l.sort((a, b) => b.createdAt < a.createdAt ? -1 : 1) })).sort((a, b) => b.fecha < a.fecha ? -1 : 1);
}
function etiquetaDia(fecha, hoy) {
  hoy = hoy || Fechas.hoy();
  const d = Fechas.dias(fecha, hoy);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  if (!Fechas.valida(fecha)) return fecha;
  const o = { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (fecha.slice(0, 4) !== hoy.slice(0, 4)) o.year = 'numeric';
  return new Date(Fechas.utc(fecha)).toLocaleDateString('es-ES', o).replace(/,/g, '').replace(/\.$/, '');
}
const historial = log => [...log].sort((a, b) => (b.date + b.createdAt) < (a.date + a.createdAt) ? -1 : 1);

/* ───── Pestaña Resumen ───── */
const COLOR_BORRADA = '#8E8E93';
const registrosMes = (log, mes) => historial(log.filter(e => Fechas.mes(e.date) === mes));
function clasificacion(personas, log, mes) {
  const del = registrosMes(log, mes), por = {}; del.forEach(e => (por[e.person] = por[e.person] || []).push(e));
  const orden = {}; personas.forEach(p => orden[p.id] = p.order);
  const fila = (id, nombre, color, persona, r) => ({ id, nombre, color, persona, puntos: r.reduce((a, e) => a + e.points, 0), tareas: r.length });
  const filas = personas.map(p => fila(p.id, p.name, p.color, p, por[p.id] || []));
  Object.keys(por).forEach(id => { if (!(id in orden)) filas.push(fila(id, por[id][0].personName || '?', COLOR_BORRADA, null, por[id])); });
  const big = Number.MAX_SAFE_INTEGER;
  return filas.sort((a, b) => b.puntos - a.puntos || b.tareas - a.tareas || ((orden[a.id] ?? big) - (orden[b.id] ?? big)) || cmpNombre(a.nombre, b.nombre));
}
function coronados(c) { const max = c.length ? c[0].puntos : 0; return new Set(max > 0 ? c.filter(f => f.puntos === max).map(f => f.id) : []); }
const porcentaje = (p, total) => total > 0 ? Math.round(p * 100 / total) : 0;
const desplazarMes = (mes, n) => { const [y, m] = mes.split('-').map(Number), t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
const puedeAvanzar = (mes, hoy) => mes < Fechas.mes(hoy || Fechas.hoy());
const puedeRetroceder = (mes, log) => { if (!log.length) return false; const p = log.reduce((m, e) => e.date < m ? e.date : m, log[0].date); return mes > Fechas.mes(p); };
function nombreMes(mes) { const t = new Date(Fechas.utc(mes + '-01')).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(' de ', ' '); return t.charAt(0).toUpperCase() + t.slice(1); }

/* ───── Pestaña Premios ───── */
const personasDe = (r, personas) => r.who && r.who.length ? personas.filter(p => r.who.includes(p.id)) : personas;
const bucketDe = (r, fecha) => r.period === 'total' ? 'all' : Fechas.mes(fecha);
function puntosPorBucket(r, pid, log) { const res = {}; for (const e of log) if (e.person === pid && e.date >= r.since) { const b = bucketDe(r, e.date); res[b] = (res[b] || 0) + e.points; } return res; }
const vecesGanada = (r, pts) => r.points > 0 ? (r.type === 'every' ? Math.floor(pts / r.points) : pts >= r.points ? 1 : 0) : 0;
const claimId = (rid, pid, b, n) => rid + '__' + pid + '__' + b + '__' + n;
function ganados(rewards, personas, log) {
  const res = [];
  for (const r of rewards) for (const p of personasDe(r, personas)) {
    const pb = puntosPorBucket(r, p.id, log);
    for (const b of Object.keys(pb)) for (let n = 1; n <= vecesGanada(r, pb[b]); n++)
      res.push({ id: claimId(r.id, p.id, b, n), recompensa: r, personaId: p.id, personaNombre: p.name, bucket: b, n, threshold: n * r.points });
  }
  const k = g => [g.bucket, g.recompensa.name, g.personaNombre, String(g.n).padStart(6, '0')].join('\u0000');
  return res.sort((a, b) => k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0);
}
function pendientes(rewards, personas, log, claims) { const hechos = new Set(claims.map(c => c.id)); return ganados(rewards, personas, log).filter(g => !hechos.has(g.id)); }
function nuevosPremios(antes, despues) { const p = new Set(antes.map(g => g.id)); return despues.filter(g => !p.has(g.id)); }
function progreso(r, persona, log, hoy) {
  const b = bucketDe(r, hoy || Fechas.hoy()), pts = puntosPorBucket(r, persona.id, log)[b] || 0;
  const sig = r.type === 'every' ? (vecesGanada(r, pts) + 1) * r.points : (pts >= r.points ? null : r.points);
  let fr = 1; if (sig != null) { const desde = r.type === 'every' ? sig - r.points : 0; fr = Math.min(1, Math.max(0, (pts - desde) / (sig - desde))); }
  return { recompensa: r, persona, bucket: b, puntos: pts, siguiente: sig, fraccion: fr };
}
const reclamar = g => ({ id: g.id, rewardId: g.recompensa.id, rewardName: g.recompensa.name, emoji: g.recompensa.emoji, person: g.personaId, personName: g.personaNombre, bucket: g.bucket, n: g.n, threshold: g.threshold, claimedAt: Fechas.marca() });
const textoBucket = b => b === 'all' ? 'Total' : nombreMes(b);
function descripcionPremio(r) {
  return r.type === 'every' ? (r.period === 'month' ? `Cada ${r.points} pts del mes` : `Cada ${r.points} pts acumulados`)
    : (r.period === 'month' ? `Al llegar a ${r.points} pts en el mes` : `Al llegar a ${r.points} pts en total`);
}
function validarPremio(nombre, puntos) {
  const n = String(nombre).trim();
  if (!n) return 'Escribe un nombre.';
  if ([...n].length > 60) return 'El nombre puede tener como mucho 60 caracteres.';
  if (!(puntos > 0)) return 'Los puntos tienen que ser más de 0.';
  return null;
}

/* ───── Pestaña Perfiles ───── */
const SEMANA = [[1, 'L', 'lunes'], [2, 'M', 'martes'], [3, 'X', 'miércoles'], [4, 'J', 'jueves'], [5, 'V', 'viernes'], [6, 'S', 'sábado'], [0, 'D', 'domingo']];
function estadisticas(pid, log, mes) { const s = log.filter(e => e.person === pid), m = s.filter(e => Fechas.mes(e.date) === mes); const sum = l => l.reduce((a, e) => a + e.points, 0); return { puntosMes: sum(m), tareasMes: m.length, puntosTotal: sum(s), tareasTotal: s.length }; }
const actividadReciente = (pid, log, n = 3) => historial(log.filter(e => e.person === pid)).slice(0, n);
function textoAway(home) { const pct = awayPct(home), f = pct / 10; return f === 0 ? 'En casa todos los días' : f === 1 ? '+10 % por 1 día fuera de casa' : `+${pct} % por ${f} días fuera de casa`; }
const normalizarDias = d => [...new Set(d)].filter(x => x >= 0 && x <= 6).sort((a, b) => a - b);

/* ───── Colores ───── */
const PALETA = ['#FF2D55', '#FFCC00', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#5AC8FA', '#A2845E'];
const textoOscuro = hex => { const v = parseInt(String(hex).replace('#', ''), 16); if (isNaN(v)) return false; return (0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) > 160; };
const textoSobre = hex => textoOscuro(hex) ? '#000' : '#fff';
const colorValido = c => /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : COLOR_BORRADA;

/* ───── Tareas iniciales de un hogar nuevo (las mismas que trae la app nativa) ───── */
/* [id, nombre, emoji, base, cada cuántos días, puntual] — copiadas de TareasCasa/Datos/SeedData.json */
const TAREAS_INICIALES = [
  ["arenero", "Limpiar arenero del gato", "🐈", 5, 2, false],
  ["aspirar", "Barrer / aspirar", "🧹", 10, 2, false],
  ["bano", "Limpiar baño (lavabo y ducha)", "🛁", 10, 7, false],
  ["basura", "Sacar basura y reciclaje", "🗑️", 5, 3, false],
  ["cama", "Hacer la cama", "🛏️", 5, 1, false],
  ["campana", "Limpiar campana extractora", "💨", 25, 90, false],
  ["cocina", "Recoger y limpiar la cocina", "🧽", 20, 5, false],
  ["compra", "Hacer la compra", "🛒", 5, 7, false],
  ["cristales", "Limpiar cristales y ventanas", "🪟", 15, 30, false],
  ["desagues", "Limpiar desagües y sifones", "🪠", 30, 90, false],
  ["doblar", "Doblar, planchar y guardar ropa", "👕", 20, 7, false],
  ["filtros", "Limpiar filtros lavadora/lavavajillas", "⚙️", 15, 90, false],
  ["fregarsuelo", "Fregar el suelo", "🪣", 20, 7, false],
  ["h92k0d7dbqm38933blwd", "Ordenar habitación", "🛋️", 8, 7, false],
  ["horno", "Limpiar horno y microondas", "🔥", 20, 30, false],
  ["juntas", "Azulejos y juntas del baño", "🧼", 5, 30, false],
  ["lavadora", "Poner lavadora", "🫧", 5, 4, false],
  ["mggavhymcid2l36lemu1", "Limpiar vaso cepillos", "🪥", 30, null, true],
  ["nevera", "Limpiar el frigorífico", "🧊", 25, 90, false],
  ["platos", "Sacar lavavajillas", "🍽️", 10, 3, false],
  ["polvo", "Quitar el polvo", "🪶", 7, 7, false],
  ["sabanas", "Cambiar las sábanas", "🛌", 15, 15, false],
  ["tender", "Tender y recoger ropa", "🧺", 12, 5, false],
  ["vater", "Limpiar el váter", "🚽", 15, 7, false],
];
