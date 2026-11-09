async function dbApi() {
  const loaded = await import("./firebase-config.js");
  return loaded.loadDb();
}

export function pricingFrom(data) {
  const raw = data && typeof data === "object" ? data : {};
  let bonus = Number(raw.bonusPercent);
  if (!Number.isFinite(bonus) || bonus < 0) bonus = 0;
  bonus = Math.min(100, Math.round(bonus * 100) / 100);
  const feeEnabled = raw.feeEnabled !== false;
  return {
    feeEnabled: feeEnabled,
    bonusPercent: bonus,
    multiplier: (feeEnabled ? 0.955 : 1) * (1 + bonus / 100)
  };
}

export async function getPricing() {
  const api = await dbApi();
  const snap = await api.getDoc(api.doc(api.db, "config", "pricing"));
  return pricingFrom(snap.exists() ? snap.data() : null);
}

export async function savePricing(input) {
  const pricing = pricingFrom({
    feeEnabled: Boolean(input && input.feeEnabled),
    bonusPercent: input && input.bonusPercent
  });
  const api = await dbApi();
  await api.setDoc(api.doc(api.db, "config", "pricing"), {
    feeEnabled: pricing.feeEnabled,
    bonusPercent: pricing.bonusPercent
  }, { merge: true });
  return pricing;
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
