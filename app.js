/* ==========================================================
   Oasis — App de Facturación y Cotizaciones (vanilla JS)
   - PIN con sesión (8h)
   - HistoryDB (localStorage)
   - Sync opcional con Firebase (si está cargado firebase-init.js)
   - Catálogo con foto base64
   - Reportes CSV / PDF
   - Numeración independiente FAC/COT
   ========================================================== */

/* ---------------------- Utils ---------------------- */
const Utils = {
  uuid: () => (crypto.randomUUID ? crypto.randomUUID() :
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16))),
  todayISO() { const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); },
  toNum(v){ const n = parseFloat(String(v??"").replace(",", ".")); return isNaN(n)?0:n; },
  fmtMoney(n, currency="USD", locale="es-PR"){ return new Intl.NumberFormat(locale,{style:"currency",currency}).format(Number(n||0)); },
  fmtDate(d, locale="es-PR"){ try { return new Date(d).toLocaleDateString(locale,{year:"numeric",month:"2-digit",day:"2-digit"}); } catch { return d; } },
  escape(s){ return String(s??"").replace(/[&<>'"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[m])); },
  download(name, text, type="text/plain;charset=utf-8"){
    const blob = new Blob([text],{type}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  },
  fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
};

/* ---------------------- Session / Auth (PIN) ---------------------- */
const Session = (() => {
  const SES_KEY = "oasis.session.v1";
  const DURATION = 8*60*60*1000;
  const now = () => Date.now();
  const get = () => { try { return JSON.parse(localStorage.getItem(SES_KEY)); } catch { return null; } };
  const active = () => { const s=get(); return !!(s && s.exp>now()); };
  const start = () => localStorage.setItem(SES_KEY, JSON.stringify({token:Utils.uuid(), exp: now()+DURATION}));
  const end = () => localStorage.removeItem(SES_KEY);
  const touch = () => { const s=get(); if(!s) return; s.exp = now()+DURATION; localStorage.setItem(SES_KEY, JSON.stringify(s)); };
  return { active, start, end, touch };
})();

/* ---------------------- Store (settings/items/docs) ---------------------- */
const Store = (() => {
  const KEYS = { settings:"oasis.settings.v1", items:"oasis.items.v1", docs:"oasis.docs.v1" };
  const DEF = {
    settings:{
      businessName:"Oasis",
      currency:"USD",
      locale:"es-PR",
      taxPercent:11.5,
      prefixes:{ FAC:"FAC-", COT:"COT-" },
      counters:{ FAC:1, COT:1 },
      logoDataUrl:"",
      pinHash:""
    },
    items:[
      { id: Utils.uuid(), name:"Servicio básico", desc:"Mano de obra", price:50, photo:"" },
      { id: Utils.uuid(), name:"Producto estándar", desc:"Artículo genérico", price:25, photo:"" }
    ],
    docs:[]
  };
  function ensureSeeds(){
    if(!localStorage.getItem(KEYS.settings)) localStorage.setItem(KEYS.settings, JSON.stringify(DEF.settings));
    if(!localStorage.getItem(KEYS.items)) localStorage.setItem(KEYS.items, JSON.stringify(DEF.items));
    if(!localStorage.getItem(KEYS.docs)) localStorage.setItem(KEYS.docs, JSON.stringify(DEF.docs));
  }
  function get(key){ try { return JSON.parse(localStorage.getItem(KEYS[key])); } catch { return null; } }
  function set(key,val){ localStorage.setItem(KEYS[key], JSON.stringify(val)); }
  function updateSettings(patch){ const s = get("settings")||DEF.settings; const m = { ...s, ...patch }; set("settings", m); return m; }
  function setPINHash(pinHash){ const s=get("settings")||DEF.settings; s.pinHash=pinHash; set("settings", s); }
  function getItems(){ return get("items")||[]; }
  function setItems(arr){ set("items", arr); }
  function getDocs(){ return get("docs")||[]; }
  function saveDoc(doc){ const arr = getDocs(); const i = arr.findIndex(d=>d.id===doc.id); if(i>=0) arr[i]=doc; else arr.unshift(doc); set("docs", arr); return doc; }
  function reset(){ Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); ensureSeeds(); }
  return { KEYS, ensureSeeds, get, set, updateSettings, setPINHash, getItems, setItems, getDocs, saveDoc, reset };
})();

/* ---------------------- HistoryDB (adaptable) ---------------------- */
const HistoryDB = (() => {
  const KEY = Store.KEYS.docs;
  const list = () => Store.getDocs();
  const save = (doc) => Store.saveDoc(doc);
  const getById = (id) => list().find(x=>x.id===id)||null;
  const remove = (id) => Store.set(Store.KEYS.docs.replace(".v1","").split(".").pop(), list().filter(d=>d.id!==id)); // no se usa
  const toCSV = (docs) => {
    const rows=[["tipo","numero","fecha","cliente","subtotal","descuento","ivu","total","estado","pago","pago_ref"]];
    (docs||[]).forEach(d=>{ const c=Docs.calc(d);
      rows.push([d.type, `${d.prefix||""}${d.number}`, d.date, d.client||"", c.subtotal.toFixed(2), c.descAmt.toFixed(2), c.taxAmt.toFixed(2), c.total.toFixed(2), d.status, d.paymentMethod||"", d.paymentRef||""]);
    });
    return rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  };
  return { list, save, getById, remove, toCSV };
})();

/* ---------------------- Numbering ---------------------- */
const Numbering = (() => {
  function next(tipo){ const s=Store.get("settings"); const n=(s.counters?.[tipo]||1); s.counters[tipo]=n+1; Store.updateSettings({ counters:s.counters }); return n; }
  function prefix(tipo){ const s=Store.get("settings"); return s.prefixes?.[tipo] || (tipo+"-"); }
  function setCounter(tipo,n){ const s=Store.get("settings"); s.counters[tipo]=Number(n)||1; Store.updateSettings({ counters:s.counters }); }
  function setPrefix(tipo,p){ const s=Store.get("settings"); s.prefixes[tipo]=p; Store.updateSettings({ prefixes:s.prefixes }); }
  return { next, prefix, setCounter, setPrefix };
})();

/* ---------------------- Docs (cálculos y helpers) ---------------------- */
const Docs = (() => {
  function calc(doc){
    const lines = doc.lines||[];
    const subtotal = Number(lines.reduce((s,l)=> s + (Utils.toNum(l.price)*Utils.toNum(l.qty||1)), 0).toFixed(2));
    const descAmt = Number((subtotal * (Utils.toNum(doc.discountPct)/100)).toFixed(2));
    const base = Number((subtotal - descAmt).toFixed(2));
    const taxAmt = Number((base * (Utils.toNum(doc.taxPct)/100)).toFixed(2));
    const total = Number((base + taxAmt).toFixed(2));
    return { subtotal, descAmt, taxAmt, total };
  }
  function empty(){
    const s=Store.get("settings");
    return { id:Utils.uuid(), type:"COT", prefix:Numbering.prefix("COT"), number:Numbering.next("COT"),
      date:Utils.todayISO(), client:"", lines:[], discountPct:0, taxPct:s.taxPercent,
      notes:"", status:"borrador", paymentMethod:"", paymentRef:"" };
  }
  function duplicateAs(doc,newType){
    const c = structuredClone(doc);
    c.id = Utils.uuid(); c.type = newType||doc.type;
    c.prefix = Numbering.prefix(c.type); c.number = Numbering.next(c.type);
    c.status = "borrador"; c.date = Utils.todayISO();
    return c;
  }
  function reemitNumber(doc){ doc.prefix=Numbering.prefix(doc.type); doc.number=Numbering.next(doc.type); return doc; }
  return { calc, empty, duplicateAs, reemitNumber };
})();

/* ---------------------- Printer (HTML para PDF) ---------------------- */
const Printer = (() => {
  function header(){
    const s=Store.get("settings");
    return { name:s.businessName||"Oasis", logo:s.logoDataUrl||"", currency:s.currency||"USD", locale:s.locale||"es-PR" };
  }
  function docHTML(doc){
    const {name,logo,currency,locale}=header(); const t=Docs.calc(doc);
    const title = doc.type==="FAC"?"Factura":"Cotización"; const num=`${doc.prefix||""}${doc.number}`;
    const rows = (doc.lines||[]).map(l=>`
      <tr>
        <td>${Utils.escape(l.name)}</td>
        <td>${Utils.escape(l.desc||"")}</td>
        <td style="text-align:right">${Utils.fmtMoney(l.price,currency,locale)}</td>
        <td style="text-align:right">${l.qty||1}</td>
        <td style="text-align:right">${Utils.fmtMoney((l.price||0)*(l.qty||1),currency,locale)}</td>
      </tr>`).join("");
    const pago = doc.paymentMethod ? `<div><strong>Pago:</strong> ${Utils.escape(doc.paymentMethod)}${doc.paymentRef?` — Ref: ${Utils.escape(doc.paymentRef)}`:""}</div>`:"";
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${num}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12mm;}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid #000;border-radius:8px}
.p-title{font-size:22px;font-weight:800;margin:0 0 6px}
.p-meta{font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:6px}
.tot{margin-top:10px;display:flex;justify-content:flex-end}
.tot table{width:auto}
@page{size:auto;margin:12mm}
</style></head><body>
<div class="p-head">
  <div>
    <div class="p-title">${title}</div>
    <div class="p-meta">
      <div><strong>Número:</strong> ${num}</div>
      <div><strong>Fecha:</strong> ${Utils.fmtDate(doc.date,locale)}</div>
      <div><strong>Cliente:</strong> ${Utils.escape(doc.client||"")}</div>
      ${pago}
      <div><strong>Estado:</strong> ${doc.status}</div>
    </div>
  </div>
  <div style="text-align:right">${logo?`<img src="${logo}" alt="Logo">`:""}<div style="margin-top:6px;font-weight:800">${Utils.escape(name)}</div></div>
</div>
<table><thead><tr><th>Ítem</th><th>Detalle</th><th style="text-align:right">Precio</th><th style="text-align:right">Cant.</th><th style="text-align:right">Importe</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="tot"><table>
<tr><td>Subtotal</td><td style="text-align:right">${Utils.fmtMoney(t.subtotal,currency,locale)}</td></tr>
<tr><td>Descuento (${doc.discountPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(t.descAmt,currency,locale)}</td></tr>
<tr><td>IVU (${doc.taxPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(t.taxAmt,currency,locale)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${Utils.fmtMoney(t.total,currency,locale)}</strong></td></tr>
</table></div>
${doc.notes?`<div style="margin-top:10px;white-space:pre-wrap"><strong>Notas:</strong>\n${Utils.escape(doc.notes)}</div>`:""}
<script>window.onload=()=>window.print();</script>
</body></html>`;
  }
  function reportHTML(list,label){
    const {name,logo,currency,locale}=header();
    const rows = list.map(d=>`<tr>
      <td>${d.type}</td><td>${d.prefix||""}${d.number}</td><td>${Utils.fmtDate(d.date,locale)}</td>
      <td>${Utils.escape(d.client||"")}</td><td>${Utils.escape(d.paymentMethod||"-")}</td>
      <td style="text-align:right">${Utils.fmtMoney(Docs.calc(d).total,currency,locale)}</td><td>${d.status}</td></tr>`).join("");
    const sum = Reports.summarize(list);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${Utils.escape(label)}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12mm;}
h1{margin:0 0 8px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:6px}
@page{size:auto;margin:12mm}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
  <div>
    <h1>Reporte — ${Utils.escape(label)}</h1>
    <div>FAC: ${sum.counts.FAC||0} | ${Utils.fmtMoney(sum.totals.FAC||0,currency,locale)} •
         COT: ${sum.counts.COT||0} | ${Utils.fmtMoney(sum.totals.COT||0,currency,locale)} •
         Total: ${sum.counts.ALL||0} | ${Utils.fmtMoney(sum.totals.ALL||0,currency,locale)}</div>
  </div>
  <div style="text-align:right">${logo?`<img src="${logo}" style="width:80px;height:80px;object-fit:contain;border:1px solid #000;border-radius:8px">`:""}
    <div style="margin-top:6px;font-weight:800">${Utils.escape(name)}</div>
  </div>
</div>
<table><thead><tr><th>Tipo</th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Estado</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload=()=>window.print();</script>
</body></html>`;
  }
  function openPrint(html){ const w=window.open("","_blank"); w.document.open(); w.document.write(html); w.document.close(); }
  return { docHTML, reportHTML, openPrint };
})();

/* ---------------------- Reports ---------------------- */
const Reports = (() => {
  function filterRange(desde,hasta){
    const arr = HistoryDB.list().filter(d=>d.status!=="anulado");
    const from = desde? new Date(desde): null;
    const to = hasta? new Date(hasta): null; if(to) to.setHours(23,59,59,999);
    return arr.filter(d=>{ const dd = new Date(d.date); if(from && dd<from) return false; if(to && dd>to) return false; return true; });
  }
  function summarize(list){
    const out={ counts:{FAC:0,COT:0,ALL:0}, totals:{FAC:0,COT:0,ALL:0} };
    list.forEach(d=>{ const t=Docs.calc(d).total; out.counts[d.type]=(out.counts[d.type]||0)+1; out.totals[d.type]=(out.totals[d.type]||0)+t; out.counts.ALL++; out.totals.ALL+=t; });
    return out;
  }
  function csv(list){ return HistoryDB.toCSV(list); }
  return { filterRange, summarize, csv };
})();

/* ---------------------- AUTH overlay init ---------------------- */
(async function initAuth(){
  Store.ensureSeeds();
  const els = {
    overlay: byId("authOverlay"),
    title: byId("authTitle"),
    subtitle: byId("authSubtitle"),
    form: byId("authForm"),
    pin1: byId("authPin"),
    pin2: byId("authPin2"),
    label2: byId("authLabelPIN2"),
    btn: byId("authBtn"),
    msg: byId("authMsg")
  };
  const s = Store.get("settings");
  async function hashPIN(p){ const enc=new TextEncoder().encode(p); const buf=await crypto.subtle.digest("SHA-256",enc); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(""); }
  function setCreate(){ els.title.textContent="Bienvenido"; els.subtitle.textContent="Crea un PIN para proteger tus datos."; els.label2.classList.remove("hidden"); els.pin2.classList.remove("hidden"); els.btn.textContent="Guardar PIN"; els.msg.textContent=""; }
  function setLogin(){ els.title.textContent="Bienvenido"; els.subtitle.textContent="Ingresa tu PIN para entrar."; els.label2.classList.add("hidden"); els.pin2.classList.add("hidden"); els.btn.textContent="Entrar"; els.msg.textContent=""; }

  if(Session.active()){ els.overlay.style.display="none"; initUI(); return; }

  if(!s.pinHash){ setCreate(); els.overlay.style.display="flex"; }
  else { setLogin(); els.overlay.style.display="flex"; }

  els.form.onsubmit = async (e)=> {
    e.preventDefault();
    const p1=els.pin1.value.trim(), p2=els.pin2.value.trim();
    if(!s.pinHash){
      if(p1.length<4) return els.msg.textContent="El PIN debe tener al menos 4 dígitos.";
      if(p1!==p2) return els.msg.textContent="Los PIN no coinciden.";
      const h=await hashPIN(p1); Store.setPINHash(h); Session.start(); els.overlay.style.display="none"; initUI();
    } else {
      const h=await hashPIN(p1); if(h===Store.get("settings").pinHash){ Session.start(); els.overlay.style.display="none"; initUI(); } else els.msg.textContent="PIN incorrecto.";
    }
  };
})();

/* ---------------------- UI (tabs, forms, eventos) ---------------------- */
function initUI(){
  // Drawer y tabs
  const drawer = byId("drawer"), menuBtn = byId("menuBtn"), drawerClose = byId("drawerClose");
  const pwaHomeBtn = byId("pwaHomeBtn");
  const tabs = document.querySelectorAll(".tab");
  function openTab(id){ tabs.forEach(t=>t.classList.remove("active")); byId(`tab-${id}`).classList.add("active"); drawer.classList.remove("open"); pwaHomeBtn.style.display = (id==="nuevo")?"none":"inline-flex"; }
  document.querySelectorAll(".drawer-item").forEach(b=>b.addEventListener("click",()=>openTab(b.dataset.tab)));
  menuBtn?.addEventListener("click",()=>drawer.classList.toggle("open"));
  drawerClose?.addEventListener("click",()=>drawer.classList.remove("open"));
  pwaHomeBtn?.addEventListener("click",()=>openTab("nuevo"));

  loadBrand();
  loadConfigForm();
  fillQuickAdd();
  renderItems();
  loadNewDoc(Docs.empty());
  renderHistorial();
  runReportDefault();

  // Mantener sesión activa al interactuar
  ["click","keydown","touchstart"].forEach(evt=>window.addEventListener(evt,()=>Session.touch(),{passive:true}));
}

/* ---------------------- Branding ---------------------- */
function loadBrand(){
  const s=Store.get("settings");
  const brandName = byId("brandName"), drawerName = byId("drawerName"), brandLogo = byId("drawerLogo");
  brandName.textContent = s.businessName||"Oasis";
  drawerName.textContent = s.businessName||"Oasis";
  if(s.logoDataUrl){ brandLogo.src=s.logoDataUrl; brandLogo.style.display="block"; } else { brandLogo.removeAttribute("src"); brandLogo.style.display="none"; }
}

/* ---------------------- Documento: crear/editar ---------------------- */
let currentDoc = null;
function loadNewDoc(doc){
  currentDoc = doc;
  const s=Store.get("settings");
  byId("docTipo").value = doc.type;
  byId("docPrefijo").value = doc.prefix || Numbering.prefix(doc.type);
  byId("docNumero").value = doc.number;
  byId("docFecha").value = doc.date || Utils.todayISO();
  byId("docCliente").value = doc.client || "";
  byId("docDescuento").value = doc.discountPct ?? 0;
  byId("docImpuesto").value = doc.taxPct ?? s.taxPercent;
  byId("docPago").value = doc.paymentMethod || "";
  byId("docPagoRef").value = doc.paymentRef || "";
  byId("docNotas").value = doc.notes || "";
  const body = byId("lineasBody"); body.innerHTML = "";
  (doc.lines||[]).forEach(addLineaRow);
  if((doc.lines||[]).length===0) addLineaRow();
  updateTotals();
  updateDocButtons();
}

function updateDocButtons(){
  const disabled = currentDoc.status==="anulado";
  byId("btnAnular").disabled = disabled;
  byId("btnReemitir").disabled = disabled;
  byId("btnGuardarFinal").disabled = disabled;
}

function addLineaRow(line={name:"",desc:"",price:0,qty:1}){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="l-name" placeholder="Nombre" value="${Utils.escape(line.name)}"></td>
    <td><input class="l-desc" placeholder="Descripción" value="${Utils.escape(line.desc||"")}"></td>
    <td><input class="l-price" type="number" step="0.01" inputmode="decimal" value="${Number(line.price||0)}"></td>
    <td><input class="l-qty" type="number" step="1" inputmode="numeric" value="${Number(line.qty||1)}"></td>
    <td class="right l-imp">$0.00</td>
    <td class="no-print"><button type="button" class="btn warn btn-del">X</button></td>`;
  const priceEl = tr.querySelector(".l-price"), qtyEl = tr.querySelector(".l-qty");
  const recalc = ()=>{ const s=Store.get("settings"); const imp=Utils.toNum(priceEl.value)*Utils.toNum(qtyEl.value||1); tr.querySelector(".l-imp").textContent=Utils.fmtMoney(imp,s.currency,s.locale); updateTotals(); };
  [".l-price",".l-qty",".l-name",".l-desc"].forEach(sel=>tr.querySelector(sel).addEventListener("input",recalc));
  tr.querySelector(".btn-del").addEventListener("click",()=>{ tr.remove(); updateTotals(); });
  byId("lineasBody").appendChild(tr); recalc();
}

function collectDoc(){
  const lines = [...byId("lineasBody").querySelectorAll("tr")].map(tr=>({
    name: tr.querySelector(".l-name").value.trim(),
    desc: tr.querySelector(".l-desc").value.trim(),
    price: Utils.toNum(tr.querySelector(".l-price").value),
    qty: Utils.toNum(tr.querySelector(".l-qty").value||1)
  })).filter(l=>l.name||l.desc||l.price);
  return { ...currentDoc,
    type: byId("docTipo").value,
    prefix: byId("docPrefijo").value.trim() || Numbering.prefix(byId("docTipo").value),
    number: Utils.toNum(byId("docNumero").value)||currentDoc.number,
    date: byId("docFecha").value || Utils.todayISO(),
    client: byId("docCliente").value.trim(),
    discountPct: Utils.toNum(byId("docDescuento").value||0),
    taxPct: Utils.toNum(byId("docImpuesto").value||0),
    paymentMethod: byId("docPago").value || "",
    paymentRef: byId("docPagoRef").value.trim() || "",
    notes: byId("docNotas").value.trim(),
    lines
  };
}

function updateTotals(){
  const doc = collectDoc(); const s=Store.get("settings"); const t=Docs.calc(doc);
  byId("sumSubtotal").textContent = Utils.fmtMoney(t.subtotal,s.currency,s.locale);
  byId("sumDesc").textContent = Utils.fmtMoney(t.descAmt,s.currency,s.locale);
  byId("sumImpuesto").textContent = Utils.fmtMoney(t.taxAmt,s.currency,s.locale);
  byId("sumTotal").textContent = Utils.fmtMoney(t.total,s.currency,s.locale);
}

/* Eventos documento */
byId("docTipo")?.addEventListener("change",()=>{ const tipo=byId("docTipo").value; byId("docPrefijo").value=Numbering.prefix(tipo); byId("docNumero").value=Numbering.next(tipo); currentDoc.type=tipo; currentDoc.prefix=byId("docPrefijo").value; currentDoc.number=Utils.toNum(byId("docNumero").value); });
byId("btnAddLinea")?.addEventListener("click",()=>addLineaRow());
byId("docDescuento")?.addEventListener("input",updateTotals);
byId("docImpuesto")?.addEventListener("input",updateTotals);

/* Quick add desde catálogo */
function fillQuickAdd(){
  const items = Store.getItems();
  const sel = byId("catalogQuickAdd");
  if(!sel) return;
  sel.innerHTML = `<option value="">— del catálogo —</option>` + items.map(i=>`<option value="${i.id}">${Utils.escape(i.name)} (${Utils.fmtMoney(i.price)})</option>`).join("");
}
byId("btnQuickAdd")?.addEventListener("click",()=>{ const id=byId("catalogQuickAdd").value; if(!id) return; const it=Store.getItems().find(i=>i.id===id); if(!it) return; addLineaRow({name:it.name,desc:it.desc||"",price:it.price||0,qty:1}); });

/* Guardar */
byId("btnGuardarBorrador")?.addEventListener("click",()=>{
  currentDoc = collectDoc(); currentDoc.status="borrador"; HistoryDB.save(currentDoc); renderHistorial();
  if (window.OasisSync?.syncToFirebase) window.OasisSync.syncToFirebase();
  alert("Borrador guardado.");
});
byId("docForm")?.addEventListener("submit",(e)=>{
  e.preventDefault();
  currentDoc = collectDoc(); currentDoc.status="final"; HistoryDB.save(currentDoc); renderHistorial();
  if (window.OasisSync?.syncToFirebase) window.OasisSync.syncToFirebase();
  Printer.openPrint(Printer.docHTML(currentDoc));
});
byId("btnDuplicar")?.addEventListener("click",()=>{ const tipo=currentDoc.type==="COT"?"FAC":currentDoc.type; const dup=Docs.duplicateAs(currentDoc,tipo); loadNewDoc(dup); alert(`Documento duplicado como ${tipo}.`); });
byId("btnAnular")?.addEventListener("click",()=>{ if(!confirm("¿Anular este documento?")) return; currentDoc.status="anulado"; HistoryDB.save(currentDoc); updateDocButtons(); renderHistorial(); });
byId("btnReemitir")?.addEventListener("click",()=>{ if(!confirm("Asignará un nuevo número. ¿Continuar?")) return; currentDoc=Docs.reemitNumber(collectDoc()); HistoryDB.save(currentDoc); byId("docPrefijo").value=currentDoc.prefix; byId("docNumero").value=currentDoc.number; renderHistorial(); });

/* ---------------------- Historial ---------------------- */
function renderHistorial(){
  const s=Store.get("settings"); const tbody = byId("histBody"); if(!tbody) return;
  const q = (byId("histSearch")?.value||"").toLowerCase().trim();
  const docs = HistoryDB.list().filter(d=>{
    if(!q) return true;
    const num = `${d.prefix||""}${d.number}`.toLowerCase();
    return (d.client||"").toLowerCase().includes(q) || num.includes(q) || (d.paymentMethod||"").toLowerCase().includes(q);
  });
  tbody.innerHTML = docs.map(d=>{ const t=Docs.calc(d).total;
    return `<tr>
      <td>${d.type}</td>
      <td>${d.prefix||""}${d.number}</td>
      <td>${Utils.fmtDate(d.date,s.locale)}</td>
      <td>${Utils.escape(d.client||"")}</td>
      <td>${Utils.escape(d.paymentMethod||"-")}</td>
      <td class="right">${Utils.fmtMoney(t,s.currency,s.locale)}</td>
      <td>${d.status}</td>
      <td class="no-print">
        <button class="btn btn-open" data-id="${d.id}">Abrir</button>
        <button class="btn btn-dupe" data-id="${d.id}">Duplicar</button>
        <button class="btn warn btn-ann" data-id="${d.id}">Anular</button>
        <button class="btn btn-pdf" data-id="${d.id}">PDF</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll(".btn-open").forEach(b=>b.onclick=()=>{ const d=HistoryDB.getById(b.dataset.id); loadNewDoc(structuredClone(d)); document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active")); byId("tab-nuevo").classList.add("active"); });
  tbody.querySelectorAll(".btn-dupe").forEach(b=>b.onclick=()=>{ const d=HistoryDB.getById(b.dataset.id); const tipo=d.type==="COT"?"FAC":d.type; const dup=Docs.duplicateAs(d,tipo); loadNewDoc(dup); document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active")); byId("tab-nuevo").classList.add("active"); });
  tbody.querySelectorAll(".btn-ann").forEach(b=>b.onclick=()=>{ const d=HistoryDB.getById(b.dataset.id); if(!confirm("¿Anular este documento?")) return; d.status="anulado"; HistoryDB.save(d); renderHistorial(); });
  tbody.querySelectorAll(".btn-pdf").forEach(b=>b.onclick=()=>{ const d=HistoryDB.getById(b.dataset.id); Printer.openPrint(Printer.docHTML(d)); });
  byId("histSearch")?.addEventListener("input", renderHistorial, { once:true });
}

/* ---------------------- Catálogo ---------------------- */
function renderItems(){
  const items = Store.getItems(); const body = byId("itemsBody"); if(!body) return;
  body.innerHTML = items.map(it=>`
    <tr>
      <td>${it.photo?`<img src="${it.photo}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #000">`:""}</td>
      <td><input class="i-name" data-id="${it.id}" value="${Utils.escape(it.name)}"></td>
      <td><input class="i-price" data-id="${it.id}" type="number" step="0.01" inputmode="decimal" value="${Number(it.price||0)}"></td>
      <td class="no-print">
        <button class="btn i-photo" data-id="${it.id}">Foto</button>
        <button class="btn warn i-del" data-id="${it.id}">Eliminar</button>
      </td>
    </tr>`).join("");

  body.querySelectorAll(".i-name,.i-price").forEach(inp=>{
    inp.addEventListener("change",()=>{ const id=inp.dataset.id; const arr=Store.getItems(); const it=arr.find(i=>i.id===id); if(!it) return;
      if(inp.classList.contains("i-name")) it.name=inp.value.trim();
      if(inp.classList.contains("i-price")) it.price=Utils.toNum(inp.value);
      Store.setItems(arr); fillQuickAdd();
    });
  });
  body.querySelectorAll(".i-del").forEach(btn=>btn.addEventListener("click",()=>{ if(!confirm("¿Eliminar este ítem?")) return; const arr=Store.getItems().filter(i=>i.id!==btn.dataset.id); Store.setItems(arr); renderItems(); fillQuickAdd(); }));
  body.querySelectorAll(".i-photo").forEach(btn=>btn.addEventListener("click",async()=>{ const id=btn.dataset.id; const arr=Store.getItems(); const it=arr.find(i=>i.id===id); if(!it) return;
    const ipt=document.createElement("input"); ipt.type="file"; ipt.accept="image/png,image/jpeg";
    ipt.onchange=async()=>{ const f=ipt.files[0]; if(!f) return; it.photo=await Utils.fileToDataURL(f); Store.setItems(arr); renderItems(); };
    ipt.click();
  }));

  // Form agregar (parte superior)
  byId("itemAgregar")?.addEventListener("click", async ()=>{
    const name = byId("itemNombre").value.trim();
    const price = Utils.toNum(byId("itemPrecio").value);
    const file = byId("itemFoto").files?.[0];
    if(!name){ alert("Nombre requerido"); return; }
    let photo = ""; if(file) photo = await Utils.fileToDataURL(file);
    const arr = Store.getItems(); arr.unshift({ id:Utils.uuid(), name, desc:"", price, photo });
    Store.setItems(arr); byId("itemNombre").value=""; byId("itemPrecio").value=""; if(byId("itemFoto")) byId("itemFoto").value="";
    renderItems(); fillQuickAdd(); alert("Ítem agregado.");
  }, { once:true });
}

/* ---------------------- Reportes ---------------------- */
function runReportDefault(){
  const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  // Por simplicidad, al entrar muestra todo
  renderReportTable(HistoryDB.list(), "Todo");
}
function renderReportTable(list, label){
  const s=Store.get("settings"); const body = byId("repBody"); if(!body) return;
  body.innerHTML = list.map(d=>`<tr>
    <td>${d.type}</td><td>${d.prefix||""}${d.number}</td><td>${Utils.fmtDate(d.date,s.locale)}</td>
    <td>${Utils.escape(d.client||"")}</td><td>${Utils.escape(d.paymentMethod||"-")}</td>
    <td class="right">${Utils.fmtMoney(Docs.calc(d).total,s.currency,s.locale)}</td><td>${d.status}</td></tr>`).join("");
  const sum = Reports.summarize(list);
  byId("repResumen").textContent =
    `FAC: ${sum.counts.FAC||0} (${Utils.fmtMoney(sum.totals.FAC||0,s.currency,s.locale)}) • `+
    `COT: ${sum.counts.COT||0} (${Utils.fmtMoney(sum.totals.COT||0,s.currency,s.locale)}) • `+
    `Total: ${sum.counts.ALL||0} (${Utils.fmtMoney(sum.totals.ALL||0,s.currency,s.locale)})`;
}
byId("btnRepRango")?.addEventListener("click",()=>{ const d=byId("repDesde").value, h=byId("repHasta").value; const list=Reports.filterRange(d,h); renderReportTable(list, "Rango"); });
byId("btnCSV")?.addEventListener("click",()=>{ const d=byId("repDesde").value, h=byId("repHasta").value; const list=d||h?Reports.filterRange(d,h):HistoryDB.list(); const csv=Reports.csv(list); Utils.download("reporte.csv", csv, "text/csv;charset=utf-8"); });
byId("btnPDF")?.addEventListener("click",()=>{ const d=byId("repDesde").value, h=byId("repHasta").value; const list=d||h?Reports.filterRange(d,h):HistoryDB.list(); const label = d||h?`${d||""} a ${h||""}`:"Todo"; const html=Printer.reportHTML(list,label); Printer.openPrint(html); });

/* ---------------------- Configuración ---------------------- */
function loadConfigForm(){
  const s=Store.get("settings");
  byId("cfgNombre").value = s.businessName||"";
  byId("cfgIVU").value = s.taxPercent??11.5;
  byId("cfgPrefFAC").value = s.prefixes.FAC||"FAC-";
  byId("cfgNextFAC").value = s.counters.FAC||1;
  byId("cfgPrefCOT").value = s.prefixes.COT||"COT-";
  byId("cfgNextCOT").value = s.counters.COT||1;
  if(s.logoDataUrl){ byId("cfgLogoPreview").src=s.logoDataUrl; byId("cfgLogoPreview").style.display="block"; } else { byId("cfgLogoPreview").style.display="none"; }
}
byId("btnGuardarConfig")?.addEventListener("click",()=>{
  Store.updateSettings({
    businessName: byId("cfgNombre").value.trim(),
    taxPercent: Utils.toNum(byId("cfgIVU").value)
  });
  Numbering.setPrefix("FAC", byId("cfgPrefFAC").value.trim()||"FAC-");
  Numbering.setPrefix("COT", byId("cfgPrefCOT").value.trim()||"COT-");
  Numbering.setCounter("FAC", Utils.toNum(byId("cfgNextFAC").value||1));
  Numbering.setCounter("COT", Utils.toNum(byId("cfgNextCOT").value||1));
  loadBrand(); fillQuickAdd(); updateTotals(); alert("Configuración guardada.");
});
byId("cfgLogo")?.addEventListener("change", async ()=>{ const f=byId("cfgLogo").files[0]; if(!f) return; const data=await Utils.fileToDataURL(f); Store.updateSettings({logoDataUrl:data}); byId("cfgLogoPreview").src=data; byId("cfgLogoPreview").style.display="block"; loadBrand(); });
byId("btnQuitarLogo")?.addEventListener("click",()=>{ Store.updateSettings({logoDataUrl:""}); byId("cfgLogoPreview").style.display="none"; loadBrand(); });

/* Cambiar PIN */
byId("btnLogout")?.addEventListener("click",()=>{ Session.end(); location.reload(); });
byId("btnReset")?.addEventListener("click",()=>{ if(!confirm("Esto borrará TODA la data local. ¿Continuar?")) return; Store.reset(); Session.end(); location.reload(); });

/* ---------------------- Helpers ---------------------- */
function byId(id){ return document.getElementById(id); }

/* ---------------------- Fin ---------------------- */
