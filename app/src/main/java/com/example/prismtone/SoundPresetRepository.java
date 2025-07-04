package com.example.prismtone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SoundPresetRepository {
    private static final String TAG = "SoundPresetRepository";
    private static SoundPresetRepository instance;
    private final File presetDir;
    private final Gson gson;
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;

    private SoundPresetRepository(Context context) {
        this.presetDir = new File(context.getExternalFilesDir(null), "modules/soundpreset");
        this.gson = new GsonBuilder().setPrettyPrinting().create();
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
        if (files != null) {
            for (File file : files) {
                try {
                    String content = FileUtils.readFile(file);
                    JsonObject preset = gson.fromJson(content, JsonObject.class);
                    presets.add(preset);
                } catch (IOException e) {
                    Log.e(TAG, "Error reading preset file: " + file.getName(), e);
                }
            }
        }
        return presets;
    }

    /**
     * Asynchronously saves a sound preset in a background thread.
     * @param preset The JSON object of the preset.
     * @param successCallbackName The name of the JS function to call on success.
     * @param errorCallbackName The name of the JS function to call on error.
     * @param bridge The bridge instance to call JS functions.
     */
    public void savePreset(JsonObject preset, String successCallbackName, String errorCallbackName, PrismtoneBridge bridge) {
        executorService.execute(() -> {
            try {
                String id = "user_" + System.currentTimeMillis();
                preset.addProperty("id", id);

                File presetFile = new File(presetDir, id + ".json");
                String jsonOutput = gson.toJson(preset);
                FileUtils.writeFile(presetFile, jsonOutput);

                bridge.callJsFunctionOnMainThread(successCallbackName, id);
            } catch (IOException e) {
                Log.e(TAG, "Error saving preset file", e);
                String errorMessage = "Error: " + e.getMessage();
                bridge.callJsFunctionOnMainThread(errorCallbackName, errorMessage);
            }
        });
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
