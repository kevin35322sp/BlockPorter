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
  const rateInfo = document.getElementById("rate-info");
  const swapButton = document.getElementById("swap-button");
  const walletHint = document.getElementById("wallet-hint");

  let priceCache = null;
  let priceAt = 0;
  let requestId = 0;
  let inputTimer = 0;

  function isTonAddress(value) {
    const text = String(value || "").trim();
    if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(text)) return true;
    if (/^-?\d+:[0-9a-fA-F]{64}$/.test(text)) return true;
    return false;
  }

  function formProblem() {
    const amount = parseFloat(fromAmountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) return "Введите сумму больше нуля";
    if (amount > 1e12) return "Слишком большая сумма";
    if (fromChainSelect.value === toChainSelect.value) return "Выберите разные сети";
    if (toChainSelect.value === "ton" && !isTonAddress(tonInput.value)) {
      return "Для TON нужен адрес EQ…, UQ… или 0:…";
    }
    return "";
  }

  function syncTonField() {
    const show = toChainSelect.value === "ton";
    tonBox.hidden = !show;
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
    syncTonField();
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
  tonInput.addEventListener("input", scheduleUpdate);

  document.addEventListener("bp-wallet", function () {
    const saved = window.BP.wallet();
    if (saved.connected) showWallet(saved.address);
    else hideWallet();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (swapButton.disabled) return;
    const problem = formProblem();
    if (problem || !toAmountInput.value) {
      setRate(problem || "Дождитесь курса");
      return;
    }
    const draft = {
      fromChain: fromChainSelect.value,
      toChain: toChainSelect.value,
      fromToken: fromTokenSelect.value,
      toToken: toTokenSelect.value,
      fromAmount: fromAmountInput.value,
      toAmount: toAmountInput.value,
      tonAddress: toChainSelect.value === "ton" ? tonInput.value.trim() : "",
      wallet: window.BP.wallet().address || "",
      rateText: rateInfo.textContent,
      fee: "4.5%"
    };
    sessionStorage.setItem("bpSwapDraft", JSON.stringify(draft));
    location.href = "confirmation.html";
  });

  syncTonField();
  restoreWallet();
  updateAmount();
})();
