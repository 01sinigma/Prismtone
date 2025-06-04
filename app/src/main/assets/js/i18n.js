// Файл: app/src/main/assets/js/i18n.js
// Handles internationalization (i18n)
const i18n = {
    currentLanguage: 'en', // Default language
    strings: {}, // Stores translations for the current language { key: value, ... }
    elements: [], // Stores elements with data-i18n attributes found by collectElements
    isInitialized: false,

    /**
     * Initializes the i18n system. Should be called early.
     * @param {string} initialLanguage - The starting language ID.
     */
    init(initialLanguage = 'en') {
        console.log(`[i18n.init] Initializing with language: ${initialLanguage}`);
        this.currentLanguage = initialLanguage;
        // Собираем элементы сразу, чтобы они были готовы к первому обновлению
        this.collectElements();
        this.isInitialized = true;
        // Не загружаем язык здесь, app.js вызовет applyLanguage -> loadLanguage
    },

    /**
     * Finds and stores all elements needing translation. Can be called again if DOM changes.
     */
    collectElements() {
        console.log("[i18n.collectElements] Collecting elements for translation...");
        try {
            this.elements = document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title]');
            console.log(`[i18n.collectElements] Found ${this.elements.length} elements.`);
        } catch (error) {
             console.error("[i18n.collectElements] Error querying elements:", error);
             this.elements = [];
        }
    },

    /**
     * Loads language data for the given language ID from the module manager.
     * @param {string} languageId - e.g., 'en', 'ru'.
     */
    async loadLanguage(languageId) {
        if (!languageId) {
            console.warn('[i18n.loadLanguage] Called with null/empty languageId. Using current:', this.currentLanguage);
            languageId = this.currentLanguage; // Use current if none provided
        }
        console.log(`[i18n.loadLanguage] Attempting to load language: ${languageId}`);
        this.currentLanguage = languageId;
        this.strings = {}; // Clear previous strings before loading

        try {
            const langModule = await moduleManager.getModule(languageId);

            // Данные строк находятся в langModule.data.data.strings
            if (langModule?.data?.data?.strings) {
                this.strings = langModule.data.data.strings;
                console.log(`[i18n.loadLanguage] Language '${languageId}' loaded successfully with ${Object.keys(this.strings).length} strings.`);
                this.updateUI(); // Update UI after loading new strings
            } else {
                console.warn(`[i18n.loadLanguage] Language module or strings not found for ID: ${languageId}. UI will show keys.`);
                // this.strings остается пустым
                this.updateUI(); // Update UI to show keys as fallback
            }
        } catch (error) {
            console.error(`[i18n.loadLanguage] Error loading language ${languageId}:`, error, error.stack);
            this.strings = {}; // Clear strings on error
            this.updateUI(); // Update UI to show keys as fallback
        }
    },

    /**
     * Translates a given key using the loaded strings.
     * @param {string} key - The key to translate.
     * @param {string} [fallback] - Optional fallback text if key not found. If null, uses the key itself.
     * @returns {string} - The translated string or the key/fallback.
     */
    translate(key, fallback = null) {
        if (!key) return fallback || ''; // Handle null/empty key
        const translation = this.strings[key];
        if (translation !== undefined && translation !== null) {
            return translation;
        } else {
            // console.warn(`[i18n.translate] Translation key not found: '${key}'. Using fallback/key.`);
            return fallback !== null ? fallback : key; // Use provided fallback or the key itself
        }
    },

    /**
     * Updates all registered UI elements with current translations.
     */
    updateUI() {
        if (!this.isInitialized) {
             console.warn("[i18n.updateUI] i18n not initialized yet.");
             return;
        }
        console.log('[i18n.updateUI] Updating UI elements with current translations...');
        if (this.elements.length === 0) {
             console.warn("[i18n.updateUI] No elements collected for translation. Did collectElements run?");
             this.collectElements(); // Попробуем собрать снова
        }
        let updatedCount = 0;
        this.elements.forEach(el => {
            try {
                const key = el.dataset.i18n;
                const placeholderKey = el.dataset.i18nPlaceholder;
                const titleKey = el.dataset.i18nTitle;
                let updated = false;

                if (key) {
                    const translation = this.translate(key);
                    // Обновляем только если текст отличается или это не input/select/textarea
                    if (el.textContent !== translation && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                        el.textContent = translation;
                        updated = true;
                    }
                }
                if (placeholderKey && el.placeholder !== undefined) {
                    const translation = this.translate(placeholderKey);
                    if (el.placeholder !== translation) {
                        el.placeholder = translation;
                        updated = true;
                    }
                }
                 if (titleKey && el.title !== undefined) {
                    const translation = this.translate(titleKey);
                     if (el.title !== translation) {
                        el.title = translation;
                        updated = true;
                    }
                }
                if (updated) updatedCount++;
            } catch (error) {
                 console.error("[i18n.updateUI] Error updating element:", el, error);
            }
        });
        console.log(`[i18n.updateUI] UI update complete. Updated ${updatedCount} elements.`);
    }
};