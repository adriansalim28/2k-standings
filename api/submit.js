const REPO = 'adriansalim28/2k-standings';

const GH_HEADERS = () => ({
  'Authorization': `token ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': '2k-standings',
  'Content-Type': 'application/json',
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { gameId, homeScore, awayScore } = req.body || {};

  if (!gameId || homeScore == null || awayScore == null) {
    return res.status(400).json({ ok: false, error: 'Missing fields: gameId, homeScore, awayScore' });
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
    // 1. Get current file + SHA from GitHub
    const getRes  = await fetch(`https://api.github.com/repos/${REPO}/contents/data/matches.json`, { headers: GH_HEADERS() });
    const fileMeta = await getRes.json();

    if (!fileMeta.content || !fileMeta.sha) {
      return res.status(500).json({ ok: false, error: 'Could not read matches file from GitHub' });
    }

    const data = JSON.parse(Buffer.from(fileMeta.content, 'base64').toString());

    // 2. Find and update the game
    const idx = data.matches.findIndex(m => m.id === gameId);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: `Game ${gameId} not found` });
    }

    data.matches[idx].homeScore = hs;
    data.matches[idx].awayScore = as_;
    data.updatedAt = new Date().toISOString();

    // 3. Commit back to GitHub
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/data/matches.json`, {
      method: 'PUT',
      headers: GH_HEADERS(),
      body: JSON.stringify({
        message: `score: ${gameId} — ${hs}-${as_}`,
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
