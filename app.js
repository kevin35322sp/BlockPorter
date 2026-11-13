(function () {
  const chains = {
    ethereum: "Ethereum",
    bsc: "BNB Smart Chain",
    polygon: "Polygon",
    optimism: "Optimism",
    arbitrum: "Arbitrum",
    ton: "TON"
  };

  function storage() {
    try {
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  function readKey(key) {
    const store = storage();
    if (!store) return "";
    return store.getItem(key) || "";
  }

  function writeKey(key, value) {
    const store = storage();
    if (!store) return;
    if (value == null || value === "") store.removeItem(key);
    else store.setItem(key, value);
  }

  function wallet() {
    const address = readKey("walletAddress");
    const connected = readKey("walletConnected") === "true" && address.length > 0;
    return { connected, address };
  }

  function shortAddress(address) {
    if (!address || address.length < 12) return address || "";
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function authMarkup() {
    const admin = readKey("bpIsAdmin") === "1" ? '<a href="admin.html">Заявки</a> ' : "";
    const current = wallet();
    const label = readKey("authLabel");
    if (current.connected) {
      return admin + '<a href="profile.html">' + escapeHtml(shortAddress(current.address)) + '</a> <button type="button" class="nav-logout">Выйти</button>';
    }
    if (readKey("authProvider") === "google" && label) {
      return admin + '<a href="profile.html">' + escapeHtml(label) + '</a> <button type="button" class="nav-logout">Выйти</button>';
    }
    return admin + '<a href="auth.html">Войти</a>';
  }

  function fillAuth() {
    const markup = authMarkup();
    ["auth-status", "auth-status-mobile"].forEach(function (id) {
      const node = document.getElementById(id);
      if (node) node.innerHTML = markup;
    });
    document.querySelectorAll(".nav-logout").forEach(function (button) {
      button.addEventListener("click", function () {
        logout();
      });
    });
  }

  function setActive() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll("header nav a[href]").forEach(function (link) {
      const href = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
      link.classList.toggle("active", href === file);
    });
  }

  function setupMenu() {
    const burger = document.getElementById("burger");
    const menu = document.getElementById("mobile-menu");
    const closeBtn = document.getElementById("close-menu");
    if (!burger || !menu) return;

    function open(on) {
      menu.classList.toggle("active", on);
      burger.setAttribute("aria-expanded", on ? "true" : "false");
    }

    burger.addEventListener("click", function (event) {
      event.stopPropagation();
      open(!menu.classList.contains("active"));
    });
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        open(false);
      });
    }
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        open(false);
      });
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target) && !burger.contains(event.target)) open(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") open(false);
    });
  }

  const walletList = [];
  let chosenWallet = null;
  let sheetDone = null;
  let walletsReadyPromise = null;
  const watchedProviders = new WeakSet();

  function isMobile() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  }

  function safeIcon(src) {
    if (typeof src !== "string") return "";
    if (src.indexOf("data:image/") === 0) return src;
    if (src.indexOf("https://") === 0) return src;
    return "";
  }

  function flagName(provider) {
    if (!provider) return "Браузерный кошелёк";
    if (provider.isTrust || provider.isTrustWallet) return "Trust Wallet";
    if (provider.isCoinbaseWallet) return "Coinbase Wallet";
    if (provider.isOkxWallet || provider.isOKExWallet) return "OKX Wallet";
    if (provider.isRabby) return "Rabby";
    if (provider.isBraveWallet) return "Brave Wallet";
    if (provider.isPhantom) return "Phantom";
    if (provider.isMetaMask) return "MetaMask";
    return "Браузерный кошелёк";
  }

  function rememberWallet(entry) {
    const same = walletList.find(function (item) {
      return item.uuid === entry.uuid || item.provider === entry.provider;
    });
    if (same) {
      same.provider = entry.provider;
      same.name = entry.name;
      same.icon = entry.icon || same.icon;
      same.rdns = entry.rdns || same.rdns;
      return false;
    }
    if (walletList.some(function (item) { return item.name === entry.name && item.rdns && entry.rdns && item.rdns === entry.rdns; })) {
      return false;
    }
    walletList.push(entry);
    return true;
  }

  function onAnnounce(event) {
    const detail = event && event.detail;
    if (!detail || !detail.provider || !detail.info) return;
    const info = detail.info;
    const name = String(info.name || "Кошелёк").slice(0, 80);
    const added = rememberWallet({
      uuid: String(info.uuid || info.rdns || name),
      name: name,
      icon: safeIcon(info.icon),
      rdns: info.rdns || "",
      provider: detail.provider
    });
    if (added) document.dispatchEvent(new CustomEvent("bp-wallets"));
  }

  function addLegacy() {
    const eth = window.ethereum;
    if (!eth) return;
    const providers = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
    let added = false;
    providers.forEach(function (provider, index) {
      if (walletList.some(function (item) { return item.provider === provider; })) return;
      const name = flagName(provider);
      if (walletList.some(function (item) { return item.name === name; })) return;
      walletList.push({
        uuid: "legacy-" + index + "-" + name,
        name: name,
        icon: "",
        rdns: "",
        provider: provider
      });
      added = true;
    });
    if (added) document.dispatchEvent(new CustomEvent("bp-wallets"));
  }

  function ready() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    addLegacy();
    if (walletList.length > 0) return Promise.resolve(walletList.slice());
    if (!walletsReadyPromise) {
      walletsReadyPromise = new Promise(function (resolve) {
        window.setTimeout(function () {
          addLegacy();
          resolve(walletList.slice());
        }, 350);
      });
    }
    return walletsReadyPromise;
  }

  function silentProvider() {
    addLegacy();
    if (chosenWallet && chosenWallet.provider) return chosenWallet.provider;
    const name = readKey("walletName");
    if (name) {
      const named = walletList.find(function (item) { return item.name === name; });
      if (named) {
        chosenWallet = named;
        return named.provider;
      }
    }
    if (walletList.length === 1) return walletList[0].provider;
    if (window.ethereum && walletList.length === 0) return window.ethereum;
    return null;
  }

  function hasWallet() {
    addLegacy();
    return walletList.length > 0 || Boolean(window.ethereum);
  }

  function onAccounts(accounts) {
    if (!accounts || accounts.length === 0) {
      writeKey("walletConnected", "");
      writeKey("walletAddress", "");
    } else {
      writeKey("walletAddress", String(accounts[0]).toLowerCase());
      writeKey("walletConnected", "true");
    }
    refreshAuth();
    document.dispatchEvent(new CustomEvent("bp-wallet"));
  }

  function watchProvider(provider) {
    if (!provider || typeof provider.on !== "function" || watchedProviders.has(provider)) return;
    watchedProviders.add(provider);
    provider.on("accountsChanged", function (accounts) {
      if (silentProvider() !== provider) return;
      onAccounts(accounts);
    });
  }

  function deepLinks(targetUrl) {
    let parsed;
    try {
      parsed = new URL(targetUrl || location.href);
    } catch (err) {
      parsed = new URL(location.href);
    }
    const hostPath = parsed.host + parsed.pathname + parsed.search;
    const encoded = encodeURIComponent(parsed.href);
    return [
      { id: "metamask", name: "MetaMask", href: "https://metamask.app.link/dapp/" + hostPath },
      { id: "trust", name: "Trust Wallet", href: "https://link.trustwallet.com/open_url?coin_id=60&url=" + encoded },
      { id: "coinbase", name: "Coinbase Wallet", href: "https://go.cb-w.com/dapp?cb_url=" + encoded },
      { id: "okx", name: "OKX Wallet", href: "https://www.okx.com/download?deeplink=" + encodeURIComponent("okx://wallet/dapp/url?dappUrl=" + encoded) }
    ];
  }

  function closeSheet(value) {
    const root = document.getElementById("bp-wallet-sheet");
    if (root) root.hidden = true;
    const done = sheetDone;
    sheetDone = null;
    if (done) done(value);
  }

  function ensureSheet() {
    let root = document.getElementById("bp-wallet-sheet");
    if (root) return root;
    root = document.createElement("div");
    root.id = "bp-wallet-sheet";
    root.className = "bp-sheet";
    root.hidden = true;
    root.innerHTML = '<div class="bp-sheet-backdrop" data-close="1"></div><div class="bp-sheet-card" role="dialog" aria-modal="true" aria-labelledby="bp-sheet-title"><h2 id="bp-sheet-title"></h2><p id="bp-sheet-text" class="hint"></p><div id="bp-sheet-list"></div><button type="button" class="btn bp-sheet-close" id="bp-sheet-close">Закрыть</button></div>';
    document.body.appendChild(root);
    root.addEventListener("click", function (event) {
      if (event.target && event.target.getAttribute("data-close")) closeSheet(null);
    });
    root.querySelector("#bp-sheet-close").addEventListener("click", function () {
      closeSheet(null);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !root.hidden) closeSheet(null);
    });
    return root;
  }

  function openSheet(title, text, nodes) {
    if (sheetDone) closeSheet(null);
    const root = ensureSheet();
    root.querySelector("#bp-sheet-title").textContent = title;
    root.querySelector("#bp-sheet-text").textContent = text;
    const list = root.querySelector("#bp-sheet-list");
    list.replaceChildren();
    nodes.forEach(function (node) { list.appendChild(node); });
    root.hidden = false;
    return new Promise(function (resolve) {
      sheetDone = resolve;
    });
  }

  function showChooser(entries) {
    const buttons = entries.map(function (entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn neon-btn bp-wallet-choice";
      const icon = safeIcon(entry.icon);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = "";
        img.width = 28;
        img.height = 28;
        button.appendChild(img);
      }
      button.appendChild(document.createTextNode(entry.name));
      button.addEventListener("click", function () { closeSheet(entry); });
      return button;
    });
    return openSheet("Выберите кошелёк", "Подключение нужно, чтобы оплатить заявку. На этом шаге перевод не создаётся.", buttons);
  }

  function showOpenInWallet(targetUrl) {
    const links = deepLinks(targetUrl).map(function (item) {
      const link = document.createElement("a");
      link.className = "btn neon-btn bp-wallet-choice";
      link.href = item.href;
      link.textContent = "Открыть в " + item.name;
      return link;
    });
    return openSheet(
      "Откройте страницу в кошельке",
      "Обычный браузер телефона не видит кошелёк. Откройте заявку в приложении и подтвердите перевод.",
      links
    );
  }

  async function connect(entry) {
    const accounts = await entry.provider.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts[0]) throw new Error("Кошелёк не вернул адрес");
    chosenWallet = entry;
    writeKey("walletName", entry.name);
    writeKey("walletAddress", String(accounts[0]).toLowerCase());
    writeKey("walletConnected", "true");
    watchProvider(entry.provider);
    refreshAuth();
    document.dispatchEvent(new CustomEvent("bp-wallet"));
    return String(accounts[0]);
  }

  async function connectInteractive() {
    await ready();
    if (walletList.length === 0) {
      if (location.protocol === "file:") {
        throw new Error("Страница открыта как файл. Запустите локальный сервер и откройте http://localhost.");
      }
      if (isMobile()) {
        await showOpenInWallet(location.href);
        return "";
      }
      throw new Error("Установите MetaMask, Trust Wallet или другой кошелёк и обновите страницу.");
    }
    const entry = walletList.length === 1 ? walletList[0] : await showChooser(walletList);
    if (!entry) return "";
    return connect(entry);
  }

  async function provider() {
    await ready();
    const found = silentProvider();
    if (found) {
      watchProvider(found);
      return found;
    }
    if (walletList.length > 1) {
      const entry = await showChooser(walletList);
      if (!entry) return null;
      chosenWallet = entry;
      writeKey("walletName", entry.name);
      watchProvider(entry.provider);
      return entry.provider;
    }
    return null;
  }

  async function forgetWallet() {
    const providerToForget = silentProvider();
    chosenWallet = null;
    writeKey("walletConnected", "");
    writeKey("walletAddress", "");
    writeKey("walletName", "");
    if (!providerToForget || !providerToForget.request) return;
    try {
      await providerToForget.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch (err) {
      /* Кошелёк может не поддерживать отзыв разрешения. Локальный адрес уже забыт. */
    }
  }

  async function logout() {
    try {
      if (readKey("authProvider") === "google") {
        const loaded = await import("./firebase-config.js");
        const authApi = await loaded.loadAuth();
        await authApi.signOut(authApi.auth);
      }
    } catch (err) {
      console.error(err);
    }
    await forgetWallet();
    writeKey("authProvider", "");
    writeKey("authLabel", "");
    writeKey("bpIsAdmin", "");
    location.href = "index.html";
  }

  function refreshAdminFlag() {
    if (readKey("authProvider") !== "google") return;
    import("./firebase-config.js").then(function (loaded) {
      return loaded.loadAuth();
    }).then(function (authApi) {
      authApi.onAuthStateChanged(authApi.auth, function (user) {
        if (!user || !user.email) return;
        import("./ledger.js").then(function (ledger) {
          return ledger.isAdmin(user.email);
        }).then(function (ok) {
          writeKey("bpIsAdmin", ok ? "1" : "");
          fillAuth();
          setActive();
        }).catch(function () {});
      });
    }).catch(function () {});
  }

  function refreshAuth() {
    fillAuth();
    setActive();
  }

  function googleError(err) {
    const code = (err && err.code) || "";
    const message = (err && err.message) || "";
    const host = location.hostname;
    if (code === "auth/unauthorized-domain" || /unauthorized-domain|not authorized/i.test(message)) {
      return "Google не пускает с адреса " + host + ". В Firebase откройте Authentication → Settings → Authorized domains и добавьте " + host + " без https и без пути. Если сайт открывается и с www, добавьте оба имени.";
    }
    if (code === "auth/popup-blocked") {
      return "Браузер закрыл окно Google. Разрешите всплывающие окна для этого сайта и нажмите ещё раз.";
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return "Окно Google закрылось до выбора аккаунта. Нажмите ещё раз и дождитесь входа.";
    }
    if (code === "auth/operation-not-allowed") {
      return "В Firebase выключен вход через Google. Authentication → Sign-in method → Google → Enable.";
    }
    if (/referer|api key|api-key|requested action is invalid/i.test(message)) {
      return "Ключ Firebase не принимает сайт " + host + ". В Google Cloud у браузерного ключа в ограничениях по сайтам добавьте https://" + host + "/*";
    }
    return message || "Не удалось войти через Google";
  }

  function formatPercent(value) {
    return String(Math.round(Number(value) * 100) / 100);
  }

  function applyPages(pricing) {
    const crossOn = !pricing || pricing.crossSwapEnabled !== false;
    const swapOn = !pricing || pricing.coinSwapEnabled !== false;
    document.querySelectorAll("[data-page='cross']").forEach(function (node) {
      node.hidden = !crossOn;
    });
    document.querySelectorAll("[data-page='swap']").forEach(function (node) {
      node.hidden = !swapOn;
    });
  }

  function applyPricingCopy(pricing) {
    const feeOn = !pricing || pricing.feeEnabled !== false;
    document.querySelectorAll("[data-pricing='fee']").forEach(function (node) {
      node.hidden = !feeOn;
    });
    document.querySelectorAll("[data-pricing='nofee']").forEach(function (node) {
      node.hidden = feeOn;
    });
    document.querySelectorAll("[data-pricing='bonus']").forEach(function (node) {
      const bonus = pricing && Number(pricing.bonusPercent);
      if (bonus > 0) {
        node.hidden = false;
        node.textContent = "К сумме получения добавлено " + formatPercent(bonus) + "%. ";
      } else {
        node.hidden = true;
        node.textContent = "";
      }
    });
    applyPages(pricing);
  }

  function boot() {
    refreshAuth();
    setupMenu();
    addLegacy();
    const known = silentProvider();
    if (known) watchProvider(known);
    refreshAdminFlag();
    if (window.BP.pricing) applyPricingCopy(window.BP.pricing);
  }

  window.BP = {
    chains: chains,
    wallet: wallet,
    shortAddress: shortAddress,
    forgetWallet: forgetWallet,
    logout: logout,
    refreshAuth: refreshAuth,
    googleError: googleError,
    pricing: {
      feeEnabled: true,
      bonusPercent: 0,
      multiplier: 0.955,
      swapFeeEnabled: true,
      swapBonusPercent: 0,
      swapMultiplier: 0.955,
      crossSwapEnabled: true,
      coinSwapEnabled: true
    },
    applyPricingCopy: applyPricingCopy
  };

  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      let done = false;
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(window.BP.pricing);
      }, ms);
      promise.then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(window.BP.pricing);
      });
    });
  }

  window.BP.pricingReady = withTimeout(import("./ledger.js").then(function (ledger) {
    return ledger.getPricing();
  }).then(function (pricing) {
    window.BP.pricing = pricing;
    applyPricingCopy(pricing);
    document.dispatchEvent(new CustomEvent("bp-pricing"));
    return pricing;
  }).catch(function () {
    return window.BP.pricing;
  }), 4000);

  window.BPWallets = {
    ready: ready,
    active: silentProvider,
    hasWallet: hasWallet,
    provider: provider,
    connectInteractive: connectInteractive,
    showOpenInWallet: showOpenInWallet,
    isMobile: isMobile,
    deepLinks: deepLinks
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.addEventListener("ethereum#initialized", addLegacy);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
