// Файл: app/src/main/java/com/example/prismtone/MainActivity.java
package com.example.prismtone;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.preference.PreferenceManager;
import android.util.Log;
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
    private SharedPreferences sharedPreferences; // <<< НОВОЕ

    @SuppressLint({"SetJavaScriptEnabled", "WrongConstant"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        hideSystemBars();

        // >>> НАЧАЛО ИЗМЕНЕНИЙ <<<
        viewModel = new ViewModelProvider(this).get(MainViewModel.class);
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);

        // Загружаем настройки. Логика определения языка теперь внутри ViewModel.
        viewModel.loadSettings(sharedPreferences);
        // >>> КОНЕЦ ИЗМЕНЕНИЙ <<<

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
        webSettings.setAllowFileAccessFromFileURLs(false);
        webSettings.setAllowUniversalAccessFromFileURLs(false);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        WebView.setWebContentsDebuggingEnabled(true);

        moduleManager = new ModuleManager(this, viewModel);
        bridge = new PrismtoneBridge(this, webView, viewModel, moduleManager);
        webView.addJavascriptInterface(bridge, "PrismtoneBridge");

        sensorController = new SensorController(this, bridge);
        if (bridge != null) {
            bridge.setSensorController(sensorController);
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        moduleManager.scanModulesAsync();
    }

    private static class LocalContentWebViewClient extends WebViewClient {
        private final WebViewAssetLoader mAssetLoader;
        LocalContentWebViewClient(WebViewAssetLoader assetLoader) {
            mAssetLoader = assetLoader;
        }
        @Override
        @Nullable
        public WebResourceResponse shouldInterceptRequest(WebView view, @NonNull WebResourceRequest request) {
            return mAssetLoader.shouldInterceptRequest(request.getUrl());
        }
    }

    @SuppressLint("WrongConstant")
    private void hideSystemBars() {
        WindowInsetsControllerCompat windowInsetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (windowInsetsController == null) return;
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
            webView.evaluateJavascript("if(window.app && typeof window.app.resumeAudio === 'function') app.resumeAudio();", null);
        }
        if (sensorController != null) sensorController.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // >>> НАЧАЛО ИЗМЕНЕНИЙ <<<
        // Сохраняем все настройки при сворачивании приложения
        if (viewModel != null && sharedPreferences != null) {
            viewModel.saveSettings(sharedPreferences);
            Log.d("MainActivity", "Settings saved onPause.");
        }
        // >>> КОНЕЦ ИZМЕНЕНИЙ <<<

        if (sensorController != null) sensorController.stop();
        if (webView != null) {
            webView.onPause();
            webView.evaluateJavascript("if(window.app && typeof window.app.suspendAudio === 'function') app.suspendAudio();", null);
            webView.evaluateJavascript("if(window.triggerSaveSettingsOnPause) window.triggerSaveSettingsOnPause();", null);
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
