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

  function paySlug() {
    return window.BPSwap && window.BPSwap.orderSlugFromPath ? window.BPSwap.orderSlugFromPath() : "";
  }

  function applyGate() {
    if (paySlug()) {
      document.body.classList.add("pages-ready");
      document.body.classList.remove("page-locked");
      document.getElementById("page-closed").hidden = true;
      document.getElementById("pay-open").hidden = false;
      return;
    }
    const pricing = window.BP && window.BP.pricing;
    const open = swapOpen();
    const knownClosed = !!(pricing && pricing.pagesKnown === true && !open);
    document.getElementById("page-closed").hidden = !knownClosed;
    document.getElementById("pay-open").hidden = !open;
  }

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function draftFrom(data) {
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

  function readError(err) {
    const code = String((err && err.code) || "");
    const message = String((err && err.message) || "");
    if (location.protocol === "file:") return "Адрес приёма открывается по http, не из файла на диске.";
    if (code.indexOf("permission") !== -1 || /permission|disabled|has not been used/i.test(message)) {
      return "Адрес приёма не открылся. В Firebase выберите проект blockporter-1, создайте базу Firestore, вставьте правила из файла firestore.rules и снова сохраните адреса на странице заявок.";
    }
    return message || "Не удалось открыть страницу оплаты";
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

  function showDraft(page) {
    draft = draftFrom(page);
    if (!draft) {
      missing.hidden = false;
      missing.textContent = "Заявка по этой ссылке не найдена. Оформите её ещё раз.";
      details.hidden = true;
      return false;
    }
    missing.hidden = true;
    details.hidden = false;
    orderNo.textContent = String(draft.orderNo);
    sendAmount.textContent = draft.fromAmount + " " + draft.fromToken;
    sendChain.textContent = chainName(draft.chain);
    return true;
  }

  function showStoredDeposit(address) {
    deposit = String(address || "").trim();
    if (!window.BPSwap.isReceiveAddress(draft.chain, deposit)) {
      deposit = "";
      depositAddress.textContent = "Реквизиты для этой сети ещё не заданы. Обмен сейчас не оформить.";
      copyDeposit.hidden = true;
      qr.hidden = true;
      done.disabled = true;
      return;
    }
    depositAddress.textContent = deposit;
    copyDeposit.hidden = false;
    drawQr(deposit);
    done.disabled = false;
  }

  async function loadDeposit() {
    applyGate();
    const slug = paySlug();
    if (!slug) {
      missing.hidden = false;
      missing.textContent = "Страница оплаты открывается по ссылке заявки.";
      details.hidden = true;
      return;
    }
    if (loading || deposit) {
      applyGate();
      return;
    }
    loading = true;
    try {
      const ledger = await import("./ledger.js?v=5");
      const page = await ledger.getPayPage(slug);
      if (!page || !showDraft(page)) return;
      draft.paySlug = slug;
      if (page.status === "submitted") {
        showStoredDeposit(page.depositAddress);
        showRecorded();
        return;
      }
      depositAddress.textContent = "Загружаем реквизиты…";
      copyDeposit.hidden = true;
      done.disabled = true;
      let wallets = null;
      try {
        wallets = await ledger.getWallets();
      } catch (err) {
        deposit = "";
        depositAddress.textContent = readError(err);
        return;
      }
      showStoredDeposit(wallets && wallets[draft.chain]);
    } catch (err) {
      missing.hidden = false;
      missing.textContent = readError(err);
      details.hidden = true;
    } finally {
      loading = false;
      applyGate();
    }
  }

  copyDeposit.addEventListener("click", function () {
    if (deposit) copyText(deposit, copyDeposit);
  });

  done.addEventListener("click", async function () {
    if (saving || !draft || !deposit) return;
    saving = true;
    done.disabled = true;
    status.textContent = "Записываем заявку…";
    try {
      const ledger = await import("./ledger.js?v=5");
      const fresh = await ledger.getWallets();
      const current = String((fresh && fresh[draft.chain]) || "").trim();
      if (!window.BPSwap.isReceiveAddress(draft.chain, current) || !window.BPSwap.sameAddress(draft.chain, current, deposit)) {
        status.textContent = "Адрес приёма изменился. Обновите страницу и отправьте перевод на новый адрес.";
        done.disabled = false;
        saving = false;
        return;
      }
      const slug = paySlug();
      if (!draft.savedId) {
        draft.savedId = await ledger.createCoinOrder({
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
          bonus: draft.bonus && draft.bonus !== "0%" ? String(draft.bonus) : "0%",
          paySlug: slug
        });
      }
      await ledger.submitPayPage(slug, draft.savedId, deposit);
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
