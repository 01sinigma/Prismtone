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

public class FxChainRepository {
    private static FxChainRepository instance;
    private final Context context;
    private final File chainDir;
    private final Gson gson;
    private static final String TAG = "FxChainRepository";

    private FxChainRepository(Context context) {
        this.context = context.getApplicationContext();
        this.chainDir = new File(context.getExternalFilesDir(null), "modules/fxchain");
        this.gson = new Gson();
        
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
    public String saveChain(JsonObject chain) {
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
            
            try {
                // Fixed: Using Gson to properly format the JSON with indentation
                String jsonOutput = new GsonBuilder().setPrettyPrinting().create().toJson(chain);
                FileUtils.writeFile(chainFile, jsonOutput);
                
                // Return the ID
                return id;
            } catch (IOException e) {
                Log.e(TAG, "Error saving chain file", e);
                return "Error: " + e.getMessage();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving chain", e);
            return "Error: " + e.getMessage();
        }
    }
    
    /**
     * Save an FX chain from JSONObject
     */
    public String saveFxChain(JSONObject chain) {
        try {
            // Convert JSONObject to JsonObject
            JsonObject jsonObject = JsonParser.parseString(chain.toString()).getAsJsonObject();
            return saveChain(jsonObject);
        } catch (Exception e) {
            Log.e(TAG, "Error converting JSONObject to JsonObject", e);
            return "Error: " + e.getMessage();
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
        
        File chainFile = new File(chainDir, chainId + ".json");
        return chainFile.exists() && chainFile.delete();
    }
}
