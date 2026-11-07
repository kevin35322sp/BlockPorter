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
  const depositLabel = document.getElementById("deposit-label");
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
    if (!/^\d+(\.\d+)?$/.test(raw)) return "Введите сумму больше нуля";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return "Введите сумму больше нуля";
    if (amount > 1e12) return "Слишком большая сумма";
    if (fromChainSelect.value === toChainSelect.value && fromTokenSelect.value === toTokenSelect.value) {
      return "Выберите другую монету или другую сеть";
    }
    const mode = payMode();
    if (mode === "unsupported") return "Из этой сети через сайт отправляются только её монета, USDT и USDC";
    if (!walletsReady) return walletsError || "Загружаем адрес приёма…";
    if (walletsError) return walletsError;
    const deposit = depositFor(fromChainSelect.value);
    if (!window.BPSwap.isReceiveAddress(fromChainSelect.value, deposit)) {
      return "Адрес для этой сети ещё готовится. Выберите другую сеть или обновите страницу.";
    }
    if (!window.BPSwap.isReceiveAddress(toChainSelect.value, payoutValue())) {
      return toChainSelect.value === "ton"
        ? "Для выплаты нужен адрес TON: EQ…, UQ… или 0:…"
        : "Для выплаты нужен адрес 0x… из 40 знаков";
    }
    if (mode === "manual") {
      if (!window.BPSwap.isTxHash("ton", manualHash.value.trim())) return "Вставьте хеш перевода в TON";
      if (!window.BPSwap.isTonAddress(manualSender.value.trim())) return "Вставьте адрес TON, с которого отправили";
    }
    if (mode === "wallet" && !window.ethereum) return "Для этой монеты нужен MetaMask";
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
    swapButton.textContent = mode === "manual" ? "Я отправил TON" : (mode === "wallet" ? "Перейти к оплате" : "Эта пара недоступна");
    const deposit = depositFor(fromChainSelect.value);
    const valid = walletsReady && window.BPSwap.isReceiveAddress(fromChainSelect.value, deposit);
    depositLabel.textContent = "Куда отправить в сети " + chainName(fromChainSelect.value);
    if (!walletsReady) depositAddress.textContent = walletsError || "Загружаем адрес…";
    else if (walletsError) depositAddress.textContent = walletsError;
    else if (valid) depositAddress.textContent = deposit;
    else depositAddress.textContent = "Адрес для этой сети ещё готовится";
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
    syncForm();
    const amount = parseFloat(fromAmountInput.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      toAmountInput.value = "";
      setRate(formProblem() || "Введите сумму");
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
      const toAmount = (amount * fromPrice * 0.955) / toPrice;
      toAmountInput.value = formatAmount(toAmount);
      const problem = formProblem();
      const perToken = formatAmount(toAmount / amount);
      const rate = "1 " + fromTokenSelect.value + " ≈ " + perToken + " " + toTokenSelect.value + " после комиссии 4.5%";
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

  function restoreWallet() {
    const saved = window.BP.wallet();
    if (!saved.connected) return;
    showWallet(saved.address);
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(function (accounts) {
      if (!accounts || accounts.length === 0) return;
      const match = accounts.find(function (item) {
        return item.toLowerCase() === saved.address.toLowerCase();
      });
      const address = (match || accounts[0]).toLowerCase();
      localStorage.setItem("walletAddress", address);
      localStorage.setItem("walletConnected", "true");
      showWallet(address);
      window.BP.refreshAuth();
    }).catch(function () {});
  }

  async function refreshWallets() {
    try {
      const ledger = await import("./ledger.js");
      wallets = await ledger.getWallets();
      walletsError = "";
    } catch (err) {
      wallets = {};
      walletsError = "Адрес обмена сейчас не открылся. Обновите страницу через минуту.";
    }
    walletsReady = true;
    syncForm();
  }

  document.getElementById("connect-wallet").addEventListener("click", async function () {
    if (!window.ethereum) {
      window.alert("MetaMask не найден. Откройте сайт по http://localhost и проверьте расширение.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts[0].toLowerCase();
      localStorage.setItem("walletAddress", address);
      localStorage.setItem("walletConnected", "true");
      showWallet(address);
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
      fee: "4.5%"
    };
    sessionStorage.setItem("bpSwapDraft", JSON.stringify(draft));
    location.href = "confirmation.html";
  });

  syncForm();
  restoreWallet();
  refreshWallets().then(updateAmount);
})();
