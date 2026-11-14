/* Interfaz de Tareas de casa: mismas pantallas que la app nativa (TareasCasa/Vistas). */
const M = () => document.getElementById('m');
let TAB = 'resumen', MES = Fechas.mes(Fechas.hoy()), VER_TODO = false;
let SEL = new Set(), FECHA = '', BUSQ = '', ULT = null, ULT_T = null, EDIT_H = false, LIM_H = 30, DIAS = {};
const GASTOS_URL = 'https://l-rero.github.io/gastos/';

/* Conexión con las piezas compartidas (sync.js y setup.js) */
const APP = {
  name: 'Tareas de casa', desc: 'Vuestras tareas, puntos y premios', stateKey: 'tareas-state',
  ownDoc: id => id.startsWith('t-'),
  start() { if (DEV.d && DEV.d.mode !== 'sync') sembrarSiHaceFalta(); render(); },
  clear() { closeModal(); const m = M(); if (m) m.innerHTML = ''; },
  goSettings() { go('perfiles'); },
  refreshSettings() { if (TAB === 'perfiles') render(); },
  afterRelogin() { TAB = 'perfiles'; },
  afterSync() { sembrarSiHaceFalta(); },
};

/* ───── Piezas comunes de la interfaz ───── */
const ICON = {
  resumen: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5C4.5 8.5 5.6 10.4 7.4 10.8M17 6h2.5c0 2.5-1.1 4.4-2.9 4.8"/><path d="M12 13v3.5M8.5 20h7M9.5 16.5h5V20h-5z"/>',
  registrar: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
  puntos: '<path d="M9.5 6h10M9.5 12h10M9.5 18h10"/><circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="18" r="1.2"/>',
  premios: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.5S10 8 12 8Zm0 0c1.5-3 5-3.5 5-1.5S14 8 12 8Z"/>',
  perfiles: '<circle cx="9" cy="8" r="3.3"/><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="16.8" cy="9" r="2.6"/><path d="M16.5 14c2.7 0 4.5 1.8 4.5 4.6"/>',
};
const TITULOS = { resumen: 'Resumen', registrar: 'Registrar', puntos: 'Puntos', premios: 'Premios', perfiles: 'Perfiles' };
function avatar(p, t) {
  t = t || 44; const c = colorValido(p.color);
  const inner = p.photo ? `<img src="${esc(p.photo)}" alt="">` : p.emoji ? `<span style="font-size:${Math.round(t * .55)}px">${esc(p.emoji)}</span>` : `<span style="font-size:${Math.round(t * .45)}px;font-weight:600;color:${textoSobre(c)}">${esc((p.name || '?').charAt(0).toUpperCase())}</span>`;
  return `<span class="av" style="width:${t}px;height:${t}px;background:${c}">${inner}</span>`;
}
const pastilla = (pts, color) => `<span class="pill" style="background:${colorValido(color)};color:${textoSobre(colorValido(color))}">+${pts}</span>`;
const etiqueta = e => `<span class="tag ${e.k}">${esc(e.txt)}</span>`;
const seccion = (titulo, cuerpo, pie, extra) => `${titulo ? `<div class="gh">${titulo}${extra || ''}</div>` : ''}<div class="grp">${cuerpo}</div>${pie ? `<div class="gf">${pie}</div>` : ''}`;
const filaHist = (r, color, detalle) => `<div class="row"><span class="emo">${esc(r.emoji)}</span><span class="tx"><b>${esc(r.taskName)}</b><small>${esc(detalle || r.personName)}</small></span>${pastilla(r.points, color)}</div>`;
function confeti() {
  const cols = personas().map(p => p.color).concat(['#FF2D55', '#FFCC00', '#007AFF', '#34C759', '#FF9500', '#AF52DE']);
  for (let i = 0; i < 40; i++) { const s = document.createElement('i'); s.className = 'conf'; s.style.left = Math.random() * 100 + 'vw'; s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * .4 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`; document.body.appendChild(s); setTimeout(() => s.remove(), 2400); }
  try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
}
const confirmar = (titulo, texto, boton, destructivo) => askChoice(titulo, texto, [{ label: 'Cancelar', cls: 'g', v: 0 }, { label: boton, cls: destructivo ? 'd' : '', v: 1 }]);
const avisar = (titulo, texto) => askChoice(titulo, texto, [{ label: '¡Genial!', v: 1 }]);
function unGrafema(v) { if (!v) return ''; try { const s = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(v)]; return s.length ? s[s.length - 1].segment : ''; } catch (e) { return [...v].slice(-1).join(''); } }

/* Hoja de edición (como las «sheets» de iOS) */
function hoja(titulo, cuerpo, okLabel, onOk) {
  const w = modal(`<div class="sh-head"><button class="lnk" id="shc">Cancelar</button><b>${esc(titulo)}</b><button class="lnk b" id="sho">${esc(okLabel)}</button></div><div class="sh-body">${cuerpo}</div>`);
  w.querySelector('.md').classList.add('sheet');
  w.querySelector('#shc').onclick = closeModal;
  w.querySelector('#sho').onclick = async () => { if (await onOk(w) !== false) closeModal(); };
  return w;
}

/* ───── Navegación ───── */
function go(t) { TAB = t; try { history.replaceState(null, '', '#' + t); } catch (e) {} render(); window.scrollTo(0, 0); }
{ const h = location.hash.slice(1); if (TITULOS[h]) TAB = h; }
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TITULOS[h] && h !== TAB && !$('#app').hidden) { TAB = h; render(); window.scrollTo(0, 0); } });
function render() {
  if (!M()) return;
  document.querySelectorAll('.tabbar [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === TAB));
  const n = pendientes(S.rewards, personas(), S.log, S.claims).length, bd = $('#badge');
  if (bd) { bd.textContent = n; bd.hidden = !n; }
  $('#syncw').innerHTML = syncBadge();
  $('#navR').innerHTML = { puntos: '<button class="circ" onclick="editorTarea()" aria-label="Nueva tarea">+</button>', premios: '<button class="circ" onclick="editorPremio()" aria-label="Nueva recompensa">+</button>', perfiles: '<button class="circ" onclick="editorPersona()" aria-label="Añadir persona">+</button>' }[TAB] || '';
  M().innerHTML = `<h1 class="lt">${TITULOS[TAB]}</h1>` + ({ resumen: vResumen, registrar: vRegistrar, puntos: vPuntos, premios: vPremios, perfiles: vPerfiles })[TAB]();
  barraInferior();
  if (TAB === 'perfiles') secLoad();
}

/* ───── Resumen ───── */
function vResumen() {
  const hoy = Fechas.hoy(), c = clasificacion(personas(), S.log, MES), total = c.reduce((a, f) => a + f.puntos, 0), cor = coronados(c);
  const regs = registrosMes(S.log, MES), top = filasPuntos(S.tasks, S.log, hoy).slice(0, 5);
  let h = `<div class="month"><button onclick="MES=desplazarMes(MES,-1);VER_TODO=false;render()" ${puedeRetroceder(MES, S.log) ? '' : 'disabled'} aria-label="Mes anterior">‹</button><b>${nombreMes(MES)}</b><button onclick="MES=desplazarMes(MES,1);VER_TODO=false;render()" ${puedeAvanzar(MES) ? '' : 'disabled'} aria-label="Mes siguiente">›</button></div>`;
  if (!c.length) h += seccion('', `<div class="empty">Todavía no hay nadie en la casa.<br><button class="bt" onclick="editorPersona()">Añadir persona</button></div>`);
  else {
    const top3 = c.slice(0, 3), ord = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0], alt = { 1: 96, 2: 68, 3: 48 };
    const av = f => f.persona || { name: f.nombre, color: f.color };
    h += seccion('', `<div class="podio">${ord.map(i => { const f = top3[i], pos = i + 1, col = colorValido(f.color); return `<div class="pcol"><span class="crown" style="opacity:${cor.has(f.id) ? 1 : 0}">👑</span>${avatar(av(f), pos === 1 ? 60 : 48)}<b>${esc(f.nombre)}</b><small>${f.puntos} pts</small><div class="step" style="height:${alt[pos]}px;background:${col}40;color:${col}">${pos}</div></div>`; }).join('')}</div>`);
    const barra = total ? `<div class="split">${c.filter(f => f.puntos > 0).map(f => `<i style="flex:${f.puntos};background:${colorValido(f.color)}"></i>`).join('')}</div>` : '<div class="split"></div>';
    h += seccion('Reparto de puntos', `<div class="row">${barra}</div>` + c.map((f, i) => `<div class="row"><span class="pos">${i + 1}</span>${avatar(av(f), 34)}<span class="tx"><b>${esc(f.nombre)}${cor.has(f.id) ? ' 👑' : ''}</b><small>${f.tareas === 1 ? '1 tarea' : f.tareas + ' tareas'}</small></span><span class="val"><b style="color:${colorValido(f.color)}">${f.puntos} pts</b><small>${porcentaje(f.puntos, total)} %</small></span></div>`).join(''),
      total === 0 ? 'Aún no hay puntos este mes.' : `En total, ${total} puntos y ${regs.length} tareas.`);
  }
  if (top.length) h += seccion('Ahora puntúan más', top.map(f => `<div class="row"><span class="emo">${esc(f.tarea.emoji)}</span><span class="tx"><b>${esc(f.tarea.name)}</b><small>${etiqueta(estadoFila(f))}</small></span><span class="num">${f.valor.points}</span></div>`).join(''));
  const vis = VER_TODO ? regs : regs.slice(0, 20);
  if (!regs.length) h += seccion('Actividad del mes', '<div class="empty">No hay tareas registradas este mes.</div>');
  else { h += '<h2 class="sub">Actividad del mes</h2>' + agruparPorDia(vis).map(d => seccion(esc(etiquetaDia(d.fecha, hoy)), d.registros.map(r => filaHist(r, (persona(r.person) || {}).color || COLOR_BORRADA)).join(''))).join('');
    if (regs.length > 20 && !VER_TODO) h += `<button class="bt g w" onclick="VER_TODO=true;render()">Mostrar todo (${regs.length})</button>`; }
  return h;
}

/* ───── Registrar ───── */
function personaActual() { return persona(yo.get()) || personas()[0] || null; }
function vRegistrar() {
  const p = personaActual(), hoy = Fechas.hoy();
  if (!p) return `<div class="empty big"><div style="font-size:44px">👥</div><b>Todavía no hay nadie</b><p>Añade a las personas de la casa para empezar a registrar tareas.</p><button class="bt" onclick="editorPersona()">Añadir persona</button></div>`;
  if (!FECHA || FECHA > hoy) FECHA = hoy;
  const ops = opcionesRegistrar(S.tasks, S.log, p, FECHA, BUSQ), away = awayPct(p.home);
  const validas = new Set(opcionesRegistrar(S.tasks, S.log, p, FECHA, '').map(o => o.tarea.id));
  SEL.forEach(id => { if (!validas.has(id)) SEL.delete(id); });
  let h = seccion('', `<div class="row people">${personas().map(x => `<button class="pp${x.id === p.id ? ' on' : ''}" style="--c:${colorValido(x.color)}" data-id="${esc(x.id)}" onclick="yo.set(this.dataset.id);render()">${avatar(x, 48)}<small>${esc(x.name)}</small></button>`).join('')}<button class="pp" onclick="editorPersona()"><span class="av add">+</span><small>Añadir</small></button></div>
    <div class="row"><span class="tx">Fecha</span><input type="date" id="rf" value="${FECHA}" max="${hoy}" onchange="FECHA=this.value>'${hoy}'?'${hoy}':this.value||'${hoy}';render()">${FECHA !== hoy ? `<button class="bt g sm" onclick="FECHA='${hoy}';render()">Hoy</button>` : ''}</div>`);
  h += `<label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Buscar tarea" value="${esc(BUSQ)}" oninput="BUSQ=this.value;listaRegistrar()"></label>`;
  h += `<div id="lreg">${listaRegistrarHtml(p, ops, away)}</div>`;
  const todos = historial(S.log), dias = agruparPorDia(todos.slice(0, LIM_H));
  h += `<h2 class="sub">Historial${todos.length ? `<button class="lnk" onclick="EDIT_H=!EDIT_H;render()">${EDIT_H ? 'Hecho' : 'Editar'}</button>` : ''}</h2>`;
  if (!dias.length) h += seccion('', '<div class="empty">Aún no hay registros.</div>');
  h += dias.map(d => seccion(esc(etiquetaDia(d.fecha, hoy)), d.registros.map(r => (EDIT_H ? `<div class="row"><button class="minus" data-id="${esc(r.id)}" onclick="borrarRegistro(this.dataset.id)" aria-label="Borrar">−</button>` + filaHist(r, (persona(r.person) || {}).color || COLOR_BORRADA).slice(17) : filaHist(r, (persona(r.person) || {}).color || COLOR_BORRADA))).join(''))).join('');
  if (todos.length > LIM_H) h += `<button class="bt g w" onclick="LIM_H+=30;render()">Mostrar más</button>`;
  return h + '<div style="height:70px"></div>';
}
function listaRegistrarHtml(p, ops, away) {
  const cuerpo = ops.length ? ops.map(o => { const on = SEL.has(o.tarea.id), c = colorValido(p.color); return `<button class="row opt${on ? ' on' : ''}" style="--c:${c}" data-id="${esc(o.tarea.id)}" onclick="elegirTarea(this.dataset.id)"><span class="emo">${esc(o.tarea.emoji)}</span><span class="tx"><b>${esc(o.tarea.name)}</b><small class="${o.valor.tocaYa && !o.tarea.once ? 'naranja' : ''}">${esc(estadoOpcion(o))}</small></span>${pastilla(o.puntos, c)}<span class="chk">${on ? '✓' : ''}</span></button>`; }).join('')
    : `<div class="empty">${BUSQ ? 'Sin resultados para «' + esc(BUSQ) + '».' : 'No hay tareas pendientes.'}</div>`;
  const pie = [ops.length ? 'Puedes marcar varias tareas a la vez.' : '', away > 0 ? `Incluye +${away} % por días fuera de casa.` : ''].filter(Boolean).join(' ');
  return seccion('Tareas para ' + esc(p.name), cuerpo, pie);
}
function elegirTarea(id) { SEL.has(id) ? SEL.delete(id) : SEL.add(id); listaRegistrar(); barraInferior(); }
function listaRegistrar() { const p = personaActual(), e = $('#lreg'); if (!p || !e) return; e.innerHTML = listaRegistrarHtml(p, opcionesRegistrar(S.tasks, S.log, p, FECHA, BUSQ), awayPct(p.home)); }
function barraInferior() {
  const b = $('#bbar'); if (!b) return;
  const p = personaActual();
  if (TAB === 'registrar' && p && SEL.size) {
    const os = opcionesRegistrar(S.tasks, S.log, p, FECHA, '').filter(x => SEL.has(x.tarea.id));
    if (os.length) {
      const c = colorValido(p.color), pts = os.reduce((a, o) => a + o.puntos, 0);
      b.innerHTML = `<div class="bbrow">${os.length > 1 ? `<button class="bt g big quitar" onclick="SEL.clear();listaRegistrar();barraInferior()" aria-label="Quitar la selección">✕</button>` : ''}<button class="bt big" style="background:${c};color:${textoSobre(c)}" onclick="confirmarRegistro()">${os.length > 1 ? `Confirmar ${os.length} tareas · +${pts} pts` : `Confirmar +${pts} pts`}</button></div>`;
      b.hidden = false; return;
    }
  }
  if (TAB === 'registrar' && ULT) {
    const pts = ULT.reduce((a, r) => a + r.points, 0), txt = ULT.length > 1 ? `${ULT.length} tareas` : `${esc(ULT[0].emoji)} ${esc(ULT[0].taskName)}`;
    b.innerHTML = `<div class="undo"><span>✅ ${txt} · +${pts} pts</span><button class="lnk b" onclick="deshacerUltimo()">Deshacer</button></div>`; b.hidden = false; return;
  }
  if (TAB === 'perfiles') { const pid = Object.keys(DIAS).find(id => persona(id)); if (pid) { barraDias(b, persona(pid)); return; } }
  b.hidden = true; b.innerHTML = '';
}
async function confirmarRegistro() {
  const p = personaActual(), hoy = Fechas.hoy();
  const ts = opcionesRegistrar(S.tasks, S.log, p || { home: [] }, FECHA, '').map(o => o.tarea).filter(t => SEL.has(t.id) && !puntualHecha(t, S.log));
  if (!p || !ts.length || FECHA > hoy) return;
  const antes = pendientes(S.rewards, personas(), S.log, S.claims);
  const rs = ts.map(t => nuevoRegistro(t, p, FECHA, S.log)); S.log.push(...rs); save();
  const nuevos = nuevosPremios(antes, pendientes(S.rewards, personas(), S.log, S.claims));
  SEL.clear(); ULT = rs; clearTimeout(ULT_T); ULT_T = setTimeout(() => { if (ULT === rs) { ULT = null; barraInferior(); } }, 6000);
  render(); confeti();
  if (nuevos.length) avisar('🎉 ¡Premio conseguido!', nuevos.map(g => `${esc(g.personaNombre)} ha ganado «${esc(g.recompensa.emoji)} ${esc(g.recompensa.name)}» (${g.threshold} pts).`).join('<br>') + '<br><br>Lo tienes en Premios para reclamarlo.');
}
function deshacerUltimo() { if (!ULT) return; const ids = new Set(ULT.map(r => r.id)); S.log = S.log.filter(e => !ids.has(e.id)); save(); ULT = null; clearTimeout(ULT_T); render(); }
async function borrarRegistro(id) {
  const r = S.log.find(x => x.id === id); if (!r) return;
  if (await confirmar('¿Borrar este registro?', `${esc(r.emoji)} ${esc(r.taskName)}: se restarán ${r.points} puntos a ${esc(r.personName)}.`, 'Borrar', 1)) { delItem('log', id); if (ULT) { ULT = ULT.filter(x => x.id !== id); if (!ULT.length) ULT = null; } render(); }
}

/* ───── Puntos ───── */
function vPuntos() {
  const hoy = Fechas.hoy(), filas = filasPuntos(S.tasks, S.log, hoy), hechas = puntualesHechas(S.tasks, S.log);
  let h = `<div class="chips">${REGLAS.map(r => `<span>${esc(r)}</span>`).join('')}</div>`;
  h += seccion('Valor de hoy', filas.length ? filas.map(f => `<button class="row" data-id="${esc(f.tarea.id)}" onclick="editorTarea(this.dataset.id)"><span class="emo">${esc(f.tarea.emoji)}</span><span class="tx"><b>${esc(f.tarea.name)}</b><small>${etiqueta(estadoFila(f))} ${esc(detalleFila(f))}</small></span><span class="num${f.valor.bonusPct > 0 ? ' rojo' : ''}">${f.valor.points}</span></button>`).join('') : '<div class="empty">No hay tareas. Pulsa + para crear una.</div>',
    'Toca una tarea para editarla. Los puntos no incluyen el extra por días fuera de casa.');
  if (hechas.length) h += seccion('Puntuales hechas', hechas.map(x => `<button class="row" data-id="${esc(x.tarea.id)}" onclick="editorTarea(this.dataset.id)"><span class="emo">${esc(x.tarea.emoji)}</span><span class="tx"><b>${esc(x.tarea.name)}</b><small>${esc(x.registro.personName)} · ${esc(etiquetaDia(x.registro.date, hoy))}</small></span><span class="ok">✓</span></button>`).join(''));
  return h;
}
function editorTarea(id) {
  const o = id ? S.tasks.find(t => t.id === id) : null;
  const st = { once: o ? !!o.once : false, every: o ? (o.every || 7) : 7, base: o ? o.base : 10 };
  const w = hoja(o ? 'Editar tarea' : 'Nueva tarea', `
    <div class="grp"><div class="row"><input id="te" class="emoji" placeholder="🧹" value="${esc(o ? o.emoji : '')}"><input id="tn" class="plain" placeholder="Nombre de la tarea" maxlength="60" value="${esc(o ? o.name : '')}"></div></div><div class="gf" id="tc"></div>
    <div class="seg"><button id="tr">Recurrente</button><button id="tp">Puntual</button></div>
    <div class="grp" id="tev"><div class="row"><span class="tx">Cada cuánto</span><b id="tevl"></b>${stepper('tevs')}</div></div><div class="gf" id="tef"></div>
    <div class="grp"><div class="row"><span class="tx">Puntos base</span><b id="tbl"></b>${stepper('tbs')}</div></div><div class="gf">Cada persona gana además un 5 % extra por cada día que no está en casa.</div>
    ${o ? `<div class="grp"><button class="row rojo" id="tdel">Eliminar tarea</button></div><div class="gf">El historial de esta tarea se conserva.</div>` : ''}<p class="err" id="terr"></p>`, 'Guardar', async () => {
    const nombre = w.querySelector('#tn').value.trim(), err = validarTarea(nombre, st.base, st.every, st.once);
    if (err) { w.querySelector('#terr').textContent = err; return false; }
    putItem('tasks', { id: o ? o.id : uid(), name: nombre, emoji: w.querySelector('#te').value || '✅', base: st.base, every: st.once ? null : st.every, once: st.once, createdAt: o ? o.createdAt : Fechas.hoy() });
    render();
  });
  const upd = () => {
    w.querySelector('#tr').className = st.once ? '' : 'on'; w.querySelector('#tp').className = st.once ? 'on' : '';
    w.querySelector('#tev').hidden = st.once; w.querySelector('#tevl').textContent = st.every === 1 ? 'Cada día' : 'Cada ' + st.every + ' días';
    w.querySelector('#tef').textContent = st.once ? 'Se hace una sola vez y vale siempre sus puntos base, sin bonus por retraso.' : textoRegla(st.every);
    w.querySelector('#tbl').textContent = st.base; w.querySelector('#tc').textContent = [...w.querySelector('#tn').value].length + '/60';
  };
  w.querySelector('#tr').onclick = () => { st.once = false; upd(); }; w.querySelector('#tp').onclick = () => { st.once = true; upd(); };
  bindStepper(w, 'tevs', d => { st.every = Math.min(365, Math.max(1, st.every + d)); upd(); });
  bindStepper(w, 'tbs', d => { st.base = Math.min(500, Math.max(1, st.base + d)); upd(); });
  w.querySelector('#tn').oninput = upd; w.querySelector('#te').oninput = e => { e.target.value = unGrafema(e.target.value); };
  if (o) w.querySelector('#tdel').onclick = async () => { closeModal(); if (await confirmar(`¿Eliminar «${esc(o.name)}»?`, 'Dejará de aparecer para registrar. Los registros que ya tiene se conservan.', 'Eliminar', 1)) { delItem('tasks', o.id); render(); } };
  upd();
}
const stepper = id => `<span class="stp" id="${id}"><button data-d="-1" aria-label="Menos">−</button><button data-d="1" aria-label="Más">+</button></span>`;
const bindStepper = (w, id, fn, paso) => w.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => fn(+b.dataset.d * (paso || 1)));

