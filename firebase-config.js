export const firebaseConfig = {
  apiKey: "AIzaSyA0kOJ3JTQZgwoS08OEzQ2yxJVX7GSwKr8",
  authDomain: "blockporter-3fc3c.firebaseapp.com",
  projectId: "blockporter-3fc3c",
  storageBucket: "blockporter-3fc3c.firebasestorage.app",
  messagingSenderId: "271743114338",
  appId: "1:271743114338:web:081f67522c3f6dbfb8853b",
  measurementId: "G-BHZTZL2WVT"
};

export async function loadDb() {
  const appMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
  const dbMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
  const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(firebaseConfig);
  return {
    db: dbMod.getFirestore(app),
    doc: dbMod.doc,
    getDoc: dbMod.getDoc,
    setDoc: dbMod.setDoc,
    addDoc: dbMod.addDoc,
    updateDoc: dbMod.updateDoc,
    collection: dbMod.collection,
    onSnapshot: dbMod.onSnapshot,
    query: dbMod.query,
    orderBy: dbMod.orderBy,
    limit: dbMod.limit,
    serverTimestamp: dbMod.serverTimestamp
  };
}

export async function loadAuth() {
  const appMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js");
  const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(firebaseConfig);
  return {
    auth: authMod.getAuth(app),
    GoogleAuthProvider: authMod.GoogleAuthProvider,
    signInWithPopup: authMod.signInWithPopup,
    onAuthStateChanged: authMod.onAuthStateChanged,
    signOut: authMod.signOut
  };
}
