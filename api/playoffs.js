const REPO = 'adriansalim28/2k-standings';
const fs   = require('fs');
const path = require('path');

const WINS_TO_CLINCH = 4; // BO7

function loadPlayerTeams() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/players.json'), 'utf8'));
  const map = {};
  raw.players.forEach(p => { map[p.name] = { team: p.team, abbrev: p.abbrev, color: p.color }; });
  return map;
}
const PLAYER_TEAMS = loadPlayerTeams();

function logoUrl(abbrev) {
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbrev}.png`;
}

async function getPlayoffs() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/data/playoffs.json`, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '2k-standings',
    },
  });
  const meta = await r.json();
  if (!meta.content) throw new Error(meta.message || 'Could not read playoffs from GitHub');
  return JSON.parse(Buffer.from(meta.content, 'base64').toString());
}

function decorateSlot(slot) {
  if (!slot || !slot.player) return null;
  const t = PLAYER_TEAMS[slot.player];
  if (!t) return { player: slot.player, seed: slot.seed || null };
  return {
    player: slot.player,
    seed:   slot.seed || null,
    team:   t.team,
    abbrev: t.abbrev,
    color:  t.color,
    logo:   logoUrl(t.abbrev),
  };
}

function gameWinner(g) {
  if (g.winner === 'home' || g.winner === 'away') return g.winner;
  if (g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore) {
    return g.homeScore > g.awayScore ? 'home' : 'away';
  }
  return null;
}

function computeSeriesStats(series) {
  let homeWins = 0, awayWins = 0;
  const games = (series.games || []).map(g => {
    const w = gameWinner(g);
    if (w === 'home') homeWins++;
    if (w === 'away') awayWins++;
    return { ...g, winner: w };
  });

  const clinched   = homeWins >= WINS_TO_CLINCH || awayWins >= WINS_TO_CLINCH;
  const winnerSide = homeWins >= WINS_TO_CLINCH ? 'home'
                   : awayWins >= WINS_TO_CLINCH ? 'away'
                   : null;
  const winner     = winnerSide === 'home' ? series.home?.player
                   : winnerSide === 'away' ? series.away?.player
                   : null;

  let status;
  if (clinched)                                  status = 'complete';
  else if (!series.home || !series.away)         status = 'awaiting';
  else if (homeWins === 0 && awayWins === 0)     status = 'upcoming';
  else                                            status = 'active';

  return { homeWins, awayWins, clinched, winnerSide, winner, status, games };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const data   = await getPlayoffs();
    const series = (data.series || []).sort((a, b) => (a.order || 0) - (b.order || 0));

    const enriched = series.map(s => {
      const stats = computeSeriesStats(s);
      return {
        id:        s.id,
        label:     s.label,
        round:     s.round,
        format:    data.format || 'BO7',
        winsToClinch: WINS_TO_CLINCH,
        home:      decorateSlot(s.home),
        away:      decorateSlot(s.away),
        awaitingFrom: s.awaitingFrom || null,
        homeWins:  stats.homeWins,
        awayWins:  stats.awayWins,
        status:    stats.status,
        clinched:  stats.clinched,
        winnerSide: stats.winnerSide,
        winner:    stats.winner,
        nextGameNum: stats.games.length + 1,
        games:     stats.games,
      };
    });

    res.json({ ok: true, series: enriched, updated: data.updated || new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
