(function (root) {
  function fail(err) {
    if (err && err.code === 4001) throw new Error("Подпись отменена");
    throw new Error((err && err.message) || "Перевод не выполнен");
  }

  async function ensureChain(chain) {
    var spec = root.BPSwap.chainParams[chain];
    if (!spec) throw new Error("Эта сеть не открывается в MetaMask");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: spec.chainId }]
      });
    } catch (err) {
      if (!err || err.code !== 4902) fail(err);
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [spec]
      });
    }
  }

  async function decimalsOf(tokenAddress) {
    var hex = await window.ethereum.request({
      method: "eth_call",
      params: [{ to: tokenAddress, data: "0x313ce567" }, "latest"]
    });
    var value = Number(BigInt(hex));
    if (!Number.isInteger(value) || value < 0 || value > 36) throw new Error("Не удалось прочитать доли токена");
    return value;
  }

  async function sendInWallet(chain, token, amount, depositAddress) {
    if (!window.ethereum) throw new Error("MetaMask не найден. Откройте сайт по https, не из файла на диске.");
    if (!root.BPSwap.canSend(chain, token)) throw new Error("Эту монету нельзя отправить из MetaMask");
    if (!root.BPSwap.isEvmAddress(depositAddress)) throw new Error("Адрес для перевода не задан. Вернитесь к форме и проверьте его.");
    await ensureChain(chain);
    var accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    var from = accounts[0];
    var native = root.BPSwap.natives[chain] === token;
    var tx = { from: from, value: "0x0" };
    if (native) {
      tx.to = depositAddress;
      tx.value = "0x" + root.BPSwap.parseUnits(amount, 18).toString(16);
    } else {
      var contract = root.BPSwap.tokenAddress(chain, token);
      var decimals = await decimalsOf(contract);
      var units = root.BPSwap.parseUnits(amount, decimals);
      tx.to = contract;
      tx.data = root.BPSwap.encodeTransfer(depositAddress, units);
    }
    try {
      var hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx]
      });
    } catch (err) {
      fail(err);
    }
    if (!root.BPSwap.isTxHash(chain, hash)) throw new Error("Кошелёк не вернул хеш перевода");
    return { hash: hash, sender: from };
  }

  root.BPPay = { sendInWallet: sendInWallet };
})(typeof window !== "undefined" ? window : globalThis);
