/* ==========================================================
Oasis — Núcleo compartido (vanilla JS)
Proyecto: facturas-web
========================================================== */

// Import Firebase SDKs (usando módulos ES)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ----------------------------------------------------------
🔐 Configuración Firebase para el proyecto facturas-web
⚠️ Revisa que coincida con tu panel en Firebase Console
----------------------------------------------------------- */
const firebaseConfig = {
apiKey: "TU_API_KEY_AQUI",
authDomain: "facturas-web.firebaseapp.com",
projectId: "facturas-web",
storageBucket: "facturas-web.appspot.com",
messagingSenderId: "TU_SENDER_ID",
appId: "TU_APP_ID"
};

/* ----------------------------------------------------------
Inicialización base
----------------------------------------------------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export const Firebase = { app, auth, db, provider, signIn: () => signInWithPopup(auth, provider), signOut: () => signOut(auth), onAuthStateChanged };

/* ----------------------------------------------------------
🧰 Utilidades generales
----------------------------------------------------------- */
export const U = {
uuid: () => crypto.randomUUID?.() ?? ('id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)),
todayISO: () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
toNum: v => Number(String(v ?? "").replace(",", ".")) || 0,
fmtMoney: (n, c = 'USD', l = 'es-PR') => new Intl.NumberFormat(l, { style: 'currency', currency: c }).format(Number(n || 0)),
fmtDate: (d, l = 'es-PR') => { try { return new Date(d).toLocaleDateString(l, { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return d; } },
fileToDataURL: f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }),
byId: id => document.getElementById(id),
download: (name, text, type = "text/csv;charset=utf-8") => {
const blob = new Blob([text], { type });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = name;
a.click();
URL.revokeObjectURL(url);
}
};

/* ----------------------------------------------------------
💾 Store: manejo local (localStorage)
----------------------------------------------------------- */
export const Store = (() => {
const K = { settings: "oasis.settings.v1", items: "oasis.items.v1", docs: "oasis.docs.v1" };
const seeds = {
settings: {
businessName: "Oasis",
currency: "USD",
locale: "es-PR",
taxPercent: 11.5,
prefixes: { FAC: "FAC-", COT: "COT-" },
counters: { FAC: 1, COT: 1 },
logoDataUrl: ""
},
items: [
{ id: U.uuid(), name: "Servicio básico", desc: "Mano de obra", price: 50, photo: "" },
{ id: U.uuid(), name: "Producto estándar", desc: "Artículo", price: 25, photo: "" }
]
};

function ensure() {
if (!localStorage.getItem(K.settings)) localStorage.setItem(K.settings, JSON.stringify(seeds.settings));
if (!localStorage.getItem(K.items)) localStorage.setItem(K.items, JSON.stringify(seeds.items));
if (!localStorage.getItem(K.docs)) localStorage.setItem(K.docs, JSON.stringify([]));
}

function get(k) { try { return JSON.parse(localStorage.getItem(K[k])); } catch { return null; } }
function set(k, v) { localStorage.setItem(K[k], JSON.stringify(v)); }

return {
ensure,
settings: () => get('settings'),
setSettings: p => set('settings', { ...get('settings'), ...p }),
items: () => get('items') || [],
setItems: arr => set('items', arr),
docs: () => get('docs') || [],
saveDoc: d => { const arr = get('docs') || []; const i = arr.findIndex(x => x.id === d.id); if (i >= 0) arr[i] = d; else arr.unshift(d); set('docs', arr); return d; },
reset: () => { Object.values(K).forEach(k => localStorage.removeItem(k)); ensure(); },
K
};
})();

/* ----------------------------------------------------------
🔢 Numeración y documentos
----------------------------------------------------------- */
export const Numbering = {
prefix: t => Store.settings().prefixes?.[t] || (t + "-"),
next: t => { const s = Store.settings(); const n = (s.counters?.[t] || 1); s.counters[t] = n + 1; Store.setSettings({ counters: s.counters }); return n; },
setPrefix: (t, p) => { const s = Store.settings(); s.prefixes[t] = p; Store.setSettings({ prefixes: s.prefixes }); },
setCounter: (t, n) => { const s = Store.settings(); s.counters[t] = Number(n) || 1; Store.setSettings({ counters: s.counters }); }
};

export const Docs = {
calc(d) {
const L = d.lines || [];
const subtotal = L.reduce((s, l) => s + U.toNum(l.price) * U.toNum(l.qty || 1), 0);
const descAmt = subtotal * (U.toNum(d.discountPct) / 100);
const base = subtotal - descAmt;
const taxAmt = base * (U.toNum(d.taxPct) / 100);
return { subtotal: +subtotal.toFixed(2), descAmt: +descAmt.toFixed(2), taxAmt: +taxAmt.toFixed(2), total: +(base + taxAmt).toFixed(2) };
},
empty(type = 'COT') {
const s = Store.settings();
return {
id: U.uuid(),
type,
prefix: Numbering.prefix(type),
number: Numbering.next(type),
date: U.todayISO(),
client: "",
lines: [],
discountPct: 0,
taxPct: s.taxPercent,
notes: "",
status: "borrador",
paymentMethod: "",
paymentRef: ""
};
},
duplicateAs(d, newType) {
const x = structuredClone(d);
x.id = U.uuid();
x.type = newType;
x.prefix = Numbering.prefix(newType);
x.number = Numbering.next(newType);
x.status = "borrador";
x.date = U.todayISO();
return x;
}
};

/* ----------------------------------------------------------
🖨️ Printer (PDF con window.print)
----------------------------------------------------------- */
export const Printer = {
docHTML(d) {
const s = Store.settings(), t = Docs.calc(d), num = `${d.prefix || ""}${d.number}`, title = d.type === "FAC" ? "Factura" : "Cotización";
const rows = (d.lines || []).map(l => `
<tr>
<td>${l.name || ""}</td>
<td>${l.desc || ""}</td>
<td style="text-align:right">${U.fmtMoney(l.price, s.currency, s.locale)}</td>
<td style="text-align:right">${l.qty || 1}</td>
<td style="text-align:right">${U.fmtMoney((l.price || 0) * (l.qty || 1), s.currency, s.locale)}</td>
</tr>`).join("");

return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${num}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12mm;}
h1{margin:0 0 8px;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #000;padding:6px;}
.meta{font-size:12px;}
.head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.logo{width:90px;height:90px;object-fit:contain;border:1px solid #000;border-radius:8px;}
@page{margin:12mm;}
</style></head><body>
<div class="head">
<div>
<h1>${title}</h1>
<div class="meta">
Número: ${num}<br>Fecha: ${U.fmtDate(d.date, s.locale)}<br>
Cliente: ${d.client || ""}<br>
${d.paymentMethod ? `Pago: ${d.paymentMethod}${d.paymentRef ? ` — Ref: ${d.paymentRef}` : ""}` : ""}
</div>
</div>
<div style="text-align:right">
${s.logoDataUrl ? `<img class="logo" src="${s.logoDataUrl}" alt="logo">` : ""}
<div style="margin-top:6px;font-weight:800">${s.businessName || "Oasis"}</div>
</div>
</div>
<table><thead><tr><th>Ítem</th><th>Detalle</th><th>Precio</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-top:10px"><table>
<tr><td>Subtotal</td><td style="text-align:right">${U.fmtMoney(t.subtotal, s.currency, s.locale)}</td></tr>
<tr><td>Descuento (${d.discountPct || 0}%)</td><td style="text-align:right">${U.fmtMoney(t.descAmt, s.currency, s.locale)}</td></tr>
<tr><td>IVU (${d.taxPct || 0}%)</td><td style="text-align:right">${U.fmtMoney(t.taxAmt, s.currency, s.locale)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${U.fmtMoney(t.total, s.currency, s.locale)}</strong></td></tr>
</table></div>
${d.notes ? `<div style="margin-top:10px;white-space:pre-wrap"><strong>Notas:</strong><br>${d.notes}</div>` : ""}
<script>onload=()=>print()</script></body></html>`;
},
open(html) {
const w = open("", "_blank");
w.document.write(html);
w.document.close();
}
};

/* ----------------------------------------------------------
☁️ Sincronización con Firestore
----------------------------------------------------------- */
let unsubRemote = null;

async function pullAll(uid) {
const colDocs = collection(db, `users/${uid}/documents`);
const snapD = await getDocs(colDocs);
snapD.docs.map(d => d.data()).forEach(x => Store.saveDoc(x));
}

async function pushAll(uid) {
const colDocs = collection(db, `users/${uid}/documents`);
for (const d of Store.docs()) await setDoc(doc(colDocs, d.id), { ...d, updatedAt: Date.now() }, { merge: true });

const colItems = collection(db, `users/${uid}/items`);
for (const it of Store.items()) await setDoc(doc(colItems, it.id), { ...it, updatedAt: Date.now() }, { merge: true });
}

function subscribeRemote(uid) {
const qDocs = query(collection(db, `users/${uid}/documents`), orderBy("updatedAt", "desc"));
unsubRemote = onSnapshot(qDocs, snap => {
snap.docChanges().forEach(c => { const d = c.doc.data(); Store.saveDoc(d); });
document.dispatchEvent(new CustomEvent("oasis-remote-update"));
});
}

export const Sync = {
async start() {
return new Promise(resolve => {
onAuthStateChanged(auth, async user => {
if (unsubRemote) { unsubRemote(); unsubRemote = null; }
if (user) {
await pullAll(user.uid);
await pushAll(user.uid);
subscribeRemote(user.uid);
resolve(user);
} else resolve(null);
document.dispatchEvent(new CustomEvent("oasis-auth", { detail: { user } }));
});
});
},
push: async () => { const u = auth.currentUser; if (u) await pushAll(u.uid); },
pull: async () => { const u = auth.currentUser; if (u) await pullAll(u.uid); }
};

/* ----------------------------------------------------------
🔐 Control de login
----------------------------------------------------------- */
export async function requireGoogleSignIn() {
const user = auth.currentUser;
const modal = document.getElementById("authModal");
if (user) { if (modal) modal.style.display = "none"; return Promise.resolve(user); }

if (modal) modal.style.display = "flex";
document.getElementById("btnGoogleSignIn")?.addEventListener("click", () => Firebase.signIn());
document.getElementById("btnUseOffline")?.addEventListener("click", () => modal.style.display = "none");

return new Promise(resolve => {
const cb = e => {
const u = e.detail.user;
if (u) {
if (modal) modal.style.display = "none";
document.removeEventListener("oasis-auth", cb);
resolve(u);
}
};
document.addEventListener("oasis-auth", cb);
});
}
