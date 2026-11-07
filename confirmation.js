(function () {
  const details = document.getElementById("swap-details");
  const missing = document.getElementById("missing-draft");
  const terms = document.getElementById("terms-checkbox");
  const confirmBtn = document.getElementById("confirm-swap");
  const tonRow = document.getElementById("ton-address-display");
  const error = document.getElementById("error-message");

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function readDraft() {
    try {
      const data = JSON.parse(sessionStorage.getItem("bpSwapDraft") || "null");
      if (!data) return null;
      const amount = parseFloat(data.fromAmount);
      const receive = parseFloat(data.toAmount);
      if (!data.fromChain || !data.toChain || !data.fromToken || !data.toToken) return null;
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(receive) || receive <= 0) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  const draft = readDraft();
  if (!draft) {
    details.hidden = true;
    document.querySelector(".terms-section").hidden = true;
    confirmBtn.hidden = true;
    missing.hidden = false;
    return;
  }

  setText("from-chain-display", chainName(draft.fromChain));
  setText("to-chain-display", chainName(draft.toChain));
  setText("from-token-display", draft.fromToken);
  setText("to-token-display", draft.toToken);
  setText("from-amount-display", draft.fromAmount + " " + draft.fromToken);
  setText("to-amount-display", draft.toAmount + " " + draft.toToken);
  setText("fee-display", draft.fee || "4.5%");
  setText("wallet-display", draft.wallet ? window.BP.shortAddress(draft.wallet) : "не подключён");
  if (draft.tonAddress) {
    tonRow.hidden = false;
    setText("ton-address-value", draft.tonAddress);
  }

  terms.addEventListener("change", function () {
    confirmBtn.disabled = !terms.checked;
  });

  confirmBtn.addEventListener("click", function () {
    if (!terms.checked) return;
    const receipt = {
      id: "BP-" + Date.now().toString(36).toUpperCase(),
      fromChain: draft.fromChain,
      toChain: draft.toChain,
      fromToken: draft.fromToken,
      toToken: draft.toToken,
      fromAmount: draft.fromAmount,
      toAmount: draft.toAmount,
      tonAddress: draft.tonAddress || "",
      wallet: draft.wallet || "",
      rateText: draft.rateText || "",
      fee: draft.fee || "4.5%",
      createdAt: new Date().toISOString(),
      mode: "demo"
    };
    try {
      sessionStorage.setItem("bpReceipt", JSON.stringify(receipt));
    } catch (err) {
      error.hidden = false;
      error.textContent = "Браузер не сохранил заявку. Проверьте, что для сайта не запрещено хранилище вкладки.";
      return;
    }
    location.href = "processing.html";
  });
})();
