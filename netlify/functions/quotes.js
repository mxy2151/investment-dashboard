// Netlify Function: share prices, gold per gram and the AUD-INR rate.
const TTL = 30 * 1000;
const cache = new Map();
const HOSTS = ["query1", "query2"];
const HDR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9"
};

async function quote(sym) {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.t < TTL) return { v: hit.v };
  let last = "no response";
  for (const h of HOSTS) {
    try {
      const url = "https://" + h + ".finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(sym) + "?interval=1d&range=5d";
      const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(7000) });
      if (!r.ok) { last = "HTTP " + r.status; continue; }
      const j = await r.json();
      const m = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      if (!m || !(m.regularMarketPrice > 0)) { last = "symbol not found"; continue; }
      const v = { price: m.regularMarketPrice, prev: m.chartPreviousClose, currency: m.currency, time: m.regularMarketTime };
      cache.set(sym, { t: Date.now(), v });
      return { v };
    } catch (e) {
      last = e.name === "TimeoutError" ? "timeout" : String(e.message || e);
    }
  }
  return { e: last };
}

exports.handler = async (event) => {
  const symbols = ((event.queryStringParameters && event.queryStringParameters.symbols) || "")
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
  const all = ["GC=F", "INR=X", "AUD=X"].concat(symbols);
  const res = await Promise.all(all.map(quote));
  const gold = res[0].v, inrUsd = res[1].v, audUsd = res[2].v;
  const quotes = {}, errors = {};
  symbols.forEach((s, i) => {
    const r = res[i + 3];
    if (r.v) quotes[s] = r.v; else errors[s] = r.e;
  });
  const OZ = 31.1035; // grams per troy ounce
  const out = { quotes, errors, gold: null, fx: null, time: Date.now() };
  // INR=X is INR per USD, AUD=X is AUD per USD, GC=F is USD per troy ounce
  if (gold && inrUsd) out.gold = { IN: gold.price * inrUsd.price / OZ };
  if (gold && audUsd) out.gold = Object.assign(out.gold || {}, { AU: gold.price * audUsd.price / OZ });
  if (inrUsd && audUsd) out.fx = inrUsd.price / audUsd.price;
  if (!gold) errors["gold"] = res[0].e;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(out)
  };
};
