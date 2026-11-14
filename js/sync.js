/* Guardado local cifrado y sincronización cifrada con el hogar. Compartido por Gastos y Tareas.
 * Cada app define un objeto APP con:
 *   stateKey      clave en IndexedDB de su estado local
 *   ownDoc(id)    qué documentos del hogar son suyos (Gastos: los que no empiezan por «t-»)
 *   afterSync()   opcional: se llama tras cada sincronización correcta
 *   goSettings()  abre sus ajustes
 * y las funciones globales blank(), rebase(), stamp(), merge(), docsOf(), fromDocs() y render(). */
const DEV = { d: null, key: null, sm: { revs: {}, pushed: {} } };
let persistT = null;
async function persistNow() {
  clearTimeout(persistT); persistT = null;
  if (!DEV.key) return;
  try { await IDB.set(APP.stateKey, await CR.encrypt(DEV.key, { S, sm: DEV.sm })); }
  catch (e) { console.error(e); toast('No se pudo guardar en el dispositivo'); }
}
function save() {
  stamp();
  clearTimeout(persistT); persistT = setTimeout(persistNow, 250);
  SYNC.schedule(1500);
}
async function loadState() {
  const e = await IDB.get(APP.stateKey);
  if (!e) { S = blank(); DEV.sm = { revs: {}, pushed: {} }; rebase(); return; }
  let o;
  try { o = await CR.decrypt(DEV.key, e.iv, e.data); }
  catch (err) {
    // La clave cambió desde la otra app (nueva contraseña del hogar): se vuelve a descargar todo del hogar.
    if (DEV.d && DEV.d.mode === 'sync') { S = blank(); DEV.sm = { revs: {}, pushed: {} }; rebase(); return; }
    throw err;
  }
  S = Object.assign(blank(), o.S); DEV.sm = o.sm || { revs: {}, pushed: {} }; rebase();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && persistT) persistNow(); });

