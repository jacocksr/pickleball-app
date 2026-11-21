# Contributing to DINK TEAMS

Thanks for helping out. This project is shared with a pickleball group, so a few simple rules keep the live site safe for everyone.

## The short version

1. Fork the repository to your own GitHub account.
2. Make a branch in your fork.
3. Run the app on your own computer and test your change.
4. Open a pull request into `main`.
5. The owner reviews it. Nothing goes live until the owner merges it.

You do not need permission to fork, and you cannot change the live site by working in your fork.

## What you can and cannot touch

The owner is the required reviewer for every change (see `.github/CODEOWNERS`). These areas get extra care because a mistake there could affect everyone's stats or open a security hole:

- `src/`: the server code, the permission rules and the database
- `wrangler.jsonc`: Cloudflare settings
- `.github/`: review rules

You are welcome to propose changes there, but please explain why in the pull request and keep them small. Changes to who is allowed to do what are decided by the owner.

## Do not use the live data

- Test on your own computer with `npx wrangler dev`. It uses a private local database. The steps are in the README.
- Never run `wrangler deploy` or `wrangler dev --remote`.
- Never add real names, passwords, API keys or the contents of `.dev.vars` to a commit, an issue or a pull request. If you accidentally do, tell the owner right away.
- Preview builds the owner may run from a branch currently share the live database. That is why only the owner runs them, using throwaway names.

## Code style

- Plain JavaScript, HTML and CSS. No frameworks, no build step, no new libraries without asking first.
- Match the code around yours. The site files use `var` and `function` and avoid features older phones lack.
- Keep the phone-first layout. Test on a narrow screen, and check both light and dark themes.
- Keep it accessible: real buttons, `aria-label` on icon-only controls, visible keyboard focus, and respect "reduce motion" (see how `app.js` and `easter.js` do this).
- The server must check everything itself. The browser can be edited by anyone, so never rely on a browser-side check alone.
- Keep messages short, friendly and in plain language.

## Before you open a pull request

- [ ] It runs locally with no errors in the browser console.
- [ ] I tried it on a phone-sized screen.
- [ ] I did not include secrets, `.dev.vars` or real player data.
- [ ] The description says what changed and how I tested it.
- [ ] It does one thing. Several unrelated changes should be separate pull requests.

## Ideas and bugs

Not a developer? Use the feedback form on the More tab in the app, or ask the owner. Developers can also open a GitHub issue. Describe what you saw, what you expected, and the device and browser you used.

## Be kind

This is a hobby project among friends. Review comments are about the code, not the person. Questions are always welcome.
