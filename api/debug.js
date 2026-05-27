const REPO = 'adriansalim28/2k-standings';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/data/matches.json`, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': '2k-standings',
      },
    });
    const meta = await r.json();
    const hasContent = !!meta.content;
    let matchCount = 0, playedCount = 0;

    if (hasContent) {
      const data = JSON.parse(Buffer.from(meta.content, 'base64').toString());
      matchCount  = data.matches?.length ?? 0;
      playedCount = data.matches?.filter(m => m.homeScore !== null).length ?? 0;
    }

    res.json({
      ok:         true,
      hasToken:   !!process.env.GITHUB_TOKEN,
      fileFound:  hasContent,
      matchCount,
      playedCount,
      sha:        meta.sha?.substring(0, 8) || null,
      ghStatus:   r.status,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
