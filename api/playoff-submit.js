const REPO = 'adriansalim28/2k-standings';

const WINS_TO_CLINCH = 4;

const GH_HEADERS = () => ({
  'Authorization': `token ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': '2k-standings',
  'Content-Type': 'application/json',
});

function gameWinner(g) {
  if (g.winner === 'home' || g.winner === 'away') return g.winner;
  if (g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore) {
    return g.homeScore > g.awayScore ? 'home' : 'away';
  }
  return null;
}

function countWins(series) {
  let h = 0, a = 0;
  (series.games || []).forEach(g => {
    const w = gameWinner(g);
    if (w === 'home') h++;
    if (w === 'away') a++;
  });
  return { h, a };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { seriesId, gameNum, homeScore, awayScore, action } = req.body || {};

  if (!seriesId) {
    return res.status(400).json({ ok: false, error: 'Missing seriesId' });
  }

  // action: "add" (default) | "edit" | "delete"
  const op = action || 'add';

  // For add/edit, scores required
  let hs = null, as_ = null;
  if (op !== 'delete') {
    hs  = Number(homeScore);
    as_ = Number(awayScore);
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
      return res.status(400).json({ ok: false, error: 'Scores must be non-negative numbers' });
    }
    if (hs === as_) {
      return res.status(400).json({ ok: false, error: 'Tied scores are not allowed' });
    }
  }

  try {
    // 1. Get current playoffs.json
    const getRes  = await fetch(`https://api.github.com/repos/${REPO}/contents/data/playoffs.json`, { headers: GH_HEADERS() });
    const fileMeta = await getRes.json();
    if (!fileMeta.content || !fileMeta.sha) {
      return res.status(500).json({ ok: false, error: 'Could not read playoffs file from GitHub' });
    }
    const data = JSON.parse(Buffer.from(fileMeta.content, 'base64').toString());

    // 2. Find the series
    const sIdx = data.series.findIndex(s => s.id === seriesId);
    if (sIdx === -1) {
      return res.status(404).json({ ok: false, error: `Series '${seriesId}' not found` });
    }
    const series = data.series[sIdx];

    // Series must have both home + away set to accept games
    if (!series.home?.player || !series.away?.player) {
      return res.status(400).json({ ok: false, error: 'Series is waiting for an opponent' });
    }

    // Check not already clinched
    const { h: hWinsBefore, a: aWinsBefore } = countWins(series);
    if ((hWinsBefore >= WINS_TO_CLINCH || aWinsBefore >= WINS_TO_CLINCH) && op === 'add') {
      return res.status(400).json({ ok: false, error: 'Series already complete' });
    }

    const nowIso = new Date().toISOString();
    let commitMsg = '';

    if (op === 'add') {
      const nextG = (series.games?.length || 0) + 1;
      const requestedG = gameNum != null ? Number(gameNum) : nextG;
      if (requestedG !== nextG) {
        return res.status(400).json({ ok: false, error: `Next game must be ${nextG}` });
      }
      series.games = series.games || [];
      series.games.push({
        g: nextG,
        homeScore: hs,
        awayScore: as_,
        winner: hs > as_ ? 'home' : 'away',
        playedAt: nowIso,
      });
      commitMsg = `playoffs: ${seriesId} G${nextG} ${hs}-${as_}`;
    } else if (op === 'edit') {
      const gIdx = (series.games || []).findIndex(g => g.g === Number(gameNum));
      if (gIdx === -1) {
        return res.status(404).json({ ok: false, error: `Game ${gameNum} not found in ${seriesId}` });
      }
      series.games[gIdx].homeScore = hs;
      series.games[gIdx].awayScore = as_;
      series.games[gIdx].winner    = hs > as_ ? 'home' : 'away';
      series.games[gIdx].playedAt  = nowIso;
      commitMsg = `playoffs: edit ${seriesId} G${gameNum} ${hs}-${as_}`;
    } else if (op === 'delete') {
      const gIdx = (series.games || []).findIndex(g => g.g === Number(gameNum));
      if (gIdx === -1) {
        return res.status(404).json({ ok: false, error: `Game ${gameNum} not found in ${seriesId}` });
      }
      // Only allow delete if it's the latest game
      if (gIdx !== series.games.length - 1) {
        return res.status(400).json({ ok: false, error: 'Only the latest game can be deleted' });
      }
      series.games.splice(gIdx, 1);
      commitMsg = `playoffs: undo ${seriesId} G${gameNum}`;
    }

    // 3. Check if series newly clinched → cascade winner to downstream
    const { h: hWinsAfter, a: aWinsAfter } = countWins(series);
    const newlyClinched = (hWinsAfter >= WINS_TO_CLINCH || aWinsAfter >= WINS_TO_CLINCH);

    if (newlyClinched && series.advancesTo) {
      const winnerPlayer = hWinsAfter >= WINS_TO_CLINCH ? series.home.player : series.away.player;
      const winnerSeed   = hWinsAfter >= WINS_TO_CLINCH ? (series.home.seed || null) : (series.away.seed || null);
      const dstIdx = data.series.findIndex(s => s.id === series.advancesTo.series);
      if (dstIdx !== -1) {
        const slot = series.advancesTo.slot; // "home" | "away"
        data.series[dstIdx][slot] = { player: winnerPlayer, seed: winnerSeed };
        // Clear awaitingFrom if both slots now filled
        if (data.series[dstIdx].home?.player && data.series[dstIdx].away?.player) {
          delete data.series[dstIdx].awaitingFrom;
        }
      }
    } else if (op === 'delete' && hWinsBefore >= WINS_TO_CLINCH || op === 'delete' && aWinsBefore >= WINS_TO_CLINCH) {
      // If we just un-clinched a series, also clear the slot it filled downstream
      if (series.advancesTo) {
        const dstIdx = data.series.findIndex(s => s.id === series.advancesTo.series);
        if (dstIdx !== -1) {
          data.series[dstIdx][series.advancesTo.slot] = null;
          data.series[dstIdx].awaitingFrom = series.id;
        }
      }
    }

    data.updated = nowIso;

    // 4. Commit back
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/data/playoffs.json`, {
      method: 'PUT',
      headers: GH_HEADERS(),
      body: JSON.stringify({
        message: commitMsg,
        content: newContent,
        sha:     fileMeta.sha,
      }),
    });
    const putData = await putRes.json();
    if (putData.content) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: putData.message || 'GitHub API error' });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
