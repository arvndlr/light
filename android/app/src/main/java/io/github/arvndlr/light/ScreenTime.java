package io.github.arvndlr.light;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Foreground time per app per day, rebuilt from Android's usage events
 * (the same source Digital Wellbeing uses). A "day" starts at `rollover` o'clock,
 * matching Light, so 1 AM scrolling counts toward the evening before.
 *
 * Output: { granted: true, days: { "2026-11-20": [ { p, n, m, c }, … ] } }
 * p = package, n = app name, m = minutes, c = Android's app category (game, video, social…)
 */
final class ScreenTime {
    private static final long HOUR = 3_600_000L;
    // UsageEvents.Event type numbers (constants vary by API level, values don't).
    private static final int RESUMED = 1, PAUSED = 2, STOPPED = 23, SCREEN_OFF = 16, SHUTDOWN = 26;

    private ScreenTime() { }

    static JSONObject compute(Context ctx, int days, int rollover) throws JSONException {
        UsageStatsManager um = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        PackageManager pm = ctx.getPackageManager();
        long now = System.currentTimeMillis(), roll = rollover * HOUR;
        long start = dayStart(now, roll);
        for (int i = 1; i < days; i++) start = dayStart(start - HOUR, roll);

        Set<String> skip = new HashSet<>();
        skip.add(ctx.getPackageName());
        for (ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)) {
            skip.add(r.activityInfo.packageName); // launchers aren't "apps you used"
        }

        Map<String, Long> open = new HashMap<>();
        Map<String, Map<String, Long>> perDay = new TreeMap<>();
        UsageEvents ev = um.queryEvents(start, now);
        UsageEvents.Event e = new UsageEvents.Event();
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            int t = e.getEventType();
            String p = e.getPackageName();
            long ts = e.getTimeStamp();
            if (t == RESUMED) {
                // Another app coming to the front closes anything we missed a pause for.
                for (Iterator<Map.Entry<String, Long>> it = open.entrySet().iterator(); it.hasNext(); ) {
                    Map.Entry<String, Long> o = it.next();
                    if (!o.getKey().equals(p)) { add(perDay, o.getKey(), o.getValue(), ts, roll); it.remove(); }
                }
                if (!open.containsKey(p)) open.put(p, ts);
            } else if (t == PAUSED || t == STOPPED) {
                Long s = open.remove(p);
                if (s != null) add(perDay, p, s, ts, roll);
            } else if (t == SCREEN_OFF || t == SHUTDOWN) {
                for (Map.Entry<String, Long> o : open.entrySet()) add(perDay, o.getKey(), o.getValue(), ts, roll);
                open.clear();
            }
        }
        for (Map.Entry<String, Long> o : open.entrySet()) add(perDay, o.getKey(), o.getValue(), now, roll);

        Map<String, String[]> info = new HashMap<>();
        JSONObject out = new JSONObject();
        for (Map.Entry<String, Map<String, Long>> d : perDay.entrySet()) {
            ArrayList<JSONObject> list = new ArrayList<>();
            for (Map.Entry<String, Long> a : d.getValue().entrySet()) {
                String p = a.getKey();
                double mins = Math.round(a.getValue() / 6000.0) / 10.0;
                if (mins < 1 || skip.contains(p)) continue;
                String[] meta = info.get(p);
                if (meta == null) { meta = describe(pm, p); info.put(p, meta); }
                if (meta == null) continue; // not a launchable app (system service, keyboard…)
                list.add(new JSONObject().put("p", p).put("n", meta[0]).put("m", mins).put("c", meta[1]));
            }
            list.sort((x, y) -> Double.compare(y.optDouble("m"), x.optDouble("m")));
            JSONArray arr = new JSONArray();
            for (JSONObject j : list) arr.put(j);
            out.put(d.getKey(), arr);
        }
        return new JSONObject().put("granted", true).put("days", out).put("at", now);
    }

    /** [name, category] for a launchable app, or null. */
    @SuppressWarnings("deprecation")
    private static String[] describe(PackageManager pm, String p) {
        if (pm.getLaunchIntentForPackage(p) == null) return null;
        try {
            ApplicationInfo ai = pm.getApplicationInfo(p, 0);
            String cat;
            switch (ai.category) {
                case ApplicationInfo.CATEGORY_GAME: cat = "game"; break;
                case ApplicationInfo.CATEGORY_AUDIO: cat = "audio"; break;
                case ApplicationInfo.CATEGORY_VIDEO: cat = "video"; break;
                case ApplicationInfo.CATEGORY_IMAGE: cat = "image"; break;
                case ApplicationInfo.CATEGORY_SOCIAL: cat = "social"; break;
                case ApplicationInfo.CATEGORY_NEWS: cat = "news"; break;
                case ApplicationInfo.CATEGORY_MAPS: cat = "maps"; break;
                case ApplicationInfo.CATEGORY_PRODUCTIVITY: cat = "productivity"; break;
                default: cat = (ai.flags & ApplicationInfo.FLAG_IS_GAME) != 0 ? "game" : "";
            }
            return new String[] { String.valueOf(pm.getApplicationLabel(ai)), cat };
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    /** Adds [from, to) to each day it covers. */
    private static void add(Map<String, Map<String, Long>> perDay, String p, long from, long to, long roll) {
        while (from < to) {
            long next = dayStart(from, roll) + 24 * HOUR;
            long end = Math.min(to, next);
            Map<String, Long> day = perDay.computeIfAbsent(key(from, roll), k -> new HashMap<>());
            day.merge(p, end - from, Long::sum);
            from = end;
        }
    }

    /** When the Light day containing ts began (local time). */
    private static long dayStart(long ts, long roll) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ts - roll);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis() + roll;
    }

    /** Light-day key for today, and for n days ago. */
    static String todayKey(int rollover) { return keyDaysAgo(0, rollover); }

    static String keyDaysAgo(int n, int rollover) {
        long roll = rollover * HOUR, ts = dayStart(System.currentTimeMillis(), roll);
        for (int i = 0; i < n; i++) ts = dayStart(ts - HOUR, roll);
        return key(ts, roll);
    }

    private static String key(long ts, long roll) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(ts - roll);
    }
}
