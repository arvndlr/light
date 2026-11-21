package io.github.arvndlr.light;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * "Open Light instead?" — watches which app is in front (from the same usage events as
 * screen time) and, when you open an app you chose (TikTok, Facebook…), shows a card
 * over it: open Light for 60 seconds, or continue for a while. With a daily limit it
 * also comes back the moment you reach the limit. Nothing leaves the phone.
 *
 * Config (set by the web app through Bridge.setNudge), prefs "nudge" → "cfg":
 * { on, rollover, line, apps: { pkg: { n, limit } }, t: { title, opening, used, over, light, cont, contOver, chose } }
 */
public class NudgeService extends Service {
    static final String PREFS = "nudge";
    static volatile boolean running;
    private static final String CH_GUARD = "guard", CH_NUDGE = "nudge";
    private static final int RESUMED = 1, SCREEN_OFF = 16;
    private static final long MIN = 60_000L;

    private Handler h;
    private UsageStatsManager um;
    private PowerManager pm;
    private WindowManager wm;
    private JSONObject cfg = new JSONObject();
    private String fg;          // app in front right now
    private long lastQuery;
    private final Map<String, Long> allowUntil = new HashMap<>();
    private View card;
    private String cardPkg;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }

    static JSONObject config(Context c) {
        try { return new JSONObject(prefs(c).getString("cfg", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** Starts or stops the service to match the saved config. */
    static void sync(Context c) {
        JSONObject k = config(c);
        Intent i = new Intent(c, NudgeService.class);
        boolean want = k.optBoolean("on") && k.optJSONObject("apps") != null && k.optJSONObject("apps").length() > 0;
        if (want) {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } else {
            c.stopService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        h = new Handler(Looper.getMainLooper());
        um = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
        pm = (PowerManager) getSystemService(POWER_SERVICE);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        channels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        cfg = config(this);
        Notification n = new Notification.Builder(this, CH_GUARD)
            .setSmallIcon(android.R.drawable.star_on)
            .setContentTitle("Light is with you")
            .setContentText("A gentle nudge when you open " + appList())
            .setContentIntent(openLight(null, 1))
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        running = true;
        h.removeCallbacks(tick);
        lastQuery = System.currentTimeMillis() - 10 * MIN; // find what's in front now
        h.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        h.removeCallbacks(tick);
        hideCard();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            boolean on = pm.isInteractive();
            try { if (on) check(); } catch (Exception ignored) { }
            h.postDelayed(this, on ? 1500 : 10_000);
        }
    };

    private void check() {
        long now = System.currentTimeMillis();
        UsageEvents ev = um.queryEvents(Math.min(lastQuery, now - 5000), now);
        lastQuery = now - 3000; // overlap a little: events can land late
        UsageEvents.Event e = new UsageEvents.Event();
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            if (e.getEventType() == RESUMED) fg = e.getPackageName();
            else if (e.getEventType() == SCREEN_OFF) fg = null;
        }
        if (card != null && (fg == null || !fg.equals(cardPkg))) hideCard(); // you left the app on your own
        if (card != null || fg == null) return;
        JSONObject app = apps().optJSONObject(fg);
        if (app == null) return;
        Long until = allowUntil.get(fg);
        if (until != null && now < until) return;
        show(fg, app);
    }

    private JSONObject apps() {
        JSONObject a = cfg.optJSONObject("apps");
        return a == null ? new JSONObject() : a;
    }

    private String appList() {
        StringBuilder b = new StringBuilder();
        Iterator<String> it = apps().keys();
        int i = 0, total = apps().length();
        while (it.hasNext()) {
            String name = apps().optJSONObject(it.next()).optString("n", "an app");
            if (i > 0) b.append(i == total - 1 ? " or " : ", ");
            b.append(name);
            if (++i == 3 && total > 3) { b.append(" and more"); break; }
        }
        return b.toString();
    }

    private String t(String key, String fallback) {
        JSONObject tt = cfg.optJSONObject("t");
        String s = tt == null ? "" : tt.optString(key, "");
        return s.isEmpty() ? fallback : s;
    }

    private static String hm(int m) {
        if (m < 60) return m + "m";
        return (m / 60) + "h" + (m % 60 > 0 ? " " + (m % 60) + "m" : "");
    }

    /** Minutes the app has been open today (Light day). */
    private int usedToday(String pkg) {
        try {
            int roll = cfg.optInt("rollover", 3);
            JSONObject days = ScreenTime.compute(this, 1, roll).optJSONObject("days");
            if (days == null) return 0;
            org.json.JSONArray list = days.optJSONArray(ScreenTime.todayKey(roll));
            if (list == null) return 0;
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.getJSONObject(i);
                if (pkg.equals(a.optString("p"))) return (int) Math.round(a.optDouble("m"));
            }
        } catch (Exception ignored) { }
        return 0;
    }

    private void show(String pkg, JSONObject app) {
        String name = app.optString("n", "this app");
        int limit = app.optInt("limit", 0);
        int used = usedToday(pkg);
        boolean over = limit > 0 && used >= limit;
        String msg = over
            ? t("over", "You're past your {limit} {app} limit — {used} today.")
            : used >= 1 ? t("used", "You've used {app} for {used} today.") : t("opening", "You're opening {app}.");
        msg = msg.replace("{app}", name).replace("{used}", hm(used)).replace("{limit}", hm(limit));
        int snooze = over ? 5 : (limit > 0 ? Math.max(1, Math.min(15, limit - used)) : 15);
        String cont = (over ? t("contOver", "Continue · {min} min") : t("cont", "Continue to {app} · {min} min"))
            .replace("{app}", name).replace("{min}", String.valueOf(snooze));
        int chose = choseThisWeek();
        record(pkg, "s");

        if (!Settings.canDrawOverlays(this)) { notifyInstead(pkg, name, used, msg); allowUntil.put(pkg, System.currentTimeMillis() + snooze * MIN); return; }

        final long snoozeMs = snooze * MIN;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(26), dp(24), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF121829);
        bg.setCornerRadius(dp(24));
        bg.setStroke(dp(1), 0x33FFFFFF);
        box.setBackground(bg);

        box.addView(text("✨", 34, 0xFFFFFFFF, false));
        box.addView(text(t("title", "Open Light instead?"), 22, 0xFFFFFFFF, true), lp(10));
        box.addView(text(msg, 16, over ? 0xFFFF8A80 : 0xFFC9D1E6, false), lp(8));
        String line = cfg.optString("line", "");
        if (!line.isEmpty()) box.addView(text(line, 14, 0xFFFF9F43, false), lp(12));
        if (chose > 0) box.addView(text(t("chose", "This week you chose Light {n} times. Make it one more.").replace("{n}", String.valueOf(chose)), 13, 0xFF8A93AB, false), lp(8));

        Button light = button(t("light", "Open Light · 60 seconds"), true);
        light.setOnClickListener(v -> {
            record(pkg, "l");
            allowUntil.put(pkg, System.currentTimeMillis() + 15_000); // until Light is in front
            hideCard();
            // Allowed from the background: Light can draw over other apps and its card is on screen.
            try { startActivity(lightIntent(pkg + "|" + name + "|" + used)); } catch (Exception ignored) { }
        });
        box.addView(light, lp(20));
        Button go = button(cont, false);
        go.setOnClickListener(v -> {
            record(pkg, "c");
            allowUntil.put(pkg, System.currentTimeMillis() + snoozeMs);
            hideCard();
        });
        box.addView(go, lp(8));

        // Full-screen dim layer that holds the card; Back does nothing so you choose on purpose.
        LinearLayout root = new LinearLayout(this) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent ev) {
                return ev.getKeyCode() == KeyEvent.KEYCODE_BACK || super.dispatchKeyEvent(ev);
            }
        };
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xE6080B16);
        root.setPadding(dp(22), 0, dp(22), 0);
        root.addView(box, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.setFocusableInTouchMode(true);

        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        try {
            wm.addView(root, p);
            root.requestFocus();
            card = root;
            cardPkg = pkg;
        } catch (Exception ex) {
            notifyInstead(pkg, name, used, msg);
            allowUntil.put(pkg, System.currentTimeMillis() + snoozeMs);
        }
    }

    private void hideCard() {
        if (card == null) return;
        try { wm.removeView(card); } catch (Exception ignored) { }
        card = null;
        cardPkg = null;
    }

    /** Without "Display over other apps", a heads-up notification does the job. */
    private void notifyInstead(String pkg, String name, int used, String msg) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        Notification n = new Notification.Builder(this, CH_NUDGE)
            .setSmallIcon(android.R.drawable.star_on)
            .setContentTitle(t("title", "Open Light instead?"))
            .setContentText(msg)
            .setContentIntent(openLight(pkg + "|" + name + "|" + used, 3))
            .setAutoCancel(true)
            .build();
        nm.notify(2, n);
    }

    private Intent lightIntent(String nudge) {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (nudge != null) i.putExtra("nudge", nudge);
        return i;
    }

    private PendingIntent openLight(String nudge, int req) {
        return PendingIntent.getActivity(this, req, lightIntent(nudge), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void channels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel g = new NotificationChannel(CH_GUARD, "Open Light instead", NotificationManager.IMPORTANCE_MIN);
        g.setDescription("Keeps the nudge running. You can hide this notification.");
        g.setShowBadge(false);
        nm.createNotificationChannel(g);
        NotificationChannel n = new NotificationChannel(CH_NUDGE, "Nudges", NotificationManager.IMPORTANCE_HIGH);
        n.setDescription("Shown when Light can't draw over other apps.");
        nm.createNotificationChannel(n);
    }

    // ---- Counts per day: { "2026-11-21": { pkg: { s: shown, l: chose Light, c: continued } } } (last 30 days)
    private void record(String pkg, String what) {
        try {
            SharedPreferences sp = prefs(this);
            JSONObject all = new JSONObject(sp.getString("stats", "{}"));
            String day = ScreenTime.todayKey(cfg.optInt("rollover", 3));
            JSONObject d = all.optJSONObject(day);
            if (d == null) { d = new JSONObject(); all.put(day, d); }
            JSONObject a = d.optJSONObject(pkg);
            if (a == null) { a = new JSONObject(); d.put(pkg, a); }
            a.put(what, a.optInt(what) + 1);
            String cut = ScreenTime.keyDaysAgo(30, cfg.optInt("rollover", 3));
            for (Iterator<String> it = all.keys(); it.hasNext(); ) if (it.next().compareTo(cut) < 0) it.remove();
            sp.edit().putString("stats", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    /** Times you chose Light in the last 7 days. */
    private int choseThisWeek() {
        try {
            JSONObject all = new JSONObject(prefs(this).getString("stats", "{}"));
            String cut = ScreenTime.keyDaysAgo(6, cfg.optInt("rollover", 3));
            int n = 0;
            for (Iterator<String> it = all.keys(); it.hasNext(); ) {
                String k = it.next();
                if (k.compareTo(cut) < 0) continue;
                JSONObject d = all.getJSONObject(k);
                for (Iterator<String> a = d.keys(); a.hasNext(); ) n += d.getJSONObject(a.next()).optInt("l");
            }
            return n;
        } catch (Exception e) { return 0; }
    }

    // ---- Small view helpers
    private int dp(int v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private LinearLayout.LayoutParams lp(int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(top);
        return p;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private Button button(String s, boolean primary) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTextColor(primary ? 0xFF1A1206 : 0xFFC9D1E6);
        b.setTypeface(primary ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        b.setMinHeight(dp(52));
        b.setStateListAnimator(null);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(14));
        if (primary) g.setColor(0xFFFF9F43); else { g.setColor(0x00000000); g.setStroke(dp(1), 0x33FFFFFF); }
        b.setBackground(g);
        return b;
    }
}
