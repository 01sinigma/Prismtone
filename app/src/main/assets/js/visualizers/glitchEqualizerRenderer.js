// Файл: app/src/main/assets/js/visualizers/glitchEqualizerRenderer.js
// ВЕРСИЯ 1.0: Спектральный анализатор с глитч-эффектами, управляемыми гироскопом.

class GlitchEqualizerRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        // Массив для хранения высот "залипающих" пиков
        this.peakHeights = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки
            barCount: 64,             // Количество столбиков эквалайзера
            minDecibels: -90,         // Минимальный уровень dB для анализатора
            maxDecibels: -10,         // Максимальный уровень dB
            smoothingTimeConstant: 0.8, // Сглаживание данных анализатора
            peakFallSpeed: 0.5,       // Скорость падения пиков
            channelSeparation: 30,    // Максимальное смещение RGB каналов в пикселях
            glitchLineIntensity: 0.2, // Интенсивность горизонтальных глитч-полос
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        // Настраиваем анализатор под наши нужды
        if (this.analyserNodeRef) {
            this.analyserNodeRef.type = 'fft';
            this.analyserNodeRef.size = this.settings.barCount * 2; // FFT size должен быть больше или равен barCount
            this.analyserNodeRef.minDecibels = this.settings.minDecibels;
            this.analyserNodeRef.maxDecibels = this.settings.maxDecibels;
            this.analyserNodeRef.smoothingTimeConstant = this.settings.smoothingTimeConstant;
        }

        this.peakHeights = new Array(this.settings.barCount).fill(0);
        console.log("[GlitchEqualizerRenderer v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    // onResize и onSettingsChange можно добавить, если нужно переинициализировать массив пиков при изменении barCount

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.analyserNodeRef || !audioData || !(audioData instanceof Float32Array)) return;

        // 1. Очистка фона
        this.ctx.fillStyle = this.themeColors.background || '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const { width, height } = this.canvas;
        const barCount = this.settings.barCount;
        const barWidth = width / barCount;

        // 2. Вычисление искажений от гироскопа
        const rollEffect = deviceTilt.roll / 90; // от -1 до 1
        const pitchEffect = Math.abs(deviceTilt.pitch / 90); // от 0 до 1

        const separation = rollEffect * this.settings.channelSeparation;
        const glitchLineProbability = pitchEffect * this.settings.glitchLineIntensity;

        // 3. Отрисовка столбиков эквалайзера
        const minDb = this.analyserNodeRef.minDecibels;
        const dbRange = this.analyserNodeRef.maxDecibels - minDb;

        for (let i = 0; i < barCount; i++) {
            const dbValue = audioData[i];
            const normalizedHeight = dbRange > 0 ? (dbValue - minDb) / dbRange : 0;
            const barHeight = Math.max(0, normalizedHeight * height);

            const x = i * barWidth;

            // --- Эффект расслоения каналов (Chromatic Aberration) ---
            this.ctx.globalCompositeOperation = 'lighter';

            // Красный канал (смещен влево)
            this.ctx.fillStyle = this.themeColors.accent || '#FF0033';
            this.ctx.fillRect(x - separation, height - barHeight, barWidth, barHeight);

            // Зеленый канал (в центре)
            this.ctx.fillStyle = this.themeColors.primary || '#00FFDD';
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            // Синий канал (смещен вправо)
            this.ctx.fillStyle = '#0066FF';
            this.ctx.fillRect(x + separation, height - barHeight, barWidth, barHeight);

            // --- Отрисовка "залипающих" пиков ---
            if (barHeight > this.peakHeights[i]) {
                this.peakHeights[i] = barHeight;
            } else {
                this.peakHeights[i] -= this.settings.peakFallSpeed; // Пики медленно падают
            }
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillRect(x - separation, height - this.peakHeights[i], barWidth + separation * 2, 2);
        }

        // 4. Отрисовка горизонтальных глитч-полос
        if (Math.random() < glitchLineProbability) {
            this.ctx.globalCompositeOperation = 'source-over';
            const y = Math.random() * height;
            const h = Math.random() * 3 + 1;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + Math.random() * 0.2})`;
            this.ctx.fillRect(0, y, width, h);
        }
    }

    dispose() {
        this.peakHeights = [];
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('GlitchEqualizerRenderer', GlitchEqualizerRenderer);
}