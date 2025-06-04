package com.example.prismtone;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class ModuleValidator {
    private static final Set<String> VALID_MODULE_TYPES = new HashSet<>(Arrays.asList(
        "soundpreset", "fxchain", "theme", "language", "visualizer", "effect", "scale"
    ));

    /**
     * Validates a module JSON structure
     * @return true if the module is valid
     */
    public boolean validateModule(JsonObject moduleJson) {
        if (moduleJson == null) {
            return false;
        }

        // Check required fields
        if (!hasRequiredFields(moduleJson)) {
            return false;
        }

        // Check module type
        String moduleType = moduleJson.get("type").getAsString();
        if (!VALID_MODULE_TYPES.contains(moduleType)) {
            return false;
        }

        // Validate module data based on type
        if (moduleJson.has("data")) {
            return validateModuleData(moduleType, moduleJson.getAsJsonObject("data"));
        }

        return true;
    }

    /**
     * Checks if the module has all required fields
     */
    private boolean hasRequiredFields(JsonObject moduleJson) {
        return moduleJson.has("id") && !moduleJson.get("id").getAsString().isEmpty() &&
               moduleJson.has("type") && !moduleJson.get("type").getAsString().isEmpty() &&
               moduleJson.has("name") && !moduleJson.get("name").getAsString().isEmpty() &&
               moduleJson.has("version") && !moduleJson.get("version").getAsString().isEmpty() &&
               moduleJson.has("description") &&
               moduleJson.has("active");
    }

    /**
     * Validates module data based on module type
     */
    private boolean validateModuleData(String moduleType, JsonObject data) {
        if (data == null) {
            return false;
        }

        switch (moduleType) {
            case "soundpreset":
                return validateSoundPresetData(data);
            case "fxchain":
                return validateFxChainData(data);
            case "theme":
                return validateThemeData(data);
            case "language":
                return validateLanguageData(data);
            case "visualizer":
                return validateVisualizerData(data);
            case "effect":
                return validateEffectData(data);
            case "scale":
                return validateScaleData(data);
            default:
                return false;
        }
    }

    private boolean validateSoundPresetData(JsonObject data) {
        // Sound preset must have oscillator or envelope or filter
        return data.has("oscillator") || data.has("envelope") || data.has("filter");
    }

    private boolean validateFxChainData(JsonObject data) {
        // FX chain must have effects array
        return data.has("effects") && data.get("effects").isJsonArray();
    }

    private boolean validateThemeData(JsonObject data) {
        // Theme must have colors object
        return data.has("colors") && data.get("colors").isJsonObject();
    }

    private boolean validateLanguageData(JsonObject data) {
        // Language must have strings object
        return data.has("strings") && data.get("strings").isJsonObject();
    }

    private boolean validateVisualizerData(JsonObject data) {
        // Minimal validation for visualizer
        return true;
    }

    private boolean validateEffectData(JsonObject data) {
        // Effect must have parameters array
        return data.has("parameters") && data.get("parameters").isJsonArray();
    }

    private boolean validateScaleData(JsonObject data) {
        // Scale must have intervals array
        return data.has("intervals") && data.get("intervals").isJsonArray();
    }
}
