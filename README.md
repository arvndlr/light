# Light ✨

Your all-in-one daily life app: focus, health, money, sleep, hygiene, character, emotional intelligence, comedy, and freedom from social media, gambling, fast food and soda.

It runs in any modern browser on a laptop or phone, works offline, and keeps all data **privately on the device** (no account, no server).

## Run it on your laptop

```bash
cd D:\Light
python -m http.server 5173
```

Then open http://localhost:5173. In Chrome/Edge, click the **install** icon in the address bar to get it as a desktop app.

## Run it on your phone

**Quick test (same Wi-Fi):** keep the command above running, find your laptop's IP (`ipconfig` → IPv4, e.g. 192.168.1.20) and open `http://192.168.1.20:5173` on your phone. Offline mode and "install" need HTTPS, so for daily use, host it:

**Recommended: free HTTPS hosting.** Upload this folder to GitHub Pages, Netlify Drop (drag & drop the folder at app.netlify.com/drop) or Cloudflare Pages. Open the link on your phone, then:
- **Android (Chrome):** ⋮ → *Install app* / *Add to Home screen*
- **iPhone (Safari):** Share → *Add to Home Screen*

Put the Light icon where your social media apps used to be.

## Your data

Data lives in the browser on each device. Your laptop and phone do **not** sync automatically. Use ⚙️ Settings → **Export backup** and **Import backup** to move data, and export now and then as a safety copy.

## What's inside

| Tab | What it does |
| --- | --- |
| **Today** | Level/XP orb, 10-min morning & evening check-ins, daily wisdom + EQ lesson + glow-up tip, goals & top 3 priorities, personalized recommendations, water tracker, daily quests, AM/PM hygiene, freedom streaks, joke of the day |
| **Money** | Quick expense/income logging, monthly budget ring, safe-to-spend per day, category breakdown, 14-day chart, cost of fast food/soda/gambling per year |
| **Feed** | Endless, healthy scroll: wisdom, EQ lessons, comedy techniques, jokes, glow-up tips, money tips, reflection prompts and real-life challenges (claim XP) |
| **Stats** | Life Score + 6 areas (Health & Sleep, Physical, Mental, Career, Money, EQ & Joy) with trends, charts, **1-year "Future You" projection**, and "Know yourself" pattern insights on your bad habits |
| **Grow** | Comedy gym + joke notebook, EQ lab, glow-up do/avoid guide, Freedom center (streaks, urge log, gambling help), journal, badges |
| **Urge? button** | 90-second urge-surfing breathing, your "why", healthy alternatives; log "I beat it" (+XP) or an honest slip |

## Files

- `index.html`: app shell
- `css/styles.css`: styles
- `js/app.js`: all app logic
- `js/content.js`: wisdom, lessons, jokes, tips (edit freely to add your own!)
- `sw.js`, `manifest.webmanifest`, `icons/`: offline + installable app support
- `tools/make-icons.js`: regenerates the PNG icons (`node tools/make-icons.js`)
