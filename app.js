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
    const current = wallet();
    const label = readKey("authLabel");
    if (current.connected) {
      return '<a href="profile.html">' + escapeHtml(shortAddress(current.address)) + '</a> <button type="button" class="nav-logout">Выйти</button>';
    }
    if (readKey("authProvider") === "google" && label) {
      return '<a href="profile.html">' + escapeHtml(label) + '</a> <button type="button" class="nav-logout">Выйти</button>';
    }
    return '<a href="auth.html">Войти</a>';
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

  async function forgetWallet() {
    writeKey("walletConnected", "");
    writeKey("walletAddress", "");
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
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
    location.href = "index.html";
  }

  function watchWallet() {
    if (!window.ethereum || !window.ethereum.on || window.__bpWalletWatch) return;
    window.__bpWalletWatch = true;
    window.ethereum.on("accountsChanged", function (accounts) {
      if (!accounts || accounts.length === 0) {
        writeKey("walletConnected", "");
        writeKey("walletAddress", "");
      } else {
        writeKey("walletAddress", accounts[0].toLowerCase());
        writeKey("walletConnected", "true");
      }
      refreshAuth();
      document.dispatchEvent(new CustomEvent("bp-wallet"));
    });
  }

  function refreshAuth() {
    fillAuth();
    setActive();
  }

  function boot() {
    refreshAuth();
    setupMenu();
    watchWallet();
  }

  window.BP = {
    chains: chains,
    wallet: wallet,
    shortAddress: shortAddress,
    forgetWallet: forgetWallet,
    logout: logout,
    refreshAuth: refreshAuth
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
