# Flockt

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

Open **http://localhost:8787**, type your TikTok username, and click **Connect**. The Live page has a three-step checklist for first-time setup. Press `/` (or Ctrl+K) anywhere to search for an overlay, alert, sound, setting or quick action. You have to be LIVE for the connection to succeed. If auto-reconnect is on, it keeps retrying every 30s until you go live.

## Look and themes

The look is **Flockt Dusk**, taken from the sky at the moment a murmuration of starlings rises: twilight navy above, an *afterglow* peach at the horizon (the signature colour for live, buttons and focus), and dusk tones for events: sunlit gold (coins), rosé (likes), tide blue (shares), lavender (subscribes) and sage (connected). Headlines and numbers use Unbounded, text uses Manrope, data uses IBM Plex Mono. The logo is a flock of birds swooping across a dusk sky; it drifts while you're live. Overlay panels carry three small birds on their top-left corner.

Every overlay comes in four themes. Add `?theme=` to its link, pick one on the Overlays page, or set it per overlay (or for a whole layout) in the Layout editor:

| Theme | Feel |
|---|---|
| `dusk` (default) | Navy panels, afterglow and gold accents |
| `mint` | Deep teal panels, mint and lime accents |
| `candy` | Light, bright panels with pink and sky accents |
| `mono` | Black and white |

Fonts load from Google Fonts; without internet everything falls back to system fonts.

## Overlays

Copy a URL from the **Overlays** page. In TikTok LIVE Studio, add it as a *Link* source. In OBS, add it as a *Browser* source.

| Overlay | URL | Options |
|---|---|---|
| Alerts (also plays sounds + TTS) | `/overlays/alerts.html` | `volume=0.5`, `tts=0`, `sounds=0`, `style=plain`, `accent=%23ff0000` |
| Sound player (audio only) | `/overlays/sounds.html` | `volume=0.5`. Use instead of Alerts, not together |
| Layout (several overlays in one) | `/overlays/scene.html?layout=main` | `layout=` the layout's id |
| Gift jar | `/overlays/jar.html` | `goal=1000`, `title=...`, `max=260` (coins on screen) |
| Spin wheel | `/overlays/wheel.html` | `items=A,B,C`, `min=100` or `gift=Rose` or `cmd=!spin`, `cooldown=30`, `hide=1`, `sound=0` |
| Team battle | `/overlays/battle.html` | `a=Red&b=Blue`, `ga=Rose&gb=TikTok`, `time=180`, `likes=1`, `ca=`/`cb=` colors |
| Like race | `/overlays/race.html` | `by=likes\|coins`, `goal=300`, `lanes=5` |
| Top gift spotlight | `/overlays/topgift.html` | `mode=gift\|streak` |
| Emoji rain | `/overlays/emojis.html` | `mode=rain\|float`, `size=46`, `likes=1` |
| Celebrations | `/overlays/celebrate.html` | `min=100`, `follows=0`, `subs=0`, `text=0` |
| Chat | `/overlays/chat.html` | `max=8`, `events=0`, `fade=30` |
| Gift combos | `/overlays/combos.html` | `max=5`, `hold=4` |
| Like hearts | `/overlays/hearts.html` | `side=left\|center\|right`, `max=60` |
| Ticker | `/overlays/ticker.html` | |
| Top gifters / likers | `/overlays/gifters.html` | `by=coins\|likes`, `count=5`, `title=...` |
| Counter | `/overlays/counter.html?stat=likes` | `stat=likes\|viewers\|coins\|follows\|shares\|comments`, `label=...`, `bg=0` |
| Live stats | `/overlays/stats.html` | `show=viewers,likes,coins,follows,shares,comments,gifts,subs,time`, `layout=row\|column\|rotate`, `every=5`, `bg=0` |
| Subathon timer | `/overlays/timer.html` | `label=...`, `bg=0` |
| Goal bar | `/overlays/goal.html?goal=likes` | `goal=likes\|follows\|coins\|shares` |

## Layout editor (one link for everything)

Instead of adding a separate source for every overlay, open **Layout editor**:

1. Click overlays in the list on the left to add them to the canvas (1080 × 1920 for a phone stream, or 1920 × 1080).
2. Drag to move, drag a corner to resize (Shift keeps the shape), and set each overlay's options in the panel on the right.
3. The shaded areas show roughly where TikTok's own buttons and comments cover the screen, so you can keep things out of the way.
4. Press **Save** and add the one link, `/overlays/scene.html?layout=main`, to TikTok LIVE Studio or OBS. Later changes show up on stream as soon as you save, with no need to touch the source again.

**Landscape:** pick *Landscape · 1920 × 1080* to build for a horizontal stream. Switching keeps every overlay's size and moves it to the same spot on the new shape; full-screen effects refill the canvas. An empty layout offers a ready-made starter set for its orientation, and the guides switch to a 5% safe area.

**Full screen:** press **Full screen** (or F) to give the whole window to the canvas. H hides the side panels, P shows a clean preview exactly as viewers will see it, Esc leaves full screen.

You can keep several layouts (for example one for chatting and one for games) and switch between them by changing the link.

Shortcuts: arrow keys nudge (Shift = 10 px), Delete removes, Ctrl+D duplicates, Ctrl+Z undoes, Ctrl+S saves, Esc deselects, F full screen, H panels, P preview. Hold Alt while dragging to turn off snapping.

## OBS

Flockt can control OBS Studio (version 28 or newer) through OBS's built-in WebSocket server.

1. In OBS: **Tools → WebSocket Server Settings**, tick **Enable WebSocket server** (port 4455), click **Show Connect Info** and copy the password.
2. In Flockt: open **OBS**, paste the password and click **Connect to OBS**. Tick "Connect when Flockt starts" to do this automatically.
3. Add **OBS actions**: when something happens (a gift, a coin range, a follow, a share, likes, a chat command, a join or a subscribe), Flockt can
   - switch to a scene, and optionally switch back after some seconds
   - show, hide or toggle a source, and optionally undo it after some seconds
   - mute, unmute or toggle an audio source

The **Scenes** panel lets you switch scenes by hand, and **What OBS did** lists every change Flockt made. The OBS password stays on your computer: it's saved in `data/config.json` and never sent to the browser or the overlays.

OBS on another computer? Use its address, e.g. `ws://192.168.1.20:4455`, and make sure your firewall allows the port.

## Sounds

The **Sounds** page maps events to sounds: a specific gift, a coin range, follows, shares, likes, chat commands, joins or subscribes. Each sound action has its own volume and cooldown. Gift sounds can play once per gift in a combo (5 Roses = 5 pops, capped at 10).

13 built-in sounds ship in `public/sounds/builtin`: airhorn, applause, boing, buzzer, chime, coin, ding, drumroll, laser, levelup, pop, tada and whoosh. They're generated by `node scripts/make-sounds.js`. Upload your own mp3/wav/ogg files on the Sounds page; they're saved to `public/sounds/custom`.

## Subathon timer

On the **Goals & timer** page, start the countdown. While it runs, coins, follows, shares, subscribes and every 100 likes add time (the amounts are configurable). You can also add or remove time by hand.

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
- Wheel of fortune and polls
- Minecraft and Streamer.bot integrations
- Viewer points and a leaderboard that persist across streams
- Overlay style editor (fonts, colors and positions)
- Saved overlay presets per game or stream type
- Package as a desktop app with Electron
