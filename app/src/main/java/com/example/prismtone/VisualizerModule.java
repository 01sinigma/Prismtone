package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

public class VisualizerModule extends BaseModule {
    private JsonObject visualizerSettings;

    public VisualizerModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract visualizer settings from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null) {
            return false;
        }

        visualizerSettings = data;
        return true;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - settings will be fetched via getSettings()
        return true;
    }

    /**
     * Gets the visualizer settings
     */
    public JsonObject getSettings() {
        return visualizerSettings;
    }
}
