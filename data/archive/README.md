# Season Archive

Each completed season is stored here as a frozen JSON file.

## Files
| File | Season | Year | Status |
|------|--------|------|--------|
| *(empty — Season 1 in progress)* | 1 | 2026 | 🔄 Active |

## How to archive a season

When Season N ends:

```bash
# 1. Copy current season to archive
cp data/matches.json data/archive/season-1-2026.json

# 2. Create new matches.json for Season N+1
# (update season number, year, and regenerate the 42-game schedule)

# 3. Update data/players.json if players or teams change

# 4. Commit everything
git add -A
git commit -m "season: archive Season 1, start Season 2"
git push
```

The app always reads `data/matches.json` — no code changes needed for a new season,
unless player count or team assignments change.

See also: [[2K App]]
