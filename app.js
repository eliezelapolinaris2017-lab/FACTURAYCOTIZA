/* ==========================================================
   Oasis App — Facturación y Cotizaciones
   ========================================================== */

// -------------------- Utilidades --------------------
const Utils = {
  id: () => crypto.randomUUID(),
  fmt: n => Number(n).toLocaleString("es-PR", { minimumFractionDigits: 2 }),
  date: () => new Date().toISOString().substring(0, 10),
  fmtDate: d => new Date(d).toLocaleDateString("es-PR")
};

// -------------------- Base de datos local --------------------
const HistoryDB = (() => {
  const KEY = "oasis.docs.v1";
  const getAll = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const saveAll = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));

  function list() { return getAll(); }
  function getById(id) { return getAll().find(d => d.id === id) || null; }
  function save(doc) {
    const arr = getAll();
    const i = arr.findIndex(d => d.id === doc.id);
    if (i >= 0) arr[i] = doc; else arr.unshift(doc);
    saveAll(arr);
    return doc;
  }
  function remove(id) {
    saveAll(getAll().filter(d => d.id !== id));
  }
  function clear() { localStorage.removeItem(KEY); }

  return { list, getById, save, remove, clear };
})();

// -------------------- UI y lógica --------------------
document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const drawer = document.getElementById("drawer");
  const drawerItems = document.querySelectorAll(".drawer-item");
  const btnMenu = document.getElementById("menuBtn");
  const btnHome = document.getElementById("btnHome");

  function showTab(id) {
    tabs.forEach(t => t.classList.remove("active"));
    document.getElementById(`tab-${id}`).classList.add("active");
    drawer.classList.remove("open");
    if (id !== "nuevo") btnHome.style.display = "block";
    else btnHome.style.display = "none";
  }

  drawerItems.forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  btnMenu.onclick = () => drawer.classList.toggle("open");
  btnHome.onclick = () => showTab("nuevo");

  // -------------------- Catálogo --------------------
  const catBody = document.getElementById("catalogBody");
  const addItem = document.getElementById("addItem");
  addItem.onclick = () => {
    const name = document.getElementById("itemName").value.trim();
    const price = parseFloat(document.getElementById("itemPrice").value || 0);
    const file = document.getElementById("itemImage").files[0];
    if (!name) return alert("Nombre requerido");
    const reader = new FileReader();
    reader.onload = () => {
      const imgData = reader.result || "";
      const item = { id: Utils.id(), name, price, img: imgData };
      const catalog = JSON.parse(localStorage.getItem("oasis.items.v1") || "[]");
      catalog.push(item);
      localStorage.setItem("oasis.items.v1", JSON.stringify(catalog));
      renderCatalog();
    };
    if (file) reader.readAsDataURL(file); else reader.onload();
  };

  function renderCatalog() {
    const cat = JSON.parse(localStorage.getItem("oasis.items.v1") || "[]");
    catBody.innerHTML = cat.map(i => `
      <tr>
        <td><img src="${i.img || ""}" alt="img"></td>
        <td>${i.name}</td>
        <td>$${Utils.fmt(i.price)}</td>
        <td><button class="btn warn" data-id="${i.id}">Eliminar</button></td>
      </tr>
    `).join("");
  }
  catBody.addEventListener("click", (e) => {
    if (e.target.matches("button[data-id]")) {
      const id = e.target.dataset.id;
      const cat = JSON.parse(localStorage.getItem("oasis.items.v1") || "[]").filter(i => i.id !== id);
      localStorage.setItem("oasis.items.v1", JSON.stringify(cat));
      renderCatalog();
    }
  });
  renderCatalog();

  // -------------------- Documentos --------------------
  const docType = document.getElementById("docType");
  const docNumber = document.getElementById("docNumber");
  const docClient = document.getElementById("docClient");
  const docDate = document.getElementById("docDate");
  const discount = document.getElementById("discount");
  const tax = document.getElementById("tax");
  const paymentMethod = document.getElementById("paymentMethod");
  const notes = document.getElementById("notes");
  const saveDoc = document.getElementById("saveDoc");

  docDate.value = Utils.date();

  saveDoc.onclick = () => {
    const doc = {
      id: Utils.id(),
      type: docType.value,
      number: Date.now(),
      date: docDate.value,
      client: docClient.value.trim(),
      lines: [],
      discountPct: parseFloat(discount.value || 0),
      taxPct: parseFloat(tax.value || 0),
      paymentMethod: paymentMethod.value,
      notes: notes.value,
      status: "final"
    };
    HistoryDB.save(doc);
    alert("Factura/Cotización guardada localmente ✅");
    if (navigator.onLine) OasisSync.syncToFirebase();
  };

  // -------------------- Reportes --------------------
  const repBody = document.getElementById("repBody");
  const btnFiltrar = document.getElementById("btnFiltrar");
  btnFiltrar.onclick = () => {
    const desde = document.getElementById("repDesde").value;
    const hasta = document.getElementById("repHasta").value;
    const list = HistoryDB.list().filter(d => (!desde || d.date >= desde) && (!hasta || d.date <= hasta));
    repBody.innerHTML = list.map(d => `
      <tr>
        <td>${d.type}</td>
        <td>${d.number}</td>
        <td>${Utils.fmtDate(d.date)}</td>
        <td>${d.client}</td>
        <td>${d.paymentMethod}</td>
        <td>$${Utils.fmt((d.total || 0).toFixed ? d.total : 0)}</td>
        <td>${d.status}</td>
      </tr>
    `).join("");
  };
});
