const BASE_TOKEN = 'OaKybENNnaGWkIstbYplgvNBg5d';
const PLAYERS_TABLE = 'tbl1d07ESYbMjgJ6';
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

async function larkGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const token = await getTenantToken();

    const [playersRes, matchesRes] = await Promise.all([
      larkGet(token, `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${PLAYERS_TABLE}/records?page_size=100`),
      larkGet(token, `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${MATCHES_TABLE}/records?page_size=100`),
    ]);

    const matchItems = matchesRes.data?.items || [];

    // Compute per-player game history (chronological by record_id)
    const playedMatches = matchItems
      .filter(m => m.fields['Home Score'] != null && m.fields['Away Score'] != null)
      .sort((a, b) => a.record_id.localeCompare(b.record_id));

    const history = {};
    Object.values(PLAYERS_MAP).forEach(n => { history[n] = []; });

    for (const m of playedMatches) {
      const hs = Number(m.fields['Home Score']);
      const as_ = Number(m.fields['Away Score']);
      const homeName = PLAYERS_MAP[getLinkId(m.fields['Home'])];
      const awayName = PLAYERS_MAP[getLinkId(m.fields['Away'])];
      if (homeName) history[homeName].push(hs > as_ ? 'W' : 'L');
      if (awayName) history[awayName].push(as_ > hs ? 'W' : 'L');
    }

    // Build players array
    const playerItems = playersRes.data?.items || [];
    let players = playerItems.map(p => {
      const rawName = p.fields['Name'] || '';
      const name = rawName === 'Christian' ? 'Vieri' : rawName;
      if (!name) return null;

      const w   = Number(p.fields['W']  || 0);
      const l   = Number(p.fields['L']  || 0);
      const gp  = Number(p.fields['GP'] || 0);
      const pd  = Number(p.fields['PD'] || 0);
      const pct = gp > 0 ? w / gp : 0;

      const team = PLAYER_TEAMS[name] || {};
      const hist = history[name] || [];

      // Streak
      let streak = '';
      if (hist.length) {
        const last = hist[hist.length - 1];
        let cnt = 0;
        for (let i = hist.length - 1; i >= 0 && hist[i] === last; i--) cnt++;
        streak = last + cnt;
      }

      return {
        id:     p.record_id,
        name,
        w, l, gp, pd, pct,
        color:  team.color  || '#334155',
        logo:   team.abbrev ? logoUrl(team.abbrev) : '',
        team:   team.name   || '',
        streak,
        last5:  hist.slice(-5),
      };
    }).filter(Boolean);

    // Sort: win% desc, then PD desc
    players.sort((a, b) => b.pct - a.pct || b.pd - a.pd);

    // Add rank + GB
    const leader = players[0] || { w: 0, l: 0 };
    players = players.map((p, i) => {
      const gb = i === 0 ? null : ((leader.w - p.w) + (p.l - leader.l)) / 2;
      const pctStr = p.gp > 0
        ? (p.pct === 1 ? '1.000' : `.${Math.round(p.pct * 1000).toString().padStart(3, '0')}`)
        : '.000';
      return {
        ...p,
        rank:   i + 1,
        pctStr,
        gbStr:  gb === null ? '—' : (gb % 1 === 0 ? String(gb) : gb.toFixed(1)),
      };
    });

    // Magic number: leader vs #2
    if (players.length >= 2) {
      const GAMES_PER_PLAYER = 12;
      const mn = Math.max(0, (GAMES_PER_PLAYER + 1) - players[0].w - players[1].l);
      players[0].mn = mn;
    }

    res.json({ ok: true, players, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
