package com.example.prismtone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView; // Added import

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale; // Added import
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FxChainRepository {
    private static FxChainRepository instance;
    private final Context context;
    private final File chainDir;
    private final Gson gson; // gson instance is already available
    private static final String TAG = "FxChainRepository";
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;

    private FxChainRepository(Context context) {
        this.context = context.getApplicationContext();
        this.chainDir = new File(context.getExternalFilesDir(null), "modules/fxchain");
        this.gson = new Gson();
        this.executorService = Executors.newSingleThreadExecutor();
        this.mainThreadHandler = new Handler(Looper.getMainLooper());

        if (!chainDir.exists()) {
            chainDir.mkdirs();
        }
    }

    public static synchronized FxChainRepository getInstance(Context context) {
        if (instance == null) {
            instance = new FxChainRepository(context);
        }
        return instance;
    }

    /**
     * Returns a list of all user-created FX chains
     */
    public List<JsonObject> getUserFxChains() {
        List<JsonObject> chains = new ArrayList<>();

        File[] files = chainDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return chains;

        for (File file : files) {
            try {
                String json = FileUtils.readFile(file);
                JsonObject chain = gson.fromJson(json, JsonObject.class);
                chains.add(chain);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        return chains;
    }

    /**
     * Save a chain
     */
    public void saveChain(JsonObject chain, String successCallbackName, String errorCallbackName, WebView webView) {
        executorService.execute(() -> {
            try {
                // Generate a unique ID
                String id = "user_" + System.currentTimeMillis();

                // Set the ID in the chain data
                chain.addProperty("id", id);

                // Create directory if needed
                File userDir = new File(context.getExternalFilesDir(null), "modules/fxchain");
                if (!userDir.exists()) {
                    userDir.mkdirs();
                }

                // Create the chain file
                File chainFile = new File(userDir, id + ".json");

                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(chain);
                FileUtils.writeFile(chainFile, jsonOutput);

                // Post success to main thread
                final String script = String.format(Locale.US, "%s(%s)", successCallbackName, gson.toJson(id));
                mainThreadHandler.post(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript(script, null);
                    } else {
                        Log.e(TAG, "WebView is null, cannot execute success callback for " + successCallbackName);
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error saving chain", e);
                // Post error to main thread
                final String errorMsg = "Error: " + e.getMessage();
                final String script = String.format(Locale.US, "%s(%s)", errorCallbackName, gson.toJson(errorMsg));
                mainThreadHandler.post(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript(script, null);
                    } else {
                        Log.e(TAG, "WebView is null, cannot execute error callback for " + errorCallbackName);
                    }
                });
            }
        });
    }

    /**
     * Save an FX chain from JSONObject
     */
    public void saveFxChain(JSONObject chain, String successCallbackName, String errorCallbackName, WebView webView) {
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(chain.toString()).getAsJsonObject();
            saveChain(jsonObject, successCallbackName, errorCallbackName, webView);
        } catch (Exception e) {
            Log.e(TAG, "Error converting JSONObject to JsonObject", e);
            // Post error to main thread
            final String errorMsg = "Error: " + e.getMessage();
            final String script = String.format(Locale.US, "%s(%s)", errorCallbackName, gson.toJson(errorMsg));
            mainThreadHandler.post(() -> {
                if (webView != null) {
                    webView.evaluateJavascript(script, null);
                } else {
                    Log.e(TAG, "WebView is null, cannot execute error callback for " + errorCallbackName + " during JSON conversion.");
                }
            });
        }
    }

    /**
     * Deletes a user FX chain
     * @return true if deleted successfully
     */
    public boolean deleteFxChain(String chainId) {
        // Don't allow deletion of default chains
        if (!chainId.startsWith("user_")) {
            return false;
        }
        // Ensure file operations are not on main thread if they could be slow,
        // however, delete is generally fast. For now, keeping it synchronous.
        // If performance issues arise, consider moving to executorService as well.
        File chainFile = new File(chainDir, chainId + ".json");
        return chainFile.exists() && chainFile.delete();
    }
}
