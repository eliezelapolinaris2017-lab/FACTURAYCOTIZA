import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDocs, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AlzaSyBM6gQ-BbqngwFF8rfLLVQnhQw-YSYHLAI",
  authDomain: "facturas-web-794ae.firebaseapp.com",
  projectId: "facturas-web-794ae",
  storageBucket: "facturas-web-794ae.appspot.com",
  messagingSenderId: "412530106595",
  appId: "1:412530106595:web:416fe7dfc53740ce9a25d6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const Firebase = { app, auth, db, provider, signIn: () => signInWithPopup(auth, provider), signOut: () => signOut(auth), onAuthStateChanged };

export const U = {
  uuid: () => crypto.randomUUID?.() ?? ('id-'+Date.now()),
  todayISO: () => new Date().toISOString().split('T')[0],
  toNum: v => Number(String(v??"").replace(",", ".")) || 0,
  fmtMoney: (n,c='USD',l='es-PR') => new Intl.NumberFormat(l,{style:'currency',currency:c}).format(Number(n||0)),
};
export const Store = (() => {
  const K = { settings:"oasis.settings.v1", items:"oasis.items.v1", docs:"oasis.docs.v1" };
  const seeds = {
    settings:{ businessName:"Oasis", currency:"USD", taxPercent:11.5, prefixes:{FAC:"FAC-", COT:"COT-"}, counters:{FAC:1,COT:1} },
    items:[{ id:U.uuid(), name:"Servicio básico", desc:"Mano de obra", price:50 }]
  };
  function ensure(){
    if(!localStorage.getItem(K.settings)) localStorage.setItem(K.settings, JSON.stringify(seeds.settings));
    if(!localStorage.getItem(K.items)) localStorage.setItem(K.items, JSON.stringify(seeds.items));
    if(!localStorage.getItem(K.docs)) localStorage.setItem(K.docs, JSON.stringify([]));
  }
  function get(k){ return JSON.parse(localStorage.getItem(K[k])); }
  function set(k,v){ localStorage.setItem(K[k], JSON.stringify(v)); }
  return {
    ensure,
    settings: ()=>get('settings'),
    setSettings:p=>set('settings',{...get('settings'),...p}),
    items: ()=>get('items')||[],
    docs: ()=>get('docs')||[],
    saveDoc: d => { const arr=get('docs'); arr.unshift(d); set('docs',arr); return d; }
  };
})();
export async function requireGoogleSignIn(){
  const user = Firebase.auth.currentUser;
  const modal = document.getElementById("authModal");
  if(user){ modal.style.display="none"; return Promise.resolve(user); }
  modal.style.display="flex";
  document.getElementById("btnGoogleSignIn").onclick = ()=>Firebase.signIn();
  document.getElementById("btnUseOffline").onclick = ()=>modal.style.display="none";

  return new Promise(resolve=>{
    Firebase.onAuthStateChanged(Firebase.auth, u=>{
      if(u){ modal.style.display="none"; resolve(u); }
    });
  });
}

export const Sync = {
  async start(){
    Firebase.onAuthStateChanged(Firebase.auth, async (user)=>{
      if(user){
        console.log("🔗 Sincronizando con Firestore para UID:", user.uid);
        const snap = await getDocs(collection(Firebase.db, `users/${user.uid}/documents`));
        snap.docs.map(d=>d.data()).forEach(x=>Store.saveDoc(x));
      }
    });
  }
};

