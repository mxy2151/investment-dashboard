// Netlify Function: returns share prices, gold per gram and the AUD-INR rate.
const TTL = 30 * 1000;
const cache = new Map();

async function quote(sym) {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(sym) + "?interval=1d&range=5d";
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const m = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error("no price");
  const v = { price: m.regularMarketPrice, prev: m.chartPreviousClose, currency: m.currency, time: m.regularMarketTime };
  cache.set(sym, { t: Date.now(), v });
  return v;
}

async function safe(sym) {
  try { return await quote(sym); } catch (e) { return null; }
}

exports.handler = async (event) => {
  const symbols = ((event.queryStringParameters && event.queryStringParameters.symbols) || "")
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
  const [gold, inrUsd, audUsd, ...rest] = await Promise.all([
    safe("GC=F"), safe("INR=X"), safe("AUD=X"), ...symbols.map(safe)
  ]);
  const quotes = {};
  symbols.forEach((s, i) => { if (rest[i]) quotes[s] = rest[i]; });
  const OZ = 31.1035; // grams per troy ounce
  const out = { quotes, gold: null, fx: null, time: Date.now() };
  // INR=X is INR per USD, AUD=X is AUD per USD, GC=F is USD per troy ounce
  if (gold && inrUsd) out.gold = { IN: gold.price * inrUsd.price / OZ };
  if (gold && audUsd) out.gold = Object.assign(out.gold || {}, { AU: gold.price * audUsd.price / OZ });
  if (inrUsd && audUsd) out.fx = inrUsd.price / audUsd.price;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(out)
  };
};
