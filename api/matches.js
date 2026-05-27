const BASE_TOKEN = 'OaKybENNnaGWkIstbYplgvNBg5d';
const MATCHES_TABLE = 'tblwFOxYns6UTkZH';
const APP_ID = 'cli_aa9da0c31078ded1';

const PLAYERS_MAP = {
  'recvkJoDKAOtBS': 'Adrian',
  'recvkJoDKA02nw': 'Rokhmad',
  'recvkJoDKALj4b': 'Arga',
  'recvkJoDKAtvJF': 'Vieri',
  'recvkJoDKAjuFu': 'Yodha',
  'recvkJoDKAfHan': 'Azhar',
  'recvkJoDKAbL5v': 'Dhani',
};

const PLAYER_TEAMS = {
  Adrian:  { name: 'Lakers',    abbrev: 'lal', color: '#552583' },
  Azhar:   { name: 'Thunder',   abbrev: 'okc', color: '#007AC1' },
  Arga:    { name: 'Cavaliers', abbrev: 'cle', color: '#860038' },
  Yodha:   { name: 'Celtics',   abbrev: 'bos', color: '#007A33' },
  Rokhmad: { name: 'Wolves',    abbrev: 'min', color: '#0C2340' },
  Dhani:   { name: 'Knicks',    abbrev: 'ny',  color: '#F58426' },
  Vieri:   { name: 'Spurs',     abbrev: 'sa',  color: '#1a1a1a' },
};

function logoUrl(abbrev) {
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbrev}.png`;
}

function getLinkId(linkField) {
  if (!Array.isArray(linkField) || !linkField.length) return null;
  const item = linkField[0];
  return item.record_id || item.id;
}

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

  try {
    const token = await getTenantToken();
    const r = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${MATCHES_TABLE}/records?page_size=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    const items = data.data?.items || [];

    const matches = items.map(m => {
      const homeId   = getLinkId(m.fields['Home']);
      const awayId   = getLinkId(m.fields['Away']);
      const homeName = PLAYERS_MAP[homeId] || '?';
      const awayName = PLAYERS_MAP[awayId] || '?';
      const hs       = m.fields['Home Score'];
      const as_      = m.fields['Away Score'];
      const played   = hs != null && as_ != null;
      const homeTeam = PLAYER_TEAMS[homeName] || {};
      const awayTeam = PLAYER_TEAMS[awayName] || {};

      return {
        recordId:   m.record_id,
        gameNo:     m.fields['ID'] || '',
        leg:        Number(m.fields['Leg'] || 1),
        home:       homeName,
        away:       awayName,
        homeId,
        awayId,
        homeScore:  played ? Number(hs)  : null,
        awayScore:  played ? Number(as_) : null,
        homeTeam:   homeTeam.name   || '',
        awayTeam:   awayTeam.name   || '',
        homeColor:  homeTeam.color  || '#334155',
        awayColor:  awayTeam.color  || '#334155',
        homeLogo:   homeTeam.abbrev ? logoUrl(homeTeam.abbrev) : '',
        awayLogo:   awayTeam.abbrev ? logoUrl(awayTeam.abbrev) : '',
        played,
      };
    });

    // Played: sort newest first (by record_id desc — they're submitted in order)
    const played   = matches.filter(m => m.played)
      .sort((a, b) => b.recordId.localeCompare(a.recordId));

    // Upcoming: sort by game number asc
    const upcoming = matches.filter(m => !m.played)
      .sort((a, b) => a.gameNo.localeCompare(b.gameNo));

    res.json({ ok: true, played, upcoming });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
