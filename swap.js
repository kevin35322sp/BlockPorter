(function () {
  const tokenIds = {
    ETH: "ethereum",
    USDC: "usd-coin",
    USDT: "tether",
    MATIC: "matic-network",
    BNB: "binancecoin",
    TON: "the-open-network"
  };
  const form = document.getElementById("swap-form");
  const chainSelect = document.getElementById("chain");
  const fromToken = document.getElementById("from-token");
  const toToken = document.getElementById("to-token");
  const fromAmount = document.getElementById("from-amount");
  const toAmount = document.getElementById("to-amount");
  const payout = document.getElementById("payout-address");
  const memo = document.getElementById("memo");
  const fullName = document.getElementById("full-name");
  const email = document.getElementById("email");
  const contact = document.getElementById("contact");
  const agree = document.getElementById("agree");
  const button = document.getElementById("swap-button");
  const rateInfo = document.getElementById("rate-info");
  const note = document.getElementById("swap-note");
  let priceCache = null;
  let priceAt = 0;
  let requestId = 0;
  let inputTimer = 0;
  let priced = false;

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key;
  }

  function selectedKind() {
    const node = document.querySelector('input[name="contact-kind"]:checked');
    return node ? node.value : "";
  }

  function swapOpen() {
    const pricing = window.BP && window.BP.pricing;
    return !pricing || pricing.coinSwapEnabled !== false;
  }

  function applyGate() {
    const open = swapOpen();
    document.getElementById("page-closed").hidden = open;
    document.getElementById("swap-open").hidden = !open;
  }

  function conditions() {
    const pricing = (window.BP && window.BP.pricing) || {};
    const bonus = Number(pricing.swapBonusPercent);
    const safeBonus = Number.isFinite(bonus) && bonus > 0 ? bonus : 0;
    const feeOn = pricing.swapFeeEnabled !== false;
    const multiplier = typeof pricing.swapMultiplier === "number"
      ? pricing.swapMultiplier
      : (feeOn ? 0.955 : 1) * (1 + safeBonus / 100);
    return { feeOn: feeOn, bonus: safeBonus, multiplier: multiplier };
  }

  function paintNote() {
    if (!priced) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    const pricing = conditions();
    const parts = [];
    if (pricing.feeOn) parts.push("Комиссия 4.5% включена в курс.");
    if (pricing.bonus > 0) parts.push("К сумме получения добавлено " + pricing.bonus + "%.");
    note.hidden = parts.length === 0;
    note.textContent = parts.join(" ");
  }

  function fillCoins(preferFrom, preferTo) {
    const coins = window.BPSwap.coinsOn(chainSelect.value);
    function fill(select, prefer) {
      const prev = prefer || select.value;
      select.replaceChildren();
      coins.forEach(function (coin) {
        const option = document.createElement("option");
        option.value = coin;
        option.textContent = coin;
        select.appendChild(option);
      });
      if (coins.indexOf(prev) !== -1) select.value = prev;
    }
    fill(fromToken, preferFrom);
    fill(toToken, preferTo);
    if (fromToken.value === toToken.value && coins.length > 1) {
      const other = coins.filter(function (coin) { return coin !== fromToken.value; })[0];
      if (other) toToken.value = other;
    }
    payout.placeholder = chainSelect.value === "ton" ? "EQ…, UQ… или 0:…" : "0x…";
  }

  function contactProblem() {
    const kind = selectedKind();
    const text = contact.value.trim();
    if (kind === "telegram") {
      if (!/^@?[A-Za-z][A-Za-z0-9_]{2,31}$/.test(text) && !/^(?:https?:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{2,31}$/.test(text)) {
        return "Укажите Telegram: @имя или ссылку t.me";
      }
    } else if (kind === "whatsapp" || kind === "phone") {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        return kind === "whatsapp" ? "Укажите номер WhatsApp" : "Укажите номер телефона";
      }
    } else {
      return "Выберите способ связи";
    }
    if (text.length > 64) return "Контакт слишком длинный";
    return "";
  }

  function formProblem() {
    const raw = fromAmount.value.trim().replace(",", ".");
    if (!raw) return "";
    if (!/^\d+(\.\d+)?$/.test(raw)) return "Укажите сумму больше нуля";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return "Укажите сумму больше нуля";
    if (amount > 1e12) return "Слишком большая сумма";
    const coins = window.BPSwap.coinsOn(chainSelect.value);
    if (coins.length < 2) return "В сети " + chainName(chainSelect.value) + " нет второй монеты для обмена";
    if (!fromToken.value || !toToken.value || fromToken.value === toToken.value) return "Выберите две разные монеты";
    if (!window.BPSwap.isReceiveAddress(chainSelect.value, payout.value.trim())) {
      return chainSelect.value === "ton"
        ? "Укажите кошелёк TON: EQ…, UQ… или 0:…"
        : "Укажите кошелёк для получения: адрес 0x… из 40 знаков";
    }
    if (memo.value.trim().length > 159) return "Мемо слишком длинное";
    const name = fullName.value.trim();
    if (name.length < 3 || name.length > 80 || !/[A-Za-zА-Яа-яЁё]/.test(name)) return "Укажите ФИО";
    const mail = email.value.trim();
    if (mail.length < 5 || mail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return "Укажите почту";
    const contactError = contactProblem();
    if (contactError) return contactError;
    if (!agree.checked) return "Отметьте согласие с политикой соглашения";
    return "";
  }

  function setRate(text) {
    rateInfo.textContent = text;
  }

  function formatAmount(value) {
    const fixed = value.toFixed(6);
    if (Number(fixed) === 0 && value > 0) return value.toPrecision(6);
    return fixed;
  }

  function priceOf(data, token) {
    const id = tokenIds[token];
    const usd = id && data[id] && data[id].usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
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

  async function updateAmount() {
    const my = ++requestId;
    if (window.BP && window.BP.pricingReady) {
      try { await window.BP.pricingReady; } catch (err) {}
    }
    if (my !== requestId) return;
    priced = true;
    applyGate();
    paintNote();
    if (!swapOpen()) return;
    const amount = Number(fromAmount.value.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      toAmount.value = "";
      setRate(formProblem() || "Укажите сумму");
      button.disabled = true;
      return;
    }
    if (fromToken.value === toToken.value) {
      toAmount.value = "";
      setRate(formProblem() || "Выберите две разные монеты");
      button.disabled = true;
      return;
    }
    setRate("Считаем курс…");
    button.disabled = true;
    try {
      const data = await loadPrices();
      if (my !== requestId) return;
      const fromPrice = priceOf(data, fromToken.value);
      const toPrice = priceOf(data, toToken.value);
      if (!fromPrice || !toPrice) {
        toAmount.value = "";
        setRate("Не удалось получить курс");
        return;
      }
      const pricing = conditions();
      const receive = (amount * fromPrice * pricing.multiplier) / toPrice;
      toAmount.value = formatAmount(receive);
      const problem = formProblem();
      const perToken = formatAmount(receive / amount);
      const notes = [];
      if (pricing.feeOn) notes.push("комиссия включена в курс");
      if (pricing.bonus > 0) notes.push("к сумме добавлено " + pricing.bonus + "%");
      const rate = "Курс: 1 " + fromToken.value + " = " + perToken + " " + toToken.value + (notes.length ? ". " + notes.join(", ") : "");
      setRate(problem || rate);
      button.disabled = Boolean(problem);
    } catch (err) {
      if (my !== requestId) return;
      toAmount.value = "";
      const message = err && err.message === "Failed to fetch" ? "Нет связи с CoinGecko" : (err && err.message) || "Не удалось получить курс";
      setRate(message);
    }
  }

  function scheduleUpdate() {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(updateAmount, 350);
  }

  function contactPlaceholder() {
    const kind = selectedKind();
    if (kind === "whatsapp") contact.placeholder = "Номер WhatsApp";
    else if (kind === "phone") contact.placeholder = "Номер телефона";
    else contact.placeholder = "@имя в Telegram";
  }

  function restoreDraft() {
    let draft = null;
    try { draft = JSON.parse(sessionStorage.getItem("bpCoinSwap") || ""); } catch (err) { draft = null; }
    if (!draft || typeof draft !== "object") return;
    if ([].some.call(chainSelect.options, function (option) { return option.value === draft.chain; })) {
      chainSelect.value = draft.chain;
    }
    fillCoins(draft.fromToken, draft.toToken);
    if (draft.fromAmount) fromAmount.value = String(draft.fromAmount);
    if (draft.payoutAddress) payout.value = String(draft.payoutAddress);
    if (draft.memo) memo.value = String(draft.memo);
    if (draft.fullName) fullName.value = String(draft.fullName);
    if (draft.email) email.value = String(draft.email);
    if (draft.contactKind) {
      const radio = document.querySelector('input[name="contact-kind"][value="' + draft.contactKind + '"]');
      if (radio) radio.checked = true;
    }
    if (draft.contact) contact.value = String(draft.contact);
  }

  document.getElementById("swap-coins").addEventListener("click", function () {
    const nextFrom = toToken.value;
    const nextTo = fromToken.value;
    if (nextFrom) fromToken.value = nextFrom;
    if (nextTo) toToken.value = nextTo;
    updateAmount();
  });

  chainSelect.addEventListener("change", function () {
    fillCoins();
    updateAmount();
  });
  [fromToken, toToken].forEach(function (node) {
    node.addEventListener("change", updateAmount);
  });
  [fromAmount, payout, memo, fullName, email, contact].forEach(function (node) {
    node.addEventListener("input", scheduleUpdate);
  });
  agree.addEventListener("change", scheduleUpdate);
  document.querySelectorAll('input[name="contact-kind"]').forEach(function (node) {
    node.addEventListener("change", function () {
      contactPlaceholder();
      scheduleUpdate();
    });
  });
  document.addEventListener("bp-pricing", function () {
    applyGate();
    paintNote();
    if (fromAmount.value) updateAmount();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!swapOpen() || button.disabled) return;
    button.disabled = true;
    await updateAmount();
    const problem = formProblem();
    if (problem || !toAmount.value) {
      setRate(problem || "Дождитесь курса");
      button.disabled = true;
      return;
    }
    const pricing = conditions();
    const draft = {
      orderNo: 1 + Math.floor(Math.random() * 100),
      orderedAt: new Date().toISOString(),
      chain: chainSelect.value,
      fromToken: fromToken.value,
      toToken: toToken.value,
      fromAmount: fromAmount.value.trim().replace(",", "."),
      toAmount: toAmount.value,
      payoutAddress: payout.value.trim(),
      memo: memo.value.trim(),
      fullName: fullName.value.trim(),
      email: email.value.trim(),
      contactKind: selectedKind(),
      contact: contact.value.trim(),
      fee: pricing.feeOn ? "4.5%" : "0%",
      bonus: pricing.bonus > 0 ? pricing.bonus + "%" : "0%"
    };
    try {
      sessionStorage.setItem("bpCoinSwap", JSON.stringify(draft));
    } catch (err) {
      setRate("Браузер не сохранил заявку. Разрешите сохранение данных для этого сайта.");
      button.disabled = false;
      return;
    }
    location.href = "swap-review.html";
  });

  fillCoins();
  contactPlaceholder();
  restoreDraft();
  applyGate();
  if (window.BP && window.BP.pricingReady) window.BP.pricingReady.then(function () {
    applyGate();
    paintNote();
  });
  updateAmount();
})();
