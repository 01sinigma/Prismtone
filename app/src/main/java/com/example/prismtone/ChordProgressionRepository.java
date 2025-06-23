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

public class ChordProgressionRepository {
    private static final String TAG = "ChordProgressionRepository";
    private static ChordProgressionRepository instance;
    private final Context context;
    private final File progressionDir;
    private final Gson gson; // gson instance is already available
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;

    private ChordProgressionRepository(Context context) {
        this.context = context.getApplicationContext();
        // Путь изменен на modules/chordProgression
        this.progressionDir = new File(context.getExternalFilesDir(null), "modules/chordProgression");
        this.gson = new Gson();
        this.executorService = Executors.newSingleThreadExecutor();
        this.mainThreadHandler = new Handler(Looper.getMainLooper());

        if (!progressionDir.exists()) {
            progressionDir.mkdirs();
        }
    }

    public static synchronized ChordProgressionRepository getInstance(Context context) {
        if (instance == null) {
            instance = new ChordProgressionRepository(context);
        }
        return instance;
    }

    /**
     * Returns a list of all user-created chord progressions
     */
    public List<JsonObject> getUserProgressions() {
        List<JsonObject> progressions = new ArrayList<>();

        File[] files = progressionDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return progressions;

        for (File file : files) {
            try {
                String json = FileUtils.readFile(file);
                JsonObject progression = gson.fromJson(json, JsonObject.class);
                progressions.add(progression);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        return progressions;
    }

    /**
     * Save a progression
     */
    public void saveProgression(JsonObject progression, String successCallbackName, String errorCallbackName, WebView webView) {
        executorService.execute(() -> {
            try {
                // Generate a unique ID
                String id = "user_" + System.currentTimeMillis();

                // Set the ID in the progression data
                progression.addProperty("id", id);

                // Create directory if needed (progressionDir уже должен быть создан конструктором, но проверим)
                if (!progressionDir.exists()) {
                    progressionDir.mkdirs();
                }

                // Create the progression file
                File progressionFile = new File(progressionDir, id + ".json");

                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(progression);
                FileUtils.writeFile(progressionFile, jsonOutput);

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
                Log.e(TAG, "Error saving progression", e);
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
     * Save a chord progression from JSONObject
     */
    public void saveChordProgression(JSONObject progression, String successCallbackName, String errorCallbackName, WebView webView) { // Метод переименован для консистентности, параметр тоже
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(progression.toString()).getAsJsonObject();
            saveProgression(jsonObject, successCallbackName, errorCallbackName, webView); // Вызываем основной метод saveProgression
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
     * Deletes a user chord progression
     * @return true if deleted successfully
     */
    public boolean deleteProgression(String progressionId) { // Метод и параметр переименованы
        // Don't allow deletion of default progressions
        if (!progressionId.startsWith("user_")) {
            return false;
        }
        // Ensure file operations are not on main thread if they could be slow,
        // however, delete is generally fast. For now, keeping it synchronous.
        // If performance issues arise, consider moving to executorService as well.
        File progressionFile = new File(progressionDir, progressionId + ".json");
        return progressionFile.exists() && progressionFile.delete();
    }
}