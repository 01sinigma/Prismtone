package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public class EffectModule extends BaseModule {
    private JsonArray parameters;

    public EffectModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract effect parameters from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null || !data.has("parameters")) {
            return false;
        }

        parameters = data.getAsJsonArray("parameters");
        return parameters != null && parameters.size() > 0;
    }

    @Override
    public boolean apply() {
        // Nothing to do here - parameters will be fetched via getParameters()
        return true;
    }

    /**
     * Gets the effect parameters
     */
    public JsonArray getParameters() {
        return parameters;
    }
}