/* ───── Premios ───── */
function vPremios() {
  const rs = [...S.rewards].sort((a, b) => cmpNombre(a.name, b.name)), pend = pendientes(rs, personas(), S.log, S.claims), recl = [...S.claims].sort((a, b) => b.claimedAt < a.claimedAt ? -1 : 1);
  let h = '';
  if (!rs.length) h += `<div class="empty big"><div style="font-size:48px">🎁</div><b>Aún no hay recompensas</b><p>Crea premios como «Elegir la peli» o «Cena fuera» que se ganan al sumar puntos.</p><button class="bt" onclick="editorPremio()">Crear recompensa</button></div>`;
  if (pend.length) h += seccion('Pendientes de reclamar', pend.map(g => { const c = colorValido((persona(g.personaId) || {}).color); return `<div class="row"><span class="emo">${esc(g.recompensa.emoji)}</span><span class="tx"><b>${esc(g.recompensa.name)}</b><small>${esc(g.personaNombre)} · ${esc(textoBucket(g.bucket))} · ${g.threshold} pts</small></span><button class="bt sm" style="background:${c};color:${textoSobre(c)}" data-id="${esc(g.id)}" onclick="reclamarPremio(this.dataset.id)">Reclamar</button></div>`; }).join(''), 'Pulsa «Reclamar» cuando se haya disfrutado el premio.');
  rs.forEach(r => {
    const quien = r.who && r.who.length ? (() => { const n = r.who.map(id => (persona(id) || {}).name).filter(Boolean); return n.length ? ' · Para ' + n.join(', ').replace(/, ([^,]*)$/, ' y $1') : ''; })() : ' · Para todos';
    h += seccion(`<button class="lnk hdr" data-id="${esc(r.id)}" onclick="editorPremio(this.dataset.id)">${esc(r.emoji)} ${esc(r.name)} <span>✎</span></button>`,
      personasDe(r, personas()).map(p => { const g = progreso(r, p, S.log); return `<div class="row">${avatar(p, 32)}<span class="tx"><span class="lr"><b>${esc(p.name)}</b><small>${g.siguiente == null ? '¡Conseguido! ✓' : g.puntos + ' / ' + g.siguiente + ' pts'}</small></span><span class="bar"><i style="width:${g.fraccion * 100}%;background:${colorValido(p.color)}"></i></span></span></div>`; }).join('') || '<div class="empty">Nadie puede ganarla.</div>',
      esc(descripcionPremio(r) + quien + ' · Desde el ' + new Date(Fechas.utc(r.since)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })));
  });
  if (recl.length) h += seccion('Reclamadas', recl.map(c => `<button class="row" data-id="${esc(c.id)}" onclick="deshacerReclamo(this.dataset.id)"><span class="emo">${esc(c.emoji)}</span><span class="tx"><b>${esc(c.rewardName)}</b><small>${esc(c.personName)} · ${esc(textoBucket(c.bucket))} · ${c.threshold} pts</small></span><span class="ok">✓</span></button>`).join(''), 'Toca una para deshacer la reclamación.');
  return h;
}
async function reclamarPremio(id) {
  const g = pendientes(S.rewards, personas(), S.log, S.claims).find(x => x.id === id); if (!g) return;
  if (await confirmar(`¿Reclamar «${esc(g.recompensa.name)}»?`, `Para ${esc(g.personaNombre)} (${esc(textoBucket(g.bucket))}, ${g.threshold} pts).`, 'Reclamar')) { S.claims.push(reclamar(g)); save(); render(); confeti(); }
}
async function deshacerReclamo(id) {
  const c = S.claims.find(x => x.id === id); if (!c) return;
  if (await confirmar('¿Deshacer la reclamación?', `«${esc(c.rewardName)}» de ${esc(c.personName)} volverá a estar pendiente.`, 'Deshacer', 1)) { delItem('claims', id); render(); }
}
function editorPremio(id) {
  const o = id ? S.rewards.find(r => r.id === id) : null;
  const st = { type: o ? o.type : 'every', period: o ? o.period : 'month', points: o ? o.points : 100, who: new Set(o ? o.who : []) };
  const w = hoja(o ? 'Editar recompensa' : 'Nueva recompensa', `
    <div class="grp"><div class="row"><input id="re" class="emoji" placeholder="🎁" value="${esc(o ? o.emoji : '')}"><input id="rn" class="plain" placeholder="Nombre (p. ej. Elegir la peli)" maxlength="60" value="${esc(o ? o.name : '')}"></div></div>
    <div class="grp"><div class="row"><span class="tx">Cuándo se gana</span><select id="rt"><option value="every">Cada X puntos</option><option value="reach">Al llegar a X</option></select></div>
      <div class="row"><span class="tx">Qué puntos cuentan</span><select id="rp"><option value="month">Los del mes</option><option value="total">Todos (acumulados)</option></select></div>
      <div class="row"><span class="tx">Puntos (X)</span><input id="rx" type="number" inputmode="numeric" min="1" class="num-in" value="${st.points}">${stepper('rxs')}</div></div><div class="gf" id="rf2"></div>
    <div class="gh">Para quién</div><div class="grp">${personas().map(p => `<button class="row" data-id="${esc(p.id)}">${avatar(p, 30)}<span class="tx">${esc(p.name)}</span><span class="chk2"></span></button>`).join('') || '<div class="empty">Aún no hay personas.</div>'}</div><div class="gf" id="rq"></div>
    <div class="grp"><div class="row"><span class="tx">Cuentan desde</span><input id="rd" type="date" value="${o ? o.since : Fechas.hoy()}"></div></div><div class="gf">Solo cuentan las tareas registradas a partir de esta fecha.</div>
    ${o ? `<div class="grp"><button class="row rojo" id="rdel">Eliminar recompensa</button></div><div class="gf">Las que ya se reclamaron se conservan.</div>` : ''}<p class="err" id="rerr"></p>`, 'Guardar', () => {
    const nombre = w.querySelector('#rn').value.trim(), pts = Math.round(+w.querySelector('#rx').value), err = validarPremio(nombre, pts);
    if (err) { w.querySelector('#rerr').textContent = err; return false; }
    const existentes = new Set(S.people.map(p => p.id));
    putItem('rewards', { id: o ? o.id : uid(), name: nombre, emoji: w.querySelector('#re').value || '🎁', type: st.type, period: st.period, points: pts, who: [...st.who].filter(x => existentes.has(x)).sort(), since: w.querySelector('#rd').value || Fechas.hoy() });
    render();
  });
  const upd = () => {
    st.type = w.querySelector('#rt').value; st.period = w.querySelector('#rp').value; const x = Math.max(1, Math.round(+w.querySelector('#rx').value) || 1);
    w.querySelector('#rf2').textContent = descripcionPremio({ type: st.type, period: st.period, points: x }) + (st.type === 'every' ? `: se gana en ${x}, ${x * 2}, ${x * 3}…` : ': se gana una sola vez') + (st.period === 'month' ? ' y vuelve a empezar cada mes.' : '.');
    w.querySelector('#rq').textContent = st.who.size ? 'Solo para las personas marcadas.' : 'Sin marcar a nadie, vale para todos.';
    w.querySelectorAll('.grp [data-id]').forEach(b => b.querySelector('.chk2').textContent = st.who.has(b.dataset.id) ? '✓' : '');
  };
  w.querySelector('#rt').value = st.type; w.querySelector('#rp').value = st.period;
  w.querySelector('#rt').onchange = upd; w.querySelector('#rp').onchange = upd; w.querySelector('#rx').oninput = upd;
  bindStepper(w, 'rxs', d => { const i = w.querySelector('#rx'); i.value = Math.min(100000, Math.max(1, (Math.round(+i.value) || 0) + d)); upd(); }, 10);
  w.querySelectorAll('.grp [data-id]').forEach(b => b.onclick = () => { st.who.has(b.dataset.id) ? st.who.delete(b.dataset.id) : st.who.add(b.dataset.id); upd(); });
  w.querySelector('#re').oninput = e => { e.target.value = unGrafema(e.target.value); };
  if (o) w.querySelector('#rdel').onclick = async () => { closeModal(); if (await confirmar(`¿Eliminar «${esc(o.name)}»?`, 'Dejará de aparecer el progreso y los pendientes de esta recompensa.', 'Eliminar', 1)) { delItem('rewards', o.id); render(); } };
  upd();
}

