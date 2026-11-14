/* Primer arranque, hogar compartido, invitaciones, dispositivos y bloqueo con Face ID.
 * Compartido por Gastos y Tareas. Cada app define en APP: name, desc, start(), clear(),
 * refreshSettings() y, opcionalmente, afterRelogin(). */
const ERR = e => {
  const m = (e && (e.message || e.error_description || e.code)) || String(e);
  if (/invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Aún no has confirmado tu email. Revisa tu correo (y la carpeta de spam).';
  if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese email. Inicia sesión.';
  if (/invalid_invite/i.test(m)) return 'El código de invitación no es válido, ya se ha usado o ha caducado.';
  if (/password should be/i.test(m)) return 'La contraseña de la cuenta debe tener al menos 8 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión con el servidor.';
  return m;
};
const devName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'PC' : 'Dispositivo'; };
const setupBox = html => { document.body.classList.add('setup'); $('#app').hidden = true; const s = $('#setup'); s.hidden = false; s.innerHTML = `<div class="sbox"><div class="slogo"><img src="icons/icon-180.png" alt=""></div>${html}</div>`; const f = s.querySelector('input'); if (f) f.focus(); };
const setupMsg = (t, err) => { const e = $('#smsg'); if (e) { e.textContent = t; e.className = 'st' + (err ? ' err' : ''); } };
const busyBtn = (id, on, label) => { const b = document.getElementById(id); if (b) { b.disabled = on; if (label) b.textContent = label; } };

async function saveDev() { await IDB.set('device', DEV.d); }
async function startApp() {
  document.body.classList.remove('setup'); $('#setup').hidden = true; $('#app').hidden = false;
  await loadState(); APP.start(); SYNC.schedule(200);
}

/* ───── Bienvenida ───── */
function welcome() {
  const ok = SYNC.configured();
  setupBox(`<h1>${esc(APP.name)}</h1><p class="st">${APP.desc} se guardan <b>cifrados</b>. Nadie más puede leerlos: ni el servidor ni quien publica la app.</p>
  ${ok ? `<button class="bt w" onclick="authStep('create')">Crear un hogar</button><p class="st">Para compartir los datos con tu pareja o familia. Se sincroniza entre vuestros dispositivos.</p>
  <button class="bt t w" onclick="authStep('join')">Entrar en un hogar que ya existe</button><p class="st">Si te han invitado, o si ya eres miembro (por ejemplo, porque usas la otra app del hogar).</p>` : ''}
  <button class="bt g w" onclick="localSetup()">Usar solo en este dispositivo</button><p class="st">Sin cuenta y sin sincronizar. Podrás pasarte a un hogar más adelante.</p>`);
}
async function localSetup() {
  DEV.key = await CR.randomKey();
  DEV.d = { mode: 'local', key: DEV.key, created: Date.now() };
  await saveDev(); S = blank(); rebase(); await persistNow(); await offerLock();
  startApp();
}