/* ───── Sincronización con Supabase (solo datos cifrados) ───── */
const SYNC = (() => {
  let sb = null, busy = false, again = false, t = null, status = 'local', lastSeen = 0, pendRender = false;
  const cfg = window.GASTOS_CONFIG || {};
  const configured = () => !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !/TU_/.test(cfg.supabaseUrl + cfg.supabaseAnonKey));
  const client = () => {
    if (!sb && configured() && window.supabase) sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gastos-auth' } });
    return sb;
  };
  const on = () => DEV.d && DEV.d.mode === 'sync' && client();
  const setSt = s => { status = s; const e = document.getElementById('syncst'); if (e) e.outerHTML = syncBadge(); };
  const schedule = ms => { if (!on()) return; clearTimeout(t); t = setTimeout(run, ms || 0); };

  async function pushDoc(k, obj) {
    const hh = DEV.d.hh.id, kv = DEV.d.hh.key_version, e = await CR.encrypt(DEV.key, obj), rev = DEV.sm.revs[k];
    if (rev == null) {
      const { error } = await sb.from('docs').insert({ household_id: hh, doc_id: k, rev: 1, key_version: kv, iv: e.iv, data: e.data });
      if (error) { if (error.code === '23505') return 'conflict'; throw error; }
      DEV.sm.revs[k] = 1;
    } else {
      const { data, error } = await sb.from('docs').update({ rev: rev + 1, key_version: kv, iv: e.iv, data: e.data })
        .eq('household_id', hh).eq('doc_id', k).eq('rev', rev).select('rev');
      if (error) throw error;
      if (!data || !data.length) return 'conflict';
      DEV.sm.revs[k] = rev + 1;
    }
    return 'ok';
  }

  async function run() {
    if (!on()) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setSt('off'); return; }
    busy = true; setSt('busy');
    let changed = false;
    try {
      const { data: ses } = await sb.auth.getSession();
      if (!ses || !ses.session) throw { code: 'auth' };
      const hh = DEV.d.hh.id;
      for (let round = 0; round < 4; round++) {
        const { data: all, error } = await sb.from('docs').select('doc_id,rev,key_version').eq('household_id', hh);
        if (error) throw error;
        const list = all.filter(d => APP.ownDoc(d.doc_id));
        if (list.some(d => d.key_version > DEV.d.hh.key_version)) throw { code: 'rekey' };
        const stale = list.filter(d => DEV.sm.revs[d.doc_id] !== d.rev).map(d => d.doc_id);
        if (stale.length) {
          const { data: rows, error: e2 } = await sb.from('docs').select('doc_id,rev,iv,data,key_version').eq('household_id', hh).in('doc_id', stale);
          if (e2) throw e2;
          const part = {};
          for (const r of rows) {
            if (r.key_version !== DEV.d.hh.key_version) throw { code: 'rekey' };
            part[r.doc_id] = await CR.decrypt(DEV.key, r.iv, r.data);
            DEV.sm.revs[r.doc_id] = r.rev; DEV.sm.pushed[r.doc_id] = sj(part[r.doc_id]);
          }
          const before = sj(docsOf(S));
          S = merge(S, fromDocs(part)); rebase();
          if (sj(docsOf(S)) !== before) changed = true;
        }
        const d = docsOf(S, DEV.sm.revs); let conflict = false;
        for (const k of Object.keys(d)) {
          const j = sj(d[k]); if (DEV.sm.pushed[k] === j) continue;
          if (await pushDoc(k, d[k]) === 'conflict') { conflict = true; break; }
          DEV.sm.pushed[k] = j;
        }
        if (!conflict) break;
      }
      // ¿se ha revocado este dispositivo desde otro?
      if (DEV.d.deviceId) {
        const { data: dv, error: e3 } = await sb.from('devices').select('revoked').eq('id', DEV.d.deviceId).maybeSingle();
        if (!e3 && (!dv || dv.revoked)) { await wipeDevice('Este dispositivo se ha desvinculado del hogar. Sus datos se han borrado.'); return; }
        if (Date.now() - lastSeen > 36e5) { lastSeen = Date.now(); sb.from('devices').update({ last_seen: new Date().toISOString() }).eq('id', DEV.d.deviceId).then(() => {}); }
      }
      await persistNow();
      setSt('ok');
      if (APP.afterSync) APP.afterSync();
      if (changed) safeRender();
    } catch (e) {
      console.warn('sync', e);
      if (e && e.code === 'rekey') { setSt('rekey'); showRekey(); }
      else if (e && (e.code === 'auth' || e.status === 401 || /JWT|token/i.test(e.message||''))) setSt('auth');
      else { setSt('err'); setTimeout(() => schedule(0), 20000); }
    }
    busy = false;
    if (again) { again = false; schedule(500); }
  }
  function safeRender() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { if (!pendRender) { pendRender = true; a.addEventListener('blur', () => { pendRender = false; setTimeout(safeRender, 50); }, { once: true }); } return; }
    if (typeof render === 'function' && !document.getElementById('cpp')) render();
  }
  setInterval(() => { if (!document.hidden) schedule(0); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(300); });
  window.addEventListener('online', () => schedule(300));
  return { client, configured, schedule, run, get status() { return status; }, set status(v) { setSt(v); } };
})();

function syncBadge() {
  const st = DEV.d && DEV.d.mode === 'sync' ? SYNC.status : 'local';
  const M = { local: ['', 'Guardado solo en este dispositivo (cifrado)'], ok: ['', 'Sincronizado con el hogar (cifrado)'], busy: ['w', 'Sincronizando…'], off: ['w', 'Sin conexión: se sincronizará al volver'], err: ['e', 'Error de sincronización: se reintentará'], auth: ['e', 'Inicia sesión de nuevo para sincronizar'], rekey: ['e', 'La contraseña del hogar ha cambiado'] }[st] || ['', ''];
  return `<div id="syncst" class="sync ${M[0]}"${st === 'auth' ? ' onclick="APP.goSettings()" style="cursor:pointer"' : ''}><i></i>${M[1]}</div>`;
}
