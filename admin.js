(function () {
  const gate = document.getElementById("gate");
  const desk = document.getElementById("desk");
  const errorNode = document.getElementById("admin-error");
  const loginBtn = document.getElementById("admin-login");
  const form = document.getElementById("wallets-form");
  const pricingForm = document.getElementById("pricing-form");
  const pagesForm = document.getElementById("pages-form");
  const swapPricingForm = document.getElementById("swap-pricing-form");
  const walletStatus = document.getElementById("wallet-status-line");
  const pricingStatus = document.getElementById("pricing-status");
  const pagesStatus = document.getElementById("pages-status");
  const swapPricingStatus = document.getElementById("swap-pricing-status");
  const ordersNode = document.getElementById("orders");
  const emptyNode = document.getElementById("orders-empty");
  const coinOrdersNode = document.getElementById("coin-orders");
  const coinEmptyNode = document.getElementById("coin-orders-empty");
  const chains = ["ethereum", "bsc", "polygon", "optimism", "arbitrum", "ton"];
  const drafts = {};
  const coinDrafts = {};
  let ledgerApi = null;
  let stopWatch = null;
  let stopCoinWatch = null;
  let opening = false;
  let opened = false;

  function showError(message) {
    errorNode.hidden = !message;
    errorNode.textContent = message || "";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function when(value) {
    if (!value) return "только что";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU");
  }

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
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

  function addressRow(label, value) {
    const row = el("div", "addr-row");
    row.appendChild(el("span", "addr-label", label));
    row.appendChild(el("code", "addr-value", value || "—"));
    if (value) {
      const button = el("button", "btn copy-btn", "Копировать");
      button.type = "button";
      button.setAttribute("data-copy", value);
      row.appendChild(button);
    }
    return row;
  }

  function renderOrders(rows) {
    ordersNode.querySelectorAll("input[data-draft]").forEach(function (input) {
      drafts[input.getAttribute("data-draft")] = input.value;
    });
    ordersNode.replaceChildren();
    emptyNode.hidden = rows.length > 0;
    rows.forEach(function (row) {
      const card = el("article", "order-card");
      const paid = row.status === "paid";
      card.appendChild(el("p", "order-time", when(row.createdAt)));
      card.appendChild(el("p", "", "Перевели: " + (row.fromAmount || "—") + " " + (row.fromToken || "") + " · " + chainName(row.fromChain)));
      card.appendChild(el("p", "order-due", "Нужно отправить: " + (row.toAmount || "—") + " " + (row.toToken || "") + " · " + chainName(row.toChain)));
      if (row.bonus && row.bonus !== "0%") card.appendChild(el("p", "", "Доплата сверху: " + row.bonus));
      card.appendChild(addressRow("Откуда пришло", row.senderAddress || ""));
      card.appendChild(addressRow("Куда отправить выплату", row.payoutAddress || ""));
      card.appendChild(addressRow("Куда пришло", row.depositAddress || ""));
      const explorer = (window.BPSwap && window.BPSwap.explorerTx(row.fromChain, row.txHash)) || row.explorerUrl || "";
      if (explorer) {
        const link = el("a", "explorer-link", "Открыть входящий перевод");
        link.href = explorer;
        link.target = "_blank";
        link.rel = "noopener";
        card.appendChild(link);
      }
      card.appendChild(el("p", paid ? "status-paid" : "status-pending", paid ? "Выплачено" : "Ожидает выплату"));
      if (paid && row.payoutTx) {
        const out = (window.BPSwap && window.BPSwap.explorerTx(row.toChain, row.payoutTx)) || "";
        if (out && window.BPSwap.isTxHash(row.toChain, row.payoutTx)) {
          const link = el("a", "explorer-link", "Выплата в обозревателе");
          link.href = out;
          link.target = "_blank";
          link.rel = "noopener";
          card.appendChild(link);
        } else {
          card.appendChild(el("p", "mono", "Хеш выплаты: " + row.payoutTx));
        }
      }
      if (!paid) {
        const input = el("input", "field-input");
        input.type = "text";
        input.placeholder = "Хеш исходящей выплаты";
        input.setAttribute("data-draft", row.id);
        input.value = drafts[row.id] || "";
        input.autocomplete = "off";
        input.spellcheck = false;
        const button = el("button", "btn primary-btn pay-btn", "Выплачено");
        button.type = "button";
        button.setAttribute("data-pay", row.id);
        card.appendChild(input);
        card.appendChild(button);
      }
      ordersNode.appendChild(card);
    });
  }

  function contactTitle(kind) {
    if (kind === "whatsapp") return "WhatsApp";
    if (kind === "phone") return "Телефон";
    if (kind === "telegram") return "Telegram";
    return "Контакт";
  }

  function renderCoinOrders(rows) {
    coinOrdersNode.querySelectorAll("input[data-coin-draft]").forEach(function (input) {
      coinDrafts[input.getAttribute("data-coin-draft")] = input.value;
    });
    coinOrdersNode.replaceChildren();
    coinEmptyNode.hidden = rows.length > 0;
    rows.forEach(function (row) {
      const card = el("article", "order-card");
      const paid = row.status === "paid";
      card.appendChild(el("p", "order-time", "Заявка № " + (row.orderNo || "—") + " · " + when(row.orderedAt || row.createdAt)));
      if (/^order\d{17}$/.test(row.paySlug || "")) {
        const payLink = el("a", "explorer-link", "Страница оплаты");
        const dir = location.pathname.slice(0, location.pathname.lastIndexOf("/") + 1);
        payLink.href = dir + row.paySlug;
        card.appendChild(payLink);
      }
      card.appendChild(el("p", "", "Сеть: " + chainName(row.chain)));
      card.appendChild(el("p", "", "Меняет: " + (row.fromAmount || "—") + " " + (row.fromToken || "")));
      card.appendChild(el("p", "order-due", "На: " + (row.toAmount || "—") + " " + (row.toToken || "")));
      if (row.fee && row.fee !== "0%") card.appendChild(el("p", "", "В курсе: " + row.fee));
      if (row.bonus && row.bonus !== "0%") card.appendChild(el("p", "", "Доплата сверху: " + row.bonus));
      card.appendChild(addressRow("Кошелёк для получения", row.payoutAddress || ""));
      if (row.memo) card.appendChild(el("p", "", "Мемо: " + row.memo));
      card.appendChild(el("p", "", "ФИО: " + (row.fullName || "—")));
      card.appendChild(el("p", "", "Почта: " + (row.email || "—")));
      card.appendChild(el("p", "", contactTitle(row.contactKind) + ": " + (row.contact || "—")));
      card.appendChild(addressRow("Куда отправляли", row.depositAddress || ""));
      card.appendChild(el("p", paid ? "status-paid" : "status-pending", paid ? "Выплачено" : "Ожидает выплату"));
      if (paid && row.payoutTx) {
        const out = (window.BPSwap && window.BPSwap.explorerTx(row.chain, row.payoutTx)) || "";
        if (out && window.BPSwap.isTxHash(row.chain, row.payoutTx)) {
          const link = el("a", "explorer-link", "Выплата в обозревателе");
          link.href = out;
          link.target = "_blank";
          link.rel = "noopener";
          card.appendChild(link);
        } else {
          card.appendChild(el("p", "mono", "Хеш выплаты: " + row.payoutTx));
        }
      }
      if (!paid) {
        const input = el("input", "field-input");
        input.type = "text";
        input.placeholder = "Хеш исходящей выплаты";
        input.setAttribute("data-coin-draft", row.id);
        input.value = coinDrafts[row.id] || "";
        input.autocomplete = "off";
        input.spellcheck = false;
        const button = el("button", "btn primary-btn pay-btn", "Выплачено");
        button.type = "button";
        button.setAttribute("data-coin-pay", row.id);
        card.appendChild(input);
        card.appendChild(button);
      }
      coinOrdersNode.appendChild(card);
    });
  }

  async function openDesk(email) {
    if (opened || opening) return;
    opening = true;
    try {
      ledgerApi = await import("./ledger.js");
      const ok = await ledgerApi.isAdmin(email);
      if (!ok) {
        localStorage.removeItem("bpIsAdmin");
        if (window.BP) window.BP.refreshAuth();
        showError("Документа admins/" + email + " нет. В Firebase Console создайте документ с таким именем в коллекции admins и полем role = admin. Затем обновите страницу.");
        return;
      }
      localStorage.setItem("bpIsAdmin", "1");
      if (window.BP) window.BP.refreshAuth();
      gate.hidden = true;
      desk.hidden = false;
      const stored = await ledgerApi.getWallets();
      chains.forEach(function (chain) {
        const input = document.getElementById("wallet-" + chain);
        input.value = stored && stored[chain] ? String(stored[chain]) : "";
      });
      try {
        const pricing = await ledgerApi.getPricing();
        document.getElementById("fee-enabled").checked = pricing.feeEnabled;
        document.getElementById("bonus-percent").value = pricing.bonusPercent ? String(pricing.bonusPercent) : "";
        document.getElementById("swap-fee-enabled").checked = pricing.swapFeeEnabled;
        document.getElementById("swap-bonus-percent").value = pricing.swapBonusPercent ? String(pricing.swapBonusPercent) : "";
        document.getElementById("cross-enabled").checked = pricing.crossSwapEnabled;
        document.getElementById("swap-enabled").checked = pricing.coinSwapEnabled;
      } catch (err) {
        pricingStatus.textContent = "Условия не прочитались. Вставьте обновлённые правила из файла firestore.rules.";
      }
      stopWatch = await ledgerApi.watchOrders(renderOrders, function (err) {
        emptyNode.hidden = false;
        emptyNode.textContent = (err && err.message) || "Не удалось читать заявки CrossSwap";
      });
      stopCoinWatch = await ledgerApi.watchCoinOrders(renderCoinOrders, function (err) {
        coinEmptyNode.hidden = false;
        coinEmptyNode.textContent = (err && err.message) || "Не удалось читать заявки Swap. Вставьте обновлённые правила из файла firestore.rules.";
      });
      opened = true;
    } catch (err) {
      gate.hidden = false;
      desk.hidden = true;
      var code = String((err && err.code) || "");
      var message = String((err && err.message) || "");
      if (code.indexOf("permission") !== -1 || /permission/i.test(message)) {
        throw new Error("Firestore отклонил запрос. Создайте базу и вставьте правила из файла firestore.rules.");
      }
      throw err;
    } finally {
      opening = false;
    }
  }

  async function signIn() {
    showError("");
    if (location.protocol === "file:") {
      showError("Вход через Google работает по http://, а не из файла на диске.");
      return;
    }
    loginBtn.disabled = true;
    try {
      const loaded = await import("./firebase-config.js");
      const authApi = await loaded.loadAuth();
      const result = await authApi.signInWithPopup(authApi.auth, new authApi.GoogleAuthProvider());
      const email = result.user && result.user.email ? result.user.email.trim().toLowerCase() : "";
      if (!email) throw new Error("У аккаунта Google нет почты. Войдите другим аккаунтом.");
      localStorage.setItem("authProvider", "google");
      localStorage.setItem("authLabel", email);
      await openDesk(email);
    } catch (err) {
      showError(window.BP.googleError(err));
    } finally {
      loginBtn.disabled = false;
    }
  }

  loginBtn.addEventListener("click", signIn);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    walletStatus.textContent = "";
    const next = {};
    for (let i = 0; i < chains.length; i += 1) {
      const chain = chains[i];
      const value = document.getElementById("wallet-" + chain).value.trim();
      if (!value) {
        next[chain] = "";
        continue;
      }
      if (!window.BPSwap.isReceiveAddress(chain, value)) {
        walletStatus.textContent = chain === "ton"
          ? "Адрес TON должен быть EQ…, UQ… или 0:…"
          : "Адрес " + chainName(chain) + " должен быть 0x и 40 знаков";
        return;
      }
      next[chain] = value;
    }
    const button = document.getElementById("save-wallets");
    button.disabled = true;
    try {
      await ledgerApi.saveWallets(next);
      walletStatus.textContent = "Адреса сохранены. Их увидят на страницах Swap и CrossSwap.";
    } catch (err) {
      const message = String((err && err.message) || "");
      walletStatus.textContent = /permission|disabled|has not been used/i.test(message)
        ? "База не приняла адреса. Создайте Firestore в проекте blockporter-1 и вставьте правила из файла firestore.rules."
        : (message || "Не удалось сохранить адреса");
    } finally {
      button.disabled = false;
    }
  });

  function readPercent(id) {
    const text = document.getElementById(id).value.trim().replace(",", ".");
    if (!text) return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    return value;
  }

  function pricingErrorText(err) {
    const code = String((err && err.code) || "");
    const message = String((err && err.message) || "");
    return code.indexOf("permission") !== -1 || /permission/i.test(message)
      ? "Firestore отклонил запись. Вставьте обновлённые правила из файла firestore.rules."
      : (message || "Не удалось сохранить условия");
  }

  pricingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    pricingStatus.textContent = "";
    const bonus = readPercent("bonus-percent");
    if (bonus == null) {
      pricingStatus.textContent = "Доплата — число от 0 до 100, не больше двух знаков после запятой.";
      return;
    }
    const button = document.getElementById("save-pricing");
    button.disabled = true;
    try {
      const saved = await ledgerApi.savePricing({
        feeEnabled: document.getElementById("fee-enabled").checked,
        bonusPercent: bonus
      });
      document.getElementById("bonus-percent").value = saved.bonusPercent ? String(saved.bonusPercent) : "";
      pricingStatus.textContent = saved.feeEnabled
        ? "Сохранено. Комиссия 4.5%" + (saved.bonusPercent ? ", сверху доплата " + saved.bonusPercent + "%." : ", без доплаты.")
        : "Сохранено. Комиссия выключена" + (saved.bonusPercent ? ", сверху доплата " + saved.bonusPercent + "%." : ".");
    } catch (err) {
      pricingStatus.textContent = pricingErrorText(err);
    } finally {
      button.disabled = false;
    }
  });

  pagesForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    pagesStatus.textContent = "";
    const button = document.getElementById("save-pages");
    button.disabled = true;
    try {
      const saved = await ledgerApi.savePricing({
        crossSwapEnabled: document.getElementById("cross-enabled").checked,
        coinSwapEnabled: document.getElementById("swap-enabled").checked
      });
      if (window.BP) {
        window.BP.pricing = saved;
        if (window.BP.applyPricingCopy) window.BP.applyPricingCopy(saved);
      }
      pagesStatus.textContent = "Сохранено. Выключенная страница сразу пропадает из меню. По ссылке форма тоже не откроется.";
    } catch (err) {
      pagesStatus.textContent = pricingErrorText(err);
    } finally {
      button.disabled = false;
    }
  });

  swapPricingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    swapPricingStatus.textContent = "";
    const bonus = readPercent("swap-bonus-percent");
    if (bonus == null) {
      swapPricingStatus.textContent = "Доплата — число от 0 до 100, не больше двух знаков после запятой.";
      return;
    }
    const button = document.getElementById("save-swap-pricing");
    button.disabled = true;
    try {
      const saved = await ledgerApi.savePricing({
        swapFeeEnabled: document.getElementById("swap-fee-enabled").checked,
        swapBonusPercent: bonus
      });
      document.getElementById("swap-bonus-percent").value = saved.swapBonusPercent ? String(saved.swapBonusPercent) : "";
      swapPricingStatus.textContent = saved.swapFeeEnabled
        ? "Сохранено. В курсе Swap учтены 4.5%" + (saved.swapBonusPercent ? ", сверху доплата " + saved.swapBonusPercent + "%." : ", без доплаты.")
        : "Сохранено. Страница Swap долю 4.5% не показывает" + (saved.swapBonusPercent ? ", сверху доплата " + saved.swapBonusPercent + "%." : ".");
    } catch (err) {
      swapPricingStatus.textContent = pricingErrorText(err);
    } finally {
      button.disabled = false;
    }
  });

  ordersNode.addEventListener("click", async function (event) {
    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      copyText(copyBtn.getAttribute("data-copy"), copyBtn);
      return;
    }
    const payBtn = event.target.closest("[data-pay]");
    if (!payBtn || !ledgerApi) return;
    const id = payBtn.getAttribute("data-pay");
    const input = ordersNode.querySelector('input[data-draft="' + id + '"]');
    const hash = input ? input.value.trim() : "";
    if (hash.length < 8 || hash.length > 180) {
      input.setCustomValidity("Вставьте хеш выплаты");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    payBtn.disabled = true;
    try {
      await ledgerApi.markPaid(id, hash);
      delete drafts[id];
    } catch (err) {
      payBtn.disabled = false;
      window.alert((err && err.message) || "Не удалось отметить выплату");
    }
  });

  import("./firebase-config.js").then(function (loaded) {
    return loaded.loadAuth();
  }).then(function (authApi) {
    authApi.onAuthStateChanged(authApi.auth, function (user) {
      if (!user || !user.email || desk.hidden === false) return;
      const email = user.email.trim().toLowerCase();
      localStorage.setItem("authProvider", "google");
      localStorage.setItem("authLabel", email);
      openDesk(email).catch(function (err) {
        showError((err && err.message) || "Firestore не ответил. Создайте базу и вставьте правила.");
      });
    });
  }).catch(function () {
    if (location.protocol === "file:") showError("Откройте сайт по http://, не двойным щелчком по файлу.");
  });

  coinOrdersNode.addEventListener("click", async function (event) {
    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      copyText(copyBtn.getAttribute("data-copy"), copyBtn);
      return;
    }
    const payBtn = event.target.closest("[data-coin-pay]");
    if (!payBtn || !ledgerApi) return;
    const id = payBtn.getAttribute("data-coin-pay");
    const input = coinOrdersNode.querySelector('input[data-coin-draft="' + id + '"]');
    const hash = input ? input.value.trim() : "";
    if (hash.length < 8 || hash.length > 180) {
      input.setCustomValidity("Вставьте хеш выплаты");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    payBtn.disabled = true;
    try {
      await ledgerApi.markCoinPaid(id, hash);
      delete coinDrafts[id];
    } catch (err) {
      payBtn.disabled = false;
      window.alert((err && err.message) || "Не удалось отметить выплату");
    }
  });

  window.addEventListener("pagehide", function () {
    if (typeof stopWatch === "function") stopWatch();
    if (typeof stopCoinWatch === "function") stopCoinWatch();
  });
})();
