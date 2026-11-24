# Tiktak-m

A TikTok LIVE interaction toolkit in the spirit of TikFinity. It runs on your own computer and does four things:

- **Connects to any TikTok LIVE** by username and shows chat, gifts, likes, follows, shares and joins as they happen.
- **Runs Actions & Events rules.** When a trigger fires (a gift, follow, share, likes, a chat command or keyword, a join or a super fan), it shows an on-screen alert with an image, a sound and text-to-speech.
- **Serves overlays** for TikTok LIVE Studio or OBS: alerts, chat box, goal bars, top gifters and a "latest follower/gift" ticker.
- **Includes a simulator**, so you can test everything without going LIVE.

## Quick start

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open **http://localhost:8787**, type your TikTok username, and click **Connect**. You have to be LIVE for the connection to succeed. If auto-reconnect is on, it keeps retrying every 30s until you go live.

## Adding overlays to your stream

Copy a URL from the **Overlays** tab:

| Overlay | URL | Options |
|---|---|---|
| Alerts + sounds + TTS | `/overlays/alerts.html` | `?volume=0.5`, `?tts=0` |
| Chat box | `/overlays/chat.html` | `?max=8`, `?events=0`, `?fade=30` |
| Goal bar | `/overlays/goal.html?goal=likes` | `goal=likes\|follows\|coins\|shares` |
| Top gifters | `/overlays/gifters.html` | `?count=5`, `?title=...` |
| Ticker | `/overlays/ticker.html` | |

- **TikTok LIVE Studio:** add a *Link* source and paste the URL.
- **OBS:** add a *Browser* source and paste the URL. Tick "Control audio via OBS" if you want the sounds and TTS in your stream mix.

## Custom sounds

Put `.mp3` or `.wav` files in `public/sounds/`. Then reference one in a rule as `/sounds/my-sound.mp3`.

## Configuration

Settings are saved to `data/config.json`, which is git-ignored. Environment variables:

- `PORT` (default `8787`)
- `HOST` (default `127.0.0.1`). Set it to `0.0.0.0` to open the overlays from another device on your network.

## How it works

```
TikTok LIVE ──► src/tiktok.js ──► src/engine.js ──► Socket.IO ──► dashboard + overlays
 (tiktok-live-connector)   normalize    stats + rules        (public/)
```

- `src/tiktok.js` wraps [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) and turns its events into one simple shape.
- `src/engine.js` tracks stats and top gifters, matches events against rules, and emits `alert` and `tts` actions.
- `src/simulate.js` generates fake events for testing.
- `src/server.js` runs the Express and Socket.IO server and the REST API.

## Notes

- `tiktok-live-connector` is an **unofficial**, reverse-engineered library. TikTok changes can break it, so keep it updated (`npm update tiktok-live-connector`).
- Connections are signed through the Euler Stream sign server. The free tier is rate-limited. You can add an API key in **Settings**.
- The streak (combo) gifts are counted once, when the streak ends.

## Ideas for next steps

- Keystroke and mouse actions for games (gift → key press)
- Minecraft, Streamer.bot and OBS WebSocket integrations
- Viewer points and a leaderboard that persist across streams
- Wheel of fortune, polls and "like counter" overlays
- Overlay style editor (fonts, colors and positions)
- Package as a desktop app with Electron
