/* ==========================================================
Oasis — Núcleo compartido (vanilla JS)
- Google Auth (Firebase)
- Firestore sync por usuario (offline-first + localStorage)
- Store / Numbering / Docs / Printer
========================================================== */

/* ------------------ Firebase ------------------ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
apiKey: "AIzaSyDlqw-ASx4fpnDxvg24ij8kTcbGLsrxCM0",
authDomain: "facturacion-oasis.firebaseapp.com",
projectId: "facturacion-oasis",
storageBucket: "facturacion-oasis.appspot.com", // <-- CORREGIDO
messagingSenderId: "595714299623",
appId: "1:595714299623:web:e141295bffb1592500b442"
};

export const Firebase = (() => {
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
return { app, auth, db, provider, signIn: () => signInWithPopup(auth, provider), signOut: () => signOut(auth), onAuthStateChanged };
})();

/* ------------------ Utils ------------------ */
export const U = {
uuid: () => crypto.randomUUID?.() ?? ('id-'+Date.now()+'-'+Math.floor(Math.random()*1e6)),
todayISO: () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); },
toNum: v => Number(String(v??"").replace(",", ".")) || 0,
fmtMoney: (n,c='USD',l='es-PR') => new Intl.NumberFormat(l,{style:'currency',currency:c}).format(Number(n||0)),
fmtDate: (d,l='es-PR') => { try { return new Date(d).toLocaleDateString(l,{year:'numeric',month:'2-digit',day:'2-digit'}); } catch { return d; } },
fileToDataURL: f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); }),
qs: s => document.querySelector(s), byId: id => document.getElementById(id),
download: (name, text, type="text/csv;charset=utf-8") => { const b=new Blob([text],{type}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u); }
};

/* ------------------ Store (localStorage) ------------------ */
export const Store = (() => {
const K = { settings:"oasis.settings.v1", items:"oasis.items.v1", docs:"oasis.docs.v1" };
const seeds = {
settings:{ businessName:"Oasis", currency:"USD", locale:"es-PR", taxPercent:11.5, prefixes:{FAC:"FAC-",COT:"COT-"}, counters:{FAC:1,COT:1}, logoDataUrl:"" },
items:[
{ id: U.uuid(), name:"Servicio básico", desc:"Mano de obra", price:50, photo:"" },
{ id: U.uuid(), name:"Producto estándar", desc:"Artículo", price:25, photo:"" }
]
};
function ensure(){
if(!localStorage.getItem(K.settings)) localStorage.setItem(K.settings, JSON.stringify(seeds.settings));
if(!localStorage.getItem(K.items)) localStorage.setItem(K.items, JSON.stringify(seeds.items));
if(!localStorage.getItem(K.docs)) localStorage.setItem(K.docs, JSON.stringify([]));
}
function get(key){ try { return JSON.parse(localStorage.getItem(K[key])); } catch { return null; } }
function set(key,val){ localStorage.setItem(K[key], JSON.stringify(val)); }
function settings(){ return get('settings')||seeds.settings; }
function setSettings(p){ set('settings', {...settings(), ...p}); }
function items(){ return get('items')||[]; }
function setItems(arr){ set('items', arr); }
function docs(){ return get('docs')||[]; }
function saveDoc(d){ const a=docs(); const i=a.findIndex(x=>x.id===d.id); if(i>=0) a[i]=d; else a.unshift(d); set('docs', a); return d; }
function reset(){ Object.values(K).forEach(k=>localStorage.removeItem(k)); ensure(); }
return { ensure, settings, setSettings, items, setItems, docs, saveDoc, reset, K };
})();

/* ------------------ Numbering / Docs ------------------ */
export const Numbering = {
prefix: t => Store.settings().prefixes?.[t] || (t+"-"),
next: t => { const s=Store.settings(); const n=(s.counters?.[t]||1); s.counters[t]=n+1; Store.setSettings({ counters:s.counters }); return n; },
setPrefix: (t,p)=>{ const s=Store.settings(); s.prefixes[t]=p; Store.setSettings({ prefixes:s.prefixes }); },
setCounter: (t,n)=>{ const s=Store.settings(); s.counters[t]=Number(n)||1; Store.setSettings({ counters:s.counters }); }
};

export const Docs = {
calc(d){
const L=d.lines||[]; const subtotal=L.reduce((s,l)=>s+U.toNum(l.price)*U.toNum(l.qty||1),0);
const descAmt=subtotal*(U.toNum(d.discountPct)/100);
const base=subtotal-descAmt; const taxAmt=base*(U.toNum(d.taxPct)/100);
return { subtotal:+subtotal.toFixed(2), descAmt:+descAmt.toFixed(2), taxAmt:+taxAmt.toFixed(2), total:+(base+taxAmt).toFixed(2) };
},
empty(type='COT'){
const s=Store.settings();
return { id:U.uuid(), type, prefix:Numbering.prefix(type), number:Numbering.next(type), date:U.todayISO(), client:"", lines:[], discountPct:0, taxPct:s.taxPercent, notes:"", status:"borrador", paymentMethod:"", paymentRef:"" };
},
duplicateAs(d,newType){ const x=structuredClone(d); x.id=U.uuid(); x.type=newType; x.prefix=Numbering.prefix(newType); x.number=Numbering.next(newType); x.status="borrador"; x.date=U.todayISO(); return x; }
};

