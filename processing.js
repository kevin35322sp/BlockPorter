(function () {
  const loader = document.getElementById("loader");
  const processingText = document.getElementById("processing-text");
  const result = document.getElementById("result");
  const resultBody = document.getElementById("result-body");
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
    addRow("Номер:", receipt.id);
    addRow("Когда:", new Date(receipt.createdAt).toLocaleString("ru-RU"));
    addRow("Отдаёте:", receipt.fromAmount + " " + receipt.fromToken + " · " + chainName(receipt.fromChain));
    addRow("Получаете примерно:", receipt.toAmount + " " + receipt.toToken + " · " + chainName(receipt.toChain));
    addRow("Комиссия в формуле:", receipt.fee || "4.5%");
    addRow("Кошелёк:", receipt.wallet || "не подключён");
    if (receipt.tonAddress) addRow("Адрес TON:", receipt.tonAddress);
    if (receipt.rateText) addRow("Курс:", receipt.rateText);
    addRow("Статус:", "демо, в блокчейн ничего не отправлено");
  }, 600);
})();
