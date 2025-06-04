package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.HashMap;
import java.util.Map;

public class I18nManager {
    private static I18nManager instance;
    private final Context context;
    private final Map<String, JsonObject> languageStrings;
    private String currentLanguage;

    private I18nManager(Context context) {
        this.context = context.getApplicationContext();
        this.languageStrings = new HashMap<>();
        this.currentLanguage = "en"; // Default language
    }

    public static synchronized I18nManager getInstance(Context context) {
        if (instance == null) {
            instance = new I18nManager(context);
        }
        return instance;
    }

    /**
     * Registers a language module
     */
    public void registerLanguage(String languageId, JsonObject strings) {
        languageStrings.put(languageId, strings);
    }

    /**
     * Sets the current language
     */
    public void setCurrentLanguage(String languageId) {
        if (languageStrings.containsKey(languageId)) {
            this.currentLanguage = languageId;
        }
    }

    /**
     * Gets a translated string by key
     */
    public String getString(String key) {
        return getString(key, null);
    }

    /**
     * Gets a translated string by key with fallback
     */
    public String getString(String key, String fallback) {
        JsonObject strings = languageStrings.get(currentLanguage);
        if (strings != null && strings.has(key)) {
            JsonElement element = strings.get(key);
            if (element.isJsonPrimitive()) {
                return element.getAsString();
            }
        }
        
        // Try English as fallback
        if (!currentLanguage.equals("en")) {
            JsonObject enStrings = languageStrings.get("en");
            if (enStrings != null && enStrings.has(key)) {
                JsonElement element = enStrings.get(key);
                if (element.isJsonPrimitive()) {
                    return element.getAsString();
                }
            }
        }
        
        return fallback != null ? fallback : key;
    }

    /**
     * Gets all strings for the current language
     */
    public JsonObject getAllStrings() {
        return languageStrings.getOrDefault(currentLanguage, new JsonObject());
    }
}
