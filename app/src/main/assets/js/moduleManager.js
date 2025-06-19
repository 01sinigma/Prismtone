// Файл: app/src/main/assets/js/moduleManager.js
// Manages interaction with Java ModuleManager via the bridge
const moduleManager = {
    modules: {}, // Cache for loaded module lists { type: [ModuleInfo, ...], ... }
    moduleDataCache: {}, // Cache for individual module data { id: ModuleInfo, ... } - Storing full ModuleInfo

    async init() {
        console.log('[ModuleManager.init] Initializing...');
        // Pre-fetch common module types on init? Could improve perceived performance.
        // await this.getModules('soundpreset');
        // await this.getModules('fxchain');
        // await this.getModules('theme');
        // await this.getModules('language');
        // Or fetch on demand as currently implemented.
    },

    /**
     * Fetches the list of modules for a given type from the bridge.
     * Uses cache unless forceRefresh is true.
     * @param {string} moduleTypeInput - e.g., 'soundpreset', 'theme'
     * @param {boolean} forceRefresh - If true, bypasses cache.
     * @returns {Promise<Array<object>>} - Array of ModuleInfo objects (as received from Java).
     */
    async getModules(moduleTypeInput, forceRefresh = false) {
        // Apply lowercase normalization only for specific types if needed, otherwise keep original case
        let moduleType = moduleTypeInput;
        if (moduleTypeInput === 'fxChain') { // Assuming 'fxChain' is the only type expected in lowercase by Java
             moduleType = moduleTypeInput.toLowerCase(); // Normalisasi только для fxChain
        }
        // Для других типов (например, 'touchEffect', 'theme') оставляем исходный регистр

        console.log(`[ModuleManager.getModules] Input moduleType: ${moduleTypeInput}, forceRefresh: ${forceRefresh}. Processed type: ${moduleType}`);
        if (!moduleType) {
            console.error("[ModuleManager.getModules] Called with null or empty moduleType after processing.");
            return [];
        }

        if (!forceRefresh && this.modules[moduleType]) {
            console.log(`[ModuleManager.getModules] Returning cached modules for type: ${moduleType} (${this.modules[moduleType].length} items)`);
            return this.modules[moduleType];
        }

        console.log(`[ModuleManager.getModules] Fetching modules via bridge for type: ${moduleType} (Force refresh: ${forceRefresh})`);
        try {
            // TODO: Future Optimization: Implement a native bridge method (e.g., getModuleListSummary(moduleType))
            // that returns only essential fields (id, name, displayName, icon, etc.) for list displays.
            // This would reduce data transfer size from native to JS.
            // The current getModules call fetches full data for all modules of the type.
            const modulesJson = await bridgeFix.callBridge('getModules', moduleType);
            if (modulesJson) {
                const parsedModules = JSON.parse(modulesJson);
                // Basic validation
                if (Array.isArray(parsedModules)) {
                     console.log(`[ModuleManager.getModules] Fetched ${parsedModules.length} modules for ${moduleType}. Caching...`);
                     this.modules[moduleType] = parsedModules;
                     // Cache individual module data (the full ModuleInfo object)
                     parsedModules.forEach(mod => {
                         if (mod && mod.id) { // Basic check for valid module structure
                             this.moduleDataCache[mod.id] = mod; // Store the whole ModuleInfo object
                         } else {
                              console.warn(`[ModuleManager.getModules] Invalid module structure found in list for type ${moduleType}:`, mod);
                         }
                     });
                     return parsedModules;
                } else {
                    console.error(`[ModuleManager.getModules] Invalid module list format received for ${moduleType}. Expected array, got:`, typeof parsedModules);
                    this.modules[moduleType] = []; // Cache empty array
                    return [];
                }
            } else {
                 console.warn(`[ModuleManager.getModules] Received null or empty module list for ${moduleType} from bridge.`);
                 this.modules[moduleType] = [];
                 return [];
            }
        } catch (error) {
            console.error(`[ModuleManager.getModules] Error fetching or parsing modules for type ${moduleType}:`, error, error.stack);
            this.modules[moduleType] = []; // Return empty on error
            return [];
        }
    },

    /**
     * Gets the full ModuleInfo object for a specific module by its ID.
     * Uses cache first, then falls back to fetching the list if needed.
     * @param {string} moduleId - The unique ID of the module.
     * @returns {Promise<object|null>} - The ModuleInfo object including data, or null if not found.
     */
    async getModule(moduleId) {
        if (!moduleId) {
             console.warn("[ModuleManager.getModule] Called with null or empty moduleId.");
             return null;
        }

        if (this.moduleDataCache[moduleId]) {
            // console.log(`[ModuleManager.getModule] Returning cached data for module: ${moduleId}`);
            return this.moduleDataCache[moduleId];
        }

        console.log(`[ModuleManager.getModule] Module ${moduleId} not in cache, searching lists...`);
        const knownTypes = ['soundpreset', 'fxchain', 'theme', 'language', 'visualizer', 'effect', 'scale', 'touchEffect', 'chordProgression'];

        for (const type of knownTypes) {
             // Ensure list for this type is fetched if not already cached
             if (!this.modules[type]) {
                 console.log(`[ModuleManager.getModule] Cache miss for type ${type}, fetching list...`);
                 await this.getModules(type); // Fetch and cache the list
             }
             // Check the (potentially newly fetched) list
             const moduleList = this.modules[type];
             if (Array.isArray(moduleList)) {
                 const foundModule = moduleList.find(mod => mod && mod.id === moduleId);
                 if (foundModule) {
                     console.log(`[ModuleManager.getModule] Found module ${moduleId} in type ${type}`);
                     // Cache it again just in case (should already be cached by getModules)
                     this.moduleDataCache[moduleId] = foundModule;
                     return foundModule;
                 }
             } else {
                  console.warn(`[ModuleManager.getModule] Module list for type ${type} is not an array after fetching.`);
             }
        }

        console.warn(`[ModuleManager.getModule] Module with ID ${moduleId} not found after searching all known types.`);
        return null;
    },

    /**
     * Clears the module cache. Useful if modules are updated externally.
     */
    clearCache() {
        console.log('[ModuleManager.clearCache] Clearing module cache.');
        this.modules = {};
        this.moduleDataCache = {};
    },

    /**
     * Refreshes the cache for a specific module type or all types.
     * @param {string} [moduleType] - Optional. The type to refresh. If null, refreshes all known types.
     */
     async refreshCache(moduleType = null) {
         if (moduleType) {
             console.log(`[ModuleManager.refreshCache] Refreshing cache for type: ${moduleType}`);
             await this.getModules(moduleType, true); // Force refresh for specific type
         } else {
             console.log("[ModuleManager.refreshCache] Refreshing cache for all known types...");
             const knownTypes = Object.keys(this.modules); // Refresh types already in cache
             // Or use a predefined list:
             // const knownTypes = ['soundpreset', 'fxchain', 'theme', 'language', 'visualizer', 'effect', 'scale'];
             for (const type of knownTypes) {
                 await this.getModules(type, true);
             }
             console.log("[ModuleManager.refreshCache] All known types refreshed.");
         }
     },

    // Fetches module data (using getModules) and returns a summarized version
    // (id, name, displayName, etc.) suitable for list displays in the UI.
    // This helps UI components work with lighter objects.
    async getModuleSummaries(moduleTypeInput, forceRefresh = false) {
        // console.log(`[ModuleManager.getModuleSummaries] Requesting summaries for type: ${moduleTypeInput}`);
        const fullModules = await this.getModules(moduleTypeInput, forceRefresh); // Uses existing getModules

        if (Array.isArray(fullModules)) {
            const summaries = fullModules.map(mod => {
                if (mod && mod.id) { // Ensure basic structure
                    return {
                        id: mod.id,
                        name: mod.name || mod.id, // Fallback name to id if name is missing
                        // Attempt to find a displayable name. Common patterns:
                        // 1. A dedicated 'displayName' field.
                        // 2. 'name' field is already displayable.
                        // 3. 'name' is an i18n key, and we'd ideally translate it here if i18n was easily accessible.
                        //    For now, we'll assume 'name' or a 'displayName' property in the module data is sufficient.
                        displayName: mod.displayName || mod.name || mod.id,
                        // Include other minimal fields if consistently needed by UIs, e.g., 'icon', 'color'
                        // For now, keeping it minimal to id and name/displayName.
                        ...(mod.icon && { icon: mod.icon }), // Conditionally add icon if it exists
                        ...(mod.color && { color: mod.color }), // Conditionally add color
                    };
                }
                return null; // Or some default error object for invalid module structures
            }).filter(summary => summary !== null); // Filter out any nulls from invalid structures

            // console.log(`[ModuleManager.getModuleSummaries] Returning ${summaries.length} summaries for type: ${moduleTypeInput}`);
            return summaries;
        } else {
            console.warn(`[ModuleManager.getModuleSummaries] getModules did not return an array for type: ${moduleTypeInput}. Returning empty array.`);
            return [];
        }
    },
};