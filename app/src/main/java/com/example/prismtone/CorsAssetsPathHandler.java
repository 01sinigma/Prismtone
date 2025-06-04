package com.example.prismtone; // Убедитесь, что пакет правильный

import android.content.Context;
import android.util.Log;
import android.webkit.WebResourceResponse;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * A custom PathHandler that wraps AssetsPathHandler to add CORS headers
 * and ensures a valid status code (200 OK) is always set for successful responses.
 */
public class CorsAssetsPathHandler implements WebViewAssetLoader.PathHandler {
    private static final String TAG = "CorsAssetsPathHandler";
    private final WebViewAssetLoader.AssetsPathHandler defaultHandler;

    public CorsAssetsPathHandler(Context context) {
        this.defaultHandler = new WebViewAssetLoader.AssetsPathHandler(context);
    }

    @Nullable
    @Override
    public WebResourceResponse handle(@NonNull String path) {
        WebResourceResponse response = null;
        try {
            response = defaultHandler.handle(path);
        } catch (Exception e) {
            Log.e(TAG, "Error in default AssetsPathHandler for path: " + path, e);
            return null;
        }

        // Если стандартный обработчик вернул ответ с данными
        if (response != null && response.getData() != null) {
            Map<String, String> headers = response.getResponseHeaders();
            if (headers == null) {
                headers = new HashMap<>();
            } else {
                headers = new HashMap<>(headers); // Создаем копию
            }

            // Добавляем CORS-заголовок
            headers.put("Access-Control-Allow-Origin", "*");

            // --- НОВОЕ ИСПРАВЛЕНИЕ: Всегда используем 200 OK для успешного ответа ---
            // Игнорируем statusCode и reasonPhrase из оригинального response,
            // так как они могут быть некорректными для локальных файлов.
            int statusCode = 200;
            String reasonPhrase = "OK";
            // --- КОНЕЦ НОВОГО ИСПРАВЛЕНИЯ ---

            Log.d(TAG, "Serving asset with CORS: " + path + " (Status: " + statusCode + ")");

            // Создаем новый WebResourceResponse с нашими заголовками и статусом 200 OK
            return new WebResourceResponse(
                    response.getMimeType(),
                    response.getEncoding(),
                    statusCode,      // Всегда 200
                    reasonPhrase,    // Всегда "OK"
                    headers,         // Наши заголовки
                    response.getData() // Оригинальный поток данных
            );
        } else {
            // Если файл не найден или данные null
            Log.d(TAG, "Asset not found or null data for path: " + path);
            return null;
        }
    }
}