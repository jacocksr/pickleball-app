# DINK TEAMS

A phone-friendly website for pickleball groups. It sorts the players who showed up into doubles and singles matches, logs who won, and keeps win/loss stats that everyone in the group shares. It needs at least 3 players and has no upper limit.

Live site: https://dink-teams.jacocksr.workers.dev/

It runs on a Cloudflare Worker with a D1 (SQLite) database. The website is plain HTML, CSS and JavaScript with no build step and no framework.

## Tabs

| Tab | What it does |
|---|---|
| Players | The shared player list. Flip the switch for who is here today. Tap **Edit** to fix a name. Swipe a row left to delete it (administrators) or to ask the administrator to delete it (everyone else). |
| Stats | Win / Loss Stats from every logged game. Filter by doubles or singles. |
| Play (center, default) | Add today's players, shuffle teams, tap the winning side. |
| History | Every logged game, grouped by day. |
| More | Send feedback, download a copy, administrator sign-in, reset this device. |

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
| Fix a typo in a player's name | Yes (small fixes only) | Yes | Any change |
| Ask for a player to be deleted | Yes | Yes | Not needed |
| Switch the winner or delete a game | No | Only its most recent game, for 120 minutes | Any game |
| Delete a player, add a backup file | No | No | Yes |
| Read and close feedback reports | No | No | Yes |

A "small fix" for a name means changing the capital letters, finishing a name ("Al" to "Alex"), or correcting a few letters. A bigger change is turned down with a message to ask the administrator. A device can make 10 name changes per hour, and two players can never share a name.

Every change is recorded in an audit table, and deleted games and players are hidden, not erased. "Device" means a random token kept in the browser. Clearing browser data gives up that device's edit rights, and an administrator can still fix anything. Renaming a player also updates the name shown on past games, and stats follow the player's ID, so records are never split.

## Feedback

Anyone can send a bug report, idea or other note from the More tab. The administrator gets an email alert and can mark each report done and delete it. A "Request delete" swipe on the Players tab uses the same system.

## What is shared and what stays on your device

- Shared: players, logged games, stats and feedback reports.
- On your device only: who is here today, the current shuffle, sit-out counts, the theme and your edit token.
- If the server cannot be reached, the app shows the last copy it saved and tells you when saving is not possible.

## Project layout

- `public/`: the website
  - `index.html`, `styles.css`, `sync.css`, `site.webmanifest`, `images/`
  - `theme.js`: light, dark and auto theme
  - `store.js`: all data and every call to the server
  - `app.js`: screens, tabs and the ball bounce
  - `roster.js`: swipe-to-delete, the Edit pill and name changes on the Players tab
  - `feedback.js`: the feedback form and the administrator inbox
  - `easter.js`: a hidden surprise. Part of the fun is finding it.
- `src/entry.js`: sends each request to the right file
- `src/worker.js`: the main API, the database setup and the file server
- `src/tickets.js`: feedback reports and email alerts
- `src/players.js`: player renames
- `wrangler.jsonc`: Cloudflare settings (worker name, D1 database, edit window)

## API

Everything lives under `/api/`. Anyone: `GET /api/data`, `POST /api/players`, `/api/games`, `/api/games/update`, `/api/games/delete`, `/api/players/rename`, `/api/tickets`. Administrator only: `/api/admin/login`, `/api/admin/import`, `/api/admin/player/delete`, `/api/admin/player/rename`, `GET /api/admin/audit` and the `/api/admin/tickets` routes. Every write must come from the site's own origin as JSON.

## Run it on your own computer

You need Node.js. No install step is needed beyond Wrangler.

1. Copy the project (see [CONTRIBUTING.md](CONTRIBUTING.md)).
2. Create a file named `.dev.vars` in the project folder with one line, for example `ADMIN_PASSWORD=pick-something-local`. This file is already ignored by Git. Never commit it.
3. Run `npx wrangler dev`. Wrangler uses a local copy of the database by default, so nothing you do here touches the real stats.
4. Open the address it prints. The tables are created on the first request.

Do not run `npx wrangler dev --remote` or `npx wrangler deploy`. Those talk to the real Cloudflare account and are for the owner only.

## Set up your own copy on Cloudflare (owner)

1. Create a D1 database named `dink-teams-db` and paste its ID into `wrangler.jsonc`. The ID names the database. It is not a password, and nobody can use it without the owner's Cloudflare login.
2. Add a secret named `ADMIN_PASSWORD` to the worker (Settings > Variables and Secrets). Use a long passphrase.
3. For email alerts, add `RESEND_API_KEY` and `ALERT_EMAIL` as secrets. `ALERT_FROM` is optional.
4. Put the image files in `public/images/`: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png` and `og-image.png` (1200 x 630, solid background).
5. Deploy (connect the repo in Cloudflare, or run `npx wrangler deploy`).
6. Sign in under More > Administrator.

The edit window is the `EDIT_WINDOW_MINUTES` value in `wrangler.jsonc`.

## Contributing

The repository owner reviews and merges every change. Friends are welcome to suggest ideas or send fixes. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short: copy the project to your own GitHub account (a fork), make your change on a branch, test it on your computer, and open a pull request.

## License

No license has been chosen yet. Until one is added, please ask the owner before reusing the code outside this group.
