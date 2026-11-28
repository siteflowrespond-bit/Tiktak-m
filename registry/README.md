# flock.tt streamer list

A tiny server that shows which TikTok creators use flock.tt, with a red dot when they're live.
Creators are only on it if they say yes in the app (it asks once, the first time they connect),
and they can leave any time in **Settings → Public streamer list**.

**What it stores, per creator:** their TikTok @username (already public while they're live), the flock.tt
version, Windows or Mac, how many LIVEs, first and last seen, and a hash of a random install key (so only that
copy of flock.tt can remove them). Nothing about viewers, chat or gifts. No IP addresses are stored.

No dependencies: plain Node 18 or newer.

## Pages

| Address | Who | What |
|---|---|---|
| `/` | Everyone (or only you, with `PUBLIC=0`) | The list |
| `/admin` | Only you | The same list with **Remove** buttons. Log in with user `owner` and your `OWNER_TOKEN` |
| `/api/list` | Everyone (or only you) | The list as JSON |
| `/health` | Everyone | `{"ok":true}`, for the host's health check |

## Settings

| Variable | Default | |
|---|---|---|
| `OWNER_TOKEN` | (required) | Your password for `/admin`. At least 12 characters; use a long random one |
| `PUBLIC` | `1` | `1` = anyone can see the list. `0` = only you, after logging in |
| `PORT` | `8790` | Most hosts set this for you |
| `DATA_FILE` | `registry-data.json` | Where the list is saved |
| `LIVE_MINUTES` | `10` | How recently someone must have checked in to show as live |

Run it on your own computer to try it:

```
cd registry
OWNER_TOKEN=pick-a-long-password npm start
```

Then start flock.tt pointed at it: `FLOCKTT_LIST_URL=http://localhost:8790 npm start` (in the main folder).

## Putting it online

**Recommended to start: Render's free web service.** It costs nothing and needs no server knowledge.

1. Go to [render.com](https://render.com), sign in with GitHub, and click **New → Web Service**.
2. Pick the **blatantwhisperer** repository.
3. Set **Root Directory** to `registry`, **Build Command** to `npm install` (there's nothing to install; it just satisfies Render), **Start Command** to `node server.js`, and pick the **Free** plan.
4. Under **Environment**, add `OWNER_TOKEN` (a long random password) and `PUBLIC` = `1`.
5. Click **Create Web Service**. After a minute it gives you an address like `https://flocktt-list.onrender.com`.
6. Open that address: you should see an empty list. Open `/admin` and log in to check your password works.
7. Send that address to whoever builds flock.tt (or put it in `DEFAULT_LIST_URL` in `src/streamerList.js`) and release a new version. From then on the app asks creators whether to join.

Two things to know about free hosting:

- **It falls asleep** when nobody's used it for a while, and takes up to a minute to wake. flock.tt checks in every 4 minutes, so a creator may take a few minutes to appear. Nothing breaks.
- **Its disk is wiped** when it restarts or you redeploy. The "live now" part rebuilds itself within minutes (everyone live checks in again), but the history of past creators is lost. If you want to keep that, move to a paid plan with a persistent disk, or a small VPS. Check the host's current prices; they change.

**When you outgrow it:** any small Linux server works (Hetzner, DigitalOcean, a Raspberry Pi with a tunnel …):
install Node, copy the `registry` folder, run `OWNER_TOKEN=… PUBLIC=1 node server.js` under a process manager (e.g. `systemd` or `pm2`),
and put it behind HTTPS (e.g. Caddy). Keep `DATA_FILE` on a disk that survives restarts.

## Being fair to creators

- Keep the in-app question and the privacy page (flocktt.xyz/privacy.html#list) accurate if you change what's collected.
- Honour removal requests: `/admin` → **Remove**. Anyone can claim a public @username while that account isn't live,
  so if a creator says they never used flock.tt, remove them.
- With `PUBLIC=1`, anyone (including other developers) can see and copy the whole list. Set `PUBLIC=0` if you'd
  rather only you see it; the app works the same either way.
