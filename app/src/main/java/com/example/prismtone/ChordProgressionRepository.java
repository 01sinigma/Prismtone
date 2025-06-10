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

public class ChordProgressionRepository {
    private static final String TAG = "ChordProgressionRepository";
    private static ChordProgressionRepository instance;
    private final Context context;
    private final File progressionDir;
    private final Gson gson;

    private ChordProgressionRepository(Context context) {
        this.context = context.getApplicationContext();
        // Путь изменен на modules/chordProgression
        this.progressionDir = new File(context.getExternalFilesDir(null), "modules/chordProgression");
        this.gson = new Gson();
        
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
    public String saveProgression(JsonObject progression) {
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
            
            try {
                // Fixed: Using Gson to properly format the JSON with indentation
                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(progression);
                FileUtils.writeFile(progressionFile, jsonOutput);
                
                // Return the ID
                return id;
            } catch (IOException e) {
                Log.e(TAG, "Error saving progression file", e);
                return "Error: " + e.getMessage();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving progression", e);
            return "Error: " + e.getMessage();
        }
    }
    
    /**
     * Save a chord progression from JSONObject
     */
    public String saveChordProgression(JSONObject progression) { // Метод переименован для консистентности, параметр тоже
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(progression.toString()).getAsJsonObject();
            return saveProgression(jsonObject); // Вызываем основной метод saveProgression
        } catch (Exception e) {
            Log.e(TAG, "Error converting JSONObject to JsonObject", e);
            return "Error: " + e.getMessage();
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
        
        File progressionFile = new File(progressionDir, progressionId + ".json");
        return progressionFile.exists() && progressionFile.delete();
    }
} 