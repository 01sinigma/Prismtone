package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

public class ScaleModule extends BaseModule {
    private int[] intervals;

    public ScaleModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Extract scale intervals from module data
        JsonObject data = getData().getAsJsonObject("data");
        if (data == null || !data.has("intervals")) {
            return false;
        }

        JsonArray intervalArray = data.getAsJsonArray("intervals");
        if (intervalArray == null || intervalArray.size() == 0) {
            return false;
        }

        intervals = new int[intervalArray.size()];
        for (int i = 0; i < intervalArray.size(); i++) {
            intervals[i] = intervalArray.get(i).getAsInt();
        }

        return true;
    }

    @Override
    public boolean apply() {
        // ZonesManager удалён, регистрация зон больше не требуется
        return true;
    }

    /**
     * Gets the scale intervals
     */
    public int[] getIntervals() {
        return intervals;
    }
}
