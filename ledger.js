async function dbApi() {
  const loaded = await import("./firebase-config.js");
  return loaded.loadDb();
}

export async function getWallets() {
  const api = await dbApi();
  const snap = await api.getDoc(api.doc(api.db, "config", "wallets"));
  return snap.exists() ? snap.data() : {};
}

export async function saveWallets(wallets) {
  const api = await dbApi();
  await api.setDoc(api.doc(api.db, "config", "wallets"), wallets, { merge: true });
}

export async function isAdmin(email) {
  const api = await dbApi();
  const id = String(email || "").trim().toLowerCase();
  if (!id) return false;
  const snap = await api.getDoc(api.doc(api.db, "admins", id));
  return snap.exists();
}

export async function createOrder(order) {
  const api = await dbApi();
  const ref = await api.addDoc(api.collection(api.db, "orders"), Object.assign({}, order, {
    status: "pending",
    createdAt: api.serverTimestamp()
  }));
  return ref.id;
}

export async function watchOrders(onRows, onError) {
  const api = await dbApi();
  const rows = api.query(api.collection(api.db, "orders"), api.orderBy("createdAt", "desc"), api.limit(100));
  return api.onSnapshot(rows, function (snap) {
    onRows(snap.docs.map(function (item) {
      return Object.assign({ id: item.id }, item.data());
    }));
  }, onError);
}

export async function markPaid(id, payoutTx) {
  const api = await dbApi();
  await api.updateDoc(api.doc(api.db, "orders", id), {
    status: "paid",
    payoutTx: payoutTx || "",
    paidAt: api.serverTimestamp()
  });
}
