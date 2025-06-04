package com.example.prismtone;

import java.util.HashMap;
import java.util.Map;

public class ModuleRegistry {
    private final Map<String, Class<? extends BaseModule>> moduleClasses;

    public ModuleRegistry() {
        moduleClasses = new HashMap<>();
        
        // Register built-in module types
        registerModuleClass("soundpreset", SoundPresetModule.class);
        registerModuleClass("fxchain", FxChainModule.class);
        registerModuleClass("theme", ThemeModule.class);
        registerModuleClass("language", LanguageModule.class);
        registerModuleClass("visualizer", VisualizerModule.class);
        registerModuleClass("effect", EffectModule.class);
        registerModuleClass("scale", ScaleModule.class);
        registerModuleClass("touchEffect", TouchEffectModule.class);
    }

    /**
     * Registers a module class for a specific module type
     */
    public void registerModuleClass(String moduleType, Class<? extends BaseModule> moduleClass) {
        moduleClasses.put(moduleType, moduleClass);
    }

    /**
     * Returns the module class for a specific module type
     */
    public Class<? extends BaseModule> getModuleClass(String moduleType) {
        return moduleClasses.get(moduleType);
    }
}
