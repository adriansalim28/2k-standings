const BASE_TOKEN    = 'OaKybENNnaGWkIstbYplgvNBg5d';
const PLAYERS_TABLE = 'tbl1d07ESYbMjgJ6';
const APP_ID        = 'cli_aa9da0c31078ded1';

async function getTenantToken() {
  const r = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const authRes = await getTenantToken();
    const token   = authRes.tenant_access_token;

    const r = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${PLAYERS_TABLE}/records?page_size=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const raw = await r.json();

    res.json({ authCode: authRes.code, authMsg: authRes.msg, hasToken: !!token, larkCode: raw.code, larkMsg: raw.msg, itemCount: raw.data?.items?.length ?? 'no data key', raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
