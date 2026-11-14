/* Cifrado de extremo a extremo con WebCrypto (incluido en Safari, sin librerías externas).
 * - La contraseña del hogar se convierte en una clave AES-256 con PBKDF2-SHA256 (600.000 iteraciones).
 * - La clave se importa como NO EXTRAÍBLE: el código puede usarla, pero nadie puede leerla ni copiarla.
 * - Cada documento se cifra con AES-GCM y un IV aleatorio nuevo, lo que además detecta manipulaciones. */
const CR = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const VERIFY = 'gastos-ok-v1';
  const ITER = 600000;

  async function deriveKey(password, saltB64, iter = ITER) {
    const base = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const randomKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const newSalt = () => b64(rand(16));

  async function encrypt(key, obj) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: b64(iv), data: b64(ct) };
  }
  async function decrypt(key, ivB64, dataB64) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(dataB64));
    return JSON.parse(td.decode(pt));
  }
  async function makeVerifier(key) { const e = await encrypt(key, VERIFY); return e.iv + '.' + e.data; }
  async function checkVerifier(key, v) {
    try { const [iv, d] = v.split('.'); return (await decrypt(key, iv, d)) === VERIFY; } catch (e) { return false; }
  }
  /* Copias de seguridad: archivo cifrado con su propia contraseña */
  async function sealBackup(password, obj) {
    const salt = newSalt(), key = await deriveKey(password, salt);
    const e = await encrypt(key, obj);
    return { app: 'gastos', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt, iv: e.iv, data: e.data };
  }
  async function openBackup(password, f) {
    const key = await deriveKey(password, f.salt, f.iter || ITER);
    return decrypt(key, f.iv, f.data);
  }
  const code = n => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = rand(n); return Array.from(r, x => A[x % A.length]).join(''); };
  return { deriveKey, randomKey, newSalt, encrypt, decrypt, makeVerifier, checkVerifier, sealBackup, openBackup, code, b64, unb64, rand, ITER };
})();

/* Almacén local en IndexedDB. Guarda la clave (no extraíble) y los datos cifrados. */
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('gastos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction('kv', mode), s = t.objectStore('kv'), q = fn(s);
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }); };
  return {
    get: k => tx('readonly', s => s.get(k)),
    set: (k, v) => tx('readwrite', s => s.put(v, k)),
    del: k => tx('readwrite', s => s.delete(k)),
    clear: () => tx('readwrite', s => s.clear()),
  };
})();
