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

public class SoundPresetRepository {
    private static final String TAG = "SoundPresetRepository";
    // gson instance is already available in the class
    private static SoundPresetRepository instance;
    private final Context context;
    private final File presetDir;
    private final Gson gson;
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;

    private SoundPresetRepository(Context context) {
        this.context = context.getApplicationContext();
        this.presetDir = new File(context.getExternalFilesDir(null), "modules/soundpreset");
        this.gson = new Gson();
        this.executorService = Executors.newSingleThreadExecutor();
        this.mainThreadHandler = new Handler(Looper.getMainLooper());

        if (!presetDir.exists()) {
            presetDir.mkdirs();
        }
    }

    public static synchronized SoundPresetRepository getInstance(Context context) {
        if (instance == null) {
            instance = new SoundPresetRepository(context);
        }
        return instance;
    }

    /**
     * Returns a list of all user-created sound presets
     */
    public List<JsonObject> getUserPresets() {
        List<JsonObject> presets = new ArrayList<>();

        File[] files = presetDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return presets;

        for (File file : files) {
            try {
                String json = FileUtils.readFile(file);
                JsonObject preset = gson.fromJson(json, JsonObject.class);
                presets.add(preset);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        return presets;
    }

    /**
     * Save a preset
     */
    public void savePreset(JsonObject preset, String successCallbackName, String errorCallbackName, WebView webView) {
        executorService.execute(() -> {
            try {
                // Generate a unique ID
                String id = "user_" + System.currentTimeMillis();

                // Set the ID in the preset data
                preset.addProperty("id", id);

                // Create directory if needed
                File userDir = new File(context.getExternalFilesDir(null), "modules/soundpreset");
                if (!userDir.exists()) {
                    userDir.mkdirs();
                }

                // Create the preset file
                File presetFile = new File(userDir, id + ".json");

                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(preset);
                FileUtils.writeFile(presetFile, jsonOutput);

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
                Log.e(TAG, "Error saving preset", e);
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
     * Save a sound preset from JSONObject
     */
    public void saveSoundPreset(JSONObject preset, String successCallbackName, String errorCallbackName, WebView webView) {
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(preset.toString()).getAsJsonObject();
            savePreset(jsonObject, successCallbackName, errorCallbackName, webView);
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
     * Deletes a user sound preset
     * @return true if deleted successfully
     */
    public boolean deleteSoundPreset(String presetId) {
        // Don't allow deletion of default presets
        if (!presetId.startsWith("user_")) {
            return false;
        }

        // Ensure file operations are not on main thread if they could be slow,
        // however, delete is generally fast. For now, keeping it synchronous.
        // If performance issues arise, consider moving to executorService as well.
        File presetFile = new File(presetDir, presetId + ".json");
        return presetFile.exists() && presetFile.delete();
    }
}
