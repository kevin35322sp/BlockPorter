async function dbApi() {
  const loaded = await import("./firebase-config.js");
  return loaded.loadDb();
}

function clampBonus(value) {
  let bonus = Number(value);
  if (!Number.isFinite(bonus) || bonus < 0) bonus = 0;
  return Math.min(100, Math.round(bonus * 100) / 100);
}

export function pricingFrom(data) {
  const raw = data && typeof data === "object" ? data : {};
  const bonus = clampBonus(raw.bonusPercent);
  const feeEnabled = raw.feeEnabled !== false;
  const swapBonus = clampBonus(raw.swapBonusPercent);
  const swapFeeEnabled = raw.swapFeeEnabled !== false;
  return {
    feeEnabled: feeEnabled,
    bonusPercent: bonus,
    multiplier: (feeEnabled ? 0.955 : 1) * (1 + bonus / 100),
    swapFeeEnabled: swapFeeEnabled,
    swapBonusPercent: swapBonus,
    swapMultiplier: (swapFeeEnabled ? 0.955 : 1) * (1 + swapBonus / 100),
    crossSwapEnabled: raw.crossSwapEnabled !== false,
    coinSwapEnabled: raw.coinSwapEnabled !== false,
    pagesKnown: true
  };
}

export async function getPricing() {
  const api = await dbApi();
  const snap = await api.getDoc(api.doc(api.db, "config", "pricing"));
  return pricingFrom(snap.exists() ? snap.data() : null);
}

export async function savePricing(input) {
  const current = await getPricing();
  const pricing = pricingFrom(Object.assign({}, current, input || {}));
  const api = await dbApi();
  await api.setDoc(api.doc(api.db, "config", "pricing"), {
    feeEnabled: pricing.feeEnabled,
    bonusPercent: pricing.bonusPercent,
    swapFeeEnabled: pricing.swapFeeEnabled,
    swapBonusPercent: pricing.swapBonusPercent,
    crossSwapEnabled: pricing.crossSwapEnabled,
    coinSwapEnabled: pricing.coinSwapEnabled
  }, { merge: true });
  return pricing;
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function readDenied(err) {
  const code = String((err && err.code) || "");
  const message = String((err && err.message) || "");
  return code.indexOf("permission") !== -1 || /permission|disabled|has not been used/i.test(message);
}

export async function getWallets() {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const api = await dbApi();
      const snap = await api.getDoc(api.doc(api.db, "config", "wallets"));
      return snap.exists() ? snap.data() : {};
    } catch (err) {
      last = err;
      if (readDenied(err) || attempt === 2) break;
      await wait(600 * (attempt + 1));
    }
  }
  throw last;
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

function clip(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

export async function createCoinOrder(order) {
  const api = await dbApi();
  const source = order && typeof order === "object" ? order : {};
  const ref = await api.addDoc(api.collection(api.db, "coinOrders"), {
    status: "pending",
    createdAt: api.serverTimestamp(),
    orderedAt: clip(source.orderedAt, 40),
    orderNo: Number(source.orderNo),
    chain: clip(source.chain, 32),
    fromToken: clip(source.fromToken, 16),
    toToken: clip(source.toToken, 16),
    fromAmount: clip(source.fromAmount, 40),
    toAmount: clip(source.toAmount, 40),
    payoutAddress: clip(source.payoutAddress, 120),
    depositAddress: clip(source.depositAddress, 120),
    fullName: clip(source.fullName, 80),
    email: clip(source.email, 120),
    contactKind: clip(source.contactKind, 16),
    contact: clip(source.contact, 64),
    memo: clip(source.memo, 159),
    fee: clip(source.fee, 16),
    bonus: clip(source.bonus, 16)
  });
  return ref.id;
}

export async function watchCoinOrders(onRows, onError) {
  const api = await dbApi();
  const rows = api.query(api.collection(api.db, "coinOrders"), api.orderBy("createdAt", "desc"), api.limit(100));
  return api.onSnapshot(rows, function (snap) {
    onRows(snap.docs.map(function (item) {
      return Object.assign({ id: item.id }, item.data());
    }));
  }, onError);
}

export async function markCoinPaid(id, payoutTx) {
  const api = await dbApi();
  await api.updateDoc(api.doc(api.db, "coinOrders", id), {
    status: "paid",
    payoutTx: payoutTx || "",
    paidAt: api.serverTimestamp()
  });
}
