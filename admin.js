(function () {
  const gate = document.getElementById("gate");
  const desk = document.getElementById("desk");
  const errorNode = document.getElementById("admin-error");
  const loginBtn = document.getElementById("admin-login");
  const form = document.getElementById("wallets-form");
  const pricingForm = document.getElementById("pricing-form");
  const walletStatus = document.getElementById("wallet-status-line");
  const pricingStatus = document.getElementById("pricing-status");
  const ordersNode = document.getElementById("orders");
  const emptyNode = document.getElementById("orders-empty");
  const chains = ["ethereum", "bsc", "polygon", "optimism", "arbitrum", "ton"];
  const drafts = {};
  let ledgerApi = null;
  let stopWatch = null;
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
      } catch (err) {
        pricingStatus.textContent = "Условия комиссии не прочитались. Вставьте обновлённые правила из файла firestore.rules.";
      }
      stopWatch = await ledgerApi.watchOrders(renderOrders, function (err) {
        emptyNode.hidden = false;
        emptyNode.textContent = (err && err.message) || "Не удалось читать заявки";
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
      walletStatus.textContent = "Адреса сохранены. Их увидят на странице обмена.";
    } catch (err) {
      walletStatus.textContent = (err && err.message) || "Не удалось сохранить адреса";
    } finally {
      button.disabled = false;
    }
  });

  function readBonus() {
    const text = document.getElementById("bonus-percent").value.trim().replace(",", ".");
    if (!text) return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    return value;
  }

  pricingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    pricingStatus.textContent = "";
    const bonus = readBonus();
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
      var code = String((err && err.code) || "");
      var message = String((err && err.message) || "");
      pricingStatus.textContent = code.indexOf("permission") !== -1 || /permission/i.test(message)
        ? "Firestore отклонил запись. Вставьте обновлённые правила из файла firestore.rules."
        : (message || "Не удалось сохранить условия");
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

  window.addEventListener("pagehide", function () {
    if (typeof stopWatch === "function") stopWatch();
  });
})();
