const DrumPadModeStrategy = {
    _isActive: false,
    appRef: null,
    initialLayout: null,
    services: null,

    init(appRef, initialPadLayout, services) {
        this.appRef = appRef;
        this.initialLayout = initialPadLayout; // Store if needed, or use appRef for dynamic layout
        this.services = services; // Store if needed
        console.log("DrumPadModeStrategy initialized");
    },

    getName() {
        return "DrumPadMode";
    },

    getDisplayName() {
        return "Drum Pad";
    },

    requiresTonePlayer() {
        return false; // This mode uses Tone.Players directly, not the main synth's Tone.Player
    },

    async onModeActivated() {
        this._isActive = true;
        console.log("[DrumPadModeStrategy] Activated");
        // Инициализируем наш менеджер ударных
        const success = await drumPadManager.init('808_kit');
        if (success) {
            console.log("[DrumPadModeStrategy] drumPadManager initialized successfully.");
        } else {
            console.error("[DrumPadModeStrategy] drumPadManager initialization failed.");
            // Handle initialization failure, e.g., show a message to the user
        }
        // Запрашиваем перерисовку пэда, чтобы показать сетку 4x4
        if (this.appRef) {
            await this.appRef.updateZoneLayout();
        }
    },

    onModeDeactivated() {
        this._isActive = false;
        drumPadManager.dispose();
        console.log("[DrumPadModeStrategy] Deactivated and drumPadManager disposed.");
        // Request layout update if needed to clear the drum pad UI
        if (this.appRef) {
             this.appRef.updateZoneLayout(); // Or a more specific method to reset to default layout
        }
    },

    // Генерируем данные для сетки 4x4
    async generateZoneData(layoutContext, appState, services) {
        const zones = [];
        // Ensure players are loaded and get() returns the map of players
        const kitSoundPlayers = drumPadManager.isLoaded && drumPadManager.players ? drumPadManager.players.get() : new Map();
        const kitSounds = Array.from(kitSoundPlayers.keys());

        const grid_size = 4; // 4x4 grid

        for (let row = 0; row < grid_size; row++) {
            for (let col = 0; col < grid_size; col++) {
                const index = row * grid_size + col;
                const soundName = kitSounds[index] || "Empty"; // Берем звук по порядку

                zones.push({
                    index: index,
                    id: `drum-pad-${index}`, // Unique ID for the zone element
                    soundName: soundName, // Сохраняем имя звука для триггера
                    // Координаты для отрисовки сетки
                    startX: col / grid_size,
                    endX: (col + 1) / grid_size,
                    startY: row / grid_size,       // Добавляем Y-координаты
                    endY: (row + 1) / grid_size,
                    labelOverride: soundName, // Название пэда
                    type: 'drum_pad' // Важно для pad.js
                });
            }
        }
        console.log("[DrumPadModeStrategy] Generated zone data:", zones);
        return zones;
    },

    // При нажатии триггерим звук
    onPointerDown(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive || !drumPadManager.isLoaded) return null;

        const grid_size = 4;
        const col = Math.floor(x * grid_size);
        // Y-координата от (0,0) в верхнем левом углу до (1,1) в нижнем правом в UI.
        // В pad.js y нормализуется так, что 0 - низ, 1 - верх.
        // Для нашей логики сетки 0,0 - верхний левый пэд, поэтому инвертируем y.
        const row = Math.floor((1 - y) * grid_size);
        const index = row * grid_size + col;

        // Find the zone by index, ensuring it's a drum_pad type.
        // Note: currentZones might not be perfectly ordered if other zone types are mixed.
        // A safer find would be:
        // const targetZone = currentZones.find(zone => zone.type === 'drum_pad' && Math.floor(zone.startX * grid_size) === col && Math.floor(zone.startY * grid_size) === row);
        // However, generateZoneData currently produces a simple flat array of drum_pads, so index lookup should be fine.
        const targetZone = currentZones[index];

        if (targetZone && targetZone.soundName !== "Empty") {
            console.log(`[DrumPadModeStrategy] Triggering sound: ${targetZone.soundName}`);
            drumPadManager.triggerSound(targetZone.soundName);

            // Визуальный фидбэк: найти элемент и анимировать
            const padElement = document.getElementById(targetZone.id);
            if (padElement) {
                padElement.classList.add('active');
                setTimeout(() => padElement.classList.remove('active'), 100); // Снять класс через 100мс
            }
        } else {
            console.warn(`[DrumPadModeStrategy] No target zone or empty sound for index: ${index}, x: ${x}, y: ${y}`);
        }
        return null; // Прямого действия для synth.js не нужно
    },

    onPointerMove(pointerId, x, y, currentZones, padContext) {
        // Not typically used in drum pad mode
        return null;
    },

    onPointerUp(pointerId, currentZones, padContext) {
        // Not typically used in drum pad mode
        return null;
    }
};

// Регистрация стратегии (это должно быть сделано в PadModeManager.js,
// но для примера покажем здесь, как это могло бы выглядеть, если бы менеджер был доступен)
// Предполагается, что PadModeManager.registerStrategy существует.
// PadModeManager.registerStrategy(DrumPadModeStrategy.getName(), DrumPadModeStrategy);
// console.log("[DrumPadModeStrategy] Strategy registered with PadModeManager (simulated).");

// Register the strategy with the PadModeManager
// This assumes PadModeManager is loaded and available globally.
if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(DrumPadModeStrategy);
} else {
    console.warn('[DrumPadModeStrategy] PadModeManager not found, strategy not registered at load time.');
    // Optionally, queue for later registration or handle error.
}
