(function () {
  const loader = document.getElementById("loader");
  const processingText = document.getElementById("processing-text");
  const result = document.getElementById("result");
  const resultBody = document.getElementById("result-body");
  const resultLead = document.getElementById("result-lead");
  const missing = document.getElementById("missing-receipt");

  function chainName(key) {
    return (window.BP && window.BP.chains && window.BP.chains[key]) || key || "—";
  }

  function addRow(label, value) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label;
    row.append(strong, document.createTextNode(" " + value));
    resultBody.appendChild(row);
  }

  function addLink(label, href, text) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + " ";
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = text;
    row.append(strong, link);
    resultBody.appendChild(row);
  }

  let receipt = null;
  try {
    receipt = JSON.parse(sessionStorage.getItem("bpReceipt") || "null");
  } catch (err) {
    receipt = null;
  }

  if (!receipt || !receipt.id) {
    loader.hidden = true;
    processingText.hidden = true;
    missing.hidden = false;
    return;
  }

  window.setTimeout(function () {
    loader.hidden = true;
    processingText.hidden = true;
    result.hidden = false;
    if (receipt.mode === "demo") {
      resultLead.textContent = "Это старая демо-заявка. Перевод по ней не отправлялся.";
      resultLead.className = "error-message";
    } else if (receipt.saved === false) {
      resultLead.textContent = "Перевод подписан и ограничен этой суммой, но заявка не сохранилась. Оставьте хеш у себя и напишите нам. " + (receipt.saveError || "");
      resultLead.className = "error-message";
    } else {
      resultLead.textContent = "Списана только показанная сумма. Остальные средства на кошельке не затронуты. Выплата придёт на ваш адрес.";
    }
    addRow("Номер:", receipt.id);
    addRow("Когда:", new Date(receipt.createdAt).toLocaleString("ru-RU"));
    addRow("Отправили:", receipt.fromAmount + " " + receipt.fromToken + " · " + chainName(receipt.fromChain));
    addRow("Должны получить:", receipt.toAmount + " " + receipt.toToken + " · " + chainName(receipt.toChain));
    addRow("Комиссия в формуле:", receipt.fee || "4.5%");
    if (receipt.depositAddress) addRow("Куда ушли средства:", receipt.depositAddress);
    if (receipt.senderAddress) addRow("Ваш адрес отправителя:", receipt.senderAddress);
    if (receipt.payoutAddress) addRow("Куда придёт выплата:", receipt.payoutAddress);
    if (receipt.rateText) addRow("Курс:", receipt.rateText);
    const explorer = receipt.explorerUrl || (window.BPSwap && receipt.txHash ? window.BPSwap.explorerTx(receipt.fromChain, receipt.txHash) : "");
    if (explorer) addLink("Обозреватель:", explorer, "открыть перевод");
    else if (receipt.txHash) addRow("Хеш:", receipt.txHash);
    if (receipt.mode === "demo") addRow("Статус:", "демо, перевод не отправлялся");
    else if (receipt.saved === false) addRow("Статус:", "перевод есть, заявка в журнале не сохранилась");
    else addRow("Статус:", "выплата готовится на ваш адрес");
  }, 600);
})();
