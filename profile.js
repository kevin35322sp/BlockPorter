(function () {
  const statusEl = document.getElementById("profile-status");
  const bodyEl = document.getElementById("profile-body");
  const chainNames = {
    1: ["ETH", "Ethereum"],
    56: ["BNB", "BNB Smart Chain"],
    137: ["POL", "Polygon"],
    10: ["ETH", "Optimism"],
    42161: ["ETH", "Arbitrum"]
  };

  function formatWei(hex) {
    const wei = BigInt(hex);
    const base = 10n ** 18n;
    const whole = wei / base;
    const frac = (wei % base).toString().padStart(18, "0").slice(0, 4);
    return whole.toString() + "." + frac;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function actionButton(className, text) {
    const node = el("button", className, text);
    node.type = "button";
    return node;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (copyErr) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      window.alert("MetaMask не найден. Откройте сайт по http://localhost и разрешите расширение на этом адресе.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      localStorage.setItem("walletAddress", accounts[0].toLowerCase());
      localStorage.setItem("walletConnected", "true");
      render();
      window.BP.refreshAuth();
    } catch (err) {
      const message = err && err.code === 4001 ? "Подключение отменено" : (err && err.message) || "Не удалось подключить кошелёк";
      window.alert(message);
    }
  }

  async function readBalance(address, target) {
    target.textContent = "Читаем баланс сети…";
    if (!window.ethereum) {
      target.textContent = "Баланс читается в браузере, где установлен MetaMask.";
      return;
    }
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      const hex = await window.ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"]
      });
      const pair = chainNames[Number.parseInt(chainId, 16)] || ["нативной монеты", chainId];
      target.textContent = formatWei(hex) + " " + pair[0] + " · " + pair[1];
    } catch (err) {
      target.textContent = "Баланс этой сети сейчас не прочитан.";
    }
  }

  function render() {
    const saved = window.BP.wallet();
    const provider = localStorage.getItem("authProvider");
    const label = localStorage.getItem("authLabel");
    bodyEl.replaceChildren();

    if (!saved.connected && provider !== "google") {
      statusEl.textContent = "Нет входа";
      statusEl.classList.remove("connected");
      const prompt = el("div", "connect-prompt");
      prompt.append(el("p", null, "Войдите через Google или подключите кошелёк. Секретная фраза не нужна: здесь баланс только читается, перевод не запускается."));
      const actions = el("div", "profile-actions");
      const login = el("a", "btn neon-btn", "Войти");
      login.href = "auth.html";
      const connect = actionButton("btn neon-btn", "Подключить MetaMask");
      connect.id = "connect-wallet";
      connect.addEventListener("click", connectWallet);
      actions.append(login, connect);
      prompt.append(actions);
      bodyEl.append(prompt);
      return;
    }

    statusEl.classList.add("connected");
    if (saved.connected && provider === "google") statusEl.textContent = "Google и кошелёк";
    else if (saved.connected) statusEl.textContent = "Кошелёк подключён";
    else statusEl.textContent = "Вход через Google";

    if (provider === "google" && label) bodyEl.append(el("p", "hint", label));

    if (saved.connected) {
      const block = el("div", "address-block");
      block.append(el("div", "address-label", "Адрес"));
      block.append(el("div", "address-value", saved.address));
      const balance = el("div", "balance-line", "");
      block.append(balance);
      const copy = actionButton("copy-btn", "Копировать адрес");
      copy.addEventListener("click", async function () {
        const ok = await copyText(saved.address);
        copy.textContent = ok ? "Скопировано" : "Не удалось скопировать";
      });
      block.append(copy);
      bodyEl.append(block);
      readBalance(saved.address, balance);
    } else {
      const connect = actionButton("btn neon-btn", "Подключить MetaMask");
      connect.id = "connect-wallet";
      connect.addEventListener("click", connectWallet);
      bodyEl.append(connect);
    }

    const logout = actionButton("btn logout-btn", "Выйти");
    logout.addEventListener("click", function () {
      window.BP.logout();
    });
    bodyEl.append(logout);
  }

  document.addEventListener("bp-wallet", render);
  render();

  import("./firebase-config.js")
    .then(function (loaded) { return loaded.loadAuth(); })
    .then(function (authApi) {
      authApi.onAuthStateChanged(authApi.auth, function (user) {
        if (user) {
          localStorage.setItem("authProvider", "google");
          localStorage.setItem("authLabel", user.email || user.displayName || "Google");
        } else if (localStorage.getItem("authProvider") === "google") {
          localStorage.removeItem("authProvider");
          localStorage.removeItem("authLabel");
        }
        render();
        window.BP.refreshAuth();
      });
    })
    .catch(function () {});
})();