/* ───── Cuenta (email + contraseña) ───── */
let AUTH_NEXT = 'create', AUTH_UP = true;
async function authStep(next) {
  AUTH_NEXT = next || AUTH_NEXT;
  const sb = SYNC.client(); const { data } = await sb.auth.getSession();
  if (data && data.session) return AUTH_NEXT === 'create' ? createStep() : joinStep();
  setupBox(`<h2>${AUTH_UP ? 'Crea tu cuenta' : 'Inicia sesión'}</h2><p class="st">La cuenta sirve para sincronizar. Los datos se cifran aparte con la contraseña del hogar.</p>
  <input id="ae" class="w" type="email" autocomplete="email" placeholder="Email">
  <input id="ap" class="w" type="password" autocomplete="${AUTH_UP ? 'new-password' : 'current-password'}" placeholder="Contraseña de la cuenta (mín. 8)">
  <button class="bt w" id="ab1" onclick="doAuth()">${AUTH_UP ? 'Crear cuenta' : 'Entrar'}</button>
  <p id="smsg" class="st"></p>
  <button class="bt g w" onclick="AUTH_UP=!AUTH_UP;authStep()">${AUTH_UP ? 'Ya tengo cuenta: iniciar sesión' : 'No tengo cuenta: crearla'}</button>
  ${!AUTH_UP ? '<button class="bt g w" onclick="resetPw()">He olvidado la contraseña de la cuenta</button>' : ''}
  <button class="bt g w" onclick="welcome()">Atrás</button>`);
  document.getElementById('ap').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
}
async function doAuth() {
  const sb = SYNC.client(), email = $('#ae').value.trim(), password = $('#ap').value;
  if (!email || password.length < 8) return setupMsg('Escribe tu email y una contraseña de al menos 8 caracteres.', 1);
  busyBtn('ab1', true);
  try {
    if (AUTH_UP) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) { busyBtn('ab1', false); AUTH_UP = false; return setupBox(`<h2>Revisa tu correo</h2><p class="st">Te hemos enviado un enlace a <b>${esc(email)}</b>. Ábrelo para confirmar la cuenta y después vuelve aquí e inicia sesión.</p><button class="bt w" onclick="authStep()">Iniciar sesión</button>`); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
    }
    AUTH_NEXT === 'create' ? createStep() : joinStep();
  } catch (e) { setupMsg(ERR(e), 1); busyBtn('ab1', false); }
}
async function resetPw() {
  const email = $('#ae').value.trim(); if (!email) return setupMsg('Escribe tu email arriba.', 1);
  const { error } = await SYNC.client().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  setupMsg(error ? ERR(error) : 'Si el email existe, recibirás un enlace para cambiar la contraseña.', !!error);
}

/* ───── Crear hogar ───── */
function createStep() {
  setupBox(`<h2>Nuevo hogar</h2>
  <input id="hn" class="w" placeholder="Nombre del hogar (p. ej. Casa)" maxlength="60">
  <p class="st">La <b>contraseña del hogar</b> cifra todos los datos. Compártela solo en persona con quien vaya a usar la app. <b>Si la olvidáis, los datos no se pueden recuperar</b>: guárdala en el llavero o en un gestor de contraseñas.</p>
  <input id="hp" class="w" type="password" autocomplete="new-password" placeholder="Contraseña del hogar (mín. 10)">
  <input id="hp2" class="w" type="password" autocomplete="new-password" placeholder="Repite la contraseña del hogar">
  <input id="dn" class="w" placeholder="Nombre de este dispositivo" value="${esc(devName() + ' · ' + APP.name)}" maxlength="80">
  <label class="st"><input type="checkbox" id="hkeep" checked> Traer los datos que ya hay en este dispositivo</label>
  <button class="bt w" id="hb" onclick="doCreate()">Crear hogar</button><p id="smsg" class="st"></p>
  <button class="bt g w" onclick="signOutSetup()">Usar otra cuenta</button>`);
}
async function doCreate() {
  const name = $('#hn').value.trim(), pw = $('#hp').value, keep = $('#hkeep').checked;
  if (!name) return setupMsg('Pon un nombre al hogar.', 1);
  if (pw.length < 10) return setupMsg('La contraseña del hogar debe tener al menos 10 caracteres.', 1);
  if (pw !== $('#hp2').value) return setupMsg('Las contraseñas del hogar no coinciden.', 1);
  busyBtn('hb', true, 'Creando… (tarda unos segundos)');
  try {
    const sb = SYNC.client(), salt = CR.newSalt(), key = await CR.deriveKey(pw, salt), verifier = await CR.makeVerifier(key);
    const { data: hid, error } = await sb.rpc('create_household', { p_name: name, p_salt: salt, p_verifier: verifier, p_iter: CR.ITER });
    if (error) throw error;
    let prev = null;
    if (keep && DEV.key) { try { await loadState(); prev = S; } catch (e) {} }
    DEV.key = key;
    DEV.d = { mode: 'sync', key, hh: { id: hid, name, key_version: 1 }, created: Date.now() };
    await registerDevice($('#dn').value.trim() || devName());
    S = prev || blank(); DEV.sm = { revs: {}, pushed: {} }; rebase(); stamp();
    await saveDev(); await persistNow(); await offerLock();
    startApp();
  } catch (e) { setupMsg(ERR(e), 1); busyBtn('hb', false, 'Crear hogar'); }
}
async function registerDevice(name) {
  const { data, error } = await SYNC.client().from('devices').insert({ household_id: DEV.d.hh.id, name }).select('id').single();
  if (error) throw error; DEV.d.deviceId = data.id; DEV.d.deviceName = name;
}

