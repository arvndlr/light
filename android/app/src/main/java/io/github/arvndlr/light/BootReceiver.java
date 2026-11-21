package io.github.arvndlr.light;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Brings the "Open Light instead?" nudge back after a restart or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try { NudgeService.sync(c); } catch (Exception ignored) { }
    }
}
