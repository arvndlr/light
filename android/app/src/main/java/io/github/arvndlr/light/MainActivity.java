package io.github.arvndlr.light;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Light for Android: a thin shell around the live Light web app (so it updates itself
 * with every website deploy) plus a small native bridge, window.LightNative, for the
 * things a website can't do — mainly reading screen time per app.
 */
public class MainActivity extends Activity {
    static final String HOST = "arvndlr.github.io";
    static final String START = "https://arvndlr.github.io/light/";
    private static final int FILE_REQ = 7;

    private WebView web;
    private ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xFF080B16);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " LightAndroid/1");

        web.addJavascriptInterface(new Bridge(this), "LightNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String path = u.getPath() == null ? "" : u.getPath();
                if (HOST.equals(u.getHost()) && path.startsWith("/light")) return false; // stay in the app
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true; // other links open in the browser
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // <input type="file"> — used by "Import backup".
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQ);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(START);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILE_REQ && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // Lets the page refresh screen time after the user returns (e.g. from granting usage access).
        web.evaluateJavascript("window.dispatchEvent(new Event('lightnative-resume'))", null);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
