# DINK TEAMS

A phone-friendly website that sorts pickleball players into matches and keeps win/loss stats over time. It needs at least 3 players and has no upper limit.

Live site: https://jacocksr.github.io/pickleball-app/

The layout, dock, colors and animations follow the OncoScan design, recolored for pickleball.

## Tabs

| Tab | What it does |
|---|---|
| Players | Saved player list. Flip the switch for who is here today. |
| Stats | Win / Loss Stats with wins, losses, win % and streaks. Filter by doubles or singles. |
| Play (center, default) | Add today's players, shuffle teams, tap the winning side. |
| History | Every logged game, grouped by day. Delete any mistakes. |
| More | Download or restore a JSON backup, reset data, about. |

The gear icon in the header opens Settings, where you can pick Light, Dark or Auto.

## Match rules

- Groups of 4 play doubles (2 vs 2).
- 2 left over play singles.
- 1 left over sits out. The player who has sat out the least goes first.
- 3 players: 1 singles match, 1 sitting out.

| Players | Result |
|---|---|
| 3 | 1 singles, 1 sitting out |
| 4 | 1 doubles |
| 5 | 1 doubles, 1 sitting out |
| 6 | 1 doubles, 1 singles |
| 7 | 1 doubles, 1 singles, 1 sitting out |
| 8 | 2 doubles |

The pattern repeats for larger groups. Tap the winning side of each match to log a result.

## Ball animation

Tapping the Play tab or the Shuffle button sends the pickleball on a new random path. Both buttons use the same bounce:

- The path is calculated once per tap. The ball bounces off the walls with true reflections, and top and bottom walls get more hits than the sides.
- The ball loses a little speed on every bounce, then glides home with a long ease-out and stops exactly where it started.
- The Play button is round, so its bounce is calculated on a square and bent into the circle.
- The browser plays the result as one short animation. Nothing runs between taps, and it is skipped for people who use reduced motion.

## Where data lives

Everything is saved in your browser (localStorage) on the device you use. Use More > Download backup to move it to another device or keep a copy. If you want one shared list across phones, the next step is a small Cloudflare Worker with a D1 database, like OncoScan.

## Icons and link previews

These files live in the repo root:

| File | Used for |
|---|---|
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Browser tab icon |
| `apple-touch-icon.png` | iPhone and iPad home screen icon |
| `android-chrome-192x192.png`, `android-chrome-512x512.png` | Android home screen and install icons |
| `site.webmanifest` | App name, colors and icon list |
| `og-image.png` | Picture shown when the link is shared (iMessage, social sites). Use 1200 x 630 pixels with a solid background. |

The `og:image` tag in `index.html` must use the full address, `https://jacocksr.github.io/pickleball-app/og-image.png`. Messaging apps and social sites cache previews, so a new image can take a while to appear.

## Files

- `index.html`: page, dock and head tags (icons, manifest, share preview)
- `styles.css`: design tokens, layout, animations
- `theme.js`: light, dark and auto theme
- `store.js`: players, games, stats and backup logic
- `app.js`: screens, interactions and the ball animation

## Run it

Open `index.html` in any browser, or publish with GitHub Pages (Settings > Pages > main / root).

## Working on it

Changes go on a branch and come in through a pull request, for example `pb-v1.1` for features and `dt-images` for images.
