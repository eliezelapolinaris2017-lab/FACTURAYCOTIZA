/* ==========================================================
   Oasis multipágina — Núcleo compartido (auth, store, utils)
   ========================================================== */
export const Utils = {
  uuid: () => crypto.randomUUID?.() ?? ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)),
  todayISO() { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); },
  toNum(v){ const n=parseFloat(String(v??"").replace(",", ".")); return isNaN(n)?0:n; },
  fmtMoney(n,c="USD",l="es-PR"){ return new Intl.NumberFormat(l,{style:"currency",currency:c}).format(Number(n||0)); },
  fmtDate(d,l="es-PR"){ try {return new Date(d).toLocaleDateString(l,{year:"numeric",month:"2-digit",day:"2-digit"})}catch{return d} },
  download(name, text, type="text/plain;charset=utf-8"){ const b=new Blob([text],{type}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u;a.download=name;a.click(); URL.revokeObjectURL(u); },
  fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); },
  $: sel => document.querySelector(sel),
  byId: id => document.getElementById(id),
};

export const Session = (() => {
  const KEY="oasis.session.v1"; const D=8*60*60*1000;
  const now=()=>Date.now();
  const get=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}};
  const active=()=>{const s=get();return !!(s&&s.exp>now())};
  const start=()=>localStorage.setItem(KEY, JSON.stringify({token:Utils.uuid(),exp:now()+D}));
  const end=()=>localStorage.removeItem(KEY);
  const touch=()=>{const s=get(); if(!s) return; s.exp=now()+D; localStorage.setItem(KEY, JSON.stringify(s));};
  return {active,start,end,touch};
})();

export const Store = (() => {
  const K={ settings:"oasis.settings.v1", items:"oasis.items.v1", docs:"oasis.docs.v1" };
  const DEF={
    settings:{ businessName:"Oasis", currency:"USD", locale:"es-PR", taxPercent:11.5, prefixes:{FAC:"FAC-",COT:"COT-"}, counters:{FAC:1,COT:1}, logoDataUrl:"", pinHash:""},
    items:[
      { id: Utils.uuid(), name:"Servicio básico", desc:"Mano de obra", price:50, photo:"" },
      { id: Utils.uuid(), name:"Producto estándar", desc:"Artículo", price:25, photo:"" },
    ],
    docs:[]
  };
  function ensure(){ if(!localStorage.getItem(K.settings)) localStorage.setItem(K.settings, JSON.stringify(DEF.settings));
    if(!localStorage.getItem(K.items)) localStorage.setItem(K.items, JSON.stringify(DEF.items));
    if(!localStorage.getItem(K.docs)) localStorage.setItem(K.docs, JSON.stringify(DEF.docs)); }
  function get(key){ try{return JSON.parse(localStorage.getItem(K[key]))}catch{return null} }
  function set(key,val){ localStorage.setItem(K[key], JSON.stringify(val)); }
  function updateSettings(p){ const s=get("settings")||DEF.settings; const m={...s,...p}; set("settings",m); return m; }
  function setPINHash(h){ const s=get("settings")||DEF.settings; s.pinHash=h; set("settings",s); }
  function getItems(){ return get("items")||[] }
  function setItems(a){ set("items",a) }
  function getDocs(){ return get("docs")||[] }
  function saveDoc(d){ const a=getDocs(); const i=a.findIndex(x=>x.id===d.id); if(i>=0)a[i]=d; else a.unshift(d); set("docs",a); return d; }
  function reset(){ Object.values(K).forEach(k=>localStorage.removeItem(k)); ensure(); }
  return {KEYS:K, ensure, get, set, updateSettings, setPINHash, getItems, setItems, getDocs, saveDoc, reset};
})();

export const Numbering = (() => {
  function next(t){ const s=Store.get("settings"); const n=(s.counters?.[t]||1); s.counters[t]=n+1; Store.updateSettings({counters:s.counters}); return n; }
  function prefix(t){ const s=Store.get("settings"); return s.prefixes?.[t] || (t+"-"); }
  function setCounter(t,n){ const s=Store.get("settings"); s.counters[t]=Number(n)||1; Store.updateSettings({counters:s.counters}); }
  function setPrefix(t,p){ const s=Store.get("settings"); s.prefixes[t]=p; Store.updateSettings({prefixes:s.prefixes}); }
  return { next, prefix, setCounter, setPrefix };
})();

export const Docs = (() => {
  function calc(d){
    const L=d.lines||[]; const sub=Number(L.reduce((s,l)=>s+(Utils.toNum(l.price)*Utils.toNum(l.qty||1)),0).toFixed(2));
    const desc=Number((sub*(Utils.toNum(d.discountPct)/100)).toFixed(2));
    const base=Number((sub-desc).toFixed(2)); const tax=Number((base*(Utils.toNum(d.taxPct)/100)).toFixed(2));
    return { subtotal:sub, descAmt:desc, taxAmt:tax, total:Number((base+tax).toFixed(2)) };
  }
  function empty(){ const s=Store.get("settings"); return { id:Utils.uuid(), type:"COT", prefix:Numbering.prefix("COT"), number:Numbering.next("COT"),
    date:Utils.todayISO(), client:"", lines:[], discountPct:0, taxPct:s.taxPercent, notes:"", status:"borrador", paymentMethod:"", paymentRef:""}; }
  return { calc, empty };
})();