/* ───── Unirse a un hogar ───── */
let JOIN = null;
let MINE = [];
async function joinStep() {
  MINE = [];
  try { const { data } = await SYNC.client().from('households').select('id,name,salt,verifier,kdf_iter,key_version').order('created_at'); MINE = data || []; } catch (e) {}
  setupBox(`<h2>Entrar en un hogar</h2>${MINE.length ? `<p class="st">Hogares de los que ya eres miembro:</p>${MINE.map((h, i) => `<button class="bt t w" onclick="JOIN=MINE[${i}];hhPwStep()">${esc(h.name)}</button>`).join('')}<p class="st" style="margin-top:12px">¿Te han invitado a otro? Escribe el código:</p>` : '<p class="st">Escribe el código que te han dado (caduca a los 7 días y solo vale una vez).</p>'}
  <input id="jc" class="w" placeholder="Código de invitación" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.1em">
  <button class="bt w" id="jb" onclick="doJoin()">Continuar</button><p id="smsg" class="st"></p>
  <button class="bt g w" onclick="signOutSetup()">Usar otra cuenta</button>`);
}
async function doJoin() {
  const code = $('#jc').value.replace(/[\s-]/g, '').toUpperCase(); if (code.length < 8) return setupMsg('Revisa el código.', 1);
  busyBtn('jb', true);
  try {
    const { data, error } = await SYNC.client().rpc('join_household', { p_code: code });
    if (error) throw error; if (!data || !data[0]) throw { message: 'invalid_invite' };
    JOIN = data[0]; hhPwStep();
  } catch (e) { setupMsg(ERR(e), 1); busyBtn('jb', false); }
}
function hhPwStep(rekey) {
  const h = JOIN;
  setupBox(`<h2>${rekey ? 'La contraseña del hogar ha cambiado' : 'Hogar «' + esc(h.name) + '»'}</h2><p class="st">${rekey ? 'Alguien del hogar ha cambiado la contraseña. Escribe la nueva para seguir sincronizando.' : 'Escribe la contraseña del hogar. Te la tiene que decir quien lo creó.'}</p>
  <input id="hp" class="w" type="password" autocomplete="current-password" placeholder="Contraseña del hogar">
  ${rekey ? '' : `<input id="dn" class="w" placeholder="Nombre de este dispositivo" value="${esc(devName() + ' · ' + APP.name)}" maxlength="80">`}
  <button class="bt w" id="hb" onclick="doHhPw(${rekey ? 1 : 0})">Desbloquear</button><p id="smsg" class="st"></p>
  ${rekey ? '<button class="bt g w" onclick="wipeAsk()">Borrar los datos de este dispositivo</button>' : ''}`);
  document.getElementById('hp').addEventListener('keydown', e => { if (e.key === 'Enter') doHhPw(rekey); });
}
async function doHhPw(rekey) {
  const h = JOIN, pw = $('#hp').value; busyBtn('hb', true, 'Comprobando…');
  try {
    const key = await CR.deriveKey(pw, h.salt, h.kdf_iter);
    if (!(await CR.checkVerifier(key, h.verifier))) { busyBtn('hb', false, 'Desbloquear'); return setupMsg('Contraseña incorrecta.', 1); }
    if (rekey) {
      try { await loadState(); } catch (e) {}
      DEV.key = key; DEV.d.key = key; DEV.d.hh.key_version = h.key_version; DEV.sm = { revs: {}, pushed: {} };
      await saveDev(); await persistNow(); return startApp();
    }
    DEV.key = key;
    DEV.d = { mode: 'sync', key, hh: { id: h.id, name: h.name, key_version: h.key_version }, created: Date.now() };
    await registerDevice(($('#dn') && $('#dn').value.trim()) || devName());
    S = blank(); S.catsU = 0; S.cfgU = 0; DEV.sm = { revs: {}, pushed: {} }; rebase();
    await saveDev(); await persistNow(); await offerLock();
    startApp();
  } catch (e) { setupMsg(ERR(e), 1); busyBtn('hb', false, 'Desbloquear'); }
}
async function showRekey() {
  try {
    const { data, error } = await SYNC.client().from('households').select('id,name,salt,verifier,kdf_iter,key_version').eq('id', DEV.d.hh.id).single();
    if (error) throw error; JOIN = data; await persistNow(); hhPwStep(true);
  } catch (e) { toast('No se pudo comprobar el hogar: ' + ERR(e)); }
}
async function signOutSetup() { try { await SYNC.client().auth.signOut({ scope: 'local' }); } catch (e) {} AUTH_UP = false; authStep(); }

