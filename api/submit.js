const BASE_TOKEN    = 'OaKybENNnaGWkIstbYplgvNBg5d';
const MATCHES_TABLE = 'tblwFOxYns6UTkZH';
const APP_ID        = 'cli_a941f51b31229ed3';

// Matches table field IDs
const FIELD_HOME_SCORE = 'fldjEcj3Ns';
const FIELD_AWAY_SCORE = 'fldIKc8YGU';
const FIELD_HWV        = 'fldtXAJYFa'; // Home Win Value — drives Players.W formula
const FIELD_AWV        = 'fldSyA90Y3'; // Away Win Value — drives Players.L formula
const FIELD_PROCESSED  = 'fldlCr4hpg';

async function getTenantToken() {
  const r = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const d = await r.json();
  return d.tenant_access_token;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { recordId, homeScore, awayScore } = req.body || {};

  if (!recordId || homeScore == null || awayScore == null) {
    return res.status(400).json({ ok: false, error: 'Missing fields: recordId, homeScore, awayScore' });
  }

  const hs  = Number(homeScore);
  const as_ = Number(awayScore);

  if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
    return res.status(400).json({ ok: false, error: 'Scores must be non-negative numbers' });
  }
  if (hs === as_) {
    return res.status(400).json({ ok: false, error: 'Tied scores are not allowed' });
  }

  try {
    const token = await getTenantToken();

    const fields = {
      [FIELD_HOME_SCORE]: hs,
      [FIELD_AWAY_SCORE]: as_,
      [FIELD_HWV]:        hs > as_ ? 1 : 0,
      [FIELD_AWV]:        as_ > hs ? 1 : 0,
      [FIELD_PROCESSED]:  true,
    };

    const r = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${MATCHES_TABLE}/records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    const data = await r.json();

    if (data.code !== 0) {
      return res.status(500).json({ ok: false, error: data.msg || 'Lark API error' });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
