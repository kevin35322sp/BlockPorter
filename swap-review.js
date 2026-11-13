(function () {
  const details = document.getElementById("review-details");
  const missing = document.getElementById("missing");
  const goPay = document.getElementById("go-pay");
  const editLink = document.getElementById("edit-link");
  const reviewStatus = document.getElementById("review-status");

  function swapOpen() {
    const pricing = window.BP && window.BP.pricing;
    return !!(pricing && pricing.pagesKnown === true && pricing.coinSwapEnabled !== false);
  }

  function applyGate() {
    const pricing = window.BP && window.BP.pricing;
    const open = swapOpen();
    const knownClosed = !!(pricing && pricing.pagesKnown === true && !open);
    document.getElementById("page-closed").hidden = !knownClosed;
    document.getElementById("review-open").hidden = !open;
  }

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function contactTitle(kind) {
    if (kind === "whatsapp") return "WhatsApp";
    if (kind === "phone") return "Телефон";
    return "Telegram";
  }

  function whenText(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU");
  }

  function line(label, value, mono) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + " ";
    const span = document.createElement("span");
    if (mono) span.className = "mono";
    span.textContent = value;
    row.appendChild(strong);
    row.appendChild(span);
    return row;
  }

  function readDraft() {
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem("bpCoinSwap") || ""); } catch (err) { data = null; }
    if (!data || typeof data !== "object" || !window.BPSwap) return null;
    const chain = String(data.chain || "");
    const coins = window.BPSwap.coinsOn(chain);
    const orderNo = Number(data.orderNo);
    if (!Number.isInteger(orderNo) || orderNo < 1 || orderNo > 100) return null;
    if (coins.indexOf(data.fromToken) === -1 || coins.indexOf(data.toToken) === -1) return null;
    if (data.fromToken === data.toToken) return null;
    if (!/^\d+(\.\d+)?$/.test(String(data.fromAmount || ""))) return null;
    if (!data.toAmount) return null;
    if (!window.BPSwap.isReceiveAddress(chain, data.payoutAddress)) return null;
    if (!data.orderedAt || !data.fullName || !data.email || !data.contact) return null;
    if (["telegram", "whatsapp", "phone"].indexOf(data.contactKind) === -1) return null;
    return data;
  }

  function show() {
    applyGate();
    if (!swapOpen()) return;
    const draft = readDraft();
    if (!draft) {
      missing.hidden = false;
      details.hidden = true;
      goPay.hidden = true;
      editLink.hidden = true;
      return;
    }
    details.replaceChildren();
    details.appendChild(line("Номер заявки:", String(draft.orderNo)));
    details.appendChild(line("Дата и время:", whenText(draft.orderedAt)));
    details.appendChild(line("Сеть:", chainName(draft.chain)));
    details.appendChild(line("Меняет:", draft.fromAmount + " " + draft.fromToken));
    details.appendChild(line("На:", draft.toAmount + " " + draft.toToken));
    details.appendChild(line("Кошелёк для получения:", draft.payoutAddress, true));
    if (draft.memo) details.appendChild(line("Мемо:", draft.memo));
    details.appendChild(line("ФИО:", draft.fullName));
    details.appendChild(line("Почта:", draft.email));
    details.appendChild(line(contactTitle(draft.contactKind) + ":", draft.contact));
    if (draft.fee && draft.fee !== "0%") details.appendChild(line("Комиссия:", draft.fee + " включена в сумму получения"));
    if (draft.bonus && draft.bonus !== "0%") details.appendChild(line("Доплата сверху:", draft.bonus));
    details.hidden = false;
    missing.hidden = true;
    goPay.hidden = false;
    editLink.hidden = false;
  }

  function saveError(err) {
    const code = String((err && err.code) || "");
    const message = String((err && err.message) || "");
    if (code.indexOf("permission") !== -1 || /permission|disabled|has not been used/i.test(message)) {
      return "Страница оплаты не сохранилась. Создайте Firestore в проекте blockporter-1 и вставьте правила из файла firestore.rules.";
    }
    return message || "Не удалось открыть страницу оплаты";
  }

  goPay.addEventListener("click", async function () {
    const draft = readDraft();
    if (!draft || !swapOpen() || !window.BPSwap) return;
    const slug = window.BPSwap.orderSlug(draft.orderNo, draft.orderedAt);
    if (!slug) return;
    goPay.disabled = true;
    reviewStatus.textContent = "Открываем страницу оплаты…";
    try {
      const ledger = await import("./ledger.js?v=5");
      await ledger.savePayPage(slug, draft);
      const path = location.pathname;
      const dir = path.slice(0, path.lastIndexOf("/") + 1);
      location.assign(dir + slug);
    } catch (err) {
      reviewStatus.textContent = saveError(err);
      goPay.disabled = false;
    }
  });

  document.addEventListener("bp-pricing", show);
  show();
  if (window.BP && window.BP.pricingReady) window.BP.pricingReady.then(show);
})();
