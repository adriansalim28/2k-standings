const REPO = 'adriansalim28/2k-standings';

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
    const data = await getMatches();
    const matches = data.matches || [];

    // Played matches sorted chronologically by ID
    const played = matches
      .filter(m => m.homeScore !== null && m.awayScore !== null)
      .sort((a, b) => a.id.localeCompare(b.id));

    // Per-player stats + history
    const stats   = {};
    const history = {};
    const h2h     = {};
    Object.keys(PLAYER_TEAMS).forEach(n => {
      stats[n]   = { w: 0, l: 0, gp: 0, pd: 0, ptsFor: 0, ptsAg: 0, homeW: 0, homeL: 0, awayW: 0, awayL: 0, biggestWin: null };
      history[n] = [];
      h2h[n]     = {};
    });

    for (const m of played) {
      const hs  = Number(m.homeScore);
      const as_ = Number(m.awayScore);
      const h   = m.home;
      const a   = m.away;

      if (!h2h[h]) h2h[h] = {};
      if (!h2h[a]) h2h[a] = {};
      if (!h2h[h][a]) h2h[h][a] = { w: 0, l: 0 };
      if (!h2h[a][h]) h2h[a][h] = { w: 0, l: 0 };

      if (stats[h]) {
        stats[h].gp++;
        stats[h].ptsFor += hs;
        stats[h].ptsAg  += as_;
        stats[h].pd     += (hs - as_);
        if (hs > as_) {
          stats[h].w++; stats[h].homeW++;
          history[h].push('W');
          h2h[h][a].w++;
          const mg = hs - as_;
          if (stats[h].biggestWin === null || mg > stats[h].biggestWin) stats[h].biggestWin = mg;
        } else {
          stats[h].l++; stats[h].homeL++;
          history[h].push('L');
          h2h[h][a].l++;
        }
      }
      if (stats[a]) {
        stats[a].gp++;
        stats[a].ptsFor += as_;
        stats[a].ptsAg  += hs;
        stats[a].pd     += (as_ - hs);
        if (as_ > hs) {
          stats[a].w++; stats[a].awayW++;
          history[a].push('W');
          h2h[a][h].w++;
          const mg = as_ - hs;
          if (stats[a].biggestWin === null || mg > stats[a].biggestWin) stats[a].biggestWin = mg;
        } else {
          stats[a].l++; stats[a].awayL++;
          history[a].push('L');
          h2h[a][h].l++;
        }
      }
    }

    // Build players array
    let players = Object.keys(PLAYER_TEAMS).map(name => {
      const s    = stats[name];
      const team = PLAYER_TEAMS[name];
      const hist = history[name];
      const pct  = s.gp > 0 ? s.w / s.gp : 0;

      let streak = '';
      if (hist.length) {
        const last = hist[hist.length - 1];
        let cnt = 0;
        for (let i = hist.length - 1; i >= 0 && hist[i] === last; i--) cnt++;
        streak = last + cnt;
      }

      return {
        name,
        w: s.w, l: s.l, gp: s.gp, pd: s.pd, pct,
        color:  team.color,
        logo:   logoUrl(team.abbrev),
        team:   team.name,
        streak,
        last5:      hist.slice(-5),
        ppg:        s.gp > 0 ? Math.round(s.ptsFor / s.gp * 10) / 10 : null,
        oppPpg:     s.gp > 0 ? Math.round(s.ptsAg  / s.gp * 10) / 10 : null,
        homeW: s.homeW, homeL: s.homeL,
        awayW: s.awayW, awayL: s.awayL,
        biggestWin: s.biggestWin,
        h2h:        h2h[name] || {},
      };
    });

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
