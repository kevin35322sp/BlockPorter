(function () {
  const details = document.getElementById("swap-details");
  const missing = document.getElementById("missing-draft");
  const terms = document.getElementById("terms-checkbox");
  const confirmBtn = document.getElementById("confirm-swap");
  const error = document.getElementById("error-message");
  const senderRow = document.getElementById("sender-row");
  const hashRow = document.getElementById("hash-row");

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function readDraft() {
    try {
      const data = JSON.parse(sessionStorage.getItem("bpSwapDraft") || "null");
      if (!data || !window.BPSwap) return null;
      if (!/^\d+(\.\d+)?$/.test(String(data.fromAmount || ""))) return null;
      const amount = Number(data.fromAmount);
      const receive = Number(data.toAmount);
      if (!data.fromChain || !data.toChain || !data.fromToken || !data.toToken) return null;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
      if (!Number.isFinite(receive) || receive <= 0) return null;
      if (data.payMode !== "wallet" && data.payMode !== "manual") return null;
      if (data.fromChain === data.toChain && data.fromToken === data.toToken) return null;
      if (!window.BPSwap.isReceiveAddress(data.fromChain, data.depositAddress)) return null;
      if (!window.BPSwap.isReceiveAddress(data.toChain, data.payoutAddress)) return null;
      if (data.payMode === "manual") {
        if (!window.BPSwap.isTxHash(data.fromChain, data.txHash)) return null;
        if (!window.BPSwap.isReceiveAddress(data.fromChain, data.senderAddress)) return null;
      }
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
  const feeText = draft.fee || "4.5%";
  if (feeText === "0%") document.getElementById("fee-row").hidden = true;
  else setText("fee-display", feeText);
  if (draft.bonus && draft.bonus !== "0%") {
    document.getElementById("bonus-row").hidden = false;
    setText("bonus-display", draft.bonus);
  }
  setText("deposit-display", draft.depositAddress);
  setText("payout-display", draft.payoutAddress);
  if (draft.payMode === "manual") {
    senderRow.hidden = false;
    hashRow.hidden = false;
    setText("sender-display", draft.senderAddress);
    setText("hash-display", draft.txHash);
    confirmBtn.textContent = "Подтвердить оплату TON";
  } else {
    confirmBtn.textContent = "Оплатить " + draft.fromAmount + " " + draft.fromToken;
  }

  terms.addEventListener("change", function () {
    confirmBtn.disabled = !terms.checked;
  });

  confirmBtn.addEventListener("click", async function () {
    if (!terms.checked || confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    error.hidden = true;
    try {
      const ledger = await import("./ledger.js");
      const fresh = await ledger.getWallets();
      const deposit = String((fresh && fresh[draft.fromChain]) || "").trim();
      if (!window.BPSwap.sameAddress(draft.fromChain, deposit, draft.depositAddress)) {
        throw new Error("Адрес для перевода обновился. Вернитесь к форме и проверьте его ещё раз, прежде чем подписывать.");
      }
      let hash = draft.txHash || "";
      let sender = draft.senderAddress || "";
      if (draft.payMode === "wallet") {
        const sent = await window.BPPay.sendInWallet(draft.fromChain, draft.fromToken, draft.fromAmount, deposit);
        hash = sent.hash;
        sender = sent.sender;
      }
      const order = {
        fromChain: draft.fromChain,
        toChain: draft.toChain,
        fromToken: draft.fromToken,
        toToken: draft.toToken,
        fromAmount: String(draft.fromAmount),
        toAmount: String(draft.toAmount),
        senderAddress: String(sender),
        payoutAddress: String(draft.payoutAddress),
        depositAddress: deposit,
        txHash: String(hash),
        fee: draft.fee || "4.5%",
        bonus: draft.bonus || "0%",
        rateText: draft.rateText || "",
        payMode: draft.payMode,
        explorerUrl: window.BPSwap.explorerTx(draft.fromChain, hash)
      };
      let saved = true;
      let orderId = "";
      let saveError = "";
      try {
        orderId = await ledger.createOrder(order);
      } catch (err) {
        saved = false;
        saveError = (err && err.message) || "Заявку не удалось записать";
      }
      const receipt = Object.assign({}, order, {
        id: orderId || ("BP-" + Date.now().toString(36).toUpperCase()),
        createdAt: new Date().toISOString(),
        saved: saved,
        saveError: saveError
      });
      sessionStorage.setItem("bpReceipt", JSON.stringify(receipt));
      sessionStorage.removeItem("bpSwapDraft");
      location.href = "processing.html";
    } catch (err) {
      error.hidden = false;
      error.textContent = (err && err.message) || "Не удалось отправить перевод";
      confirmBtn.disabled = !terms.checked;
    }
  });
})();
