/**
 * app.js — Inicializador multipágina de Oasis
 * Requiere: app-core.js, styles.css y los HTML ya provistos.
 * - Auth Google + Sync Firestore (offline-first)
 * - Ruteo por filename (index/historial/catalogo/reportes/config)
 */

import {
  Firebase, Sync, requireGoogleSignIn,
  Store, Numbering, Docs, Printer, U
} from './app-core.js';

// Registrar Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  });
}

// Arranque global: auth + sync, luego init por página
(async function bootstrap () {
  Store.ensure();
  await Sync.start();
  await requireGoogleSignIn();

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  switch (page) {
    case 'index.html':
    case '':
      return initIndex();
    case 'historial.html':
      return initHistorial();
    case 'catalogo.html':
      return initCatalogo();
    case 'reportes.html':
      return initReportes();
    case 'config.html':
      return initConfig();
    default:
      return; // páginas estáticas, si las hubiera
  }
})();

/* ==========================================================
   INDEX (Nuevo documento)
   ========================================================== */
function initIndex(){
  const s = Store.settings();
  // Estado inicial de documento
  const doc = Docs.empty('FAC');
  U.byId('docTipo').value   = doc.type;
  U.byId('docPrefijo').value= doc.prefix;
  U.byId('docNumero').value = doc.number;
  U.byId('docFecha').value  = doc.date;
  U.byId('docTax').value    = s.taxPercent;

  // Tabla de líneas
  function addRow(l={name:"",desc:"",price:0,qty:1}){
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td><input class="nm" value="${l.name||""}"></td>
      <td><input class="ds" value="${l.desc||""}"></td>
      <td><input class="pr" type="number" step="0.01" inputmode="decimal" value="${Number(l.price||0)}"></td>
      <td><input class="qt" type="number" step="1" inputmode="numeric" value="${Number(l.qty||1)}"></td>
      <td class="right imp">$0.00</td>
      <td><button class="btn warn del" type="button">X</button></td>`;
    const recalc=()=>{ const p=U.toNum(tr.querySelector('.pr').value), q=U.toNum(tr.querySelector('.qt').value||1);
      tr.querySelector('.imp').textContent = U.fmtMoney(p*q, s.currency, s.locale); tot(); };
    tr.querySelectorAll('input').forEach(i=>i.addEventListener('input', recalc));
    tr.querySelector('.del').onclick=()=>{ tr.remove(); tot(); };
    U.byId('lineasBody').appendChild(tr); recalc();
  }
  function collect(){
    const lines=[...document.querySelectorAll('#lineasBody tr')].map(tr=>({
      name:tr.querySelector('.nm').value.trim(),
      desc:tr.querySelector('.ds').value.trim(),
      price:U.toNum(tr.querySelector('.pr').value),
      qty:U.toNum(tr.querySelector('.qt').value||1)
    })).filter(l=>l.name||l.desc||l.price);
    return {
      id: doc.id,
      type: U.byId('docTipo').value,
      prefix: U.byId('docPrefijo').value || Numbering.prefix(U.byId('docTipo').value),
      number: U.toNum(U.byId('docNumero').value) || doc.number,
      date: U.byId('docFecha').value || U.todayISO(),
      client: U.byId('docCliente').value.trim(),
      discountPct: U.toNum(U.byId('docDesc').value||0),
      taxPct: U.toNum(U.byId('docTax').value||0),
      paymentMethod: U.byId('docPago').value || "",
      paymentRef: U.byId('docPagoRef').value.trim() || "",
      notes: U.byId('docNotas').value.trim(),
      lines,
      status: "borrador"
    };
  }
  function tot(){
    const t=Docs.calc(collect());
    U.byId('sSub').textContent=U.fmtMoney(t.subtotal,s.currency,s.locale);
    U.byId('sDes').textContent=U.fmtMoney(t.descAmt,s.currency,s.locale);
    U.byId('sTax').textContent=U.fmtMoney(t.taxAmt,s.currency,s.locale);
    U.byId('sTot').textContent=U.fmtMoney(t.total,s.currency,s.locale);
  }

  // Líneas por defecto y eventos
  addRow();
  U.byId('btnAddLinea').onclick = ()=> addRow();
  ['docDesc','docTax'].forEach(id=>U.byId(id).addEventListener('input', tot));

  // Quick-add catálogo
  function fillQuick(){
    const it=Store.items();
    U.byId('catalogQuick').innerHTML = '<option value="">— del catálogo —</option>'+
      it.map(i=>`<option value="${i.id}">${i.name} (${U.fmtMoney(i.price)})</option>`).join('');
  }
  fillQuick();
  U.byId('btnQuickAdd').onclick=()=>{
    const id=U.byId('catalogQuick').value; if(!id) return;
    const it=Store.items().find(i=>i.id===id); if(!it) return;
    addRow({name:it.name,desc:it.desc||"",price:it.price||0,qty:1});
  };

  // Guardar/Imprimir
  U.byId('btnBorrador').onclick = async ()=>{
    const d=collect(); d.status="borrador"; Store.saveDoc(d); await Sync.push(); alert("Borrador guardado.");
  };
  U.byId('docForm').onsubmit = async (e)=>{
    e.preventDefault();
    const d=collect(); d.status="final"; Store.saveDoc(d); await Sync.push();
    Printer.open(Printer.docHTML(d));
  };
}

/* ==========================================================
   HISTORIAL
   ========================================================== */
function initHistorial(){
  const s=Store.settings(), tbody=U.byId('tbody');

  function render(){
    const q=(U.byId('q').value||"").toLowerCase().trim();
    const list=(Store.docs()).filter(d=>{
      const num=`${d.prefix||""}${d.number}`.toLowerCase();
      return !q || (d.client||"").toLowerCase().includes(q) || num.includes(q) || (d.paymentMethod||"").toLowerCase().includes(q);
    });
    tbody.innerHTML = list.map(d=>`<tr>
      <td>${d.type}</td>
      <td>${d.prefix||""}${d.number}</td>
      <td>${U.fmtDate(d.date,s.locale)}</td>
      <td>${d.client||""}</td>
      <td>${d.paymentMethod||"-"}</td>
      <td class="right">${U.fmtMoney(Docs.calc(d).total,s.currency,s.locale)}</td>
      <td>${d.status}</td>
      <td>
        <button class="btn" data-id="${d.id}" data-act="pdf">PDF</button>
      </td>
    </tr>`).join("");
  }
  render();
  U.byId('q').oninput=render;
  tbody.onclick=(e)=>{ const b=e.target.closest('button[data-id]'); if(!b) return;
    const d=Store.docs().find(x=>x.id===b.dataset.id);
    if(b.dataset.act==="pdf") Printer.open(Printer.docHTML(d));
  };
  document.addEventListener("oasis-remote-update", render);
}

/* ==========================================================
   CATÁLOGO
   ========================================================== */
function initCatalogo(){
  const tb=U.byId('tb');
  function render(){
    const it=Store.items();
    tb.innerHTML = it.map(x=>`<tr>
      <td>${x.photo?`<img src="${x.photo}" style="width:56px;height:56px;object-fit:cover;border:1px solid #000;border-radius:8px">`:""}</td>
      <td><input class="nm" data-id="${x.id}" value="${x.name}"></td>
      <td><input class="pr" data-id="${x.id}" type="number" step="0.01" value="${Number(x.price||0)}"></td>
      <td>
        <button class="btn warn del" data-id="${x.id}">Eliminar</button>
        <button class="btn foto" data-id="${x.id}">Foto</button>
      </td>
    </tr>`).join("");
  }
  render();

  U.byId('add').onclick = async ()=>{
    const name=U.byId('nm').value.trim(); if(!name) return alert("Nombre requerido");
    const price=U.toNum(U.byId('pr').value||0);
    const file=U.byId('ph').files?.[0]; const photo=file? await U.fileToDataURL(file):"";
    const arr=Store.items(); arr.unshift({id:U.uuid(), name, desc:"", price, photo}); Store.setItems(arr); render(); alert("Ítem agregado.");
  };

  tb.onclick = async (e)=>{
    const id=e.target.dataset.id; if(!id) return;
    const arr=Store.items(); const it=arr.find(i=>i.id===id); if(!it) return;
    if(e.target.classList.contains('del')){ if(!confirm("¿Eliminar ítem?")) return; Store.setItems(arr.filter(i=>i.id!==id)); render(); }
    if(e.target.classList.contains('foto')){
      const ipt=document.createElement('input'); ipt.type="file"; ipt.accept="image/*";
      ipt.onchange=async()=>{ const f=ipt.files[0]; if(!f) return; it.photo=await U.fileToDataURL(f); Store.setItems(arr); render(); };
      ipt.click();
    }
  };
  tb.onchange = (e)=>{ const id=e.target.dataset.id; if(!id) return; const arr=Store.items(); const it=arr.find(i=>i.id===id); if(!it) return;
    if(e.target.classList.contains('nm')) it.name=e.target.value.trim();
    if(e.target.classList.contains('pr')) it.price=U.toNum(e.target.value);
    Store.setItems(arr);
  };
}

/* ==========================================================
   REPORTES
   ========================================================== */
function initReportes(){
  const s=Store.settings();

  function filter(desde,hasta){
    const arr=Store.docs().filter(x=>x.status!=="anulado");
    const from=desde?new Date(desde):null, to=hasta?new Date(hasta):null; if(to) to.setHours(23,59,59,999);
    return arr.filter(d=>{ const dd=new Date(d.date); if(from && dd<from) return false; if(to && dd>to) return false; return true; });
  }
  function render(list){
    const tb=U.byId('tb'); tb.innerHTML = list.map(d=>`<tr>
      <td>${d.type}</td><td>${d.prefix||""}${d.number}</td><td>${U.fmtDate(d.date,s.locale)}</td>
      <td>${d.client||""}</td><td>${d.paymentMethod||"-"}</td><td class="right">${U.fmtMoney(Docs.calc(d).total,s.currency,s.locale)}</td><td>${d.status}</td></tr>`).join("");
    const sums = list.reduce((acc,d)=>{ const t=Docs.calc(d).total; acc.ALL+=t; acc["C_"+d.type]=(acc["C_"+d.type]||0)+1; acc[d.type]=(acc[d.type]||0)+t; return acc; }, {ALL:0});
    U.byId('sum').textContent = `FAC: ${sums.C_FAC||0} (${U.fmtMoney(sums.FAC||0,s.currency,s.locale)}) • COT: ${sums.C_COT||0} (${U.fmtMoney(sums.COT||0,s.currency,s.locale)}) • Total: ${U.fmtMoney(sums.ALL||0,s.currency,s.locale)}`;
  }

  const all=Store.docs(); render(all);

  U.byId('f').onclick=()=>{ render(filter(U.byId('d').value, U.byId('h').value)); };
  U.byId('csv').onclick=()=>{ const d=U.byId('d').value,h=U.byId('h').value; const list=d||h?filter(d,h):Store.docs();
    const rows=[["tipo","numero","fecha","cliente","subtotal","descuento","ivu","total","estado","pago","pago_ref"]];
    list.forEach(x=>{ const c=Docs.calc(x);
      rows.push([x.type,`${x.prefix||""}${x.number}`,x.date,x.client||"",c.subtotal.toFixed(2),c.descAmt.toFixed(2),c.taxAmt.toFixed(2),c.total.toFixed(2),x.status,x.paymentMethod||"",x.paymentRef||""]);
    });
    U.download("reporte.csv", rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n"));
  };
  U.byId('pdf').onclick=()=>{ const d=U.byId('d').value,h=U.byId('h').value; const list=d||h?filter(d,h):Store.docs();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reporte</title>
    <style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:12mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:6px}h1{margin:0 0 8px}@page{margin:12mm}</style></head><body>
    <h1>Reporte</h1>
    <table><thead><tr><th>Tipo</th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Estado</th></tr></thead>
    <tbody>${list.map(x=>`<tr><td>${x.type}</td><td>${x.prefix||""}${x.number}</td><td>${U.fmtDate(x.date)}</td><td>${x.client||""}</td><td>${x.paymentMethod||"-"}</td><td style="text-align:right">${U.fmtMoney(Docs.calc(x).total)}</td><td>${x.status}</td></tr>`).join("")}</tbody></table>
    <script>onload=()=>print()</script></body></html>`;
    const w=open("","_blank"); w.document.write(html); w.document.close();
  };
}

