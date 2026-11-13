(function () {
  const missing = document.getElementById("missing");
  const details = document.getElementById("pay-details");
  const orderNo = document.getElementById("order-no");
  const sendAmount = document.getElementById("send-amount");
  const sendChain = document.getElementById("send-chain");
  const depositAddress = document.getElementById("deposit-address");
  const copyDeposit = document.getElementById("copy-deposit");
  const qr = document.getElementById("qr");
  const done = document.getElementById("done");
  const status = document.getElementById("pay-status");
  let draft = null;
  let deposit = "";
  let saving = false;
  let loading = false;

  function swapOpen() {
    const pricing = window.BP && window.BP.pricing;
    return !!(pricing && pricing.pagesKnown === true && pricing.coinSwapEnabled !== false);
  }

  function applyGate() {
    const pricing = window.BP && window.BP.pricing;
    const open = swapOpen();
    const knownClosed = !!(pricing && pricing.pagesKnown === true && !open);
    document.getElementById("page-closed").hidden = !knownClosed;
    document.getElementById("pay-open").hidden = !open;
  }

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function readDraft() {
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem("bpCoinSwap") || ""); } catch (err) { data = null; }
    if (!data || typeof data !== "object" || !window.BPSwap) return null;
    const chain = String(data.chain || "");
    const coins = window.BPSwap.coinsOn(chain);
    const number = Number(data.orderNo);
    if (!Number.isInteger(number) || number < 1 || number > 100) return null;
    if (coins.indexOf(data.fromToken) === -1 || coins.indexOf(data.toToken) === -1) return null;
    if (data.fromToken === data.toToken) return null;
    if (!/^\d+(\.\d+)?$/.test(String(data.fromAmount || ""))) return null;
    if (!data.toAmount || !data.orderedAt || !data.fullName || !data.email || !data.contact) return null;
    if (!window.BPSwap.isReceiveAddress(chain, data.payoutAddress)) return null;
    if (["telegram", "whatsapp", "phone"].indexOf(data.contactKind) === -1) return null;
    return data;
  }

  function copyText(text, button) {
    function mark() {
      const prev = button.textContent;
      button.textContent = "Скопировано";
      window.setTimeout(function () { button.textContent = prev; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(mark).catch(fallback);
      return;
    }
    fallback();
    function fallback() {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); mark(); } catch (err) {}
      area.remove();
    }
  }

  function drawQr(address) {
    qr.replaceChildren();
    qr.hidden = true;
    if (!address || !window.QRCode) return;
    qr.hidden = false;
    new window.QRCode(qr, {
      text: address,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }

  function showRecorded() {
    done.hidden = true;
    status.textContent = "Заявка № " + draft.orderNo + " записана. Оператор сверит поступление и отправит выплату на указанный кошелёк.";
  }

  function walletMissText() {
    if (location.protocol === "file:") {
      return "Адрес приёма открывается по http, не из файла на диске.";
    }
    return "Адрес приёма не открылся. В Firebase выберите проект blockporter-1, создайте базу Firestore, вставьте правила из файла firestore.rules и снова сохраните адреса на странице заявок.";
  }

  async function loadDeposit() {
    applyGate();
    if (!swapOpen()) return;
    if (loading || deposit) return;
    loading = true;
    try {
      draft = readDraft();
      if (!draft) {
        missing.hidden = false;
        details.hidden = true;
        return;
      }
      missing.hidden = true;
      details.hidden = false;
      orderNo.textContent = String(draft.orderNo);
      sendAmount.textContent = draft.fromAmount + " " + draft.fromToken;
      sendChain.textContent = chainName(draft.chain);
      if (draft.savedId) {
        depositAddress.textContent = draft.depositAddress || "Реквизиты уже были показаны";
        copyDeposit.hidden = !draft.depositAddress;
        deposit = draft.depositAddress || "";
        drawQr(deposit);
        showRecorded();
        return;
      }
      depositAddress.textContent = "Загружаем реквизиты…";
      copyDeposit.hidden = true;
      done.disabled = true;
      let wallets = null;
      try {
        const ledger = await import("./ledger.js");
        wallets = await ledger.getWallets();
      } catch (err) {
        deposit = "";
        depositAddress.textContent = walletMissText();
        return;
      }
      deposit = String((wallets && wallets[draft.chain]) || "").trim();
      if (!window.BPSwap.isReceiveAddress(draft.chain, deposit)) {
        deposit = "";
        depositAddress.textContent = "Реквизиты для этой сети ещё не заданы. Обмен сейчас не оформить.";
        qr.hidden = true;
        return;
      }
      depositAddress.textContent = deposit;
      copyDeposit.hidden = false;
      drawQr(deposit);
      done.disabled = false;
    } finally {
      loading = false;
    }
  }

  copyDeposit.addEventListener("click", function () {
    if (deposit) copyText(deposit, copyDeposit);
  });

  done.addEventListener("click", async function () {
    if (saving || !draft || draft.savedId || !deposit) return;
    saving = true;
    done.disabled = true;
    status.textContent = "Записываем заявку…";
    try {
      const ledger = await import("./ledger.js");
      const fresh = await ledger.getWallets();
      const current = String((fresh && fresh[draft.chain]) || "").trim();
      if (!window.BPSwap.isReceiveAddress(draft.chain, current) || !window.BPSwap.sameAddress(draft.chain, current, deposit)) {
        status.textContent = "Адрес приёма изменился. Обновите страницу и отправьте перевод на новый адрес.";
        done.disabled = false;
        saving = false;
        return;
      }
      const id = await ledger.createCoinOrder({
        orderNo: draft.orderNo,
        orderedAt: draft.orderedAt,
        chain: draft.chain,
        fromToken: draft.fromToken,
        toToken: draft.toToken,
        fromAmount: String(draft.fromAmount),
        toAmount: String(draft.toAmount),
        payoutAddress: draft.payoutAddress,
        depositAddress: deposit,
        fullName: draft.fullName,
        email: draft.email,
        contactKind: draft.contactKind,
        contact: draft.contact,
        memo: draft.memo || "",
        fee: draft.fee === "4.5%" ? "4.5%" : "0%",
        bonus: draft.bonus && draft.bonus !== "0%" ? String(draft.bonus) : "0%"
      });
      draft.savedId = id;
      draft.depositAddress = deposit;
      sessionStorage.setItem("bpCoinSwap", JSON.stringify(draft));
      showRecorded();
    } catch (err) {
      const code = String((err && err.code) || "");
      const message = String((err && err.message) || "");
      status.textContent = code.indexOf("permission") !== -1 || /permission/i.test(message)
        ? "Заявка не записалась. Вставьте обновлённые правила из файла firestore.rules."
        : (message || "Не удалось записать заявку");
      done.disabled = false;
      saving = false;
    }
  });

  document.addEventListener("bp-pricing", applyGate);
  loadDeposit();
  if (window.BP && window.BP.pricingReady) window.BP.pricingReady.then(loadDeposit);
})();