/* ───── Bloqueo con Face ID / Touch ID (WebAuthn) ───── */
const LOCK = {
  available: async () => !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()),
  async enable() {
    const cred = await navigator.credentials.create({ publicKey: { challenge: CR.rand(32), rp: { name: 'Gastos', id: location.hostname }, user: { id: CR.rand(16), name: APP.name + ' · ' + (DEV.d.deviceName || devName()), displayName: 'Gastos' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
    DEV.d.lock = { id: CR.b64(cred.rawId), min: (DEV.d.lock && DEV.d.lock.min) || 5 }; await saveDev();
  },
  async verify() {
    await navigator.credentials.get({ publicKey: { challenge: CR.rand(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: CR.unb64(DEV.d.lock.id) }], userVerification: 'required', timeout: 60000 } });
  },
};
async function offerLock() {
  if (!(await LOCK.available())) return;
  const r = await new Promise(res => setupBox(`<h2>¿Proteger con Face ID?</h2><p class="st">Al abrir la app se pedirá Face ID (o el código del iPhone). Así, aunque alguien tenga tu móvil desbloqueado, no podrá ver tus datos.</p><button class="bt w" id="lk1">Activar Face ID</button><button class="bt g w" id="lk0">Ahora no</button><p id="smsg" class="st"></p>`) || setTimeout(() => { $('#lk1').onclick = () => res(1); $('#lk0').onclick = () => res(0); }, 0));
  if (r) { try { await LOCK.enable(); } catch (e) { toast('No se pudo activar Face ID. Puedes hacerlo luego en Ajustes.'); } }
}
let hiddenAt = 0, locked = false;
function lockScreen() {
  locked = true; closeModal(); APP.clear();
  setupBox(`<h2>Gastos</h2><p class="st">La app está bloqueada.</p><button class="bt w" id="ulb" onclick="unlock()">Desbloquear con Face ID</button><p id="smsg" class="st"></p>`);
}
async function unlock() {
  busyBtn('ulb', true);
  try { await LOCK.verify(); locked = false; await startApp(); }
  catch (e) { busyBtn('ulb', false); setupMsg(e && e.name === 'NotAllowedError' ? 'Cancelado. Vuelve a intentarlo.' : 'No se pudo verificar: ' + (e.message || e.name), 1); }
}
document.addEventListener('visibilitychange', () => {
  if (!DEV.d || !DEV.d.lock) return;
  if (document.hidden) hiddenAt = Date.now();
  else if (!locked && hiddenAt && Date.now() - hiddenAt > DEV.d.lock.min * 60000) lockScreen();
});

/* ───── Tarjeta de seguridad en Ajustes ───── */
function secCard() {
  const d = DEV.d || {}, sync = d.mode === 'sync';
  return `<div class="cd" id="sec"><h3>Seguridad y sincronización</h3>
  ${sync ? `<p>Hogar <b>${esc(d.hh.name)}</b> · este dispositivo: <b>${esc(d.deviceName || devName())}</b></p>` : `<p>Modo <b>solo este dispositivo</b>. Los datos están cifrados aquí y no se sincronizan.</p>`}
  <div class="row"><label class="st" style="margin:0"><input type="checkbox" id="lkc" ${d.lock ? 'checked' : ''} onchange="toggleLock(this.checked)"> Pedir Face ID al abrir</label>${d.lock ? `<label class="st" style="margin:0">bloquear tras <select onchange="DEV.d.lock.min=+this.value;saveDev()">${[1, 5, 15, 60].map(n => `<option value="${n}"${d.lock.min === n ? ' selected' : ''}>${n} min</option>`).join('')}</select> en segundo plano</label>` : ''}</div>
  ${sync ? `<div id="secx"><p class="st">Cargando miembros y dispositivos…</p></div>
  <div class="bar"><button class="bt t" onclick="newInvite()">Invitar a alguien</button><button class="bt g" onclick="changeHhPw()">Cambiar contraseña del hogar</button><button class="bt g" onclick="signOutAll()">Cerrar sesión en todos los dispositivos</button></div>`
  : (SYNC.configured() ? `<div class="bar"><button class="bt t" onclick="AUTH_UP=true;authStep('create')">Crear un hogar con estos datos</button><button class="bt g" onclick="AUTH_UP=false;authStep('join')">Unirme a un hogar</button></div><p class="st">Al unirte a un hogar existente, los datos de este dispositivo se sustituyen por los del hogar (exporta antes una copia si los quieres).</p>` : '')}
  <div class="bar"><button class="bt d" onclick="wipeAsk()">Borrar los datos de este dispositivo</button></div></div>`;
}
async function secLoad() {
  const e = $('#secx'); if (!e || !DEV.d || DEV.d.mode !== 'sync') return;
  const sb = SYNC.client(); const { data: ses } = await sb.auth.getSession();
  if (!ses || !ses.session) { e.innerHTML = `<p class="st err">Tu sesión ha caducado: los cambios se guardan en el dispositivo pero no se sincronizan.</p><button class="bt" onclick="relogin()">Iniciar sesión de nuevo</button>`; return; }
  const [mb, dv] = await Promise.all([sb.from('members').select('user_id,email,role').eq('household_id', DEV.d.hh.id), sb.from('devices').select('id,name,user_id,created_at,last_seen,revoked').eq('household_id', DEV.d.hh.id).order('created_at')]);
  if (mb.error || dv.error) { e.innerHTML = '<p class="st">No se pudo cargar la información del hogar.</p>'; return; }
  const fmt = s => new Date(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  e.innerHTML = `<p class="st" style="margin-bottom:4px"><b>Miembros</b></p>${mb.data.map(m => `<div class="row" style="margin:0 0 4px">${esc(m.email || 'Miembro')} <small>${m.role === 'owner' ? '· creador' : ''}${m.user_id === ses.session.user.id ? ' · tú' : ''}</small></div>`).join('')}
  <p class="st" style="margin:12px 0 4px"><b>Dispositivos registrados</b></p>${dv.data.filter(x => !x.revoked).map(x => `<div class="row" style="margin:0 0 6px"><span style="flex:1">${esc(x.name || 'Dispositivo')} <small>· desde ${fmt(x.created_at)} · visto ${fmt(x.last_seen)}${x.id === DEV.d.deviceId ? ' · este' : ''}</small></span>${x.id === DEV.d.deviceId ? '' : `<button class="bt d" onclick="revokeDev('${x.id}')">Desvincular</button>`}</div>`).join('')}
  <p class="st">Si pierdes un móvil: desvincúlalo aquí, cierra sesión en todos los dispositivos y cambia la contraseña del hogar.</p>`;
}
async function relogin() { AUTH_UP = false; AUTH_NEXT = 'relogin'; const sb = SYNC.client();
  setupBox(`<h2>Iniciar sesión</h2><input id="ae" class="w" type="email" autocomplete="email" placeholder="Email"><input id="ap" class="w" type="password" autocomplete="current-password" placeholder="Contraseña de la cuenta"><button class="bt w" id="ab1" onclick="doRelogin()">Entrar</button><p id="smsg" class="st"></p><button class="bt g w" onclick="startApp()">Cancelar</button>`); }
async function doRelogin() { busyBtn('ab1', true); const { error } = await SYNC.client().auth.signInWithPassword({ email: $('#ae').value.trim(), password: $('#ap').value }); if (error) { busyBtn('ab1', false); return setupMsg(ERR(error), 1); } if (APP.afterRelogin) APP.afterRelogin(); startApp(); }
async function toggleLock(on) {
  if (on) { try { await LOCK.enable(); toast('Face ID activado'); } catch (e) { toast('No se pudo activar: ' + (e.message || e.name)); } }
  else { delete DEV.d.lock; await saveDev(); }
  APP.refreshSettings();
}
async function newInvite() {
  const code = CR.code(10), sb = SYNC.client();
  const { error } = await sb.from('invites').insert({ code, household_id: DEV.d.hh.id });
  if (error) return toast('No se pudo crear la invitación: ' + ERR(error));
  const pretty = code.slice(0, 5) + '-' + code.slice(5), url = location.origin + location.pathname;
  const w = modal(`<h3>Invitación al hogar</h3><p class="st">Código (válido 7 días, un solo uso):</p><p style="font:700 26px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-align:center;margin:8px 0 14px">${pretty}</p><p class="st">La otra persona debe: 1) abrir <b>${esc(url)}</b> en Safari y añadirla a la pantalla de inicio; 2) elegir «Unirme a un hogar» y crear su cuenta; 3) escribir este código y la <b>contraseña del hogar</b>.<br><br><b>No envíes la contraseña del hogar por el mismo mensaje que el código.</b> Mejor díselo en persona.</p><div class="bar" style="justify-content:flex-end">${navigator.share ? '<button class="bt t" id="shi">Compartir código</button>' : ''}<button class="bt" onclick="closeModal();APP.refreshSettings()">Hecho</button></div>`);
  const b = w.querySelector('#shi'); if (b) b.onclick = () => navigator.share({ text: `Te invito a la app de gastos de nuestro hogar.\nAbre ${url} en Safari, añádela a la pantalla de inicio y elige «Unirme a un hogar».\nCódigo: ${pretty}` }).catch(() => {});
}
async function revokeDev(id) {
  const ok = await askChoice('Desvincular dispositivo', 'Ese dispositivo dejará de sincronizar y borrará sus datos la próxima vez que se conecte. Si lo has perdido, cambia también la contraseña del hogar.', [{ label: 'Cancelar', cls: 'g', v: 0 }, { label: 'Desvincular', cls: 'd', v: 1 }]);
  if (!ok) return; const { error } = await SYNC.client().from('devices').update({ revoked: true }).eq('id', id);
  toast(error ? 'No se pudo desvincular: ' + ERR(error) : 'Dispositivo desvinculado'); secLoad();
}
async function signOutAll() {
  const ok = await askChoice('Cerrar sesión en todos', 'Se cerrará la sesión de tu cuenta en todos tus dispositivos (incluido este). Los datos siguen en cada dispositivo y se sincronizarán al volver a iniciar sesión.', [{ label: 'Cancelar', cls: 'g', v: 0 }, { label: 'Cerrar sesión', cls: 'd', v: 1 }]);
  if (!ok) return; await SYNC.client().auth.signOut({ scope: 'global' }); SYNC.status = 'auth'; toast('Sesión cerrada en todos los dispositivos'); APP.refreshSettings();
}
async function changeHhPw() {
  const pw = await askText('Nueva contraseña del hogar', { pw: 1, newpw: 1, confirm: 1, min: 10, ok: 'Cambiar', text: 'Se volverán a cifrar todos los datos del hogar (Gastos y Tareas). Los demás dispositivos tendrán que escribir la nueva contraseña. Si la olvidáis, los datos no se pueden recuperar.' });
  if (!pw) return;
  toast('Volviendo a cifrar los datos…', 10000);
  try {
    await SYNC.run();
    if (SYNC.status !== 'ok') throw { message: 'Primero hay que sincronizar. Comprueba la conexión.' };
    const sb = SYNC.client(), hh = DEV.d.hh, salt = CR.newSalt(), key = await CR.deriveKey(pw, salt), verifier = await CR.makeVerifier(key), kv = hh.key_version + 1;
    // Se vuelven a cifrar TODOS los documentos del hogar (los de las dos apps)
    const { data: old, error: e0 } = await sb.from('docs').select('doc_id,rev,iv,data').eq('household_id', hh.id); if (e0) throw e0;
    const rows = [];
    for (const r of old) { const e = await CR.encrypt(key, await CR.decrypt(DEV.key, r.iv, r.data)); rows.push({ household_id: hh.id, doc_id: r.doc_id, rev: r.rev + 1, key_version: kv, iv: e.iv, data: e.data }); }
    if (rows.length) { const { error: e1 } = await sb.from('docs').upsert(rows, { onConflict: 'household_id,doc_id' }); if (e1) throw e1; }
    const { error: e2 } = await sb.from('households').update({ salt, verifier, kdf_iter: CR.ITER, key_version: kv }).eq('id', hh.id); if (e2) throw e2;
    rows.forEach(r => { if (DEV.sm.revs[r.doc_id] != null) DEV.sm.revs[r.doc_id] = r.rev; });
    // y el estado local de la otra app en este dispositivo, si comparte almacenamiento
    for (const k of ['state', 'tareas-state']) {
      if (k === APP.stateKey) continue;
      const b = await IDB.get(k); if (!b) continue;
      try { await IDB.set(k, await CR.encrypt(key, await CR.decrypt(DEV.key, b.iv, b.data))); } catch (e) {}
    }
    DEV.key = key; DEV.d.key = key; hh.key_version = kv; await saveDev(); await persistNow();
    toast('Contraseña del hogar cambiada');
  } catch (e) { toast('No se pudo cambiar: ' + ERR(e), 6000); }
}
async function wipeAsk() {
  const ok = await askChoice('Borrar este dispositivo', 'Se borrarán de este dispositivo todos los datos, la clave y la sesión. Si usas un hogar, los datos siguen en los demás dispositivos. Si usas solo este dispositivo, <b>se perderán</b> salvo que tengas una copia.', [{ label: 'Cancelar', cls: 'g', v: 0 }, { label: 'Borrar', cls: 'd', v: 1 }]);
  if (ok) wipeDevice();
}
async function wipeDevice(msg) {
  try { if (DEV.d && DEV.d.deviceId && !msg) await SYNC.client().from('devices').update({ revoked: true }).eq('id', DEV.d.deviceId); } catch (e) {}
  try { if (SYNC.client()) await SYNC.client().auth.signOut({ scope: 'local' }); } catch (e) {}
  await IDB.clear(); try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  DEV.d = null; DEV.key = null; S = blank();
  if (msg) setupBox(`<h2>Dispositivo desvinculado</h2><p class="st">${esc(msg)}</p><button class="bt w" onclick="location.reload()">Empezar de nuevo</button>`);
  else location.reload();
}

/* ───── Arranque ───── */
async function boot() {
  try {
    if (!window.crypto || !crypto.subtle || !window.indexedDB) return setupBox('<h2>Navegador no compatible</h2><p class="st">Abre la app en Safari actualizado, desde una dirección https.</p>');
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    DEV.d = await IDB.get('device');
    if (!DEV.d) {
      // ¿volvemos de un enlace de confirmación de email?
      const hash = location.hash;
      if (SYNC.configured() && /access_token|type=signup|type=recovery/.test(hash)) { const sb = SYNC.client(); await sb.auth.getSession(); history.replaceState(null, '', location.pathname); if (/type=recovery/.test(hash)) return newAccPw(); }
      return welcome();
    }
    DEV.key = DEV.d.key;
    if (DEV.d.mode === 'sync') SYNC.client();
    if (DEV.d.lock) return lockScreen();
    await startApp();
  } catch (e) {
    console.error(e);
    setupBox(`<h2>No se pudieron abrir los datos</h2><p class="st">${esc(e.message || String(e))}</p><button class="bt w" onclick="location.reload()">Reintentar</button><button class="bt d w" onclick="wipeAsk()">Borrar los datos de este dispositivo</button>`);
  }
}
async function newAccPw() {
  setupBox(`<h2>Nueva contraseña de la cuenta</h2><input id="ap" class="w" type="password" autocomplete="new-password" placeholder="Nueva contraseña (mín. 8)"><button class="bt w" id="ab1" onclick="doNewAccPw()">Guardar</button><p id="smsg" class="st"></p>`);
}
async function doNewAccPw() { const { error } = await SYNC.client().auth.updateUser({ password: $('#ap').value }); if (error) return setupMsg(ERR(error), 1); setupMsg('Contraseña cambiada. Ya puedes iniciar sesión.'); setTimeout(() => location.reload(), 1500); }
