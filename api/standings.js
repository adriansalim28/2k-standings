// 2K Season 2026 — Standings API
// Vercel serverless function — proxies Lark Base API

const BASE_TOKEN = "OaKybENNnaGWkIstbYplgvNBg5d";
const TABLE_ID   = "tbl1d07ESYbMjgJ6";
const APP_ID     = "cli_a941f51b31229ed3";

async function getTenantToken() {
  const res = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    }
  );
  const data = await res.json();
  if (!data.tenant_access_token) throw new Error("Auth failed: " + JSON.stringify(data));
  return data.tenant_access_token;
}

function extractText(field) {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return field.map((t) => t.text || "").join("");
  return String(field);
}

function extractNumber(field) {
  if (field === null || field === undefined) return 0;
  if (typeof field === "number") return field;
  if (typeof field === "string") return parseFloat(field) || 0;
  return 0;
}

function formatPct(pct) {
  if (pct === 1) return "1.000";
  return pct.toFixed(3).replace(/^0\./, ".");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const token = await getTenantToken();

    const response = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records?page_size=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const json = await response.json();
    const items = json.data?.items || [];

    const players = items
      .map((r) => {
        const f = r.fields;
        const w  = extractNumber(f["W"]);
        const l  = extractNumber(f["L"]);
        const gp = extractNumber(f["GP"]);
        const pd = extractNumber(f["PD"]);
        return { name: extractText(f["Name"]), w, l, gp, pd };
      })
      .filter((p) => p.name);

    // Sort: PCT desc → PD desc as tiebreaker
    players.sort((a, b) => {
      const pA = a.gp > 0 ? a.w / a.gp : 0;
      const pB = b.gp > 0 ? b.w / b.gp : 0;
      if (pB !== pA) return pB - pA;
      return b.pd - a.pd;
    });

    const leader = players[0] || { w: 0, l: 0 };

    const result = players.map((p, i) => {
      const pct = p.gp > 0 ? p.w / p.gp : 0;
      const gb  = i === 0 ? null : ((leader.w - p.w) + (p.l - leader.l)) / 2;
      return {
        rank: i + 1,
        name: p.name,
        w:    p.w,
        l:    p.l,
        gp:   p.gp,
        pd:   p.pd,
        pct:  formatPct(pct),
        gb:   gb === null ? "—" : gb % 1 === 0 ? String(gb) : gb.toFixed(1),
      };
    });

    res.json({ players: result, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
