package com.example.prismtone;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ChordProgressionRepository {
    private static final String TAG = "ChordProgressionRepo";
    private static ChordProgressionRepository instance;
    private final File progressionDir;
    private final Gson gson;
    
    // >>> OPTIMIZATION: Добавляем ExecutorService для фоновых операций <<<
    private final ExecutorService executorService;
    private final Handler mainThreadHandler;

    private ChordProgressionRepository(Context context) {
        this.progressionDir = new File(context.getExternalFilesDir(null), "modules/chordProgression");
        this.gson = new GsonBuilder().setPrettyPrinting().create();
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

    // Метод getUserProgressions остается синхронным, так как чтение обычно быстрое
    public List<JsonObject> getUserProgressions() {
        List<JsonObject> progressions = new ArrayList<>();
        File[] files = progressionDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files != null) {
            for (File file : files) {
                try {
                    String content = FileUtils.readFile(file);
                    JsonObject progression = gson.fromJson(content, JsonObject.class);
                    progressions.add(progression);
                } catch (IOException e) {
                    Log.e(TAG, "Error reading progression file: " + file.getName(), e);
                }
            }
        }
        return progressions;
    }

    /**
     * >>> OPTIMIZATION: Асинхронное сохранение прогрессии в фоновом потоке. <<<
     * @param progression JSON-объект прогрессии.
     * @param successCallbackName Имя JS-функции для вызова при успехе.
     * @param errorCallbackName Имя JS-функции для вызова при ошибке.
     * @param bridge Ссылка на мост для вызова JS.
     */
    public void saveProgression(JsonObject progression, String successCallbackName, String errorCallbackName, PrismtoneBridge bridge) {
        executorService.execute(() -> {
            try {
                String id = "user_" + System.currentTimeMillis();
                progression.addProperty("id", id);
                
                File progressionFile = new File(progressionDir, id + ".json");
                String jsonOutput = gson.toJson(progression);
                FileUtils.writeFile(progressionFile, jsonOutput);

                // Вызываем коллбэк успеха в главном потоке
                bridge.callJsFunctionOnMainThread(successCallbackName, id);
            } catch (IOException e) {
                Log.e(TAG, "Error saving progression file", e);
                String errorMessage = "Error: " + e.getMessage();
                // Вызываем коллбэк ошибки в главном потоке
                bridge.callJsFunctionOnMainThread(errorCallbackName, errorMessage);
            }
        });
    }

    // Метод deleteProgression остается синхронным, так как удаление - очень быстрая операция.
    public boolean deleteProgression(String progressionId) {
        if (!progressionId.startsWith("user_")) {
            return false;
        }
        File progressionFile = new File(progressionDir, progressionId + ".json");
        return progressionFile.exists() && progressionFile.delete();
    }
}