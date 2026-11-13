(function (root) {
  var natives = {
    ethereum: "ETH",
    bsc: "BNB",
    polygon: "MATIC",
    optimism: "ETH",
    arbitrum: "ETH",
    ton: "TON"
  };

  var tokens = {
    ethereum: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
    },
    bsc: {
      USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      USDT: "0x55d398326f99059fF775485246999027B3197955"
    },
    polygon: {
      USDC: "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359",
      USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
    },
    optimism: {
      USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      USDT: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071"
    },
    arbitrum: {
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
    }
  };

  var explorers = {
    ethereum: "https://etherscan.io/tx/",
    bsc: "https://bscscan.com/tx/",
    polygon: "https://polygonscan.com/tx/",
    optimism: "https://optimistic.etherscan.io/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    ton: "https://tonviewer.com/transaction/"
  };

  var chainParams = {
    ethereum: {
      chainId: "0x1",
      chainName: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://cloudflare-eth.com"],
      blockExplorerUrls: ["https://etherscan.io"]
    },
    bsc: {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org"],
      blockExplorerUrls: ["https://bscscan.com"]
    },
    polygon: {
      chainId: "0x89",
      chainName: "Polygon",
      nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
      rpcUrls: ["https://polygon-rpc.com"],
      blockExplorerUrls: ["https://polygonscan.com"]
    },
    optimism: {
      chainId: "0xa",
      chainName: "Optimism",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://mainnet.optimism.io"],
      blockExplorerUrls: ["https://optimistic.etherscan.io"]
    },
    arbitrum: {
      chainId: "0xa4b1",
      chainName: "Arbitrum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://arb1.arbitrum.io/rpc"],
      blockExplorerUrls: ["https://arbiscan.io"]
    }
  };

  function isEvmAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
  }

  function isTonAddress(value) {
    var text = String(value || "").trim();
    if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(text)) return true;
    if (/^-?\d+:[0-9a-fA-F]{64}$/.test(text)) return true;
    return false;
  }

  function isReceiveAddress(chain, value) {
    if (chain === "ton") return isTonAddress(value);
    return isEvmAddress(value);
  }

  function sameAddress(chain, left, right) {
    var a = String(left || "").trim();
    var b = String(right || "").trim();
    if (chain === "ton") return a === b;
    return a.toLowerCase() === b.toLowerCase();
  }

  function canSend(chain, token) {
    if (!natives[chain] || chain === "ton") return false;
    if (natives[chain] === token) return true;
    return Boolean(tokens[chain] && tokens[chain][token]);
  }

  function paymentMode(chain, token) {
    if (chain === "ton" && token === "TON") return "manual";
    if (canSend(chain, token)) return "wallet";
    return "unsupported";
  }

  function tokenAddress(chain, token) {
    return (tokens[chain] && tokens[chain][token]) || "";
  }

  function parseUnits(amount, decimals) {
    var text = String(amount || "").trim();
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Некорректная сумма");
    var parts = text.split(".");
    var whole = parts[0];
    var frac = parts[1] || "";
    if (frac.length > decimals) throw new Error("Слишком много знаков после запятой");
    frac = (frac + new Array(decimals + 1).join("0")).slice(0, decimals);
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac || "0");
  }

  function encodeTransfer(to, amount) {
    var addr = String(to).toLowerCase().replace(/^0x/, "");
    if (!/^[a-f0-9]{40}$/.test(addr)) throw new Error("Некорректный адрес получателя");
    var hex = amount.toString(16);
    return "0xa9059cbb" + new Array(65 - addr.length).join("0") + addr + new Array(65 - hex.length).join("0") + hex;
  }

  function isTxHash(chain, value) {
    var text = String(value || "").trim();
    if (chain === "ton") return /^[A-Za-z0-9_+:/=-]{20,120}$/.test(text);
    return /^0x[a-fA-F0-9]{64}$/.test(text);
  }

  function explorerTx(chain, hash) {
    if (!explorers[chain] || !hash) return "";
    var text = String(hash).trim();
    if (!isTxHash(chain, text)) return "";
    return explorers[chain] + text;
  }

  function coinsOn(chain) {
    var list = [];
    if (natives[chain]) list.push(natives[chain]);
    var map = tokens[chain] || {};
    Object.keys(map).forEach(function (symbol) {
      if (list.indexOf(symbol) === -1) list.push(symbol);
    });
    return list;
  }

  root.BPSwap = {
    natives: natives,
    tokens: tokens,
    coinsOn: coinsOn,
    chainParams: chainParams,
    isEvmAddress: isEvmAddress,
    isTonAddress: isTonAddress,
    isReceiveAddress: isReceiveAddress,
    sameAddress: sameAddress,
    canSend: canSend,
    paymentMode: paymentMode,
    tokenAddress: tokenAddress,
    parseUnits: parseUnits,
    encodeTransfer: encodeTransfer,
    isTxHash: isTxHash,
    explorerTx: explorerTx
  };
})(typeof window !== "undefined" ? window : globalThis);
