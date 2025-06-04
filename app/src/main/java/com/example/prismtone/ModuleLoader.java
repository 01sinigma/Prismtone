package com.example.prismtone;

import android.content.Context;

import com.google.gson.JsonObject;

import java.lang.reflect.Constructor;
import java.util.HashMap;
import java.util.Map;

public class ModuleLoader {
    private final Context context;
    private final ModuleRegistry registry;
    private final Map<String, BaseModule> loadedModules;

    public ModuleLoader(Context context, ModuleRegistry registry) {
        this.context = context;
        this.registry = registry;
        this.loadedModules = new HashMap<>();
    }

    /**
     * Loads a module based on its info
     */
    public BaseModule loadModule(ModuleInfo info) {
        String moduleId = info.getId();
        String moduleType = info.getType();
        
        // Check if already loaded
        if (loadedModules.containsKey(moduleId)) {
            return loadedModules.get(moduleId);
        }
        
        try {
            // Get the module class for this type
            Class<? extends BaseModule> moduleClass = registry.getModuleClass(moduleType);
            if (moduleClass == null) {
                throw new IllegalArgumentException("Unknown module type: " + moduleType);
            }
            
            // Create module instance using reflection
            Constructor<? extends BaseModule> constructor = moduleClass.getConstructor(Context.class, ModuleInfo.class);
            BaseModule module = constructor.newInstance(context, info);
            
            // Initialize the module
            if (module.initialize()) {
                loadedModules.put(moduleId, module);
                return module;
            } else {
                throw new RuntimeException("Failed to initialize module: " + moduleId);
            }
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    /**
     * Unloads a module by ID
     */
    public boolean unloadModule(String moduleId) {
        if (loadedModules.containsKey(moduleId)) {
            BaseModule module = loadedModules.get(moduleId);
            if (module.onUnload()) {
                loadedModules.remove(moduleId);
                return true;
            }
        }
        return false;
    }

    /**
     * Gets a loaded module by ID
     */
    public BaseModule getModule(String moduleId) {
        return loadedModules.get(moduleId);
    }

    /**
     * Gets a loaded module by ID and casts it to the specified type
     */
    @SuppressWarnings("unchecked")
    public <T extends BaseModule> T getModuleAs(String moduleId, Class<T> moduleClass) {
        BaseModule module = loadedModules.get(moduleId);
        if (module != null && moduleClass.isInstance(module)) {
            return (T) module;
        }
        return null;
    }
}
