/* ==========================================================
   Firebase Init — Facturación Oasis
   Conexión al proyecto Firestore + soporte offline
   ========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// 🔹 Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDlqw-ASx4fpnDxvg24ij8kTcbGLsrxCM0",
  authDomain: "facturacion-oasis.firebaseapp.com",
  projectId: "facturacion-oasis",
  storageBucket: "facturacion-oasis.firebasestorage.app",
  messagingSenderId: "595714299623",
  appId: "1:595714299623:web:e141295bffb1592500b442"
};

// Inicializa Firebase y Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Guarda referencia global
window.OasisFirebase = { app, db };

// -----------------------------------------------------------
// Sincronización automática (modo híbrido)
// -----------------------------------------------------------
async function syncToFirebase() {
  if (!window.HistoryDB) return;

  const localDocs = HistoryDB.list();
  const colRef = collection(db, "documentos");

  for (const docItem of localDocs) {
    try {
      await setDoc(doc(colRef, docItem.id), docItem, { merge: true });
    } catch (err) {
      console.warn("Sync error:", err);
    }
  }
  console.log("✅ Sincronización local → Firebase completada");
}

async function syncFromFirebase() {
  if (!window.HistoryDB) return;
  const colRef = collection(db, "documentos");
  const snap = await getDocs(colRef);
  const data = snap.docs.map(d => d.data());
  data.forEach(d => HistoryDB.save(d));
  console.log("☁️ Descargado desde Firebase:", data.length, "documentos");
}

// Suscripción a cambios en Firestore
function listenFirebaseUpdates() {
  const colRef = collection(db, "documentos");
  onSnapshot(colRef, (snap) => {
    snap.docChanges().forEach(change => {
      const d = change.doc.data();
      if (change.type === "added" || change.type === "modified") {
        HistoryDB.save(d);
      }
    });
  });
  console.log("👂 Escuchando cambios en Firebase...");
}

window.OasisSync = { syncToFirebase, syncFromFirebase, listenFirebaseUpdates };

// Inicia sincronización automática
window.addEventListener("load", () => {
  setTimeout(() => {
    if (navigator.onLine) {
      OasisSync.syncFromFirebase();
      OasisSync.listenFirebaseUpdates();
      OasisSync.syncToFirebase();
    }
  }, 2000);
});
