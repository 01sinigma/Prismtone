// Файл: app/src/main/assets/js/visualizers/parallaxNebulaRenderer.js
// ВЕРСИЯ 1.0: Многослойный космический пейзаж с эффектом параллакса от гироскопа.

class ParallaxNebulaRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};

        // Массивы для объектов каждого слоя
        this.stars = [];       // Передний план (быстрый)
        this.gasClouds = [];   // Средний план (медленный)

        // Offscreen canvas для статичного дальнего фона
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCtx = this.backgroundCanvas.getContext('2d');
        this._isBackgroundDirty = true;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки
            starCount: 150,
            starSize: 1.5,
            starParallaxFactor: 1.0, // Насколько сильно смещаются звезды
            cloudCount: 15,
            cloudSize: 200,
            cloudParallaxFactor: 0.4, // Облака смещаются медленнее звезд
            backgroundParallaxFactor: 0.1, // Фон почти не двигается
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.onResize();
        console.log("[ParallaxNebulaRenderer v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this._isBackgroundDirty = true; // Перерисовать фон при смене темы
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        this.backgroundCanvas.width = this.canvas.width;
        this.backgroundCanvas.height = this.canvas.height;
        this._isBackgroundDirty = true;
        this._initLayers();
    }

    /**
     * Создает объекты для всех слоев параллакса.
     * @private
     */
    _initLayers() {
        if (!this.canvas) return;

        // 1. Звезды (передний план)
        this.stars = [];
        for (let i = 0; i < this.settings.starCount; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * this.settings.starSize + 0.5,
                opacity: 0.5 + Math.random() * 0.5
            });
        }

        // 2. Газовые облака (средний план)
        this.gasClouds = [];
        for (let i = 0; i < this.settings.cloudCount; i++) {
            this.gasClouds.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * this.settings.cloudSize + (this.settings.cloudSize / 2),
                color: this.globalVisualizerRef.getColorWithAlpha(this.themeColors.primary, 0.05 + Math.random() * 0.1)
            });
        }
    }

    /**
     * Рисует самый дальний, почти статичный фон на offscreen-холст.
     * @private
     */
    _renderStaticBackground() {
        if (!this.backgroundCtx || !this.backgroundCanvas) return;
        const ctx = this.backgroundCtx;
        const { width, height } = this.backgroundCanvas;

        // Заливка основным фоновым цветом
        ctx.fillStyle = this.themeColors.background || '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        // Добавляем несколько очень больших, тусклых пятен туманности
        for (let i = 0; i < 5; i++) {
            const grad = ctx.createRadialGradient(
                Math.random() * width, Math.random() * height, 0,
                Math.random() * width, Math.random() * height, width * 0.7
            );
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(this.themeColors.accent, 0.1));
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
        }
        this._isBackgroundDirty = false;
        console.log("[ParallaxNebulaRenderer] Static background re-rendered.");
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas) return;

        // Перерисовываем фон, если нужно
        if (this._isBackgroundDirty) {
            this._renderStaticBackground();
        }

        // --- Вычисление смещений для параллакса ---
        const maxOffset = 50; // Максимальное смещение в пикселях
        const offsetX = (deviceTilt.roll / 90) * maxOffset;
        const offsetY = (deviceTilt.pitch / 90) * maxOffset;

        // 1. Отрисовка фона
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.backgroundCanvas) {
            const bgOffsetX = offsetX * this.settings.backgroundParallaxFactor;
            const bgOffsetY = offsetY * this.settings.backgroundParallaxFactor;
            this.ctx.drawImage(this.backgroundCanvas, bgOffsetX, bgOffsetY);
        }

        // 2. Отрисовка газовых облаков (средний план)
        const cloudOffsetX = offsetX * this.settings.cloudParallaxFactor;
        const cloudOffsetY = offsetY * this.settings.cloudParallaxFactor;
        this.ctx.globalCompositeOperation = 'overlay'; // Режим наложения для красивого смешения
        this.gasClouds.forEach(cloud => {
            this.ctx.fillStyle = cloud.color;
            this.ctx.beginPath();
            this.ctx.arc(cloud.x + cloudOffsetX, cloud.y + cloudOffsetY, cloud.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 3. Отрисовка звезд (передний план)
        this.ctx.globalCompositeOperation = 'lighter'; // Звезды должны ярко светиться
        const starOffsetX = offsetX * this.settings.starParallaxFactor;
        const starOffsetY = offsetY * this.settings.starParallaxFactor;
        let audioEnergy = 0;
        if (audioData && audioData.length > 0) {
            audioEnergy = Math.abs(audioData.reduce((a, b) => a + b, 0) / audioData.length) * 5;
        }

        this.stars.forEach(star => {
            const brightness = star.opacity + audioEnergy * 0.5;
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha('#FFFFFF', brightness);
            this.ctx.beginPath();
            this.ctx.arc(star.x + starOffsetX, star.y + starOffsetY, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Сброс режима наложения
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.stars = [];
        this.gasClouds = [];
        this.backgroundCanvas = null;
        this.backgroundCtx = null;
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('ParallaxNebulaRenderer', ParallaxNebulaRenderer);
}