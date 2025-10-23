/* Oasis — 100% local. HTML+CSS+JS puro. Sin dependencias externas. */

/* ================== Utils ================== */
const Utils = {
  fmtMoney(n, currency = "USD", locale = "es-PR") {
    const v = Number(n || 0);
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(v);
  },
  toNumber(v) {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  },
  todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },
  uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  },
  async hashPIN(pin) {
    const enc = new TextEncoder().encode(pin);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  },
  download(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
  formatDate(dateISO, locale) {
    try { return new Date(dateISO).toLocaleDateString(locale || "es-PR", { year:'numeric', month:'2-digit', day:'2-digit' }); }
    catch { return dateISO; }
  },
  fileToDataURL(file){
    return new Promise((res, rej)=>{
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
  }
};

/* =============== Sesión (PIN) =============== */
const Session = (() => {
  const KEY = "oasis.session.v1";
  const DURATION_MS = 8 * 60 * 60 * 1000; // 8h
  const now = () => Date.now();
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const isActive = () => { const s = get(); return !!(s && s.expiresAt > now()); };
  const start = () => { const ses = { token: Utils.uuid(), issuedAt: now(), expiresAt: now() + DURATION_MS }; localStorage.setItem(KEY, JSON.stringify(ses)); return ses; };
  const end = () => localStorage.removeItem(KEY);
  const touch = () => { const s = get(); if (!s) return; s.expiresAt = now() + DURATION_MS; localStorage.setItem(KEY, JSON.stringify(s)); };
  return { isActive, start, end, touch };
})();

/* ================== Store ================== */
const Store = (() => {
  const KEYS = { settings: "oasis.settings.v1", items: "oasis.items.v1", docs: "oasis.docs.v1" };
  const DEFAULTS = {
    settings: {
      businessName: "Mi Negocio",
      currency: "USD",
      locale: "es-PR",
      taxPercent: 11.5,
      prefixes: { FAC: "FAC-", COT: "COT-" },
      counters: { FAC: 1, COT: 1 },
      logoDataUrl: "",
      pinHash: ""
    },
    items: [
      { id: Utils.uuid(), name: "Servicio básico", desc: "Mano de obra", price: 50, photo: "" },
      { id: Utils.uuid(), name: "Producto estándar", desc: "Artículo genérico", price: 25, photo: "" }
    ],
    docs: []
  };
  function get(key) { const raw = localStorage.getItem(KEYS[key]); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
  function set(key, val) { localStorage.setItem(KEYS[key], JSON.stringify(val)); }
  function ensureSeeds() { if (!get("settings")) set("settings", DEFAULTS.settings); if (!get("items")) set("items", DEFAULTS.items); if (!get("docs")) set("docs", DEFAULTS.docs); }
  function resetAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); ensureSeeds(); }
  function updateSettings(patch) { const s = get("settings") || DEFAULTS.settings; const merged = { ...s, ...patch }; set("settings", merged); return merged; }
  function setPINHash(pinHash) { const s = get("settings") || DEFAULTS.settings; s.pinHash = pinHash; set("settings", s); }
  function getDocs() { return get("docs") || []; }
  function saveDoc(doc) { const arr = getDocs(); const i = arr.findIndex(d => d.id === doc.id); if (i >= 0) arr[i] = doc; else arr.unshift(doc); set("docs", arr); }
  function getItems() { return get("items") || []; }
  function setItems(arr) { set("items", arr); }
  function addItem(item) { const arr = getItems(); arr.unshift(item); setItems(arr); }
  return { KEYS, DEFAULTS, get, set, ensureSeeds, resetAll, updateSettings, setPINHash, getDocs, saveDoc, getItems, setItems, addItem };
})();

/* =============== Numbering =============== */
const Numbering = (() => {
  function next(tipo) {
    const s = Store.get("settings"); const n = s.counters[tipo] || 1;
    s.counters[tipo] = n + 1; Store.updateSettings({ counters: s.counters }); return n;
  }
  function currentPrefix(tipo) { const s = Store.get("settings"); return s.prefixes[tipo] || (tipo + "-"); }
  function setCounter(tipo, num) { const s = Store.get("settings"); s.counters[tipo] = Number(num) || 1; Store.updateSettings({ counters: s.counters }); }
  function setPrefix(tipo, pref) { const s = Store.get("settings"); s.prefixes[tipo] = pref; Store.updateSettings({ prefixes: s.prefixes }); }
  return { next, currentPrefix, setCounter, setPrefix };
})();

/* ================== Docs ================== */
const Docs = (() => {
  function calc(doc) {
    const lines = doc.lines || [];
    const subtotal = lines.reduce((sum, l) => sum + (Utils.toNumber(l.price) * Utils.toNumber(l.qty || 1)), 0);
    const descAmt = subtotal * (Utils.toNumber(doc.discountPct) / 100);
    const base = subtotal - descAmt;
    const taxAmt = base * (Utils.toNumber(doc.taxPct) / 100);
    const total = base + taxAmt;
    return { subtotal, descAmt, taxAmt, total };
  }
  function createEmpty() {
    const s = Store.get("settings");
    return {
      id: Utils.uuid(),
      type: "COT",
      number: Numbering.next("COT"),
      prefix: Numbering.currentPrefix("COT"),
      date: Utils.todayISO(),
      client: "",
      notes: "",
      lines: [],
      discountPct: 0,
      taxPct: s.taxPercent,
      status: "borrador",
      paymentMethod: "",
      paymentRef: ""
    };
  }
  function duplicateAs(doc, newType) {
    const clone = structuredClone(doc);
    clone.id = Utils.uuid();
    clone.type = newType || doc.type;
    clone.prefix = Numbering.currentPrefix(clone.type);
    clone.number = Numbering.next(clone.type);
    clone.status = "borrador";
    clone.date = Utils.todayISO();
    return clone;
  }
  function reemitNumber(doc) { doc.prefix = Numbering.currentPrefix(doc.type); doc.number = Numbering.next(doc.type); return doc; }
  return { calc, createEmpty, duplicateAs, reemitNumber };
})();

/* ================= Printer ================= */
const Printer = (() => {
  function businessHeader() {
    const s = Store.get("settings");
    return { name: s.businessName || "Mi Negocio", logo: s.logoDataUrl || "", locale: s.locale || "es-PR", currency: s.currency || "USD" };
  }
  function docHTML(doc) {
    const { name, logo, locale, currency } = businessHeader();
    const totals = Docs.calc(doc);
    const dateStr = Utils.formatDate(doc.date, locale);
    const numStr = `${doc.prefix || ""}${doc.number}`;
    const title = doc.type === "FAC" ? "Factura" : "Cotización";
    const rows = (doc.lines || []).map(l => `
      <tr>
        <td>${escapeHTML(l.name||"")}</td>
        <td>${escapeHTML(l.desc||"")}</td>
        <td style="text-align:right">${Utils.fmtMoney(l.price, currency, locale)}</td>
        <td style="text-align:right">${l.qty||1}</td>
        <td style="text-align:right">${Utils.fmtMoney((l.price||0)*(l.qty||1), currency, locale)}</td>
      </tr>
    `).join("");
    const pago = doc.paymentMethod ? `<div><strong>Pago:</strong> ${escapeHTML(doc.paymentMethod)}${doc.paymentRef ? " — Ref: " + escapeHTML(doc.paymentRef) : ""}</div>` : "";
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${numStr}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:10mm;}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:8px}
.p-title{font-size:22px;font-weight:800;margin:4px 0 10px}
.p-meta{font-size:12px;color:#222}
.p-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.p-table th,.p-table td{border:1px solid #ccc;padding:6px;word-break:break-word;overflow-wrap:anywhere}
.p-totals{margin-top:12px;display:flex;justify-content:flex-end}
.p-totals table{border-collapse:collapse}
.p-totals td{border:1px solid #ccc;padding:5px 8px}
.p-notes{margin-top:12px;font-size:12px;white-space:pre-wrap;word-break:break-word}
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
  function reportHTML(list, rangeLabel) {
    const { name, logo, locale, currency } = businessHeader();
    const rows = list.map(d => `
      <tr>
        <td>${d.type}</td>
        <td>${d.prefix||""}${d.number}</td>
        <td style="text-align:right">${Utils.formatDate(d.date, locale)}</td>
        <td>${escapeHTML(d.client||"")}</td>
        <td>${escapeHTML(d.paymentMethod||"-")}</td>
        <td style="text-align:right">${Utils.fmtMoney(Docs.calc(d).total, currency, locale)}</td>
        <td>${d.status}</td>
      </tr>`).join("");
    const totals = Reports.summarize(list);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${rangeLabel}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:10mm;}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
.p-head img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:8px}
.p-title{font-size:22px;font-weight:800;margin:4px 0 10px}
.p-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.p-table th,.p-table td{border:1px solid #ccc;padding:6px;word-break:break-word;overflow-wrap:anywhere}
.p-summary{margin:10px 0;font-size:13px}
@page{size:auto;margin:12mm}
</style></head><body>
<div class="p-head">
  <div>
    <div class="p-title">Reporte — ${rangeLabel}</div>
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
<script>window.onload=()=>window.print();</script>
</body></html>`;
  }
  function openPrint(html) { const w = window.open("", "_blank"); w.document.open(); w.document.write(html); w.document.close(); }
  return { docHTML, reportHTML, openPrint };
})();

/* ================= Reports ================= */
const Reports = (() => {
  function filterByRange(desdeISO, hastaISO) {
    const docs = Store.getDocs().filter(d => d.status !== "anulado");
    const from = desdeISO ? new Date(desdeISO) : null;
    const to = hastaISO ? new Date(hastaISO) : null;
    return docs.filter(d => {
      const dd = new Date(d.date);
      if (from && dd < from) return false;
      if (to) { const end = new Date(hastaISO); end.setHours(23,59,59,999); if (dd > end) return false; }
      return true;
    });
  }
  function filterByMonth(yyyyMM) {
    const [y, m] = yyyyMM.split("-").map(Number);
    const desde = `${y}-${String(m).padStart(2,"0")}-01`;
    const fin = new Date(y, m, 0);
    const hastaISO = `${fin.getFullYear()}-${String(fin.getMonth()+1).padStart(2,"0")}-${String(fin.getDate()).padStart(2,"0")}`;
    return filterByRange(desde, hastaISO);
  }
  function summarize(list) {
    const out = { counts: { FAC: 0, COT: 0, ALL: 0 }, totals: { FAC: 0, COT: 0, ALL: 0 } };
    list.forEach(d => { const t = Docs.calc(d).total; out.counts[d.type] = (out.counts[d.type]||0)+1; out.totals[d.type] = (out.totals[d.type]||0)+t; out.counts.ALL++; out.totals.ALL += t; });
    return out;
  }
  function toCSV(list) {
    const rows = [["tipo","numero","fecha","cliente","subtotal","descuento","ivu","total","estado","pago","pago_ref"]];
    list.forEach(d => { const c = Docs.calc(d); rows.push([ d.type, `${d.prefix||""}${d.number}`, d.date, d.client||"", c.subtotal.toFixed(2), c.descAmt.toFixed(2), c.taxAmt.toFixed(2), c.total.toFixed(2), d.status, d.paymentMethod||"", d.paymentRef||"" ]); });
    return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  }
  return { filterByRange, filterByMonth, summarize, toCSV };
})();

/* =================== UI =================== */
const UI = (() => {
  const els = {
    // Drawer
    drawer: document.getElementById("drawer"),
    drawerOverlay: document.getElementById("drawerOverlay"),
    btnDrawerOpen: document.getElementById("btnDrawerOpen"),
    btnDrawerClose: document.getElementById("btnDrawerClose"),
    sections: document.querySelectorAll(".tab"),

    // Auth
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

    // Nuevo
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

    // Historial
    histBody: document.getElementById("histBody"),
    histSearch: document.getElementById("histSearch"),

    // Catálogo
    itemForm: document.getElementById("itemForm"),
    itemNombre: document.getElementById("itemNombre"),
    itemDesc: document.getElementById("itemDesc"),
    itemPrecio: document.getElementById("itemPrecio"),
    itemFoto: document.getElementById("itemFoto"),
    itemsBody: document.getElementById("itemsBody"),

    // Reportes
    repDesde: document.getElementById("repDesde"),
    repHasta: document.getElementById("repHasta"),
    repMes: document.getElementById("repMes"),
    btnRepRango: document.getElementById("btnRepRango"),
    btnRepMes: document.getElementById("btnRepMes"),
    repBody: document.getElementById("repBody"),
    cntFAC: document.getElementById("cntFAC"),
    cntCOT: document.getElementById("cntCOT"),
    cntALL: document.getElementById("cntALL"),
    totFAC: document.getElementById("totFAC"),
    totCOT: document.getElementById("totCOT"),
    totALL: document.getElementById("totALL"),
    btnCSV: document.getElementById("btnCSV"),
    btnPDF: document.getElementById("btnPDF"),

    // PWA
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
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  document.querySelectorAll(".drawer-item").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.href; closeDrawer(); }));

  /* Navegación hash */
  const HASH_TO_TAB = { "#nuevo":"tab-nuevo", "#historial":"tab-historial", "#catalogo":"tab-catalogo", "#reportes":"tab-reportes", "#config":"tab-config" };
  function highlightDrawer(hash) { document.querySelectorAll(".drawer-item").forEach(b => b.classList.toggle("active", b.dataset.href === hash)); }
  function activateTabByHash() {
    const hash = location.hash || "#nuevo";
    const id = HASH_TO_TAB[hash] || "tab-nuevo";
    els.sections.forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    highlightDrawer(hash);
    if (id==="tab-historial") renderHistorial();
    if (id==="tab-catalogo") { renderItems(); }
    if (id==="tab-reportes") runReportCurrent();
    if (id==="tab-config") loadConfigForm();
    updatePwaHomeVisibility();
  }
  window.addEventListener("hashchange", activateTabByHash);

  /* Botón PWA home */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function updatePwaHomeVisibility() {
    if (!els.pwaHomeBtn) return;
    const onInicio = (location.hash || "#nuevo") === "#nuevo";
    els.pwaHomeBtn.style.display = (isStandalone() && !onInicio) ? "inline-flex" : "none";
  }
  els.pwaHomeBtn.addEventListener("click", () => { location.hash = "#nuevo"; });

  /* AUTH */
  async function initAuth() {
    if (Session.isActive()) { els.authOverlay.style.display = "none"; afterLogin(); return; }
    const s = Store.get("settings");
    if (!s.pinHash) {
      setAuthUI({ title:"Protege tu app", subtitle:"Crea un PIN para este dispositivo.", labelPIN:"Elige un PIN", newPIN:true, btnText:"Crear PIN" });
      els.authForm.onsubmit = async (e) => {
        e.preventDefault();
        const p1 = els.authPin.value.trim(), p2 = els.authPin2.value.trim();
        if (p1.length < 4) return showAuthMsg("El PIN debe tener al menos 4 dígitos.");
        if (p1 !== p2) return showAuthMsg("Los PIN no coinciden.");
        const hash = await Utils.hashPIN(p1); Store.setPINHash(hash); Session.start();
        els.authOverlay.style.display = "none"; afterLogin();
      };
    } else {
      setAuthUI({ title:"Ingresa tu PIN", subtitle:"Tu PIN se guarda localmente.", labelPIN:"PIN", newPIN:false, btnText:"Entrar" });
      els.authForm.onsubmit = async (e) => {
        e.preventDefault();
        const p = els.authPin.value.trim(); const hash = await Utils.hashPIN(p);
        if (hash === Store.get("settings").pinHash) { Session.start(); els.authOverlay.style.display = "none"; afterLogin(); }
        else showAuthMsg("PIN incorrecto.");
      };
    }
  }
  function setAuthUI({title, subtitle, labelPIN, newPIN, btnText}) {
    els.authTitle.textContent = title;
    els.authSubtitle.textContent = subtitle;
    els.authLabelPIN.textContent = labelPIN;
    els.authLabelPIN2.classList.toggle("hidden", !newPIN);
    els.authPin2.classList.toggle("hidden", !newPIN);
    els.authBtn.textContent = btnText;
    els.authMsg.textContent = "";
  }
  function showAuthMsg(t) { els.authMsg.textContent = t; }
  ["click","keydown","touchstart"].forEach(evt => window.addEventListener(evt, () => Session.touch(), { passive:true }));

  /* Post-login */
  function afterLogin() {
    loadBrand();
    loadNewDoc(Docs.createEmpty());
    renderItems();
    fillQuickAdd();
    renderHistorial();
    loadConfigForm();
    activateTabByHash();
  }
  function loadBrand() {
    const s = Store.get("settings");
    document.getElementById("drawerName").textContent = s.businessName || "Oasis";
    const brandLogo = document.getElementById("brandLogo");
    const drawerLogo = document.getElementById("drawerLogo");
    if (s.logoDataUrl) { brandLogo.src = s.logoDataUrl; brandLogo.style.display="block"; drawerLogo.src = s.logoDataUrl; drawerLogo.style.display="block"; }
    else { brandLogo.style.display="none"; drawerLogo.style.display="none"; }
  }

  /* ====== NUEVO ====== */
  function loadNewDoc(doc) {
    currentDoc = doc;
    const s = Store.get("settings");
    document.getElementById("docTipo").value = doc.type;
    document.getElementById("docPrefijo").value = doc.prefix || Numbering.currentPrefix(doc.type);
    document.getElementById("docNumero").value = doc.number;
    document.getElementById("docFecha").value = doc.date || Utils.todayISO();
    document.getElementById("docCliente").value = doc.client || "";
    document.getElementById("docNotas").value = doc.notes || "";
    document.getElementById("docPago").value = doc.paymentMethod || "";
    document.getElementById("docPagoRef").value = doc.paymentRef || "";
    document.getElementById("docDescuento").value = doc.discountPct ?? 0;
    document.getElementById("docImpuesto").value = doc.taxPct ?? s.taxPercent;
    els.lineasBody.innerHTML = "";
    (doc.lines || []).forEach(addLineaRow);
    if ((doc.lines || []).length === 0) addLineaRow();
    updateTotals(); updateDocButtons();
  }
  function updateDocButtons() {
    const disabled = currentDoc.status === "anulado";
    els.btnAnular.disabled = disabled;
    els.btnReemitir.disabled = disabled;
    els.btnGuardarFinal.disabled = disabled;
  }
  function addLineaRow(line = { name:"", desc:"", price:0, qty:1 }) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="l-name" placeholder="Nombre ítem" value="${escapeAttr(line.name||"")}"></td>
      <td><input class="l-desc" placeholder="Descripción" value="${escapeAttr(line.desc||"")}"></td>
      <td><input class="l-price" type="number" step="0.01" inputmode="decimal" value="${Number(line.price||0)}"></td>
      <td><input class="l-qty" type="number" step="1" inputmode="numeric" value="${Number(line.qty||1)}"></td>
      <td class="right l-imp">$0.00</td>
      <td class="no-print"><button type="button" class="btn btn-del">X</button></td>`;
    const priceEl = tr.querySelector(".l-price");
    const qtyEl = tr.querySelector(".l-qty");
    const recalcLine = () => { const s = Store.get("settings"); const imp = Utils.toNumber(priceEl.value) * Utils.toNumber(qtyEl.value||1); tr.querySelector(".l-imp").textContent = Utils.fmtMoney(imp, s.currency, s.locale); updateTotals(); };
    [".l-price",".l-qty",".l-name",".l-desc"].forEach(sel => tr.querySelector(sel).addEventListener("input", recalcLine));
    tr.querySelector(".btn-del").addEventListener("click", () => { tr.remove(); updateTotals(); });
    els.lineasBody.appendChild(tr); recalcLine();
  }
  function collectDocFromForm() {
    const lines = [...els.lineasBody.querySelectorAll("tr")].map(tr => ({
      name: tr.querySelector(".l-name").value.trim(),
      desc: tr.querySelector(".l-desc").value.trim(),
      price: Utils.toNumber(tr.querySelector(".l-price").value),
      qty: Utils.toNumber(tr.querySelector(".l-qty").value || 1)
    })).filter(l => l.name || l.desc || l.price);
    return {
      ...currentDoc,
      type: document.getElementById("docTipo").value,
      prefix: document.getElementById("docPrefijo").value.trim() || Numbering.currentPrefix(document.getElementById("docTipo").value),
      number: Utils.toNumber(document.getElementById("docNumero").value) || currentDoc.number,
      date: document.getElementById("docFecha").value || Utils.todayISO(),
      client: document.getElementById("docCliente").value.trim(),
      notes: document.getElementById("docNotas").value.trim(),
      paymentMethod: document.getElementById("docPago").value || "",
      paymentRef: document.getElementById("docPagoRef").value.trim() || "",
      discountPct: Utils.toNumber(document.getElementById("docDescuento").value || 0),
      taxPct: Utils.toNumber(document.getElementById("docImpuesto").value || 0),
      lines
    };
  }
  function updateTotals() {
    const doc = collectDocFromForm();
    const s = Store.get("settings");
    const t = Docs.calc(doc);
    els.sumSubtotal.textContent = Utils.fmtMoney(t.subtotal, s.currency, s.locale);
    els.sumDesc.textContent = Utils.fmtMoney(t.descAmt, s.currency, s.locale);
    els.sumImpuesto.textContent = Utils.fmtMoney(t.taxAmt, s.currency, s.locale);
    els.sumTotal.textContent = Utils.fmtMoney(t.total, s.currency, s.locale);
  }

  document.getElementById("docTipo").addEventListener("change", () => {
    const tipo = document.getElementById("docTipo").value;
    document.getElementById("docPrefijo").value = Numbering.currentPrefix(tipo);
    document.getElementById("docNumero").value = Numbering.next(tipo);
    currentDoc.type = tipo; currentDoc.prefix = document.getElementById("docPrefijo").value; currentDoc.number = Number(document.getElementById("docNumero").value);
  });
  els.btnAddLinea.addEventListener("click", () => addLineaRow());
  function fillQuickAdd() {
    const items = Store.getItems();
    els.catalogQuickAdd.innerHTML = `<option value="">— del catálogo —</option>` + items.map(i => `<option value="${i.id}">${escapeHTML(i.name)} (${Utils.fmtMoney(i.price)})</option>`).join("");
  }
  els.btnQuickAdd.addEventListener("click", () => {
    const id = els.catalogQuickAdd.value; if (!id) return;
    const it = Store.getItems().find(i => i.id === id); if (!it) return;
    addLineaRow({ name: it.name, desc: it.desc || "", price: it.price || 0, qty: 1 });
  });
  els.docForm.addEventListener("input", (e) => { if (e.target.id === "docDescuento" || e.target.id === "docImpuesto") updateTotals(); });

  // Guardado / PDF
  els.btnGuardarBorrador.addEventListener("click", () => {
    currentDoc = collectDocFromForm(); currentDoc.status = "borrador"; Store.saveDoc(currentDoc);
    alert("Borrador guardado."); renderHistorial();
  });
  els.docForm.addEventListener("submit", (e) => {
    e.preventDefault();
    currentDoc = collectDocFromForm(); currentDoc.status = "final"; Store.saveDoc(currentDoc); renderHistorial();
    Printer.openPrint(Printer.docHTML(currentDoc));
  });
  els.btnDuplicar.addEventListener("click", () => {
    const tipo = currentDoc.type === "COT" ? "FAC" : currentDoc.type;
    const dup = Docs.duplicateAs(currentDoc, tipo);
    loadNewDoc(dup); alert(`Documento duplicado como ${tipo}.`);
  });
  els.btnAnular.addEventListener("click", () => {
    if (!confirm("¿Anular este documento?")) return;
    currentDoc.status = "anulado"; Store.saveDoc(currentDoc); updateDocButtons(); renderHistorial(); alert("Documento anulado.");
  });
  els.btnReemitir.addEventListener("click", () => {
    if (!confirm("Asignará un nuevo número según el consecutivo actual. ¿Continuar?")) return;
    currentDoc = Docs.reemitNumber(collectDocFromForm()); Store.saveDoc(currentDoc);
    document.getElementById("docPrefijo").value = currentDoc.prefix; document.getElementById("docNumero").value = currentDoc.number;
    renderHistorial(); alert("Número re-emitido.");
  });

  /* ====== HISTORIAL ====== */
  function renderHistorial() {
    const q = (els.histSearch?.value || "").toLowerCase().trim();
    const s = Store.get("settings");
    const docs = Store.getDocs().filter(d => {
      if (!q) return true;
      return (d.client||"").toLowerCase().includes(q) || `${d.prefix||""}${d.number}`.toLowerCase().includes(q) || (d.paymentMethod||"").toLowerCase().includes(q);
    });
    if (!els.histBody) return;
    els.histBody.innerHTML = docs.map(d => {
      const t = Docs.calc(d);
      const pago = d.paymentMethod ? escapeHTML(d.paymentMethod) : "-";
      return `<tr>
        <td>${d.type}</td>
        <td>${d.prefix||""}${d.number}</td>
        <td>${Utils.formatDate(d.date, s.locale)}</td>
        <td>${escapeHTML(d.client||"")}</td>
        <td>${pago}</td>
        <td class="right">${Utils.fmtMoney(t.total, s.currency, s.locale)}</td>
        <td>${d.status}</td>
        <td class="no-print">
          <button class="btn btn-open" data-id="${d.id}">Abrir</button>
          <button class="btn btn-dupe" data-id="${d.id}">Duplicar</button>
          <button class="btn warn btn-ann" data-id="${d.id}">Anular</button>
          <button class="btn btn-pdf" data-id="${d.id}">PDF</button>
        </td>
      </tr>`;
    }).join("");
    els.histBody.querySelectorAll(".btn-open").forEach(b => b.onclick = () => { const d = Store.getDocs().find(x => x.id === b.dataset.id); loadNewDoc(structuredClone(d)); location.hash = "#nuevo"; });
    els.histBody.querySelectorAll(".btn-dupe").forEach(b => b.onclick = () => { const d = Store.getDocs().find(x => x.id === b.dataset.id); const tipo = d.type === "COT" ? "FAC" :
