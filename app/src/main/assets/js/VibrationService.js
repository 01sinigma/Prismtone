// Файл: app/src/main/assets/js/VibrationService.js
// ВЕРСИЯ 2: Поддержка непрерывной вибрации через паттерны

const VibrationService = {
    appRef: null,
    isEnabled: false,
    intensityMultiplier: 0.75,
    isVibratingContinuously: false, // Флаг для отслеживания непрерывной вибрации
    pendingPatternTimeoutId: null, // ID для отложенного запуска паттерна

    init(appReference) {
        this.appRef = appReference;
        console.log('[VibrationService v2] Initialized.');
    },

    setEnabled(enabled) {
        this.isEnabled = !!enabled;
        console.log(`[VibrationService v2] >>> SET ENABLED <<< State is now: ${this.isEnabled}`);
        if (!this.isEnabled) {
            this.stop();
        }
    },

    setIntensity(level) {
        switch (level) {
            case 'weak': this.intensityMultiplier = 0.1; break;
            case 'strong': this.intensityMultiplier = 1.0; break;
            case 'medium': default: this.intensityMultiplier = 0.5; break;
        }
        console.log(`[VibrationService v2] Intensity level set to '${level}' (multiplier: ${this.intensityMultiplier})`);
    },

    // Приватный метод для одиночных импульсов
    _vibrateOneShot(duration, amplitude) {
        const finalAmplitude = Math.max(1, Math.min(255, Math.round(amplitude * this.intensityMultiplier)));
        console.log(`[VibrationService v2] --> BRIDGE CALL: 'vibrate' (OneShot) with duration=${duration}, amplitude=${finalAmplitude}`);
        bridgeFix.callBridge('vibrate', duration, finalAmplitude);
    },

    // Приватный метод для непрерывной вибрации
    _vibratePattern(amplitude) {
        this.stop(); // Сначала останавливаем любую предыдущую вибрацию (включая очистку таймаутов)
        const finalAmplitude = Math.max(1, Math.min(255, Math.round(amplitude * this.intensityMultiplier)));
        
        // Паттерн: [пауза, вибрация, пауза, вибрация...]
        const timings = [0, 1000]; // Запускаем на 1 секунду, чтобы не было разрывов
        const amplitudes = [0, finalAmplitude];

        console.log(`[VibrationService v2] --> BRIDGE CALL: 'vibratePattern' with repeat, amplitude=${finalAmplitude}`);
        bridgeFix.callBridge('vibratePattern', JSON.stringify(timings), JSON.stringify(amplitudes), 0); // repeat = 0 (повторять весь паттерн)
        this.isVibratingContinuously = true;
    },

    trigger(type, strength = 0.5) {
        if (!this.isEnabled) return;

        if (this.pendingPatternTimeoutId) {
            clearTimeout(this.pendingPatternTimeoutId);
            this.pendingPatternTimeoutId = null;
        }

        const baseAmplitude = 1 + Math.floor(strength * 254);

        switch (type) {
            case 'touch_down':
                // >>> ИЗМЕНЕНИЕ: Отменяем, только если что-то уже вибрирует <<<
                if (this.isVibratingContinuously) {
                    this.stop(); // stop() уже отменяет и сбрасывает флаг
                }
                const initialAmplitude = Math.min(255, baseAmplitude * 1.25);
                this._vibrateOneShot(40, initialAmplitude);

                this.pendingPatternTimeoutId = setTimeout(() => {
                    this.pendingPatternTimeoutId = null;
                    if (this.isEnabled) {
                        this._vibratePattern(baseAmplitude);
                    }
                }, 50);
                break;
            case 'zone_cross':
                // >>> ИЗМЕНЕНИЕ: Не отменяем, а просто даем короткий импульс поверх <<<
                // Это создаст тактильный "щелчок" без прерывания основной вибрации.
                // Для этого нативная часть должна поддерживать "наложение" вибраций,
                // что не всегда возможно. Если это вызывает проблемы, возвращаемся к `stop()`.
                // Альтернатива - более сложная логика с проверкой силы.
                // Пока оставим простой вариант для уменьшения вызовов.
                this._vibrateOneShot(30, 225); // Короткий сильный "щелчок"

                // Если нужно обновить силу непрерывной вибрации:
                if (this.isVibratingContinuously) {
                     this.stop(); // Останавливаем старую
                     this.pendingPatternTimeoutId = setTimeout(() => { // Запускаем новую с задержкой
                        this.pendingPatternTimeoutId = null;
                        if (this.isEnabled) this._vibratePattern(baseAmplitude);
                     }, 25);
                }
                break;
        }
    },

    stop() {
        if (this.pendingPatternTimeoutId) {
            clearTimeout(this.pendingPatternTimeoutId);
            this.pendingPatternTimeoutId = null;
            console.log('[VibrationService v2] Cleared pending pattern timeout.');
        }
        if (!this.appRef?.state.isBridgeReady && this.isVibratingContinuously) { // Добавил проверку isVibratingContinuously, чтобы не спамить лог, если мост не готов и вибрации нет
             console.warn('[VibrationService v2] Bridge not ready, cannot send cancelVibration. Vibration might persist if it was active.');
        } else if (this.appRef?.state.isBridgeReady) { // Только если мост готов, отправляем команду отмены
            console.log(`[VibrationService v2] --> BRIDGE CALL: 'cancelVibration'`);
            bridgeFix.callBridge('cancelVibration');
        }
        this.isVibratingContinuously = false;
    }
};