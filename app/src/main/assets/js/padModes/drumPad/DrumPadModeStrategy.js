// [Контекст -> Архитектура] Это минимальная рабочая версия стратегии.
// Она пока ничего не делает, но соответствует интерфейсу, ожидаемому PadModeManager.
const DrumPadModeStrategy = {
    _isActive: false,

    init(appRef, musicTheoryService) {
        // [Контекст -> Логика] Метод init вызывается менеджером режимов один раз.
        console.log("[DrumPadStrategy] Stub Initialized.");
    },

    getName: () => "drum_pad",

    getDisplayName: () => i18n.translate('pad_mode_drum', 'Drum Pad'),

    // [Связь -> PadModeManager] Сообщаем менеджеру, что нам не нужны стандартные настройки тональности.
    requiresTonic: () => false,
    requiresScale: () => false,
    
    onModeActivated: () => {
        this._isActive = true;
        console.log("[DrumPadStrategy] Activated (stub).");
        // На этом этапе мы намеренно ничего не рисуем, чтобы убедиться, что пэд очищается.
    },

    onModeDeactivated: () => {
        this._isActive = false;
        console.log("[DrumPadStrategy] Deactivated (stub).");
    },

    // [Связь -> pad.js] Обработчик нажатия. Пока просто логирует.
    onPointerDown: (pointerId, x, y, currentZones, padContext) => {
        if (!this._isActive) return null;
        console.log(`[DrumPadStrategy] Pointer Down at x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`);
        return null; // Возвращаем null, чтобы synth.js ничего не делал.
    },
    
    // [Контекст -> Архитектура] Эти методы должны существовать для соответствия интерфейсу.
    onPointerMove: () => null,
    onPointerUp: () => null,
    
    // [Связь -> app.js] Сигнализируем, что мы не используем стандартную генерацию зон.
    getZoneLayoutOptions: (appState) => ({ isStandardLayout: false }),

    // [Связь -> pad.js] Возвращаем пустой массив, чтобы `pad.js` очистил все предыдущие зоны.
    generateZoneData: () => [],
    
    getPadVisualHints: () => []
};

// [Контекст -> Архитектура] Саморегистрация стратегии в PadModeManager.
if (typeof PadModeManager !== 'undefined') {
    PadModeManager.registerStrategy(DrumPadModeStrategy);
} 