/* ───── Perfiles ───── */
function vPerfiles() {
  const hoy = Fechas.hoy(), ps = personas();
  let h = ps.length ? '' : seccion('', '<div class="empty">Todavía no hay nadie. Pulsa + para añadir a alguien.</div>');
  ps.forEach(p => {
    const s = estadisticas(p.id, S.log, Fechas.mes(hoy)), rec = actividadReciente(p.id, S.log), c = colorValido(p.color);
    const draft = DIAS[p.id] || new Set(p.home), cambios = [...draft].sort().join() !== [...p.home].sort().join();
    h += seccion('', `<button class="row" data-id="${esc(p.id)}" onclick="editorPersona(this.dataset.id)">${avatar(p, 60)}<span class="tx"><b class="big">${esc(p.name)}</b><small>${esc(textoAway(p.home))}</small></span><span class="edit" style="color:${c}">✎</span></button>
      <div class="row stats"><span><small>Este mes</small><b style="color:${c}">${s.puntosMes} pts</b><small>${s.tareasMes === 1 ? '1 tarea' : s.tareasMes + ' tareas'}</small></span><span><small>En total</small><b style="color:${c}">${s.puntosTotal} pts</b><small>${s.tareasTotal === 1 ? '1 tarea' : s.tareasTotal + ' tareas'}</small></span></div>
      <div class="row col"><b class="lbl">Días en casa</b><div class="days">${SEMANA.map(([d, ini, nom]) => `<button class="${draft.has(d) ? 'on' : ''}" style="--c:${c};--t:${textoSobre(c)}" data-id="${esc(p.id)}" data-d="${d}" aria-label="${nom}" onclick="toggleDia(this.dataset.id,+this.dataset.d)">${ini}</button>`).join('')}</div>
        ${cambios ? `<small class="naranja">Sin guardar: ${esc(textoAway([...draft]).toLowerCase())}. Pulsa «Guardar» abajo.</small>` : ''}</div>
      ${rec.length ? '<div class="row"><b class="lbl">Actividad reciente</b></div>' + rec.map(r => filaHist(r, c, etiquetaDia(r.date, hoy))).join('') : '<div class="row"><small class="mu">Sin actividad todavía.</small></div>'}`);
  });
  if (ps.length) h += seccion('', `<div class="row"><span class="tx">Soy</span><select onchange="yo.set(this.value)">${persona(yo.get()) ? '' : '<option value="">Sin elegir</option>'}${ps.map(p => `<option value="${esc(p.id)}"${p.id === yo.get() ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`, 'La persona que se elige por defecto al registrar en este dispositivo.');
  h += secCard();
  h += seccion('Datos', `<button class="row" onclick="importarNativa()"><span class="emo">📥</span><span class="tx"><b>Importar desde la app nativa</b><small>Trae personas, tareas, historial y premios</small></span></button><a class="row" href="${GASTOS_URL}"><span class="emo">💶</span><span class="tx"><b>Abrir Gastos</b><small>Misma cuenta y mismo hogar</small></span></a>`);
  return h + `<div style="margin-top:14px">${syncBadge()}</div>` + (Object.keys(DIAS).length ? '<div style="height:90px"></div>' : '');
}
function toggleDia(pid, d) {
  const p = persona(pid); if (!p) return; const s = DIAS[pid] || new Set(p.home); s.has(d) ? s.delete(d) : s.add(d);
  if ([...s].sort().join() === [...p.home].sort().join()) delete DIAS[pid]; else DIAS[pid] = s;
  render();
}
/* Barra fija sobre las pestañas para guardar los días en casa (siempre visible, aunque la tarjeta quede abajo) */
function barraDias(b, p) {
  const c = colorValido(p.color);
  b.innerHTML = `<div class="undo dias"><span><b>Días en casa de ${esc(p.name)}</b><small>${esc(textoAway([...DIAS[p.id]]))} · los registros anteriores no cambian</small></span><button class="lnk" data-id="${esc(p.id)}" onclick="delete DIAS[this.dataset.id];render()">Descartar</button><button class="bt sm" style="background:${c};color:${textoSobre(c)}" data-id="${esc(p.id)}" onclick="guardarDias(this.dataset.id)">Guardar</button></div>`;
  b.hidden = false;
}
function guardarDias(pid) {
  const p = persona(pid), s = DIAS[pid]; if (!p || !s) return;
  putItem('people', { id: pid, home: normalizarDias([...s]) }); delete DIAS[pid]; render(); toast(`Días en casa de ${p.name} guardados`);
}
function editorPersona(id) {
  const o = id ? persona(id) : null, st = { color: o ? colorValido(o.color) : PALETA[0], photo: o ? o.photo : null };
  const w = hoja(o ? 'Editar persona' : 'Nueva persona', `
    <div class="avedit"><span id="pav"></span><div id="pcrop" class="cropw" hidden></div><div class="bar" id="pbar"><label class="lnk fl"><span id="pfl"></span><input type="file" id="pf" accept="image/*"></label><button class="lnk" id="pa" hidden>Ajustar</button><button class="lnk rojo" id="pq" hidden>Quitar</button></div></div>
    <div class="grp"><div class="row"><input id="pn" class="plain" placeholder="Nombre" maxlength="24" autocapitalize="words" value="${esc(o ? o.name : '')}"></div><div class="row"><input id="pe" class="plain" placeholder="Emoji (opcional)" value="${esc(o ? o.emoji : '')}"></div></div><div class="gf">Si no hay foto ni emoji, se muestra la inicial sobre su color.</div>
    <div class="gh">Color</div><div class="grp"><div class="row sw">${PALETA.map(c => `<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div><div class="row"><span class="tx">Otro color</span><input type="color" id="pc" value="${st.color}"></div></div>
    ${o ? `<div class="grp"><button class="row rojo" id="pdel" ${S.people.length <= 1 ? 'disabled' : ''}>Eliminar a ${esc(o.name)}</button></div><div class="gf">${S.people.length <= 1 ? 'Siempre tiene que haber al menos una persona.' : 'Sus registros se conservan en el historial.'}</div>` : ''}<p class="err" id="perr"></p>`, o ? 'Guardar' : 'Añadir', () => {
    const nombre = w.querySelector('#pn').value.trim().slice(0, 24);
    if (!nombre) { w.querySelector('#perr').textContent = 'Escribe un nombre.'; return false; }
    if (st.crop) st.photo = st.crop.recortar();
    const datos = { name: nombre, emoji: w.querySelector('#pe').value, color: st.color, photo: st.photo || null };
    if (o) putItem('people', Object.assign({ id: o.id }, datos));
    else { const p = Object.assign({ id: uid(), home: [0, 1, 2, 3, 4, 5, 6], order: Math.max(0, ...S.people.map(x => x.order || 0)) + 1 }, datos); putItem('people', p); if (!yo.get()) yo.set(p.id); }
    render();
  });
  const upd = () => {
    w.querySelector('#pav').innerHTML = avatar({ name: w.querySelector('#pn').value.trim() || '?', emoji: w.querySelector('#pe').value, color: st.color, photo: st.photo }, 96);
    w.querySelectorAll('.sw [data-c]').forEach(b => b.textContent = b.dataset.c === st.color ? '✓' : '');
    w.querySelectorAll('.sw [data-c]').forEach(b => b.style.color = textoSobre(b.dataset.c));
    w.querySelector('#pq').hidden = w.querySelector('#pa').hidden = !st.photo;
    w.querySelector('#pfl').textContent = st.photo ? 'Cambiar foto' : 'Añadir foto';
  };
  const ajustar = async src => {
    const caja = w.querySelector('#pcrop');
    try { st.crop = await recortador(caja, src); } catch (x) { toast('No se pudo leer la imagen'); return; }
    w.querySelector('#pav').hidden = w.querySelector('#pbar').hidden = true; caja.hidden = false;
    const fin = foto => { if (foto !== undefined) st.photo = foto; st.crop = null; caja.hidden = true; caja.innerHTML = ''; w.querySelector('#pav').hidden = w.querySelector('#pbar').hidden = false; upd(); };
    caja.querySelector('#cx').onclick = () => fin();
    caja.querySelector('#cok').onclick = () => fin(st.crop.recortar());
  };
  w.querySelector('#pn').oninput = upd;
  w.querySelector('#pe').oninput = e => { e.target.value = unGrafema(e.target.value); upd(); };
  w.querySelectorAll('.sw [data-c]').forEach(b => b.onclick = () => { st.color = b.dataset.c; w.querySelector('#pc').value = st.color; upd(); });
  w.querySelector('#pc').oninput = e => { st.color = e.target.value.toUpperCase(); upd(); };
  w.querySelector('#pq').onclick = () => { st.photo = null; upd(); };
  w.querySelector('#pf').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) ajustar(f); };
  w.querySelector('#pa').onclick = () => { if (st.photo) ajustar(st.photo); };
  if (o) w.querySelector('#pdel').onclick = async () => { closeModal(); if (S.people.length > 1 && await confirmar(`¿Eliminar a ${esc(o.name)}?`, 'Dejará de aparecer en la app. Sus registros se conservan en el historial.', 'Eliminar', 1)) { delItem('people', o.id); render(); } };
  upd();
}
/* Carga una imagen (archivo o data URL) reducida a 1200 px como mucho, para recortarla con soltura */
function cargarImagen(src) {
  return new Promise((res, rej) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src), img = new Image(), fin = () => { if (url !== src) URL.revokeObjectURL(url); };
    img.onload = () => { const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); fin(); res(c); };
    img.onerror = () => { fin(); rej(new Error('imagen')); }; img.src = url;
  });
}
/* Recortador circular: arrastrar para mover, pellizcar (o la barra) para acercar.
 * El resultado es un JPEG cuadrado de 256 px (como la app nativa) para que ocupe poco. */
