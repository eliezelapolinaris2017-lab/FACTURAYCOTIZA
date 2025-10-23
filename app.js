/* Oasis — 100% local. HTML+CSS+JS puro. Sin dependencias externas. */

/* ================= Utils ================= */
const Utils = {
  fmtMoney(n, currency="USD", locale="es-PR"){
    const v = Number(n || 0);
    return new Intl.NumberFormat(locale,{style:"currency",currency}).format(v);
  },
  toNumber(v){
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  },
  todayISO(){
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  },
  uuid(){
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
  },
  async hashPIN(pin){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  },
  download(filename, text){
    const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
  formatDate(dateISO, locale){
    try{ return new Date(dateISO).toLocaleDateString(locale||"es-PR",{year:'numeric',month:'2-digit',day:'2-digit'}); }
    catch{ return dateISO; }
  }
};

/* ================ Sesión ================ */
const Session = (() => {
  const KEY = "oasis.session.v1";
  const DURATION_MS = 8*60*60*1000;
  const now = () => Date.now();
  const get = () => { try{ return JSON.parse(localStorage.getItem(KEY)); } catch{ return null; } };
  const isActive = () => { const s = get(); return !!(s && s.expiresAt > now()); };
  const start = () => { const ses={token:Utils.uuid(),issuedAt:now(),expiresAt:now()+DURATION_MS}; localStorage.setItem(KEY, JSON.stringify(ses)); return ses; };
  const end = () => localStorage.removeItem(KEY);
  const touch = () => { const s=get(); if(!s) return; s.expiresAt=now()+DURATION_MS; localStorage.setItem(KEY, JSON.stringify(s)); };
  return { isActive, start, end, touch };
})();

/* ================= Store ================= */
const Store = (() => {
  const KEYS = { settings:"oasis.settings.v1", items:"oasis.items.v1", docs:"oasis.docs.v1" };
  const DEFAULTS = {
    settings:{
      businessName:"Mi Negocio",
      currency:"USD",
      locale:"es-PR",
      taxPercent:11.5,
      prefixes:{ FAC:"FAC-", COT:"COT-" },
      counters:{ FAC:1, COT:1 },
      logoDataUrl:"",
      pinHash:""
    },
    items:[
      { id: Utils.uuid(), name:"Servicio básico", desc:"Mano de obra", price:50 },
      { id: Utils.uuid(), name:"Producto estándar", desc:"Artículo genérico", price:25 }
    ],
    docs:[]
  };
  function get(key){ const raw=localStorage.getItem(KEYS[key]); if(!raw) return null; try{ return JSON.parse(raw); } catch { return null; } }
  function set(key,val){ localStorage.setItem(KEYS[key], JSON.stringify(val)); }
  function ensureSeeds(){ if(!get("settings")) set("settings", DEFAULTS.settings); if(!get("items")) set("items", DEFAULTS.items); if(!get("docs")) set("docs", DEFAULTS.docs); }
  function resetAll(){ Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); ensureSeeds(); }
  function updateSettings(patch){ const s=get("settings")||DEFAULTS.settings; const merged={...s,...patch}; set("settings", merged); return merged; }
  function setPINHash(pinHash){ const s=get("settings")||DEFAULTS.settings; s.pinHash=pinHash; set("settings", s); }
  function getDocs(){ return get("docs") || []; }
  function saveDoc(doc){ const arr=getDocs(); const i=arr.findIndex(d=>d.id===doc.id); if(i>=0) arr[i]=doc; else arr.unshift(doc); set("docs", arr); }
  function getItems(){ return get("items") || []; }
  function setItems(arr){ set("items", arr); }
  return { KEYS, DEFAULTS, get, set, ensureSeeds, resetAll, updateSettings, setPINHash, getDocs, saveDoc, getItems, setItems };
})();

/* =============== Numbering =============== */
const Numbering = (() => {
  function next(tipo){ const s=Store.get("settings"); const n=s.counters[tipo]||1; s.counters[tipo]=n+1; Store.updateSettings({counters:s.counters}); return n; }
  function currentPrefix(tipo){ const s=Store.get("settings"); return s.prefixes[tipo] || (tipo+"-"); }
  function setCounter(tipo,num){ const s=Store.get("settings"); s.counters[tipo]=Number(num)||1; Store.updateSettings({counters:s.counters}); }
  function setPrefix(tipo,pref){ const s=Store.get("settings"); s.prefixes[tipo]=pref; Store.updateSettings({prefixes:s.prefixes}); }
  return { next, currentPrefix, setCounter, setPrefix };
})();

/* ================== Docs ================= */
const Docs = (() => {
  function calc(doc){
    const lines = doc.lines || [];
    const subtotal = lines.reduce((sum,l)=>sum+(Utils.toNumber(l.price)*Utils.toNumber(l.qty||1)),0);
    const descAmt = subtotal * (Utils.toNumber(doc.discountPct)/100);
    const base = subtotal - descAmt;
    const taxAmt = base * (Utils.toNumber(doc.taxPct)/100);
    const total = base + taxAmt;
    return { subtotal, descAmt, taxAmt, total };
  }
  function createEmpty(){
    const s=Store.get("settings");
    return { id:Utils.uuid(), type:"COT", number:Numbering.next("COT"), prefix:Numbering.currentPrefix("COT"),
      date:Utils.todayISO(), client:"", notes:"", lines:[], discountPct:0, taxPct:s.taxPercent, status:"borrador",
      paymentMethod:"", paymentRef:"" };
  }
  function duplicateAs(doc,newType){
    const clone=structuredClone(doc);
    clone.id=Utils.uuid();
    clone.type=newType||doc.type;
    clone.prefix=Numbering.currentPrefix(clone.type);
    clone.number=Numbering.next(clone.type);
    clone.status="borrador";
    clone.date=Utils.todayISO();
    return clone;
  }
  function reemitNumber(doc){ doc.prefix=Numbering.currentPrefix(doc.type); doc.number=Numbering.next(doc.type); return doc; }
  return { calc, createEmpty, duplicateAs, reemitNumber };
})();