/* ==========================================================
   CONFIG
   ========================================================== */
function initConfig(){
  function load(){
    const s=Store.settings();
    U.byId('bizName').value=s.businessName||"";
    U.byId('bizTax').value=s.taxPercent??11.5;
    U.byId('prefFAC').value=s.prefixes.FAC||"FAC-";
    U.byId('nextFAC').value=s.counters.FAC||1;
    U.byId('prefCOT').value=s.prefixes.COT||"COT-";
    U.byId('nextCOT').value=s.counters.COT||1;
    if(s.logoDataUrl){ U.byId('bizLogoPrev').src=s.logoDataUrl; U.byId('bizLogoPrev').style.display="block"; }
  }
  load();

  U.byId('bizLogo').onchange = async ()=>{ const f=U.byId('bizLogo').files[0]; if(!f) return; const data=await U.fileToDataURL(f); Store.setSettings({logoDataUrl:data}); U.byId('bizLogoPrev').src=data; U.byId('bizLogoPrev').style.display="block"; };
  U.byId('save').onclick = ()=>{ Store.setSettings({ businessName:U.byId('bizName').value.trim(), taxPercent:U.toNum(U.byId('bizTax').value||0) });
    Numbering.setPrefix("FAC",U.byId('prefFAC').value||"FAC-"); Numbering.setPrefix("COT",U.byId('prefCOT').value||"COT-");
    Numbering.setCounter("FAC",U.toNum(U.byId('nextFAC').value||1)); Numbering.setCounter("COT",U.toNum(U.byId('nextCOT').value||1));
    alert("Guardado."); };
  U.byId('reset').onclick = ()=>{ if(!confirm("Esto borrará toda la data local.")) return; Store.reset(); location.reload(); };

  // Estado de sesión y acciones
  Firebase.onAuthStateChanged(Firebase.auth,(user)=>{
    U.byId('authStatus').textContent = user? `Sesión: ${user.displayName||user.email||user.uid}` : "Sesión: sin iniciar";
  });
  U.byId('btnLoginGoogle').onclick = ()=> Firebase.signIn();
  U.byId('btnLogout').onclick      = ()=> Firebase.signOut();
  U.byId('btnPush').onclick        = ()=> import('./app-core.js').then(m=>m.Sync.push());
  U.byId('btnPull').onclick        = ()=> import('./app-core.js').then(m=>m.Sync.pull());
}
