package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

public class LanguageModule extends BaseModule {
    private JsonObject stringSettings;

    public LanguageModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract string settings from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null || !data.has("strings")) {
            return false;
        }

        stringSettings = data.getAsJsonObject("strings");
        return stringSettings != null && stringSettings.size() > 0;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - settings will be fetched via getStrings()
        return true;
    }

    /**
     * Gets the string settings for this language
     */
    public JsonObject getStrings() {
        return stringSettings;
    }
}
