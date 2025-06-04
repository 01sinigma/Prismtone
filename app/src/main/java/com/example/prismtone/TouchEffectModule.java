package com.example.prismtone;

import android.content.Context;
import com.google.gson.JsonObject;

public class TouchEffectModule extends BaseModule {
    public TouchEffectModule(Context context, ModuleInfo info) {
        super(context, info);
    }

    @Override
    public boolean initialize() {
        // Touch effects are initialized on the JavaScript side
        return true;
    }

    @Override
    public boolean apply() {
        // Touch effects are applied on the JavaScript side
        return true;
    }

    @Override
    public boolean onUnload() {
        // Cleanup is handled on the JavaScript side
        return true;
    }
} 