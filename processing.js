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
      resultLead.textContent = "Это старая заявка. Оплата по ней не проводилась.";
      resultLead.className = "error-message";
    } else if (receipt.saved === false) {
      resultLead.textContent = "Оплата прошла, но заявка не сохранилась. Сохраните хеш и напишите в поддержку. " + (receipt.saveError || "");
      resultLead.className = "error-message";
    } else {
      resultLead.textContent = "Заявка принята. Списана сумма из заявки, остальные средства на кошельке не затронуты. Выплата поступит на ваши реквизиты.";
    }
    addRow("Номер заявки:", receipt.id);
    addRow("Создана:", new Date(receipt.createdAt).toLocaleString("ru-RU"));
    addRow("Отдаёте:", receipt.fromAmount + " " + receipt.fromToken + " · " + chainName(receipt.fromChain));
    addRow("Получаете:", receipt.toAmount + " " + receipt.toToken + " · " + chainName(receipt.toChain));
    const feeText = receipt.fee || "4.5%";
    if (feeText !== "0%") addRow("Комиссия:", feeText);
    if (receipt.bonus && receipt.bonus !== "0%") addRow("Добавлено к курсу:", receipt.bonus);
    if (receipt.depositAddress) addRow("Адрес оплаты:", receipt.depositAddress);
    if (receipt.senderAddress) addRow("Адрес отправителя:", receipt.senderAddress);
    if (receipt.payoutAddress) addRow("Реквизиты получения:", receipt.payoutAddress);
    if (receipt.rateText) addRow("Курс:", receipt.rateText);
    const explorer = receipt.explorerUrl || (window.BPSwap && receipt.txHash ? window.BPSwap.explorerTx(receipt.fromChain, receipt.txHash) : "");
    if (explorer) addLink("Транзакция:", explorer, "открыть в обозревателе");
    else if (receipt.txHash) addRow("Хеш оплаты:", receipt.txHash);
    if (receipt.mode === "demo") addRow("Статус:", "старая заявка, оплата не проводилась");
    else if (receipt.saved === false) addRow("Статус:", "оплата есть, заявка не записана");
    else addRow("Статус:", "принята, ожидается выплата");
  }, 600);
})();
