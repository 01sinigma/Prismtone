/**
 * @file settingsManager.js
 * @description
 * This manager is responsible for loading and saving application settings in Prismtone.
 * It interacts with the native Android bridge to persist settings and can also load
 * default settings from a JSON configuration file if native settings are unavailable.
 * Key functionalities include:
 * - Initializing with a reference to the main application.
 * - Loading settings from either the native bridge or a default JSON file.
 * - Providing a mechanism to apply these loaded settings to the application state.
 * - Collecting relevant parts of the application state for persistence.
 * - Saving the application state to the native bridge, with an option for immediate or debounced saving.
 * - Implementing a debounce mechanism for saving frequently changed settings to optimize performance.
 */

// Файл: app/src/main/assets/js/managers/settingsManager.js
const settingsManager = {
    appRef: null, // Ссылка на главный объект app
    isInitialized: false,
    isLoading: false,
    isSaving: false,
    debounceTimeoutId: null,
    debounceDelay: 1500, // 1.5 секунды задержки для сохранения часто изменяемых настроек

    defaultSettingsPath: 'https://appassets.androidplatform.net/assets/config/defaultAppSettings.json', // Полный путь

    /**
     * Initializes the settings manager with a reference to the main application instance.
     * @param {object} appInstance - A reference to the main `app` object.
     */
    init(appInstance) {
        if (this.isInitialized) {
            console.warn("[SettingsManager] Already initialized.");
            return;
        }
        this.appRef = appInstance;
        if (!this.appRef) {
            console.error("[SettingsManager.init] App reference not provided!");
            return;
        }
        this.isInitialized = true;
        console.log("[SettingsManager] Initialized. Debounce delay:", this.debounceDelay);
    },

    /**
     * Loads settings by first attempting to fetch them from the native bridge.
     * If native settings are unavailable or an error occurs, it falls back to loading
     * default settings from a predefined JSON file path (`defaultSettingsPath`).
     * This is an internal method primarily called by `loadAndApplySettings`.
     *
     * @private
     * @async
     * @returns {Promise<object|null>} A promise that resolves to an object containing the loaded settings,
     *                                   or `null` if settings could not be loaded from any source.
     */
    async _loadSettings() {
        if (!this.isInitialized || !this.appRef) {
            console.error("[SettingsManager._loadSettings] Not initialized or appRef missing.");
            return null;
        }
        if (this.isLoading) {
            console.warn("[SettingsManager._loadSettings] Settings are already being loaded.");
            return null; // Или вернуть Promise, который уже в процессе
        }
        this.isLoading = true;
        console.log("[SettingsManager._loadSettings] Attempting to load settings...");

        let nativeSettings = null;
        if (this.appRef.state.isBridgeReady) {
            try {
                console.log("[SettingsManager._loadSettings] Fetching all settings from native bridge...");
                const settingsJson = await bridgeFix.callBridge('getAllSettings');
                if (settingsJson) {
                    nativeSettings = JSON.parse(settingsJson);
                    console.log("[SettingsManager._loadSettings] Successfully loaded settings from native:", nativeSettings);
                } else {
                    console.warn("[SettingsManager._loadSettings] Native bridge returned null or empty settings.");
                }
            } catch (error) {
                console.error("[SettingsManager._loadSettings] Error loading settings from native bridge:", error);
                nativeSettings = null; // Ошибка при загрузке с моста
            }
        } else {
            console.warn("[SettingsManager._loadSettings] Bridge not ready, skipping native settings load.");
        }

        this.isLoading = false;

        if (nativeSettings && Object.keys(nativeSettings).length > 0) {
            return nativeSettings;
        } else {
            // Если с нативной стороны ничего не пришло, грузим дефолты из JSON
            console.log("[SettingsManager._loadSettings] No native settings found or error, attempting to load from default JSON.");
            return this._loadDefaultSettingsFromJSON();
        }
    },

    /**
     * Loads default application settings from a specified JSON file URL.
     * This method is used as a fallback if settings cannot be loaded from the native side.
     *
     * @private
     * @async
     * @returns {Promise<object|null>} A promise that resolves to an object containing the default settings,
     *                                   or `null` if fetching or parsing the JSON fails.
     */
    async _loadDefaultSettingsFromJSON() {
        try {
            console.log(`[SettingsManager._loadDefaultSettingsFromJSON] Fetching default settings from: ${this.defaultSettingsPath}`);
            const response = await fetch(this.defaultSettingsPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch default settings: ${response.status} ${response.statusText}`);
            }
            const defaultSettings = await response.json();
            console.log("[SettingsManager._loadDefaultSettingsFromJSON] Successfully loaded default settings from JSON:", defaultSettings);
            return defaultSettings;
        } catch (error) {
            console.error("[SettingsManager._loadDefaultSettingsFromJSON] Error loading default settings from JSON:", error);
            return null; // Возвращаем null при ошибке загрузки/парсинга JSON
        }
    },

    /**
     * Loads application settings (either from native storage or defaults) and returns them.
     * This is the primary method called by the main application during its initialization sequence
     * to retrieve the settings that should be applied to `app.state`.
     * If no settings can be loaded, it returns `null`, signaling the main app to use its own internal defaults.
     *
     * @async
     * @returns {Promise<object|null>} A promise that resolves to the loaded settings object,
     *                                   or `null` if no settings could be obtained.
     */
    async loadAndApplySettings() {
        if (!this.isInitialized) {
            console.error("[SettingsManager.loadAndApplySettings] Not initialized.");
            return null;
        }
        console.log("[SettingsManager.loadAndApplySettings] Starting load and apply process...");

        let loadedSettings = await this._loadSettings();

        if (loadedSettings && Object.keys(loadedSettings).length > 0) {
            console.log("[SettingsManager.loadAndApplySettings] Settings loaded/defaulted successfully:", loadedSettings);
            return loadedSettings;
        } else {
            console.warn("[SettingsManager.loadAndApplySettings] No settings could be loaded (native or JSON). App will use its internal defaults.");
            return null; // Сигнализируем app.js, что нужно использовать его собственные дефолты
        }
        // Применение к app.state будет происходить в app.js на основе возвращенного объекта
    },

    /**
     * Collects the parts of the application's current state (`this.appRef.state`) that are designated for saving.
     * This typically includes user preferences like theme, language, selected presets, UI states, etc.
     *
     * @private
     * @returns {object} An object containing the subset of `app.state` to be persisted.
     *                   Returns an empty object if `appRef` or `appRef.state` is unavailable.
     */
    _collectStateForSaving() {
        if (!this.appRef || !this.appRef.state) {
            console.error("[SettingsManager._collectStateForSaving] App reference or state is missing.");
            return {};
        }
        // Собираем только те поля, которые хотим сохранять
        const {
            theme, language, soundPreset, fxChain, visualizer, touchEffect,
            scale, octaveOffset, zoneCount, showNoteNames, showLines, yAxisControls
        } = this.appRef.state;

        return {
            theme, language, soundPreset, fxChain, visualizer, touchEffect,
            scale, octaveOffset, zoneCount, showNoteNames, showLines,
            yAxisControls: { ...yAxisControls } // Глубокое копирование для yAxisControls
        };
    },

    /**
     * Saves the current application settings (collected via `_collectStateForSaving`) to the native Android bridge.
     * This method handles the actual persistence of settings.
     * It includes a flag to prevent concurrent save operations unless `forceImmediate` is true.
     *
     * @async
     * @param {object} [options={}] - Options for the save operation.
     * @param {boolean} [options.forceImmediate=false] - If `true`, the save operation will proceed immediately,
     *                                                   bypassing checks for ongoing save operations. This is typically used
     *                                                   when a debounced save is triggered.
     * @returns {Promise<void>} A promise that resolves when the save operation is complete or if it was skipped.
     */
    async saveStateToNative(options = {}) {
        if (!this.isInitialized || !this.appRef?.state?.isBridgeReady) {
            console.warn("[SettingsManager.saveStateToNative] Not initialized or bridge not ready. Save skipped.");
            return;
        }
        if (this.isSaving && !options.forceImmediate) {
            console.log("[SettingsManager.saveStateToNative] Already saving, call queued or will be handled by debounce.");
            return;
        }

        this.isSaving = true;
        const settingsToSave = this._collectStateForSaving();
        console.log(`[SettingsManager.saveStateToNative] Saving settings to native (Immediate: ${!!options.forceImmediate}):`, JSON.parse(JSON.stringify(settingsToSave)));

        try {
            await bridgeFix.callBridge('saveAllSettings', JSON.stringify(settingsToSave));
            console.log("[SettingsManager.saveStateToNative] Settings successfully saved to native.");
        } catch (error) {
            console.error("[SettingsManager.saveStateToNative] Error saving settings to native:", error);
        } finally {
            this.isSaving = false;
        }
    },

    /**
     * Initiates a debounced save of the current application state to native storage.
     * If called multiple times within the `debounceDelay` period, only the last call will
     * trigger an actual save operation (using `saveStateToNative({ forceImmediate: true })`)
     * after the delay has elapsed. This is useful for settings that might change rapidly
     * (e.g., slider adjustments) to avoid excessive save operations.
     */
    debouncedSaveState() {
        if (!this.isInitialized) return;

        if (this.debounceTimeoutId) {
            clearTimeout(this.debounceTimeoutId);
        }
        this.debounceTimeoutId = setTimeout(() => {
            this.saveStateToNative({ forceImmediate: true }); // Дебаунс истек, сохраняем немедленно
            this.debounceTimeoutId = null;
        }, this.debounceDelay);
        // console.log("[SettingsManager.debouncedSaveState] Save call debounced."); // Можно раскомментировать для отладки
    }
};