// Файл: app/src/main/assets/js/config/audioConfig.js
// Централизованная конфигурация аудио движка Prismtone

const audioConfig = {

    /**
     * Определяет порядок следования основных аудио-компонентов в цепочке голоса.
     */
    voiceAudioChainOrder: [
        'oscillator',
        'amplitudeEnv',
        'filter',
        // 'VOICE_INSERT_FX_SLOT', // <--- ДОБАВЛЕННЫЙ МАРКЕР
        'outputGain'
    ],

    /**
     * Список идентификаторов компонентов, которые являются модуляторами
     */
    modulatorComponents: [
        'pitchEnvelope',
        'filterEnvelope',
        'lfo1',
    ],

    // <<<--- ДОБАВЛЕННАЯ СТРОКА ---
    /**
     * Максимальное количество одновременно звучащих голосов.
     */
    polyphony: 6, // Попробуем значение 6 (или 4, если 6 не поможет)
    // --- КОНЕЦ ДОБАВЛЕННОЙ СТРОКИ ---

    /**
     * Реестр менеджеров компонентов.
     */
    componentManagersRegistry: {
        // Заполняется автоматически при загрузке файлов менеджеров
    },

    /**
     * Регистрирует менеджер компонента в реестре.
     */
    registerManager(componentId, managerObject) {
        if (!componentId || !managerObject) {
            console.error("[AudioConfig] Invalid arguments for registerManager:", componentId, managerObject);
            return;
        }
        if (this.componentManagersRegistry.hasOwnProperty(componentId)) {
            console.warn(`[AudioConfig] Manager for component ID '${componentId}' is being overwritten.`);
        }
        this.componentManagersRegistry[componentId] = managerObject;
        console.log(`[AudioConfig] Registered manager for: ${componentId}`);
    },

    /**
     * Получает менеджер по ID компонента.
     */
    getManager(componentId) {
        const manager = this.componentManagersRegistry[componentId];
        if (!manager) {
            // console.warn(`[AudioConfig] Manager not found for component ID: ${componentId}`); // Уменьшаем шум
        }
        return manager || null;
    }
};

// window.audioConfig = audioConfig; // Раскомментировать, если нужен глобальный доступ