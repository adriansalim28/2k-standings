const REPO = 'adriansalim28/2k-standings';
const fs   = require('fs');
const path = require('path');

// Source of truth: data/players.json — edit that file for team changes / Wild Card swaps
function loadPlayerTeams() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/players.json'), 'utf8'));
  const map = {};
  raw.players.forEach(p => { map[p.name] = { name: p.team, abbrev: p.abbrev, color: p.color }; });
  return map;
}
const PLAYER_TEAMS = loadPlayerTeams();

function logoUrl(abbrev) {
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbrev}.png`;
}

async function getMatches() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/data/matches.json`, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '2k-standings',
    },
  });
  const meta = await r.json();
  if (!meta.content) throw new Error(meta.message || 'Could not read matches from GitHub');
  return JSON.parse(Buffer.from(meta.content, 'base64').toString());
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const data  = await getMatches();
    const items = data.matches || [];

    const matches = items.map(m => {
      const homeTeam = PLAYER_TEAMS[m.home] || {};
      const awayTeam = PLAYER_TEAMS[m.away] || {};
      const played   = m.homeScore !== null && m.awayScore !== null;

      return {
        gameId:    m.id,
        leg:       m.leg,
        home:      m.home,
        away:      m.away,
        homeScore: played ? Number(m.homeScore) : null,
        awayScore: played ? Number(m.awayScore) : null,
        homeTeam:  homeTeam.name  || '',
        awayTeam:  awayTeam.name  || '',
        homeColor: homeTeam.color || '#334155',
        awayColor: awayTeam.color || '#334155',
        homeLogo:  homeTeam.abbrev ? logoUrl(homeTeam.abbrev) : '',
        awayLogo:  awayTeam.abbrev ? logoUrl(awayTeam.abbrev) : '',
        playedAt:  m.playedAt || null,
        played,
      };
    });

    const played   = matches.filter(m => m.played).sort((a, b) => {
      // Sort by playedAt timestamp desc (new games first); fallback to gameId for legacy data
      if (a.playedAt && b.playedAt) return b.playedAt.localeCompare(a.playedAt);
      if (a.playedAt) return -1;
      if (b.playedAt) return 1;
      return b.gameId.localeCompare(a.gameId);
    });
    const upcoming = matches.filter(m => !m.played).sort((a, b) => a.gameId.localeCompare(b.gameId));

    res.json({ ok: true, played, upcoming });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