/* ================ Printer ================ */
const Printer = (() => {
  function businessHeader(){
    const s=Store.get("settings");
    return { name:s.businessName||"Mi Negocio", logo:s.logoDataUrl||"", locale:s.locale||"es-PR", currency:s.currency||"USD" };
  }
  function docHTML(doc){
    const { name,logo,locale,currency } = businessHeader();
    const totals = Docs.calc(doc);
    const dateStr = Utils.formatDate(doc.date, locale);
    const numStr = `${doc.prefix||""}${doc.number}`;
    const title = doc.type==="FAC" ? "Factura" : "Cotización";
    const rows = (doc.lines||[]).map(l=>`
      <tr>
        <td>${escapeHTML(l.name||"")}</td>
        <td>${escapeHTML(l.desc||"")}</td>
        <td style="text-align:right">${Utils.fmtMoney(l.price,currency,locale)}</td>
        <td style="text-align:right">${l.qty||1}</td>
        <td style="text-align:right">${Utils.fmtMoney((l.price||0)*(l.qty||1),currency,locale)}</td>
      </tr>`).join("");
    const pago = doc.paymentMethod ? `<div><strong>Pago:</strong> ${escapeHTML(doc.paymentMethod)}${doc.paymentRef ? " — Ref: "+escapeHTML(doc.paymentRef) : ""}</div>` : "";
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${numStr}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:10mm;}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:8px}
.p-title{font-size:22px;font-weight:800;margin:4px 0 10px}
.p-meta{font-size:12px;color:#222}
.p-table{width:100%;border-collapse:collapse;font-size:12px}
.p-table th,.p-table td{border:1px solid #ccc;padding:6px}
.p-totals{margin-top:12px;display:flex;justify-content:flex-end}
.p-totals table{border-collapse:collapse}
.p-totals td{border:1px solid #ccc;padding:5px 8px}
.p-notes{margin-top:12px;font-size:12px;white-space:pre-wrap}
@page{size:auto;margin:12mm}
</style></head><body>
<div class="p-head">
  <div>
    <div class="p-title">${title}</div>
    <div class="p-meta">
      <div><strong>Número:</strong> ${numStr}</div>
      <div><strong>Fecha:</strong> ${dateStr}</div>
      <div><strong>Cliente:</strong> ${escapeHTML(doc.client||"")}</div>
      ${pago}
      <div><strong>Estado:</strong> ${doc.status}</div>
    </div>
  </div>
  <div style="text-align:right">${logo?`<img src="${logo}" alt="Logo">`:""}<div style="margin-top:6px;font-weight:700">${escapeHTML(name)}</div></div>
</div>
<table class="p-table"><thead><tr><th>Ítem</th><th>Detalle</th><th style="text-align:right">Precio</th><th style="text-align:right">Cant.</th><th style="text-align:right">Importe</th></tr></thead><tbody>${rows}</tbody></table>
<div class="p-totals"><table>
  <tr><td>Subtotal</td><td style="text-align:right">${Utils.fmtMoney(totals.subtotal,currency,locale)}</td></tr>
  <tr><td>Descuento (${doc.discountPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(totals.descAmt,currency,locale)}</td></tr>
  <tr><td>IVU (${doc.taxPct||0}%)</td><td style="text-align:right">${Utils.fmtMoney(totals.taxAmt,currency,locale)}</td></tr>
  <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${Utils.fmtMoney(totals.total,currency,locale)}</strong></td></tr>
</table></div>
${doc.notes?`<div class="p-notes"><strong>Notas:</strong>\n${escapeHTML(doc.notes)}</div>`:""}
<script>window.onload=()=>window.print();</script></body></html>`;
  }
  function reportHTML(list, label){
    const { name,logo,locale,currency } = businessHeader();
    const rows = list.map(d=>`
      <tr>
        <td>${d.type}</td>
        <td>${d.prefix||""}${d.number}</td>
        <td style="text-align:right">${Utils.formatDate(d.date,locale)}</td>
        <td>${escapeHTML(d.client||"")}</td>
        <td>${escapeHTML(d.paymentMethod||"-")}</td>
        <td style="text-align:right">${Utils.fmtMoney(Docs.calc(d).total,currency,locale)}</td>
        <td>${d.status}</td>
      </tr>`).join("");
    const totals = Reports.summarize(list);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${label}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:10mm;}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:8px}
.p-title{font-size:22px;font-weight:800;margin:4px 0 10px}
.p-table{width:100%;border-collapse:collapse;font-size:12px}
.p-table th,.p-table td{border:1px solid #ccc;padding:6px}
.p-summary{margin:10px 0;font-size:13px}
@page{size:auto;margin:12mm}
</style></head><body>
<div class="p-head">
  <div>
    <div class="p-title">Reporte — ${label}</div>
    <div class="p-summary">
      FAC: ${totals.counts.FAC||0} | ${Utils.fmtMoney(totals.totals.FAC||0,currency,locale)} •
      COT: ${totals.counts.COT||0} | ${Utils.fmtMoney(totals.totals.COT||0,currency,locale)} •
      Total: ${totals.counts.ALL||0} | ${Utils.fmtMoney(totals.totals.ALL||0,currency,locale)}
    </div>
  </div>
  <div style="text-align:right">${logo?`<img src="${logo}" alt="Logo">`:""}<div style="margin-top:6px;font-weight:700">${escapeHTML(name)}</div></div>
</div>
<table class="p-table">
  <thead><tr><th>Tipo</th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Estado</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload=()=>window.print();</script></body></html>`;
  }
  function openPrint(html){ const w=window.open("","_blank"); w.document.open(); w.document.write(html); w.document.close(); }
  return { docHTML, reportHTML, openPrint };
})();

/* ================ Reports ================ */
const Reports = (() => {
  function filterByRange(desdeISO, hastaISO){
    const docs = Store.getDocs().filter(d=>d.status!=="anulado");
    const from = desdeISO ? new Date(desdeISO) : null;
    const to = hastaISO ? new Date(hastaISO) : null;
    return docs.filter(d=>{
      const dd = new Date(d.date);
      if(from && dd < from) return false;
      if(to){ const end=new Date(hastaISO); end.setHours(23,59,59,999); if(dd > end) return false; }
      return true;
    });
  }
  function filterByMonth(yyyyMM){
    const [y,m] = yyyyMM.split("-").map(Number);
    const desde = `${y}-${String(m).padStart(2,"0")}-01`;
    const fin = new Date(y, m, 0);
    const hastaISO = `${fin.getFullYear()}-${String(fin.getMonth()+1).padStart(2,"0")}-${String(fin.getDate()).padStart(2,"0")}`;
    return filterByRange(desde, hastaISO);
  }
  function summarize(list){
    const out = { counts:{FAC:0,COT:0,ALL:0}, totals:{FAC:0,COT:0,ALL:0} };
    list.forEach(d=>{ const t=Docs.calc(d).total; out.counts[d.type]=(out.counts[d.type]||0)+1; out.totals[d.type]=(out.totals[d.type]||0)+t; out.counts.ALL++; out.totals.ALL+=t; });
    return out;
  }
  function toCSV(list){
    const rows=[["tipo","numero","fecha","cliente","subtotal","descuento","ivu","total","estado","pago","pago_ref"]];
    list.forEach(d=>{ const c=Docs.calc(d); rows.push([ d.type, `${d.prefix||""}${d.number}`, d.date, d.client||"", c.subtotal.toFixed(2), c.descAmt.toFixed(2), c.taxAmt.toFixed(2), c.total.toFixed(2), d.status, d.paymentMethod||"", d.paymentRef||"" ]); });
    return rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  }
  return { filterByRange, filterByMonth, summarize, toCSV };
})();

/* =================== UI ================== */
const UI = (() => {
  const els = {
    /* Drawer */
    drawer: document.getElementById("drawer"),
    drawerOverlay: document.getElementById("drawerOverlay"),
    btnDrawerOpen: document.getElementById("btnDrawerOpen"),
    btnDrawerClose: document.getElementById("btnDrawerClose"),
    sections: document.querySelectorAll(".tab"),
    /* Auth */
    authOverlay: document.getElementById("authOverlay"),
    authTitle: document.getElementById("authTitle"),
    authSubtitle: document.getElementById("authSubtitle"),
    authLabelPIN: document.getElementById("authLabelPIN"),
    authLabelPIN2: document.getElementById("authLabelPIN2"),
    authPin: document.getElementById("authPin"),
    authPin2: document.getElementById("authPin2"),
    authBtn: document.getElementById("authBtn"),
    authMsg: document.getElementById("authMsg"),
    authForm: document.getElementById("authForm"),
    /* Nuevo */
    docForm: document.getElementById("docForm"),
    docTipo: document.getElementById("docTipo"),
    docPrefijo: document.getElementById("docPrefijo"),
    docNumero: document.getElementById("docNumero"),
    docFecha: document.getElementById("docFecha"),
    docCliente: document.getElementById("docCliente"),
    docNotas: document.getElementById("docNotas"),
    docPago: document.getElementById("docPago"),
    docPagoRef: document.getElementById("docPagoRef"),
    docDescuento: document.getElementById("docDescuento"),
    docImpuesto: document.getElementById("docImpuesto"),
    lineasBody: document.getElementById("lineasBody"),
    sumSubtotal: document.getElementById("sumSubtotal"),
    sumDesc: document.getElementById("sumDesc"),
    sumImpuesto: document.getElementById("sumImpuesto"),
    sumTotal: document.getElementById("sumTotal"),
    btnAddLinea: document.getElementById("btnAddLinea"),
    btnQuickAdd: document.getElementById("btnQuickAdd"),
    catalogQuickAdd: document.getElementById("catalogQuickAdd"),
    btnGuardarBorrador: document.getElementById("btnGuardarBorrador"),
    btnGuardarFinal: document.getElementById("btnGuardarFinal"),
    btnDuplicar: document.getElementById("btnDuplicar"),
    btnAnular: document.getElementById("btnAnular"),
    btnReemitir: document.getElementById("btnReemitir"),
    /* Historial */
    histBody: document.getElementById("histBody"),
    histSearch: document.getElementById("histSearch"),
    /* Catálogo */
    itemForm: document.getElementById("itemForm"),
    itemNombre: document.getElementById("itemNombre"),
    itemDesc: document.getElementById("itemDesc"),
    itemPrecio: document.getElementById("itemPrecio"),
    itemsBody: document.getElementById("itemsBody"),
    itemMsg: document.getElementById("itemMsg"),
    /* Reportes */
    repDesde: document.getElementById("repDesde"),
    repHasta: document.getElementById("repHasta"),
    repMes: document.getElementById("repMes"),
    btnRepRango: document.getElementById("btnRepRango"),
    btnRepMes: document.getElementById("btnRepMes"),
    repBody: document.getElementById("repBody"),
    /* Totales resumen */
    cntFAC: document.getElementById("cntFAC"),
    cntCOT: document.getElementById("cntCOT"),
    cntALL: document.getElementById("cntALL"),
    totFAC: document.getElementById("totFAC"),
    totCOT: document.getElementById("totCOT"),
    totALL: document.getElementById("totALL"),
    btnCSV: document.getElementById("btnCSV"),
    btnPDF: document.getElementById("btnPDF"),
    /* PWA */
    pwaHomeBtn: document.getElementById("pwaHomeBtn"),
  };

  let currentDoc = null;

  /* Drawer */
  function openDrawer(){ els.drawer.classList.add("open"); els.drawerOverlay.classList.add("open"); els.drawer.setAttribute("aria-hidden","false"); }
  function closeDrawer(){ els.drawer.classList.remove("open"); els.drawerOverlay.classList.remove("open"); els.drawer.setAttribute("aria-hidden","true"); }
  function toggleDrawer(){ els.drawer.classList.contains("open") ? closeDrawer() : openDrawer(); }
  els.btnDrawerOpen.addEventListener("click", toggleDrawer);
  els.btnDrawerClose.addEventListener("click", closeDrawer);
  els.drawerOverlay.addEventListener("click", closeDrawer);
  window.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDrawer(); });
  document.querySelectorAll(".drawer-item").forEach(b => b.addEventListener("click", ()=>{ location.hash = b.dataset.href; closeDrawer(); }));

  /* Navegación hash */
  const HASH_TO_TAB = { "#nuevo":"tab-nuevo", "#historial":"tab-historial", "#catalogo":"tab-catalogo", "#reportes":"tab-reportes", "#config":"tab-config" };
  function highlightDrawer(hash){ document.querySelectorAll(".drawer-item").forEach(b=>b.classList.toggle("active", b.dataset.href===hash)); }
  function activateTabByHash(){
    const hash=location.hash || "#nuevo";
    const id = HASH_TO_TAB[hash] || "tab-nuevo";
    els.sections.forEach(s=>s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    highlightDrawer(hash);
    if(id==="tab-historial") renderHistorial();
    if(id==="tab-catalogo") renderItems();
    if(id==="tab-reportes") runReportCurrent();
    if(id==="tab-config") loadConfigForm();
    updatePwaHomeVisibility();
  }
  window.addEventListener("hashchange", activateTabByHash);

  /* PWA: botón volver al inicio */
  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function updatePwaHomeVisibility(){
    if(!els.pwaHomeBtn) return;
    const onInicio = (location.hash || "#nuevo") === "#nuevo";
    els.pwaHomeBtn.style.display = (isStandalone() && !onInicio) ? "inline-flex" : "none";
  }
  els.pwaHomeBtn?.addEventListener("click", ()=>{ location.hash="#nuevo"; });

  /* Volver al inicio (botones internos) */
  document.addEventListener("click", (e)=>{
    const btn=e.target.closest("[data-goto]");
    if(btn){ e.preventDefault(); location.hash=btn.getAttribute("data-goto"); }
  });

  /* AUTH / PIN */
  async function initAuth(){
    if(Session.isActive()){ els.authOverlay.style.display="none"; afterLogin(); return; }
    const s=Store.get("settings");
    if(!s.pinHash){
      setAuthUI({title:"Protege tu app",subtitle:"Crea un PIN para este dispositivo.",labelPIN:"Elige un PIN",newPIN:true,btnText:"Crear PIN"});
      els.authForm.onsubmit = async (e)=>{ e.preventDefault(); const p1=els.authPin.value.trim(), p2=els.authPin2.value.trim();
        if(p1.length<4) return showAuthMsg("El PIN debe tener al menos 4 dígitos.");
        if(p1!==p2) return showAuthMsg("Los PIN no coinciden.");
        Store.setPINHash(await Utils.hashPIN(p1)); Session.start(); els.authOverlay.style.display="none"; afterLogin();
      };
    } else {
      setAuthUI({title:"Ingresa tu PIN",subtitle:"Tu PIN se guarda localmente.",labelPIN:"PIN",newPIN:false,btnText:"Entrar"});
      els.authForm.onsubmit = async (e)=>{ e.preventDefault(); const p=els.authPin.value.trim(); const ok=(await Utils.hashPIN(p))===Store.get("settings").pinHash;
        if(ok){ Session.start(); els.authOverlay.style.display="none"; afterLogin(); } else showAuthMsg("PIN incorrecto."); };
    }
  }
  function setAuthUI({title,subtitle,labelPIN,newPIN,btnText}){
    els.authTitle.textContent=title; els.authSubtitle.textContent=subtitle; els.authLabelPIN.textContent=labelPIN;
    els.authLabelPIN2.classList.toggle("hidden",!newPIN); els.authPin2.classList.toggle("hidden",!newPIN);
    els.authBtn.textContent=btnText; els.authMsg.textContent="";
  }
  function showAuthMsg(t){ els.authMsg.textContent=t; }
  ["click","keydown","touchstart"].forEach(evt=>window.addEventListener(evt,()=>Session.touch(),{passive:true}));

  /* Post-login */
  function afterLogin(){
    loadBrand();
    loadNewDoc(Docs.createEmpty());
    renderItems();
    fillQuickAdd();
    renderHistorial();
    loadConfigForm();
    activateTabByHash();
    updatePwaHomeVisibility();
  }
  function loadBrand(){
    const s=Store.get("settings");
    document.getElementById("drawerName").textContent = s.businessName || "Oasis";
    const brandLogo=document.getElementById("brandLogo"), drawerLogo=document.getElementById("drawerLogo");
    if(s.logoDataUrl){ brandLogo.src=s.logoDataUrl; brandLogo.style.display="block"; drawerLogo.src=s.logoDataUrl; drawerLogo.style.display="block"; }
    else{ brandLogo.style.display="none"; drawerLogo.style.display="none"; }
  }

  /* NUEVO */
  function loadNewDoc(doc){
    currentDoc=doc;
    const s=Store.get("settings");
    els.docTipo.value=doc.type;
    els.docPrefijo.value=doc.prefix||Numbering.currentPrefix(doc.type);
    els.docNumero.value=doc.number;
    els.docFecha.value=doc.date||Utils.todayISO();
    els.docCliente.value=doc.client||"";
    els.docNotas.value=doc.notes||"";
    els.docPago.value=doc.paymentMethod||"";
    els.docPagoRef.value=doc.paymentRef||"";
    els.docDescuento.value=doc.discountPct??0;
    els.docImpuesto.value=doc.taxPct??s.taxPercent;
    els.lineasBody.innerHTML="";
    (doc.lines||[]).forEach(addLineaRow);
    if((doc.lines||[]).length===0) addLineaRow();
    updateTotals(); updateDocButtons();
  }
  function updateDocButtons(){
    const ann = currentDoc.status==="anulado";
    els.btnAnular.disabled=ann; els.btnReemitir.disabled=ann; els.btnGuardarFinal.disabled=ann;
  }
  function addLineaRow(line={name:"",desc:"",price:0,qty:1}){
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><input class="l-name" placeholder="Nombre ítem" value="${escapeAttr(line.name||"")}"></td>
      <td><input class="l-desc" placeholder="Descripción" value="${escapeAttr(line.desc||"")}"></td>
      <td><input class="l-price" type="number" step="0.01" inputmode="decimal" value="${Number(line.price||0)}"></td>
      <td><input class="l-qty" type="number" step="1" inputmode="numeric" value="${Number(line.qty||1)}"></td>
      <td class="right l-imp">$0.00</td>
      <td class="no-print"><button type="button" class="btn btn-del">X</button></td>`;
    const recalcLine=()=>{ const s=Store.get("settings"); const imp=Utils.toNumber(tr.querySelector(".l-price").value)*Utils.toNumber(tr.querySelector(".l-qty").value||1); tr.querySelector(".l-imp").textContent=Utils.fmtMoney(imp,s.currency,s.locale); updateTotals(); };
    [".l-price",".l-qty",".l-name",".l-desc"].forEach(sel=>tr.querySelector(sel).addEventListener("input",recalcLine));
    tr.querySelector(".btn-del").addEventListener("click",()=>{ tr.remove(); updateTotals(); });
    els.lineasBody.appendChild(tr); recalcLine();
  }
  function collectDocFromForm(){
    const lines=[...els.lineasBody.querySelectorAll("tr")].map(tr=>({
      name: tr.querySelector(".l-name").value.trim(),
      desc: tr.querySelector(".l-desc").value.trim(),
      price: Utils.toNumber(tr.querySelector(".l-price").value),
      qty: Utils.toNumber(tr.querySelector(".l-qty").value||1)
    })).filter(l=>l.name||l.desc||l.price);
    return { ...currentDoc,
      type:els.docTipo.value,
      prefix:els.docPrefijo.value.trim()||Numbering.currentPrefix(els.docTipo.value),
      number:Utils.toNumber(els.docNumero.value)||currentDoc.number,
      date:els.docFecha.value||Utils.todayISO(),
      client:els.docCliente.value.trim(),
      notes:els.docNotas.value.trim(),
      paymentMethod:els.docPago.value||"",
      paymentRef:els.docPagoRef.value.trim()||"",
      discountPct:Utils.toNumber(els.docDescuento.value||0),
      taxPct:Utils.toNumber(els.docImpuesto.value||0),
      lines
    };
  }
  function updateTotals(){
    const doc=collectDocFromForm(); const s=Store.get("settings"); const t=Docs.calc(doc);
    els.sumSubtotal.textContent=Utils.fmtMoney(t.subtotal,s.currency,s.locale);
    els.sumDesc.textContent=Utils.fmtMoney(t.descAmt,s.currency,s.locale);
    els.sumImpuesto.textContent=Utils.fmtMoney(t.taxAmt,s.currency,s.locale);
    els.sumTotal.textContent=Utils.fmtMoney(t.total,s.currency,s.locale);
  }
  els.docTipo.addEventListener("change",()=>{
    const tipo=els.docTipo.value;
    els.docPrefijo.value=Numbering.currentPrefix(tipo);
    els.docNumero.value=Numbering.next(tipo);
    currentDoc.type=tipo; currentDoc.prefix=els.docPrefijo.value; currentDoc.number=Number(els.docNumero.value);
  });
  els.btnAddLinea.addEventListener("click",()=>addLineaRow());
  function fillQuickAdd(){
    const items = Store.getItems();
    els.catalogQuickAdd.innerHTML = `<option value="">— del catálogo —</option>` + items.map(i=>`<option value="${i.id}">${escapeHTML(i.name)} (${Utils.fmtMoney(i.price)})</option>`).join("");
  }
  els.btnQuickAdd.addEventListener("click",()=>{
    const id=els.catalogQuickAdd.value; if(!id) return;
    const it=Store.getItems().find(i=>i.id===id); if(!it) return;
    addLineaRow({name:it.name,desc:it.desc||"",price:it.price||0,qty:1});
  });
  els.docForm.addEventListener("input",(e)=>{ if(e.target.id==="docDescuento"||e.target.id==="docImpuesto") updateTotals(); });

  // Guardado / PDF
  els.btnGuardarBorrador.addEventListener("click",()=>{
    currentDoc=collectDocFromForm(); currentDoc.status="borrador"; Store.saveDoc(currentDoc);
    toast("Borrador guardado."); renderHistorial();
  });
  els.docForm.addEventListener("submit",(e)=>{
    e.preventDefault();
    currentDoc=collectDocFromForm(); currentDoc.status="final"; Store.saveDoc(currentDoc); renderHistorial();
    Printer.openPrint(Printer.docHTML(currentDoc));
  });
  els.btnDuplicar.addEventListener("click",()=>{
    const tipo= currentDoc.type==="COT" ? "FAC" : currentDoc.type;
    const dup=Docs.duplicateAs(currentDoc,tipo);
    loadNewDoc(dup);
    toast(`Documento duplicado como ${tipo}.`);
  });
  els.btnAnular.addEventListener("click",()=>{
    if(!confirm("¿Anular este documento?")) return;
    currentDoc.status="anulado"; Store.saveDoc(currentDoc); updateDocButtons(); renderHistorial(); toast("Documento anulado.");
  });
  els.btnReemitir.addEventListener("click",()=>{
    if(!confirm("Asignará un nuevo número según el consecutivo actual. ¿Continuar?")) return;
    currentDoc=Docs.reemitNumber(collectDocFromForm()); Store.saveDoc(currentDoc);
    els.docPrefijo.value=currentDoc.prefix; els.docNumero.value=currentDoc.number; renderHistorial(); toast("Número re-emitido.");
  });

  /* Historial */
  function renderHistorial(){
    const q=els.histSearch?.value?.toLowerCase()?.trim()||"";
    const s=Store.get("settings");
    const docs=Store.getDocs().filter(d=>{
      if(!q) return true;
      return (d.client||"").toLowerCase().includes(q) || `${d.prefix||""}${d.number}`.toLowerCase().includes(q) || (d.paymentMethod||"").toLowerCase().includes(q);
    });
    if(!els.histBody) return;
    els.histBody.innerHTML = docs.map(d=>{
      const t=Docs.calc(d); const pago=d.paymentMethod ? escapeHTML(d.paymentMethod) : "-";
      return `<tr>
        <td>${d.type}</td>
        <td>${d.prefix||""}${d.number}</td>
        <td>${Utils.formatDate(d.date,s.locale)}</td>
        <td>${escapeHTML(d.client||"")}</td>
        <td>${pago}</td>
        <td class="right">${Utils.fmtMoney(t.total,s.currency,s.locale)}</td>
        <td>${d.status}</td>
        <td class="no-print">
          <button class="btn btn-open" data-id="${d.id}">Abrir</button>
          <button class="btn btn-dupe" data-id="${d.id}">Duplicar</button>
          <button class="btn warn btn-ann" data-id="${d.id}">Anular</button>
          <button class="btn btn-pdf" data-id="${d.id}">PDF</button>
        </td>
      </tr>`;
    }).join("");
    // acciones
    els.histBody.querySelectorAll(".btn-open").forEach(b=>b.onclick=()=>{ const d=Store.getDocs().find(x=>x.id===b.dataset.id); loadNewDoc(structuredClone(d)); location.hash="#nuevo"; });
    els.histBody.querySelectorAll(".btn-dupe").forEach(b=>b.onclick=()=>{ const d=Store.getDocs().find(x=>x.id===b.dataset.id); const tipo=d.type==="COT"?"FAC":d.type; const dup=Docs.duplicateAs(d,tipo); loadNewDoc(dup); location.hash="#nuevo"; });
    els.histBody.querySelectorAll(".btn-ann").forEach(b=>b.onclick=()=>{ const d=Store.getDocs().find(x=>x.id===b.dataset.id); if(!confirm("¿Anular este documento?")) return; d.status="anulado"; Store.saveDoc(d); renderHistorial(); });
    els.histBody.querySelectorAll(".btn-pdf").forEach(b=>b.onclick=()=>{ const d=Store.getDocs().find(x=>x.id===b.dataset.id); Printer.openPrint(Printer.docHTML(d)); });
    els.histSearch?.addEventListener("input", renderHistorial, { once:true });
  }

  /* Catálogo — FIX: guardar nuevos ítems */
  function renderItems(){
    const items=Store.getItems();
    if(!els.itemsBody) return;
    els.itemsBody.innerHTML = items.map(it=>`
      <tr>
        <td><input data-id="${it.id}" class="i-name" value="${escapeAttr(it.name)}"></td>
        <td><input data-id="${it.id}" class="i-desc" value="${escapeAttr(it.desc||"")}"></td>
        <td><input data-id="${it.id}" class="i-price" type="number" step="0.01" inputmode="decimal" value="${Number(it.price||0)}"></td>
        <td class="no-print"><button class="btn i-del" data-id="${it.id}">Eliminar</button></td>
      </tr>`).join("");
    // Editar en línea
    els.itemsBody.querySelectorAll(".i-name,.i-desc,.i-price").forEach(inp=>{
      inp.addEventListener("change",()=>{
        const id=inp.dataset.id; const arr=Store.getItems(); const it=arr.find(i=>i.id===id); if(!it) return;
        if(inp.classList.contains("i-name")) it.name=inp.value.trim();
        if(inp.classList.contains("i-desc")) it.desc=inp.value.trim();
        if(inp.classList.contains("i-price")) it.price=Utils.toNumber(inp.value);
        Store.setItems(arr); fillQuickAdd(); toast("Ítem actualizado.");
      });
    });
    // Eliminar
    els.itemsBody.querySelectorAll(".i-del").forEach(btn=>{
      btn.addEventListener("click",()=>{
        if(!confirm("¿Eliminar este ítem del catálogo?")) return;
        const id=btn.dataset.id;
        Store.setItems(Store.getItems().filter(i=>i.id!==id));
        renderItems(); fillQuickAdd(); toast("Ítem eliminado.");
      });
    });
  }

  // SUBMIT NUEVO ÍTEM (soluciona que no guardaba)
  els.itemForm?.addEventListener("submit",(e)=>{
    e.preventDefault();
    const nombre = (els.itemNombre.value||"").trim();
    const desc = (els.itemDesc.value||"").trim();
    const precio = Utils.toNumber(els.itemPrecio.value);
    if(!nombre){ showItemMsg("Escribe un nombre para el ítem."); return; }
    if(precio<=0){ showItemMsg("El precio debe ser mayor a 0."); return; }
    const nuevo = { id: Utils.uuid(), name: nombre, desc, price: precio };
    const arr = Store.getItems();
    arr.unshift(nuevo);
    Store.setItems(arr);
    els.itemNombre.value = ""; els.itemDesc.value = ""; els.itemPrecio.value = "";
    renderItems(); fillQuickAdd();
    showItemMsg("Ítem guardado en el catálogo.", true);
  });
  function showItemMsg(text, ok=false){
    if(!els.itemMsg) return;
    els.itemMsg.textContent = text;
    els.itemMsg.style.color = ok ? "#9EE493" : "#ffcc99";
    setTimeout(()=>{ els.itemMsg.textContent=""; }, 2500);
  }

  function fillQuickAdd(){ const items=Store.getItems(); els.catalogQuickAdd.innerHTML=`<option value="">— del catálogo —</option>`+items.map(i=>`<option value="${i.id}">${escapeHTML(i.name)} (${Utils.fmtMoney(i.price)})</option>`).join(""); }

  /* Reportes */
  function renderReportTable(list){
    const s=Store.get("settings"); if(!els.repBody) return;
    els.repBody.innerHTML = list.map(d=>{
      const t=Docs.calc(d).total;
      return `<tr>
        <td>${d.type}</td>
        <td>${d.prefix||""}${d.number}</td>
        <td>${Utils.formatDate(d.date,s.locale)}</td>
        <td>${escapeHTML(d.client||"")}</td>
        <td>${escapeHTML(d.paymentMethod||"-")}</td>
        <td class="right">${Utils.fmtMoney(t,s.currency,s.locale)}</td>
        <td>${d.status}</td>
      </tr>`;
    }).join("");
    const sum=Reports.summarize(list);
    document.getElementById("cntFAC").textContent=sum.counts.FAC||0;
    document.getElementById("cntCOT").textContent=sum.counts.COT||0;
    document.getElementById("cntALL").textContent=sum.counts.ALL||0;
    document.getElementById("totFAC").textContent=Utils.fmtMoney(sum.totals.FAC||0,s.currency,s.locale);
    document.getElementById("totCOT").textContent=Utils.fmtMoney(sum.totals.COT||0,s.currency,s.locale);
    document.getElementById("totALL").textContent=Utils.fmtMoney(sum.totals.ALL||0,s.currency,s.locale);
  }
  function runReportRange(){ const d=els.repDesde.value; const h=els.repHasta.value; const list=Reports.filterByRange(d,h); renderReportTable(list); return { list, label: labelFromRange(d,h) }; }
  function runReportMonth(){ const m=els.repMes.value; if(!m){ alert("Selecciona un mes."); return { list:[], label:"Mes (sin seleccionar)" }; } const list=Reports.filterByMonth(m); renderReportTable(list); return { list, label: labelFromMonth(m) }; }
  function runReportCurrent(){ const now=new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`; els.repMes.value=ym; return runReportMonth(); }
  function labelFromRange(d,h){ if(d&&h) return `${Utils.formatDate(d,Store.get("settings").locale)} a ${Utils.formatDate(h,Store.get("settings").locale)}`; if(d) return `Desde ${Utils.formatDate(d)}`; if(h) return `Hasta ${Utils.formatDate(h)}`; return "Todo"; }
  function labelFromMonth(m){ const [y,mm]=m.split("-"); return `${mm}/${y}`; }
  els.btnRepRango?.addEventListener("click",(e)=>{ e.preventDefault(); runReportRange(); });
  els.btnRepMes?.addEventListener("click",(e)=>{ e.preventDefault(); runReportMonth(); });
  els.btnCSV?.addEventListener("click",()=>{ const {list,label}=(els.repMes.value?runReportMonth():runReportRange()); const csv=Reports.toCSV(list); const safe=label.replace(/[^\dA-Za-z_-]+/g,"_"); Utils.download(`reporte_${safe}.csv`, csv); });
  els.btnPDF?.addEventListener("click",()=>{ const {list,label}=(els.repMes.value?runReportMonth():runReportRange()); Printer.openPrint(Printer.reportHTML(list,label)); });

  /* Config */
  function loadConfigForm(){
    const s=Store.get("settings");
    document.getElementById("cfgNombre").value=s.businessName||"";
    document.getElementById("cfgMoneda").value=s.currency||"USD";
    document.getElementById("cfgIVU").value=s.taxPercent??11.5;
    document.getElementById("cfgLocale").value=s.locale||"es-PR";
    document.getElementById("cfgPrefFAC").value=s.prefixes.FAC||"FAC-";
    document.getElementById("cfgNextFAC").value=s.counters.FAC||1;
    document.getElementById("cfgPrefCOT").value=s.prefixes.COT||"COT-";
    document.getElementById("cfgNextCOT").value=s.counters.COT||1;
    const p=document.getElementById("cfgLogoPreview");
    if(s.logoDataUrl){ p.src=s.logoDataUrl; p.style.display="block"; } else { p.removeAttribute("src"); p.style.display="none"; }
  }
  document.getElementById("btnGuardarConfig")?.addEventListener("click",()=>{
    const patch={ businessName:document.getElementById("cfgNombre").value.trim(), currency:(document.getElementById("cfgMoneda").value||"USD").toUpperCase(), taxPercent:Utils.toNumber(document.getElementById("cfgIVU").value), locale:document.getElementById("cfgLocale").value.trim()||"es-PR" };
    Store.updateSettings(patch);
    Numbering.setPrefix("FAC",document.getElementById("cfgPrefFAC").value);
    Numbering.setPrefix("COT",document.getElementById("cfgPrefCOT").value);
    Numbering.setCounter("FAC",Utils.toNumber(document.getElementById("cfgNextFAC").value));
    Numbering.setCounter("COT",Utils.toNumber(document.getElementById("cfgNextCOT").value));
    loadBrand(); fillQuickAdd(); updateTotals(); toast("Configuración guardada.");
  });
  document.getElementById("cfgLogo")?.addEventListener("change",()=>{
    const file=document.getElementById("cfgLogo").files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ Store.updateSettings({logoDataUrl:reader.result}); loadBrand();
      const p=document.getElementById("cfgLogoPreview"); p.src=reader.result; p.style.display="block"; toast("Logo actualizado."); };
    reader.readAsDataURL(file);
  });
  document.getElementById("btnQuitarLogo")?.addEventListener("click",(e)=>{
    e.preventDefault(); Store.updateSettings({logoDataUrl:""});
    const p=document.getElementById("cfgLogoPreview"); p.removeAttribute("src"); p.style.display="none"; loadBrand(); toast("Logo eliminado.");
  });

  document.getElementById("btnCambiarPIN")?.addEventListener("click", async ()=>{
    const msg=document.getElementById("cfgPinMsg");
    const curr=document.getElementById("cfgPinActual").value.trim();
    const n1=document.getElementById("cfgPinNuevo1").value.trim();
    const n2=document.getElementById("cfgPinNuevo2").value.trim();
    if(!curr||!n1||!n2) return msg.textContent="Completa todos los campos.";
    if(n1!==n2) return msg.textContent="El PIN nuevo no coincide.";
    if(n1.length<4) return msg.textContent="El PIN debe tener al menos 4 dígitos.";
    const ok = (await Utils.hashPIN(curr)) === (Store.get("settings").pinHash||"");
    if(!ok) return msg.textContent="PIN actual incorrecto.";
    Store.setPINHash(await Utils.hashPIN(n1));
    msg.textContent="PIN actualizado.";
    ["cfgPinActual","cfgPinNuevo1","cfgPinNuevo2"].forEach(id=>document.getElementById(id).value="");
  });

  document.getElementById("btnReset")?.addEventListener("click",()=>{ if(!confirm("Esto borrará toda la data (config, catálogo, documentos). ¿Continuar?")) return; Store.resetAll(); Session.end(); location.reload(); });
  document.getElementById("btnLogout")?.addEventListener("click",()=>{ Session.end(); location.reload(); });

  /* Toast minimal */
  function toast(text){
    let t=document.getElementById("__toast");
    if(!t){ t=document.createElement("div"); t.id="__toast"; document.body.appendChild(t);
      Object.assign(t.style,{position:"fixed",right:"12px",bottom:"16px",padding:"10px 12px",borderRadius:"10px",background:"rgba(0,0,0,.7)",color:"#fff",fontWeight:"700",zIndex:99,boxShadow:"0 8px 24px rgba(0,0,0,.35)"}); }
    t.textContent=text; t.style.opacity="1"; clearTimeout(t.__timer);
    t.__timer=setTimeout(()=>{ t.style.opacity="0"; }, 1800);
  }

  function init(){ Store.ensureSeeds(); initAuth(); }
  return { init };
})();

/* ======== Helpers ======== */
function escapeHTML(s){ return String(s||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHTML(s).replace(/"/g,'&quot;'); }

/* Start */
window.addEventListener("DOMContentLoaded", ()=> UI.init());

