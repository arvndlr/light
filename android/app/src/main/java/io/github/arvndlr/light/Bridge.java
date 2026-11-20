package io.github.arvndlr.light;

import android.app.Activity;
import android.app.AppOpsManager;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Process;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** window.LightNative — everything here stays on the phone; nothing is sent anywhere. */
public class Bridge {
    private final Activity act;

    Bridge(Activity act) { this.act = act; }

    @JavascriptInterface
    public int version() { return 1; }

    /** Has the user allowed Light in Settings → Usage access? */
    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public boolean hasUsageAccess() {
        AppOpsManager ops = (AppOpsManager) act.getSystemService(Activity.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), act.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), act.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** Opens the Usage access screen (straight to Light where the phone supports it). */
    @JavascriptInterface
    public void openUsageAccess() {
        act.runOnUiThread(() -> {
            try {
                act.startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + act.getPackageName())));
            } catch (Exception e) {
                try { act.startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); } catch (Exception ignored) { }
            }
        });
    }

    /** Minutes per app for the last `days` days as JSON (see ScreenTime). */
    @JavascriptInterface
    public String usage(int days, int rolloverHours) {
        if (!hasUsageAccess()) return "{\"granted\":false}";
        try {
            return ScreenTime.compute(act, Math.max(1, Math.min(days, 31)), rolloverHours).toString();
        } catch (Exception e) {
            return "{\"granted\":true,\"error\":\"" + e.getClass().getSimpleName() + "\"}";
        }
    }

    /** Saves a text file (the backup export) to Downloads. */
    @JavascriptInterface
    public boolean saveFile(String name, String text, String mime) {
        try {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                try (OutputStream o = act.getContentResolver().openOutputStream(uri)) { o.write(bytes); }
                where = "Downloads";
            } else {
                File f = new File(act.getExternalFilesDir(null), name);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); }
                where = f.getParent();
            }
            final String msg = "Saved " + name + " to " + where;
            act.runOnUiThread(() -> Toast.makeText(act, msg, Toast.LENGTH_LONG).show());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Android share sheet. */
    @JavascriptInterface
    public void share(String text) {
        act.runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            try { act.startActivity(Intent.createChooser(i, null)); } catch (Exception ignored) { }
        });
    }
}
