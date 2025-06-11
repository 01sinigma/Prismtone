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
        console.log(`[VibrationService v2] >>> TRIGGER <<< Received type: '${type}', strength: ${strength.toFixed(2)}. Service enabled: ${this.isEnabled}`);
        if (!this.isEnabled) return;
        
        // Очищаем предыдущий отложенный запуск, если он был
        if (this.pendingPatternTimeoutId) {
            clearTimeout(this.pendingPatternTimeoutId);
            this.pendingPatternTimeoutId = null;
        }

        const baseAmplitude = 1 + Math.floor(strength * 254);

        switch (type) {
            case 'touch_down':
                this.stop(); // Останавливаем все предыдущее (это также очистит любой timeout через вложенный вызов stop)
                const initialAmplitude = Math.min(255, baseAmplitude * 1.25);
                this._vibrateOneShot(40, initialAmplitude); // Короткий сильный импульс
                
                // Через 50мс запускаем непрерывную вибрацию
                this.pendingPatternTimeoutId = setTimeout(() => {
                    this.pendingPatternTimeoutId = null; // Таймаут сработал
                    if (this.isEnabled) { // Проверяем снова на случай, если сервис отключили за это время
                        this._vibratePattern(baseAmplitude);
                    }
                }, 50);
                break;
            case 'zone_cross':
                this.stop(); // Прерываем непрерывную вибрацию (это также очистит любой timeout через вложенный вызов stop)
                this._vibrateOneShot(30, 225); // Короткий, четкий "щелчок"
                
                // Через 25мс возобновляем непрерывную вибрацию с новой силой
                this.pendingPatternTimeoutId = setTimeout(() => {
                    this.pendingPatternTimeoutId = null; // Таймаут сработал
                    if (this.isEnabled) { // Проверяем снова
                        this._vibratePattern(baseAmplitude);
                    }
                }, 25);
                break;
            case 'slide':
                // При "слайде" мы БОЛЬШЕ НИЧЕГО НЕ ДЕЛАЕМ. Непрерывная вибрация уже идет.
                // Сила изменится только после пересечения следующей зоны.
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