async function recortador(caja, src) {
  const lienzo = await cargarImagen(src), V = 240, ZMAX = 5, w0 = lienzo.width, h0 = lienzo.height, s0 = V / Math.min(w0, h0);
  caja.innerHTML = `<div class="crop" id="cv" style="width:${V}px;height:${V}px"><img id="ci" alt="" draggable="false"></div>
    <input type="range" id="cz" min="1" max="${ZMAX}" step="0.01" value="1" aria-label="Zoom">
    <small class="mu">Arrastra para mover · pellizca o usa la barra para acercar</small>
    <div class="bar"><button class="lnk" id="cx">Cancelar</button><button class="lnk b" id="cok">Usar foto</button></div>`;
  const vp = caja.querySelector('#cv'), im = caja.querySelector('#ci'), zr = caja.querySelector('#cz');
  im.src = lienzo.toDataURL('image/jpeg', 0.9);
  let z = 1, ox = 0, oy = 0;
  const esc_ = () => s0 * z;
  const pinta = () => {
    const k = esc_(), W = w0 * k, H = h0 * k;
    ox = Math.min(0, Math.max(V - W, ox)); oy = Math.min(0, Math.max(V - H, oy));
    im.style.width = W + 'px'; im.style.height = H + 'px'; im.style.transform = `translate(${ox}px,${oy}px)`; zr.value = z;
  };
  const zoomEn = (nz, px, py) => { nz = Math.min(ZMAX, Math.max(1, nz)); const k = esc_(), ix = (px - ox) / k, iy = (py - oy) / k; z = nz; ox = px - ix * esc_(); oy = py - iy * esc_(); pinta(); };
  ox = (V - w0 * s0) / 2; oy = (V - h0 * s0) / 2; pinta();
  zr.oninput = () => zoomEn(+zr.value, V / 2, V / 2);
  const dedos = new Map(); let prev = null;
  const estado = () => { const p = [...dedos.values()], r = vp.getBoundingClientRect(); if (!p.length) return null; const mx = p.reduce((a, q) => a + q.x, 0) / p.length - r.left, my = p.reduce((a, q) => a + q.y, 0) / p.length - r.top; return { mx, my, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0, n: p.length }; };
  vp.addEventListener('pointerdown', e => { e.preventDefault(); try { vp.setPointerCapture(e.pointerId); } catch (x) {} dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); prev = estado(); });
  vp.addEventListener('pointermove', e => {
    if (!dedos.has(e.pointerId)) return; dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = estado(); if (!a || !prev || a.n !== prev.n) { prev = a; return; }
    ox += a.mx - prev.mx; oy += a.my - prev.my;
    if (a.n > 1 && prev.d > 0) zoomEn(z * a.d / prev.d, a.mx, a.my); else pinta();
    prev = a;
  });
  const suelta = e => { dedos.delete(e.pointerId); prev = estado(); };
  vp.addEventListener('pointerup', suelta); vp.addEventListener('pointercancel', suelta);
  vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomEn(z * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  vp.addEventListener('gesturestart', e => e.preventDefault());
  return {
    recortar() {
      const k = esc_(), c = document.createElement('canvas'); c.width = c.height = 256;
      c.getContext('2d').drawImage(lienzo, -ox / k, -oy / k, V / k, V / k, 0, 0, 256, 256);
      return c.toDataURL('image/jpeg', 0.8);
    },
  };
}
const SQL_EXPORT = "select json_build_object('people', (select coalesce(json_agg(p), '[]') from people p), 'tasks', (select coalesce(json_agg(t), '[]') from tasks t), 'log', (select coalesce(json_agg(l), '[]') from log l), 'rewards', (select coalesce(json_agg(r), '[]') from rewards r), 'claims', (select coalesce(json_agg(c), '[]') from claims c)) as datos;";
function importarNativa() {
  const w = modal(`<h3>Importar desde la app nativa</h3><p class="st">1. En supabase.com abre el proyecto de la app nativa → <b>SQL Editor</b> → pega esta consulta y pulsa <b>Run</b>:</p><textarea readonly class="code" id="sq">${esc(SQL_EXPORT)}</textarea><button class="bt g sm" id="cp">Copiar consulta</button>
    <p class="st">2. Pulsa sobre el resultado, cópialo y pégalo aquí (o elige un archivo .json):</p><textarea id="ij" class="code" placeholder="Pega aquí el resultado"></textarea><label class="bt g sm fl">Elegir archivo<input type="file" accept=".json,application/json,text/plain" id="ifl"></label><p class="err" id="ierr"></p>
    <div class="bar" style="justify-content:flex-end"><button class="bt g" id="ic">Cancelar</button><button class="bt" id="io">Importar</button></div>`);
  w.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(SQL_EXPORT); toast('Consulta copiada'); } catch (e) { w.querySelector('#sq').select(); } };
  w.querySelector('#ifl').onchange = async e => { const f = e.target.files[0]; if (f) w.querySelector('#ij').value = await f.text(); };
  w.querySelector('#ic').onclick = closeModal;
  w.querySelector('#io').onclick = async () => {
    let d; try { d = normalizarImport(w.querySelector('#ij').value.trim()); } catch (e) { w.querySelector('#ierr').textContent = 'No se ha podido leer: ' + (e.message || 'formato no válido'); return; }
    closeModal();
    const how = await askChoice('Importar datos', `Se han encontrado ${d.people.length} personas, ${d.tasks.length} tareas, ${d.log.length} registros, ${d.rewards.length} recompensas y ${d.claims.length} reclamadas.`, [{ label: 'Cancelar', cls: 'g', v: null }, { label: 'Unir con lo actual', cls: 't', v: 'merge' }, { label: 'Reemplazar lo actual', cls: 'd', v: 'replace' }]);
    if (!how) return;
    const now = Date.now(); ['people', 'tasks', 'log', 'rewards', 'claims'].forEach(k => d[k].forEach(x => x.u = now));
    if (how === 'replace') { S = Object.assign(blank(), d, { del: Object.assign({}, S.del), seeded: 1 }); }
    else { S = merge(S, Object.assign(blank(), d, { seeded: 1 })); }
    save(); render(); toast('Datos importados');
  };
}