export const Printer = (() => {
  function header(){ const s=Store.get("settings"); return {name:s.businessName||"Oasis", logo:s.logoDataUrl||"", c:s.currency||"USD", l:s.locale||"es-PR"}; }
  function docHTML(d){ const {name,logo,c,l}=header(); const t=Docs.calc(d); const num=`${d.prefix||""}${d.number}`; const title=d.type==="FAC"?"Factura":"Cotización";
    const rows=(d.lines||[]).map(l=>`<tr><td>${l.name||""}</td><td>${l.desc||""}</td><td style="text-align:right">${Utils.fmtMoney(l.price,c,l)}</td><td style="text-align:right">${l.qty||1}</td><td style="text-align:right">${Utils.fmtMoney((l.price||0)*(l.qty||1),c,l)}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${num}</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12mm}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;border:1px solid #000;border-radius:8px;background:#fff}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #000;padding:6px}
@page{size:auto;margin:12mm}</style></head><body>
<div class="p-head"><div>
  <div style="font-size:22px;font-weight:800">${title}</div>
  <div>Número: ${num}</div><div>Fecha: ${Utils.fmtDate(d.date,l)}</div><div>Cliente: ${d.client||""}</div>
  ${d.paymentMethod?`<div>Pago: ${d.paymentMethod}${d.paymentRef?` — Ref: ${d.paymentRef}`:""}</div>`:""}
  <div>Estado: ${d.status}</div></div>
  <div style="text-align:right">${logo?`<img src="${logo}">`:""}<div style="margin-top:6px;font-weight:800">${name}</div></div></div>
<table><thead><tr><th>Ítem</th><th>Detalle</th><th>Precio</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-top:10px"><table>
<tr><td>Subtotal</td><td style="text-align:right">${Utils.fmtMoney(t.subtotal,c,l)}</td></tr>
<tr><td>Descuento (${d.discountPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(t.descAmt,c,l)}</td></tr>
<tr><td>IVU (${d.taxPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(t.taxAmt,c,l)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${Utils.fmtMoney(t.total,c,l)}</strong></td></tr>
</table></div><script>onload=()=>print()</script></body></html>`;}
  function openPrint(html){ const w=open("","_blank"); w.document.write(html); w.document.close(); }
  return { docHTML, openPrint };
})();

/* ---------- Auth Overlay (usar en todas las páginas) ---------- */
export async function requirePIN() {
  Store.ensure();
  const ov = Utils.byId("authOverlay");
  const title = Utils.byId("authTitle");
  const subtitle = Utils.byId("authSubtitle");
  const form = Utils.byId("authForm");
  const pin1 = Utils.byId("authPin");
  const pin2 = Utils.byId("authPin2");
  const label2 = Utils.byId("authLabelPIN2");
  const btn = Utils.byId("authBtn");
  const msg = Utils.byId("authMsg");

  async function hashPIN(pin){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  if (Session.active()) { ov.style.display="none"; return; }

  const s = Store.get("settings");
  const hasPIN = !!s.pinHash;
  function setCreate(){ title.textContent="Bienvenido"; subtitle.textContent="Crea un PIN para proteger tus datos."; label2.classList.remove("hidden"); pin2.classList.remove("hidden"); btn.textContent="Guardar PIN"; msg.textContent=""; }
  function setLogin(){ title.textContent="Bienvenido"; subtitle.textContent="Ingresa tu PIN para entrar."; label2.classList.add("hidden"); pin2.classList.add("hidden"); btn.textContent="Entrar"; msg.textContent=""; }
  hasPIN ? setLogin() : setCreate();
  ov.style.display = "flex";

  return new Promise(resolve=>{
    form.onsubmit = async (e) => {
      e.preventDefault();
      const p1 = (pin1.value||"").trim();
      const p2 = (pin2.value||"").trim();
      if (!hasPIN) {
        if (p1.length<4) { msg.textContent="El PIN debe tener al menos 4 dígitos."; return; }
        if (p1!==p2) { msg.textContent="Los PIN no coinciden."; return; }
        const h = await hashPIN(p1);
        Store.setPINHash(h); Session.start(); ov.style.display="none"; resolve();
      } else {
        const h = await hashPIN(p1);
        if (h === (Store.get("settings").pinHash||"")) { Session.start(); ov.style.display="none"; resolve(); }
        else msg.textContent = "PIN incorrecto.";
      }
    };
  });
}

/* ---------- UI Compartida: nav + back home ---------- */
export function initShell(activeMenu){
  // botón menú lateral si lo usas; aquí solo rellenamos nombre/logo
  const s=Store.get("settings");
  const drawerName = Utils.byId("drawerName");
  const drawerLogo = Utils.byId("drawerLogo");
  const brandName = Utils.byId("brandName");
  if (drawerName) drawerName.textContent = s.businessName || "Oasis";
  if (brandName) brandName.textContent = s.businessName || "Oasis";
  if (drawerLogo && s.logoDataUrl){ drawerLogo.src=s.logoDataUrl; drawerLogo.style.display="block"; }

  // activar enlace actual
  document.querySelectorAll(".drawer-item").forEach(b=>{
    if (b.dataset.href?.endsWith(activeMenu)) b.classList.add("active");
  });

  // botón volver inicio
  const homeBtn = Utils.byId("btnHome");
  if (homeBtn) homeBtn.addEventListener("click", ()=> location.href = "./index.html");
}
