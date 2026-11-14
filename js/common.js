/* Utilidades compartidas por las apps del hogar (Gastos y Tareas). */
/* Fecha de hoy «YYYY-MM-DD» en la hora local del dispositivo (no en UTC). */
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join('');
const dc = o => JSON.parse(JSON.stringify(o));
const sj = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
const noU = x => JSON.stringify(x, (k, v) => k === 'u' ? undefined : v);
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const toast = (m, ms) => { const e = $('#ts'); if (!e) return; e.textContent = m; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms || 3500); };

/* Une dos listas de elementos {id, u}: gana la versión más reciente y se respetan los borrados. */
function mergeList(a, b, del) {
  const m = new Map();
  (a||[]).forEach(x => m.set(x.id, x));
  (b||[]).forEach(y => { const x = m.get(y.id); if (!x || (y.u||0) > (x.u||0)) m.set(y.id, y); });
  return [...m.values()].filter(x => !(del[x.id] && del[x.id] >= (x.u||0)));
}

/* ───── Ventanas modales sencillas ───── */
function modal(html, onClose) {
  closeModal(); const w = document.createElement('div'); w.className = 'mdw'; w.id = 'mdw';
  w.innerHTML = `<div class="md" role="dialog" aria-modal="true">${html}</div>`;
  w.addEventListener('mousedown', e => { if (e.target === w) { closeModal(); onClose && onClose(); } });
  document.body.appendChild(w); const f = w.querySelector('input,textarea,button'); if (f) setTimeout(() => f.focus(), 30); return w;
}
const closeModal = () => { const w = $('#mdw'); if (w) w.remove(); };
function askText(title, o) {
  o = o || {};
  return new Promise(res => {
    const w = modal(`<h3>${esc(title)}</h3>${o.text ? `<p class="st">${o.text}</p>` : ''}<input id="mq" class="w" type="${o.pw ? 'password' : 'text'}" autocomplete="${o.pw ? (o.newpw ? 'new-password' : 'current-password') : 'off'}" placeholder="${esc(o.ph||'')}">${o.confirm ? '<input id="mq2" class="w" type="password" autocomplete="new-password" placeholder="Repítela" style="margin-top:8px">' : ''}<p class="st" id="mqe"></p><div class="bar" style="justify-content:flex-end"><button class="bt g" id="mqc">Cancelar</button><button class="bt" id="mqo">${esc(o.ok||'Aceptar')}</button></div>`, () => res(null));
    const ok = () => { const v = w.querySelector('#mq').value;
      if (o.min && v.length < o.min) return w.querySelector('#mqe').textContent = 'Mínimo ' + o.min + ' caracteres.';
      if (o.confirm && v !== w.querySelector('#mq2').value) return w.querySelector('#mqe').textContent = 'Las contraseñas no coinciden.';
      closeModal(); res(v); };
    w.querySelector('#mqo').onclick = ok; w.querySelector('#mqc').onclick = () => { closeModal(); res(null); };
    w.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); }));
  });
}
function askChoice(title, text, opts) {
  return new Promise(res => {
    const w = modal(`<h3>${esc(title)}</h3><p class="st">${text}</p><div class="bar" style="justify-content:flex-end">${opts.map((o, i) => `<button class="bt ${o.cls||''}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`, () => res(null));
    w.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { closeModal(); res(opts[+b.dataset.i].v); });
  });
}
async function downloadFile(name, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  try { const f = new File([blob], name, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

