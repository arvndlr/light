# Light ✨

Your all-in-one daily life app: focus, health, money, sleep, hygiene, character, emotional intelligence, comedy, and freedom from social media, gambling, fast food and soda.

**Live app: https://arvndlr.github.io/light/**

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
| **Feed** | TikTok-style full-screen reels with **For You / Saved** tabs, topic filters (Laugh, Wisdom, Learn, Mind, Glow-up, Money), a "•••" menu (More like this / Not interested / Copy) and vivid animated color themes per topic: swipe up (or arrow keys), double-tap to like, save, reflect, share. A "For You" algorithm learns from likes, saves and how long you stay on each card. It remembers what you have seen (across sessions), so nothing repeats until a whole category is exhausted — 550+ cards in total. Card types: wisdom, did-you-know science facts, word of the day, quizzes, this-or-that polls, jokes with punchline reveal, EQ & comedy lessons, glow-up tips, breathing resets, real-life challenges, and cards about your own progress |
| **Stats** | Life Score + 6 areas (Health & Sleep, Physical, Mental, Career, Money, EQ & Joy) with trends, charts, **1-year "Future You" projection**, and "Know yourself" pattern insights on your bad habits |
| **Today → Right now** | A plan for the current part of your day (built from your wake/bed times): wake-up, deep work, midday, afternoon, evening, wind-down, sleep — each with suggestions that tick themselves off from your data, plus a full-day timeline |
| **Grow → Fitness** | 31 no-equipment home exercises (how-to, form tips, reps per level), 8 routines, a weekly plan, time-aware "recommended right now", and a guided interval player with voice cues |
| **Grow** | Comedy gym + joke notebook, EQ lab, glow-up do/avoid guide, Freedom center (streaks, urge log, gambling help), journal, badges |
| **Focus timer** | 15/25/50/90-min sessions that log focused minutes automatically, keep running if you close the app, and notify you when done |
| **Weekly review** | Every Fri–Sun: your week in numbers, best day, wins, goal progress sliders, one habit to improve and a commitment shown all next week |
| **Daily reward chest** | Complete both check-ins to open a chest: common, rare or legendary XP + a quote or joke |
| **Urge? button** | 90-second urge-surfing breathing, your "why", healthy alternatives; log "I beat it" (+XP) or an honest slip |

## Look & feel

Settings → **Appearance**: Auto / Dark / Light mode and four accent colors (Sunrise, Ocean, Aurora, Forest). The Today screen opens with a smart **Next up** card that always shows the single most useful thing to do right now.

## Reminders

Settings → **Add reminders to my calendar** downloads a calendar file with daily morning/evening check-in alarms and a Sunday weekly review. Open it on your phone to add them to Google/Apple/Outlook calendar. These are reliable even when the app is closed.

## Safety nets

- **Undo** on every delete.
- **Automatic daily snapshot**: Settings → *Restore automatic snapshot* rolls back to how your data looked at the start of the day.
- **Schema migrations**: older saved data is upgraded automatically; corrupt fields are repaired instead of crashing.
- **Error boundary**: if a screen fails, you see a recovery card (with Export backup) instead of a blank page.

## Development

```bash
npm test        # 49 unit tests for the core logic (Node 20+, no dependencies)
npm start       # serve on http://localhost:5173
```

Tests also run automatically on GitHub for every push (`.github/workflows/test.yml`).
When you change any file, bump `VERSION` in `sw.js` so installed apps pick up the update (users see a "new version ready" prompt).

## Files

- `index.html`: app shell
- `css/styles.css`: styles
- `js/app.js`: UI — screens, check-in wizards, focus timer, modals, actions
- `js/core.js`: domain logic — scores, streaks, XP, quests, badges, projection, insights, reminders (pure, unit-tested)
- `js/store.js`: saving, schema migrations, daily snapshot
- `js/feed.js`: "For You" feed algorithm (pure, unit-tested)
- `js/icons.js`: the app's line-icon set (open `tools/icon-sheet.html` to preview them all)
- `js/fitness.js`: exercises, routines, interval logic (unit-tested)
- `js/plan.js`: time-of-day plan for Today (unit-tested)
- `js/charts.js`: tiny SVG charts (rings, lines, bars, heatmap)
- `js/util.js`: date & text helpers
- `js/content.js` + `js/content-extra.js`: wisdom, lessons, jokes, quizzes, facts, words, tips (edit freely to add your own!)
- `tests/core.test.js`: unit tests
- `sw.js`, `manifest.webmanifest`, `icons/`: offline + installable app support
- `tools/make-icons.cjs`: regenerates the PNG icons (`npm run icons`)