/* ------------------ Printer ------------------ */
export const Printer = {
docHTML(d){
const s=Store.settings(), t=Docs.calc(d), num=`${d.prefix||""}${d.number}`, title=d.type==="FAC"?"Factura":"Cotización";
const rows=(d.lines||[]).map(l=>`<tr><td>${l.name||""}</td><td>${l.desc||""}</td><td style="text-align:right">${U.fmtMoney(l.price,s.currency,s.locale)}</td><td style="text-align:right">${l.qty||1}</td><td style="text-align:right">${U.fmtMoney((l.price||0)*(l.qty||1),s.currency,s.locale)}</td></tr>`).join("");
return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${num}</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12mm}
h1{margin:0 0 8px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #000;padding:6px} .meta{font-size:12px}
.head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.logo{width:90px;height:90px;object-fit:contain;border:1px solid #000;border-radius:8px;background:#fff}
@page{margin:12mm}</style></head><body>
<div class="head"><div><h1>${title}</h1>
<div class="meta">Número: ${num}<br>Fecha: ${U.fmtDate(d.date,s.locale)}<br>Cliente: ${d.client||""}<br>${d.paymentMethod?`Pago: ${d.paymentMethod}${d.paymentRef?` — Ref: ${d.paymentRef}`:""}`:""}<br>Estado: ${d.status}</div>
</div><div style="text-align:right">${s.logoDataUrl?`<img class="logo" src="${s.logoDataUrl}" alt="logo">`:``}<div style="margin-top:6px;font-weight:800">${s.businessName||"Oasis"}</div></div></div>
<table><thead><tr><th>Ítem</th><th>Detalle</th><th>Precio</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-top:10px"><table>
<tr><td>Subtotal</td><td style="text-align:right">${U.fmtMoney(t.subtotal,s.currency,s.locale)}</td></tr>
<tr><td>Descuento (${d.discountPct||0}%)</td><td style="text-align:right">${U.fmtMoney(t.descAmt,s.currency,s.locale)}</td></tr>
<tr><td>IVU (${d.taxPct||0}%)</td><td style="text-align:right">${U.fmtMoney(t.taxAmt,s.currency,s.locale)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${U.fmtMoney(t.total,s.currency,s.locale)}</strong></td></tr>
</table></div>
${d.notes?`<div style="margin-top:10px;white-space:pre-wrap"><strong>Notas:</strong>\n${d.notes}</div>`:""}
<script>onload=()=>print()</script></body></html>`; },
open(html){ const w=open("","_blank"); w.document.write(html); w.document.close(); }
};

/* ------------------ Sync Firestore (por usuario) ------------------ */
let unsubRemote = null;

async function pullAll(uid){
// docs
const colDocs = collection(Firebase.db, `users/${uid}/documents`);
const snapD = await getDocs(colDocs);
snapD.docs.map(d=>d.data()).forEach(x=>Store.saveDoc(x));
// items
const colItems = collection(Firebase.db, `users/${uid}/items`);
const snapI = await getDocs(colItems);
const items = snapI.docs.map(d=>d.data());
if(items?.length) Store.setItems(items);
}

async function pushAll(uid){
// docs
const colDocs = collection(Firebase.db, `users/${uid}/documents`);
for(const d of Store.docs()){
await setDoc(doc(colDocs, d.id), {...d, updatedAt:Date.now()}, {merge:true});
}
// items
const colItems = collection(Firebase.db, `users/${uid}/items`);
for(const it of Store.items()){
await setDoc(doc(colItems, it.id), {...it, updatedAt:Date.now()}, {merge:true});
}
}

function subscribeRemote(uid){
const qDocs = query(collection(Firebase.db, `users/${uid}/documents`), orderBy("updatedAt","desc"));
unsubRemote = onSnapshot(qDocs, (snap)=>{
snap.docChanges().forEach(c=>{ const d=c.doc.data(); Store.saveDoc(d); });
document.dispatchEvent(new CustomEvent("oasis-remote-update"));
});
}

export const Sync = {
async start(){
return new Promise((resolve)=>{
Firebase.onAuthStateChanged(Firebase.auth, async (user)=>{
if(unsubRemote){ unsubRemote(); unsubRemote=null; }
if(user){
await pullAll(user.uid);
await pushAll(user.uid);
subscribeRemote(user.uid);
resolve(user);
} else {
resolve(null);
}
document.dispatchEvent(new CustomEvent("oasis-auth", { detail:{ user } }));
});
});
},
push: async () => { const u=Firebase.auth.currentUser; if(u) await pushAll(u.uid); },
pull: async () => { const u=Firebase.auth.currentUser; if(u) await pullAll(u.uid); }
};

/* ------------------ Auth UI helpers ------------------ */
export function requireGoogleSignIn(){
const user = Firebase.auth.currentUser;
const modal = U.byId("loginModal");
const status = U.byId("loginStatus");
if(user){ if(modal) modal.style.display="none"; return Promise.resolve(user); }

if(modal){ modal.style.display="flex"; status.textContent="Inicia sesión para continuar"; }
U.byId("btnLoginGoogle")?.addEventListener("click", ()=> Firebase.signIn().catch(()=>status.textContent="Error al iniciar sesión."));
U.byId("btnLogout")?.addEventListener("click", ()=> Firebase.signOut());
return new Promise(resolve=>{
const cb = (ev)=>{ const u = ev.detail.user; if(u){ if(modal) modal.style.display="none"; document.removeEventListener("oasis-auth", cb); resolve(u); } };
document.addEventListener("oasis-auth", cb);
});
}

/* ------------------ Shell common ------------------ */
export function navActive(activePage){
document.querySelectorAll(".nav a").forEach(a=>{
if(a.getAttribute("href")?.endsWith(activePage)) a.classList.add("active"); else a.classList.remove("active");
});
}
