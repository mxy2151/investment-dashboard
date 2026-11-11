// Netlify Function: search NSE, BSE and ASX stocks and ETFs by name or symbol.
const HOSTS = ["query2", "query1"];
const HDR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9"
};
const reply = (o) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(o)
});

exports.handler = async (event) => {
  const q = (((event.queryStringParameters || {}).q) || "").trim().slice(0, 40);
  if (q.length < 2) return reply({ results: [] });
  let last = "no response";
  for (const h of HOSTS) {
    try {
      const url = "https://" + h + ".finance.yahoo.com/v1/finance/search?q=" +
        encodeURIComponent(q) + "&quotesCount=25&newsCount=0&listsCount=0";
      const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(7000) });
      if (!r.ok) { last = "HTTP " + r.status; continue; }
      const j = await r.json();
      const results = (j.quotes || [])
        .filter(x => x.symbol && /\.(NS|BO|AX)$/.test(x.symbol) && (x.quoteType === "EQUITY" || x.quoteType === "ETF"))
        .map(x => ({
          symbol: x.symbol,
          name: x.shortname || x.longname || x.symbol,
          exchange: x.exchDisp || x.exchange || "",
          market: x.symbol.endsWith(".AX") ? "AU" : "IN"
        })).slice(0, 8);
      return reply({ results });
    } catch (e) {
      last = e.name === "TimeoutError" ? "timeout" : String(e.message || e);
    }
  }
  return reply({ results: [], error: last });
};
