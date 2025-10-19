import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const CONTRACT = "0x74c220a24718cf1cb2743b212ce52e23be6dd357";
const API_KEY = process.env.ETHERSCAN_API_KEY || ""; // define isto em Render

// Serve simple HTML (preto + dourado)
function renderHTML({ supply, holders, txsHtml, marketCap }) {
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>BitKz Live</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root { --gold: #FFD700; --bg: #000; --white: #fff; --muted: #BBBBBB; }
      html,body{height:100%;margin:0;background:var(--bg);color:var(--white);font-family:Inter, Poppins, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;}
      .wrap{max-width:920px;margin:40px auto;padding:24px;}
      h1{margin:0 0 8px;font-size:28px}
      .subtitle{color:var(--muted);margin-bottom:24px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
      .card{background:rgba(255,255,255,0.02);border-radius:12px;padding:18px;box-shadow:0 4px 18px rgba(0,0,0,0.6);transition:transform 0.14s, box-shadow 0.14s;}
      .card:hover{transform:translateY(-6px);box-shadow:0 10px 30px rgba(0,0,0,0.7);}
      .label{font-size:13px;color:var(--muted);margin-bottom:8px}
      .value{font-size:20px;color:var(--gold);font-weight:700;word-break:break-all}
      .small{font-size:13px;color:var(--muted)}
      .tx{margin-bottom:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.02)}
      a.hash{color:var(--gold);text-decoration:none;font-family:monospace}
      footer{margin-top:28px;color:var(--muted);font-size:13px}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>BitKz Live Dashboard</h1>
      <div class="subtitle">Dados atualizados a partir da blockchain (BNB Chain)</div>

      <div class="grid">
        <div class="card">
          <div class="label">💰 Total Supply</div>
          <div class="value">${supply ?? "—"}</div>
          <div class="small">Contract: ${CONTRACT}</div>
        </div>

        <div class="card">
          <div class="label">👥 Holders</div>
          <div class="value">${holders ?? "—"}</div>
          <div class="small">Endereços que detêm BKZ</div>
        </div>

        <div class="card">
          <div class="label">📈 Market Cap (aprox.)</div>
          <div class="value">${marketCap ?? "—"}</div>
          <div class="small">Total Supply × preço (estimado)</div>
        </div>
      </div>

      <div style="margin-top:20px">
        <div class="label">🔄 Últimas transações</div>
        <div style="margin-top:8px">${txsHtml}</div>
      </div>

      <footer>Atualizado ao carregar a página — usar API key válida (Etherscan V2) no servidor.</footer>
    </div>
  </body>
  </html>
  `;
}

// Helper para formatar números
function fmt(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US");
}

app.get("/", async (req, res) => {
  try {
    if (!API_KEY) {
      // Informação suave se a key não estiver definida
      return res.send(renderHTML({
        supply: "API key not configured",
        holders: "API key not configured",
        txsHtml: "<div class='small' style='color:#ff7777'>Define ETHERSCAN_API_KEY no Render (Environment).</div>",
        marketCap: "—"
      }));
    }

    // 1) Token info (Etherscan V2 token endpoint)
    const tokenInfoUrl = `https://api.etherscan.io/v2/api?chainid=56&module=token&action=tokeninfo&contractaddress=${CONTRACT}&apikey=${API_KEY}`;
    const tokenResp = await fetch(tokenInfoUrl);
    const tokenJson = await tokenResp.json();

    // A estrutura pode variar — tentamos aceder aos campos comuns
    const totalSupplyRaw = tokenJson?.data?.total_supply ?? tokenJson?.result?.totalSupply ?? null;
    const holdersCount = tokenJson?.data?.holders_count ?? tokenJson?.result?.holdersCount ?? null;

    const decimals = tokenJson?.data?.decimals ?? tokenJson?.result?.decimals ?? 18;
    const supply = totalSupplyRaw ? (Number(totalSupplyRaw) / Math.pow(10, Number(decimals))) : null;

    // 2) Transfers (últimas transações) — tentamos usar o endpoint transfers do V2
    const transfersUrl = `https://api.etherscan.io/v2/api?chainid=56&module=token&action=transfers&contractaddress=${CONTRACT}&apikey=${API_KEY}`;
    const transfersResp = await fetch(transfersUrl);
    const transfersJson = await transfersResp.json();
    const transfers = transfersJson?.data?.transfers ?? transfersJson?.result ?? [];

    // Pega nas 3 mais recentes
    const last3 = (Array.isArray(transfers) ? transfers.slice(0, 3) : []).map(t => {
      // Estrutura pode variar: procura por hash e value / tokenValue / value
      const hash = t.hash ?? t.transactionHash ?? t.txHash ?? "—";
      const valueRaw = t.value ?? t.tokenValue ?? t.amount ?? "0";
      const value = (Number(valueRaw) / Math.pow(10, Number(decimals)));
      return { hash, value };
    });

    let txsHtml = "";
    if (last3.length === 0) {
      txsHtml = `<div class="small">Sem transações recentes ou endpoint de transfer não disponível.</div>`;
    } else {
      txsHtml = last3.map(t => 
        `<div class="tx"><a class="hash" target="_blank" href="https://bscscan.com/tx/${t.hash}">${t.hash.substring(0,12)}...</a> — ${fmt(t.value)} BKZ</div>`
      ).join("");
    }

    // 3) Preço (opcional) — tentamos estimativa via PancakeSwap ou APIs externas.
    // Aqui deixamos simples: não consultamos preço terceiro por defeito.
    const marketCap = supply ? `${fmt(supply * 0 /* preço não definido */)} (preço não disponível)` : "—";

    res.send(renderHTML({
      supply: supply ? `${fmt(supply)} BKZ` : "—",
      holders: holdersCount ? fmt(holdersCount) : "—",
      txsHtml,
      marketCap
    }));

  } catch (err) {
    console.error("Erro:", err);
    res.status(500).send("Erro ao obter dados da blockchain. Ver consola do servidor.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
