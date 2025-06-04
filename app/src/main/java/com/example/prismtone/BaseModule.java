package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

public abstract class BaseModule {
    protected final Context context;
    protected final ModuleInfo info;

    public BaseModule(Context context, ModuleInfo info) {
        this.context = context;
        this.info = info;
    }

    /**
     * Initialize the module - load and validate data
     * @return true if initialization succeeded
     */
    public abstract boolean initialize();

    /**
     * Apply the module's settings to the application
     * @return true if settings were applied successfully
     */
    public abstract boolean apply();

    /**
     * Cleanup resources when the module is unloaded
     * @return true if cleanup succeeded
     */
    public boolean onUnload() {
        // Default implementation does nothing
        return true;
    }

    /**
     * Gets the ID of this module
     */
    public String getId() {
        return info.getId();
    }

    /**
     * Gets the type of this module
     */
    public String getType() {
        return info.getType();
    }

    /**
     * Gets the name of this module
     */
    public String getName() {
        return info.getName();
    }

    /**
     * Gets the description of this module
     */
    public String getDescription() {
        return info.getDescription();
    }

    /**
     * Gets the version of this module
     */
    public String getVersion() {
        return info.getVersion();
    }

    /**
     * Gets the raw module data
     */
    protected JsonObject getData() {
        return info.getData();
    }
}
