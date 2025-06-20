package com.example.prismtone;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.ViewModelProvider;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private PrismtoneBridge bridge;
    private MainViewModel viewModel;
    private ModuleManager moduleManager;
    private WebViewAssetLoader assetLoader;
    private SensorController sensorController;

    @SuppressLint({"SetJavaScriptEnabled", "WrongConstant"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        hideSystemBars();

        viewModel = new ViewModelProvider(this).get(MainViewModel.class);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new CorsAssetsPathHandler(this))
                .setDomain("appassets.androidplatform.net")
                .build();

        webView = findViewById(R.id.webview);
        webView.setWebViewClient(new LocalContentWebViewClient(assetLoader));

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(false); // Безопасность: обычно false
        webSettings.setAllowUniversalAccessFromFileURLs(false); // Безопасность: обычно false
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        WebView.setWebContentsDebuggingEnabled(true); // Для разработки

        moduleManager = new ModuleManager(this, viewModel);
        bridge = new PrismtoneBridge(this, webView, viewModel, moduleManager);
        webView.addJavascriptInterface(bridge, "PrismtoneBridge");

        sensorController = new SensorController(this, bridge);

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        moduleManager.scanModules();
    }

    private static class LocalContentWebViewClient extends WebViewClient {
        private final WebViewAssetLoader mAssetLoader;

        LocalContentWebViewClient(WebViewAssetLoader assetLoader) {
            mAssetLoader = assetLoader;
        }

        @Override
        @Nullable
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri requestedUri = request.getUrl();
            return mAssetLoader.shouldInterceptRequest(requestedUri);
        }
    }

    @SuppressLint("WrongConstant")
    private void hideSystemBars() {
        WindowInsetsControllerCompat windowInsetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (windowInsetsController == null) {
            return;
        }
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars());
        windowInsetsController.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript("if(window.app && typeof window.app.resumeAudio === 'function') app.resumeAudio(); else console.warn('app.resumeAudio not found');", null);
        }
        if (sensorController != null) sensorController.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (sensorController != null) sensorController.stop();
        if (webView != null) {
            webView.onPause();
            webView.evaluateJavascript("if(window.app && typeof window.app.suspendAudio === 'function') app.suspendAudio(); else console.warn('app.suspendAudio not found');", null);
            webView.evaluateJavascript("if(window.triggerSaveSettingsOnPause) window.triggerSaveSettingsOnPause(); else console.warn('window.triggerSaveSettingsOnPause not found');", null);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.stopLoading();
            webView.getSettings().setJavaScriptEnabled(false);
            webView.clearHistory();
            webView.clearCache(true);
            webView.loadUrl("about:blank");
            webView.onPause();
            webView.removeAllViews();
            webView.destroyDrawingCache();
            webView.destroy();
            webView = null;
            Log.d("MainActivity", "WebView destroyed");
        }
        super.onDestroy();
    }
}