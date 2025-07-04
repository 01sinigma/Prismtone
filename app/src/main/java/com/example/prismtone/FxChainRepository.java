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

public class FxChainRepository {
    private static FxChainRepository instance;
    private final File chainDir;
    private final Gson gson;
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;
    private static final String TAG = "FxChainRepository";

    private FxChainRepository(Context context) {
        this.chainDir = new File(context.getExternalFilesDir(null), "modules/fxchain");
        this.gson = new GsonBuilder().setPrettyPrinting().create();
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
        if (files != null) {
            for (File file : files) {
                try {
                    String content = FileUtils.readFile(file);
                    JsonObject chain = gson.fromJson(content, JsonObject.class);
                    chains.add(chain);
                } catch (IOException e) {
                    Log.e(TAG, "Error reading chain file: " + file.getName(), e);
                }
            }
        }
        return chains;
    }

    /**
     * Asynchronously saves an FxChain in a background thread.
     * @param chain The JSON object of the FxChain.
     * @param successCallbackName The name of the JS function to call on success.
     * @param errorCallbackName The name of the JS function to call on error.
     * @param bridge The bridge instance to call JS functions.
     */
    public void saveChain(JsonObject chain, String successCallbackName, String errorCallbackName, PrismtoneBridge bridge) {
        executorService.execute(() -> {
            try {
                String id = "user_" + System.currentTimeMillis();
                chain.addProperty("id", id);

                File chainFile = new File(chainDir, id + ".json");
                String jsonOutput = gson.toJson(chain);
                FileUtils.writeFile(chainFile, jsonOutput);

                bridge.callJsFunctionOnMainThread(successCallbackName, id);
            } catch (IOException e) {
                Log.e(TAG, "Error saving chain file", e);
                String errorMessage = "Error: " + e.getMessage();
                bridge.callJsFunctionOnMainThread(errorCallbackName, errorMessage);
            }
        });
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
