package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public class FxChainModule extends BaseModule {
    private JsonArray effectsSettings;

    public FxChainModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract effects settings from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null || !data.has("effects")) {
            return false;
        }

        effectsSettings = data.getAsJsonArray("effects");
        return effectsSettings != null && effectsSettings.size() > 0;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - settings will be fetched via getEffects()
        return true;
    }

    /**
     * Gets the effects settings for this FX chain
     */
    public JsonArray getEffects() {
        return effectsSettings;
    }
}
