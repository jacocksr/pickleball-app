# DINK TEAMS

A phone-friendly website that sorts pickleball players into matches and keeps win/loss stats that everyone shares. It needs at least 3 players and has no upper limit.

Live site: https://dink-teams.jacocksr.workers.dev/

The layout, dock, colors and animations follow the OncoScan design, recolored for pickleball. Like OncoScan, it runs on a Cloudflare Worker with a D1 database.

## Tabs

| Tab | What it does |
|---|---|
| Players | Shared player list. Flip the switch for who is here today. |
| Stats | Win / Loss Stats from every logged game. Filter by doubles or singles. |
| Play (center, default) | Add today's players, shuffle teams, tap the winning side. |
| History | Every logged game, grouped by day. |
| More | Download a copy, administrator sign-in, reset this device. |

## Match rules

- Groups of 4 play doubles (2 vs 2).
- 2 left over play singles.
- 1 left over sits out. The player who has sat out the least goes first.
- 3 players: 1 singles match, 1 sitting out.

## Who can do what

| Action | Anyone | The device that logged the game | Administrator |
|---|---|---|---|
| View players, history and stats | Yes | Yes | Yes |
| Add a player | Yes | Yes | Yes |
| Log a game | Yes | Yes | Yes |
| Switch the winner or delete a game | No | Only its most recent game, for 120 minutes | Any game |
| Delete a player, add a backup file | No | No | Yes |

Every change is recorded in an audit table, and deleted games are hidden, not erased. "Device" means a random token kept in the browser. Clearing browser data gives up that device's edit rights, and an administrator can still fix anything.

## What is shared and what stays on your device

- Shared: players, logged games and stats.
- On your device only: who is here today, the current shuffle, sit-out counts, the theme and your edit token.
- If the server cannot be reached, the app shows the last copy it saved and tells you when saving is not possible.

## Ball animation

Tapping the Play tab or the Shuffle button sends the pickleball on a new random path. Both buttons use the same bounce: true wall reflections, more top and bottom hits than sides, a little speed lost on every bounce, and a long ease-out glide that ends exactly at the start. It is calculated once per tap and skipped for people who use reduced motion.

## Project layout

- `public/`: the website (`index.html`, `styles.css`, `sync.css`, `theme.js`, `store.js`, `app.js`, `site.webmanifest`, `images/`)
- `src/worker.js`: the API, the database setup and the file server
- `wrangler.jsonc`: Cloudflare settings (worker name, D1 database, edit window)

The `index.html`, `styles.css`, `app.js`, `store.js`, `theme.js` and `site.webmanifest` files in the repo root are the old GitHub Pages copy and are no longer used.

## Set up on Cloudflare

1. Create a D1 database named `dink-teams-db` and paste its ID into `wrangler.jsonc`.
2. Add a secret named `ADMIN_PASSWORD` to the worker (Settings > Variables and Secrets). Use a long passphrase.
3. Put the image files in `public/images/`: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png` and `og-image.png` (1200 x 630, solid background).
4. Deploy (connect the repo in Cloudflare, or run `npx wrangler deploy`). The tables are created automatically on the first request.
5. Sign in under More > Administrator and use "Import old data from this device" on the browser that holds your earlier stats.

The edit window is the `EDIT_WINDOW_MINUTES` value in `wrangler.jsonc`.

## Working on it

Changes go on a branch and come in through a pull request, for example `pb-v1.1` for features, `dt-images` for images and `dt-ui` for the look and the shared backend.
