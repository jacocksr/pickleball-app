# DINK TEAMS

A phone-friendly website that sorts pickleball players into matches and keeps win/loss stats over time. Needs at least 3 players. There is no upper limit.

The layout, dock, colors and animations follow the OncoScan design, recolored for pickleball.

## Tabs

| Tab | What it does |
|---|---|
| Players | Saved player list. Flip the switch for who is here today. |
| Stats | Wins, losses, win % and streaks. Filter by doubles or singles. |
| Play (center) | Add today's players, shuffle teams, tap the winning side. |
| History | Every logged game. Delete any mistakes. |
| More | Download or restore a JSON backup, reset data, about. |

## Match rules

- Groups of 4 play doubles (2 vs 2).
- 2 left over play singles.
- 1 left over sits out. The player who has sat out the least goes first.
- 3 players: 1 singles match, 1 sitting out.

## Ball animation

Tapping Play or Shuffle sends the pickleball on a new random path. The path is calculated once per tap as a straight-line trajectory that reflects off the walls of the button, with a spin that matches the distance rolled. The browser then plays it as a single short animation. Nothing runs between taps, and it is skipped for people who use reduced motion.

## Where data lives

Everything is saved in your browser (localStorage) on the device you use. Use More > Download backup to move it to another device or keep a copy. If you want one shared list across phones, the next step is a small Cloudflare Worker with a D1 database, like OncoScan.

## Files

- `index.html`: page and dock
- `styles.css`: design tokens, layout, animations
- `theme.js`: light, dark and auto theme
- `store.js`: players, games, stats and backup logic
- `app.js`: screens and interactions

## Run it

Open `index.html` in any browser, or publish with GitHub Pages (Settings > Pages > main / root).
