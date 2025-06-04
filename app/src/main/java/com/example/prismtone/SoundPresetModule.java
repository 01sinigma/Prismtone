package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

public class SoundPresetModule extends BaseModule {
    private JsonObject synthSettings;

    public SoundPresetModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract synth settings from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null) {
            return false;
        }

        synthSettings = new JsonObject();

        // Copy oscillator settings if present
        if (data.has("oscillator")) {
            synthSettings.add("oscillator", data.get("oscillator"));
        }

        // Copy envelope settings if present
        if (data.has("envelope")) {
            synthSettings.add("envelope", data.get("envelope"));
        }

        // Copy filter settings if present
        if (data.has("filter")) {
            synthSettings.add("filter", data.get("filter"));
        }

        return true;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - settings will be fetched via getSettings()
        return true;
    }

    /**
     * Gets the synth settings for this sound preset
     */
    public JsonObject getSettings() {
        return synthSettings;
    }
}
