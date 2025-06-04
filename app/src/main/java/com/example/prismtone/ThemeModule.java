package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

public class ThemeModule extends BaseModule {
    private JsonObject colorSettings;

    public ThemeModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract color settings from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null || !data.has("colors")) {
            return false;
        }

        colorSettings = data.getAsJsonObject("colors");
        return colorSettings != null && colorSettings.size() > 0;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - settings will be fetched via getColors()
        return true;
    }

    /**
     * Gets the color settings for this theme
     */
    public JsonObject getColors() {
        return colorSettings;
    }
}
