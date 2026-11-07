export const firebaseConfig = {
  apiKey: "AIzaSyBHWbr9rlbKUiTY6qEYpLEqfy07W1b3Yqs",
  authDomain: "blockporter-1.firebaseapp.com",
  projectId: "blockporter-1",
  storageBucket: "blockporter-1.firebasestorage.app",
  messagingSenderId: "873745031112",
  appId: "1:873745031112:web:0dd56950729a4d4f532afd"
};

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
