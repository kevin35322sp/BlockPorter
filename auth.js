(function () {
  const loading = document.getElementById("loading");
  const error = document.getElementById("auth-error");

  function showLoading(show) {
    loading.style.display = show ? "flex" : "none";
  }

  function showError(message) {
    error.hidden = !message;
    error.textContent = message || "";
  }

  function walletError(err) {
    if (err && err.code === 4001) return "Подключение отменено";
    if (location.protocol === "file:") {
      return "Страница открыта как файл. Запустите локальный сервер и откройте http://localhost.";
    }
    return (err && err.message) || "Не удалось подключить кошелёк";
  }

  document.getElementById("metamask-login").addEventListener("click", async function () {
    showError("");
    showLoading(true);
    try {
      const address = await window.BPWallets.connectInteractive();
      if (!address) return;
      localStorage.setItem("walletAddress", address.toLowerCase());
      localStorage.setItem("walletConnected", "true");
      location.href = "profile.html";
    } catch (err) {
      showError(walletError(err));
    } finally {
      showLoading(false);
    }
  });

  document.getElementById("google-login").addEventListener("click", async function () {
    showError("");
    if (location.protocol === "file:") {
      showError("Вход через Google работает по http://, а не из файла на диске.");
      return;
    }
    showLoading(true);
    try {
      const loaded = await import("./firebase-config.js");
      const authApi = await loaded.loadAuth();
      const result = await authApi.signInWithPopup(authApi.auth, new authApi.GoogleAuthProvider());
      const user = result.user;
      localStorage.setItem("authProvider", "google");
      localStorage.setItem("authLabel", user.email || user.displayName || "Google");
      location.href = "profile.html";
    } catch (err) {
      showError(window.BP.googleError(err));
    } finally {
      showLoading(false);
    }
  });

  import("./firebase-config.js")
    .then(function (loaded) {
      return loaded.loadAuth();
    })
    .then(function (authApi) {
      authApi.onAuthStateChanged(authApi.auth, function (user) {
        if (!user) return;
        localStorage.setItem("authProvider", "google");
        localStorage.setItem("authLabel", user.email || user.displayName || "Google");
        location.href = "profile.html";
      });
    })
    .catch(function () {
      /* Без сети или вне http Firebase просто не подключается. Вход через кошелёк остаётся на странице. */
    });
})();
