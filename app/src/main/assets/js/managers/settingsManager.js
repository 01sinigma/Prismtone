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
     * Инициализирует менеджер настроек.
     * @param {object} appInstance - Ссылка на главный объект приложения (app).
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
     * Загружает настройки с нативной стороны или из defaultAppSettings.json.
     * Не применяет их к app.state, а просто возвращает.
     * @returns {Promise<object|null>} Объект с настройками или null при ошибке.
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
     * Загружает настройки из файла defaultAppSettings.json.
     * @returns {Promise<object|null>}
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
     * Основной метод, вызываемый из app.js.
     * Загружает настройки и, если успешно, возвращает их.
     * Если загрузка не удалась, возвращает null, чтобы app.js использовал свои встроенные дефолты.
     * @returns {Promise<object|null>} Загруженные настройки или null.
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
     * Собирает текущее состояние из app.state для сохранения.
     * @returns {object} Объект с настройками для сохранения.
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
     * Сохраняет текущее состояние настроек на нативную сторону.
     * @param {object} [options={}]
     * @param {boolean} [options.forceImmediate=false] - Если true, сохраняет немедленно.
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
     * Отложенное сохранение состояния.
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