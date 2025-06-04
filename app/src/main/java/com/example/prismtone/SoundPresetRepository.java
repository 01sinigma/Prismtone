package com.example.prismtone;

import android.content.Context;
import android.util.Log;

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
import java.util.UUID;

public class SoundPresetRepository {
    private static final String TAG = "SoundPresetRepository";
    private static SoundPresetRepository instance;
    private final Context context;
    private final File presetDir;
    private final Gson gson;

    private SoundPresetRepository(Context context) {
        this.context = context.getApplicationContext();
        this.presetDir = new File(context.getExternalFilesDir(null), "modules/soundpreset");
        this.gson = new Gson();
        
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
    public String savePreset(JsonObject preset) {
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
            
            try {
                // Fixed: Using Gson to properly format the JSON with indentation
                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(preset);
                FileUtils.writeFile(presetFile, jsonOutput);
                
                // Return the ID
                return id;
            } catch (IOException e) {
                Log.e(TAG, "Error saving preset file", e);
                return "Error: " + e.getMessage();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving preset", e);
            return "Error: " + e.getMessage();
        }
    }
    
    /**
     * Save a sound preset from JSONObject
     */
    public String saveSoundPreset(JSONObject preset) {
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(preset.toString()).getAsJsonObject();
            return savePreset(jsonObject);
        } catch (Exception e) {
            Log.e(TAG, "Error converting JSONObject to JsonObject", e);
            return "Error: " + e.getMessage();
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
        
        File presetFile = new File(presetDir, presetId + ".json");
        return presetFile.exists() && presetFile.delete();
    }
}
