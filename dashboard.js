(function () {
  const tokenIds = {
    ETH: "ethereum",
    USDC: "usd-coin",
    USDT: "tether",
    MATIC: "matic-network",
    BNB: "binancecoin",
    TON: "the-open-network",
    XRP: "ripple"
  };

  const form = document.getElementById("swap-form");
  const fromAmountInput = document.getElementById("from-amount");
  const toAmountInput = document.getElementById("to-amount");
  const fromTokenSelect = document.getElementById("from-token");
  const toTokenSelect = document.getElementById("to-token");
  const fromChainSelect = document.getElementById("from-chain");
  const toChainSelect = document.getElementById("to-chain");
  const tonBox = document.getElementById("ton-address-container");
  const tonInput = document.getElementById("ton-address");
  const payoutBox = document.getElementById("payout-container");
  const payoutInput = document.getElementById("payout-address");
  const manualBox = document.getElementById("manual-box");
  const manualHash = document.getElementById("manual-hash");
  const manualSender = document.getElementById("manual-sender");
  const depositAddress = document.getElementById("deposit-address");
  const copyDeposit = document.getElementById("copy-deposit");
  const rateInfo = document.getElementById("rate-info");
  const swapButton = document.getElementById("swap-button");
  const walletHint = document.getElementById("wallet-hint");

  let priceCache = null;
  let priceAt = 0;
  let requestId = 0;
  let inputTimer = 0;
  let wallets = {};
  let walletsReady = false;
  let walletsError = "";

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key;
  }

  function payMode() {
    return window.BPSwap.paymentMode(fromChainSelect.value, fromTokenSelect.value);
  }

  function depositFor(chain) {
    return String((wallets && wallets[chain]) || "").trim();
  }

  function payoutValue() {
    if (toChainSelect.value === "ton") return tonInput.value.trim();
    return payoutInput.value.trim();
  }

  function formProblem() {
    const raw = String(fromAmountInput.value || "").trim();
    if (!raw) return "";
    if (!/^\d+(\.\d+)?$/.test(raw)) return "Укажите сумму больше нуля";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return "Укажите сумму больше нуля";
    if (amount > 1e12) return "Слишком большая сумма";
    if (fromChainSelect.value === toChainSelect.value && fromTokenSelect.value === toTokenSelect.value) {
      return "Это направление недоступно: выберите другую монету или сеть";
    }
    const mode = payMode();
    if (mode === "unsupported") return "В этой сети к обмену доступны её монета, USDT и USDC";
    if (!walletsReady) return walletsError || "Загружаем адрес приёма…";
    if (walletsError) return walletsError;
    const deposit = depositFor(fromChainSelect.value);
    if (!window.BPSwap.isReceiveAddress(fromChainSelect.value, deposit)) {
      return "Реквизиты для этой сети ещё не заданы. Выберите другую сеть или обновите страницу.";
    }
    if (!window.BPSwap.isReceiveAddress(toChainSelect.value, payoutValue())) {
      return toChainSelect.value === "ton"
        ? "Укажите реквизиты TON: EQ…, UQ… или 0:…"
        : "Укажите реквизиты для получения: адрес 0x… из 40 знаков";
    }
    if (mode === "manual") {
      if (!window.BPSwap.isTxHash("ton", manualHash.value.trim())) return "Укажите хеш оплаты в TON";
      if (!window.BPSwap.isTonAddress(manualSender.value.trim())) return "Укажите адрес отправителя в TON";
    }
    if (mode === "wallet" && window.BPWallets && !window.BPWallets.hasWallet() && !window.BPWallets.isMobile()) {
      return "Установите MetaMask, Trust Wallet или другой кошелёк";
    }
    return "";
  }

  function copyText(text, button) {
    function done() {
      const prev = button.textContent;
      button.textContent = "Скопировано";
      window.setTimeout(function () { button.textContent = prev; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
      return;
    }
    fallback();
    function fallback() {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
      area.remove();
    }
  }

  function syncForm() {
    const toTon = toChainSelect.value === "ton";
    const mode = payMode();
    tonBox.hidden = !toTon;
    payoutBox.hidden = toTon;
    manualBox.hidden = mode !== "manual";
    const openInApp = mode === "wallet" && window.BPWallets && window.BPWallets.isMobile() && !window.BPWallets.hasWallet();
    swapButton.textContent = mode === "manual" ? "Я оплатил" : (mode === "unsupported" ? "Направление недоступно" : (openInApp ? "Открыть в кошельке" : "Обменять"));
    const deposit = depositFor(fromChainSelect.value);
    const valid = walletsReady && window.BPSwap.isReceiveAddress(fromChainSelect.value, deposit);
    if (!walletsReady) depositAddress.textContent = walletsError || "Загружаем реквизиты…";
    else if (walletsError) depositAddress.textContent = walletsError;
    else if (valid) depositAddress.textContent = deposit;
    else depositAddress.textContent = "Реквизиты для этой сети ещё не заданы";
    copyDeposit.hidden = !valid;
  }

  function maybeFillPayout(address) {
    if (toChainSelect.value === "ton") return;
    if (payoutInput.value.trim()) return;
    if (address && window.BPSwap.isEvmAddress(address)) payoutInput.value = address;
  }

  function setRate(text) {
    rateInfo.textContent = text;
  }

  async function loadPrices() {
    const now = Date.now();
    if (priceCache && now - priceAt < 60000) return priceCache;
    const ids = Object.keys(tokenIds).map(function (token) { return tokenIds[token]; }).filter(function (id, index, list) {
      return list.indexOf(id) === index;
    }).join(",");
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd");
    if (response.status === 429) throw new Error("CoinGecko ограничил запросы. Подождите минуту и введите сумму снова.");
    if (!response.ok) throw new Error("Курс недоступен (" + response.status + ")");
    const data = await response.json();
    const hasPrice = Object.keys(tokenIds).some(function (token) { return priceOf(data, token); });
    if (!hasPrice) throw new Error("Не удалось получить курс");
    priceCache = data;
    priceAt = Date.now();
    return data;
  }

  function priceOf(data, token) {
    const id = tokenIds[token];
    const usd = id && data[id] && data[id].usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  }

  function formatAmount(value) {
    const fixed = value.toFixed(6);
    if (Number(fixed) === 0 && value > 0) return value.toPrecision(6);
    return fixed;
  }

  async function updateAmount() {
    const my = ++requestId;
    if (window.BP && window.BP.pricingReady) {
      try { await window.BP.pricingReady; } catch (err) {}
    }
    if (my !== requestId) return;
    syncForm();
    const amount = parseFloat(fromAmountInput.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      toAmountInput.value = "";
      setRate(formProblem() || "Укажите сумму");
      swapButton.disabled = true;
      return;
    }

    setRate("Считаем курс…");
    swapButton.disabled = true;
    try {
      const data = await loadPrices();
      if (my !== requestId) return;
      const fromPrice = priceOf(data, fromTokenSelect.value);
      const toPrice = priceOf(data, toTokenSelect.value);
      if (!fromPrice || !toPrice) {
        toAmountInput.value = "";
        setRate("Не удалось получить курс");
        return;
      }
      const pricing = window.BP.pricing || { feeEnabled: true, bonusPercent: 0, multiplier: 0.955 };
      const toAmount = (amount * fromPrice * pricing.multiplier) / toPrice;
      toAmountInput.value = formatAmount(toAmount);
      const problem = formProblem();
      const perToken = formatAmount(toAmount / amount);
      const notes = [];
      if (pricing.feeEnabled) notes.push("комиссия включена в курс");
      if (pricing.bonusPercent > 0) notes.push("к сумме добавлено " + pricing.bonusPercent + "%");
      const rate = "Курс: 1 " + fromTokenSelect.value + " = " + perToken + " " + toTokenSelect.value + (notes.length ? ". " + notes.join(", ") : "");
      setRate(problem || rate);
      swapButton.disabled = Boolean(problem);
    } catch (err) {
      if (my !== requestId) return;
      toAmountInput.value = "";
      const message = err && err.message === "Failed to fetch" ? "Нет связи с CoinGecko" : (err && err.message) || "Не удалось получить курс";
      setRate(message);
    }
  }

  function scheduleUpdate() {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(updateAmount, 350);
  }

  function showWallet(address) {
    document.getElementById("wallet-status").textContent = window.BP.shortAddress(address);
    document.getElementById("wallet-status").title = address;
    document.getElementById("wallet-info").style.display = "flex";
    document.getElementById("connect-wallet").style.display = "none";
    walletHint.hidden = true;
    maybeFillPayout(address);
    updateAmount();
  }

  function hideWallet() {
    document.getElementById("wallet-info").style.display = "none";
    document.getElementById("connect-wallet").style.display = "flex";
    walletHint.hidden = false;
  }

  function restoreAccounts() {
    const eth = window.BPWallets && window.BPWallets.active();
    if (!eth || !eth.request) return;
    eth.request({ method: "eth_accounts" }).then(function (accounts) {
      if (!accounts || accounts.length === 0) return;
      const saved = window.BP.wallet();
      const match = accounts.find(function (item) {
        return saved.address && item.toLowerCase() === saved.address.toLowerCase();
      });
      const address = (match || accounts[0]).toLowerCase();
      localStorage.setItem("walletAddress", address);
      localStorage.setItem("walletConnected", "true");
      showWallet(address);
      window.BP.refreshAuth();
    }).catch(function () {});
  }

  function restoreWallet() {
    const saved = window.BP.wallet();
    if (saved.connected) showWallet(saved.address);
    restoreAccounts();
  }

  function takeQueryDraft() {
    const params = new URLSearchParams(location.search);
    const raw = params.get("bp");
    if (!raw || raw.length > 4000) {
      if (raw) history.replaceState(null, "", location.pathname);
      return;
    }
    history.replaceState(null, "", location.pathname);
    let draft = null;
    try { draft = JSON.parse(raw); } catch (err) { draft = null; }
    if (!draft || typeof draft !== "object") return;
    function setSelect(node, value) {
      if (!value) return;
      if ([].some.call(node.options, function (option) { return option.value === value; })) node.value = value;
    }
    setSelect(fromChainSelect, draft.fromChain);
    setSelect(toChainSelect, draft.toChain);
    setSelect(fromTokenSelect, draft.fromToken);
    setSelect(toTokenSelect, draft.toToken);
    if (draft.fromAmount) fromAmountInput.value = String(draft.fromAmount);
    if (draft.payoutAddress) {
      if (toChainSelect.value === "ton") tonInput.value = String(draft.payoutAddress);
      else payoutInput.value = String(draft.payoutAddress);
    }
    if (draft.txHash) manualHash.value = String(draft.txHash);
    if (draft.senderAddress) manualSender.value = String(draft.senderAddress);
  }

  async function refreshWallets() {
    try {
      const ledger = await import("./ledger.js");
      wallets = await ledger.getWallets();
      walletsError = "";
    } catch (err) {
      wallets = {};
      walletsError = "Реквизиты обмена сейчас не открылись. Обновите страницу через минуту.";
    }
    walletsReady = true;
    syncForm();
  }

  document.getElementById("connect-wallet").addEventListener("click", async function () {
    try {
      const address = await window.BPWallets.connectInteractive();
      if (!address) return;
      showWallet(address.toLowerCase());
      window.BP.refreshAuth();
    } catch (err) {
      const message = err && err.code === 4001 ? "Подключение отменено" : (err && err.message) || "Не удалось подключить кошелёк";
      window.alert(message);
    }
  });

  document.getElementById("disconnect").addEventListener("click", async function () {
    const button = document.getElementById("disconnect");
    button.disabled = true;
    await window.BP.forgetWallet();
    hideWallet();
    window.BP.refreshAuth();
    button.disabled = false;
  });

  copyDeposit.addEventListener("click", function () {
    const deposit = depositFor(fromChainSelect.value);
    if (window.BPSwap.isReceiveAddress(fromChainSelect.value, deposit)) copyText(deposit, copyDeposit);
  });

  document.getElementById("swap-direction").addEventListener("click", function () {
    [["from-chain", "to-chain"], ["from-token", "to-token"]].forEach(function (pair) {
      const left = document.getElementById(pair[0]);
      const right = document.getElementById(pair[1]);
      const nextLeft = right.value;
      const nextRight = left.value;
      if ([].some.call(left.options, function (option) { return option.value === nextLeft; }) &&
          [].some.call(right.options, function (option) { return option.value === nextRight; })) {
        left.value = nextLeft;
        right.value = nextRight;
      }
    });
    if (toAmountInput.value) fromAmountInput.value = toAmountInput.value;
    updateAmount();
  });

  fromAmountInput.addEventListener("input", scheduleUpdate);
  fromAmountInput.addEventListener("wheel", function (event) {
    event.currentTarget.blur();
  });
  [fromTokenSelect, toTokenSelect, fromChainSelect, toChainSelect].forEach(function (node) {
    node.addEventListener("change", updateAmount);
  });
  [tonInput, payoutInput, manualHash, manualSender].forEach(function (node) {
    node.addEventListener("input", scheduleUpdate);
  });

  document.addEventListener("bp-wallet", function () {
    const saved = window.BP.wallet();
    if (saved.connected) showWallet(saved.address);
    else hideWallet();
  });

  document.addEventListener("bp-pricing", function () {
    if (fromAmountInput.value) updateAmount();
  });

  document.addEventListener("bp-wallets", function () {
    restoreAccounts();
    if (fromAmountInput.value) updateAmount();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (swapButton.disabled) return;
    swapButton.disabled = true;
    await refreshWallets();
    const problem = formProblem();
    if (problem || !toAmountInput.value) {
      setRate(problem || "Дождитесь курса");
      swapButton.disabled = true;
      return;
    }
    const mode = payMode();
    const draft = {
      fromChain: fromChainSelect.value,
      toChain: toChainSelect.value,
      fromToken: fromTokenSelect.value,
      toToken: toTokenSelect.value,
      fromAmount: String(fromAmountInput.value).trim(),
      toAmount: toAmountInput.value,
      payoutAddress: payoutValue(),
      depositAddress: depositFor(fromChainSelect.value),
      senderAddress: mode === "manual" ? manualSender.value.trim() : (window.BP.wallet().address || ""),
      txHash: mode === "manual" ? manualHash.value.trim() : "",
      payMode: mode,
      wallet: window.BP.wallet().address || "",
      rateText: rateInfo.textContent,
      fee: window.BP.pricing && window.BP.pricing.feeEnabled === false ? "0%" : "4.5%",
      bonus: window.BP.pricing && window.BP.pricing.bonusPercent > 0 ? window.BP.pricing.bonusPercent + "%" : "0%"
    };
    if (mode === "wallet") await window.BPWallets.ready();
    if (mode === "wallet" && !window.BPWallets.hasWallet()) {
      if (window.BPWallets.isMobile()) {
        const reopen = location.origin + location.pathname + "?bp=" + encodeURIComponent(JSON.stringify(draft));
        await window.BPWallets.showOpenInWallet(reopen);
        swapButton.disabled = false;
        return;
      }
      setRate("Установите MetaMask, Trust Wallet или другой кошелёк");
      swapButton.disabled = true;
      return;
    }
    sessionStorage.setItem("bpSwapDraft", JSON.stringify(draft));
    location.href = "confirmation.html";
  });

  takeQueryDraft();
  syncForm();
  restoreWallet();
  refreshWallets().then(updateAmount);
})();
