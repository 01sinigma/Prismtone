// Файл: app/src/main/assets/js/visualizers/liquidNeonRenderer.js
// ВЕРСИЯ 1.0: Эффект сливающихся капель (метаболов) с реакцией на звук и гироскоп.

class LiquidNeonRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        this.metaballs = []; // Массив для хранения наших "капель"

        // >>> OPTIMIZATION: Offscreen canvas для техники метаболов <<<
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки, если не указаны в JSON
            ballCount: 8,
            minSpeed: 0.2,
            maxSpeed: 0.8,
            minRadius: 40,
            maxRadius: 80,
            blurAmount: 30,      // Ключевой параметр для эффекта слияния
            contrastAmount: 35,  // Ключевой параметр для создания четких краев
            windStrength: 0.1,   // Сила влияния гироскопа
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        this.onResize(); // Вызываем для установки размеров и создания капель
        console.log("[LiquidNeonRenderer v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        // Перекрашиваем существующие капли
        this.metaballs.forEach(ball => {
            ball.color = this._getRandomColor();
        });
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        // Синхронизируем размеры offscreen canvas
        this.offscreenCanvas.width = this.canvas.width;
        this.offscreenCanvas.height = this.canvas.height;
        this._initMetaballs();
    }

    _getRandomColor() {
        // Используем основные цвета темы для капель
        const palette = [
            this.themeColors.primary || '#00BFFF',
            this.themeColors.accent || '#FF4081',
            this.themeColors.primaryLight || '#66D9FF',
            this.themeColors.primaryDark || '#0099CC'
        ];
        return palette[Math.floor(Math.random() * palette.length)];
    }

    _initMetaballs() {
        this.metaballs = [];
        for (let i = 0; i < this.settings.ballCount; i++) {
            const radius = Math.random() * (this.settings.maxRadius - this.settings.minRadius) + this.settings.minRadius;
            this.metaballs.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * this.settings.maxSpeed * 2,
                vy: (Math.random() - 0.5) * this.settings.maxSpeed * 2,
                radius: radius,
                color: this._getRandomColor()
            });
        }
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.offscreenCtx) return;

        // --- 1. Физика и обновление позиций ---
        const windX = (deviceTilt.roll / 90) * this.settings.windStrength;
        const windY = (deviceTilt.pitch / 90) * this.settings.windStrength;
        let audioEnergy = 0;
        if (audioData && audioData.length > 0) {
            audioEnergy = audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length;
            audioEnergy = Math.sqrt(audioEnergy); // RMS
        }

        this.metaballs.forEach(ball => {
            // Применяем "ветер" от гироскопа
            ball.vx += windX;
            ball.vy += windY;

            // Движение
            ball.x += ball.vx;
            ball.y += ball.vy;

            // Отскок от границ
            if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx *= -1; }
            if (ball.x > this.canvas.width - ball.radius) { ball.x = this.canvas.width - ball.radius; ball.vx *= -1; }
            if (ball.y < ball.radius) { ball.y = ball.radius; ball.vy *= -1; }
            if (ball.y > this.canvas.height - ball.radius) { ball.y = this.canvas.height - ball.radius; ball.vy *= -1; }

            // Реакция на громкость звука
            ball.radius += (audioEnergy * 20 - (ball.radius - this.settings.minRadius) * 0.1) * 0.1;
            ball.radius = Math.max(this.settings.minRadius, Math.min(this.settings.maxRadius * 1.5, ball.radius));
        });

        // --- 2. Отрисовка на Offscreen Canvas (Техника Metaballs) ---

        // Очищаем временный холст
        this.offscreenCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.offscreenCtx.fillStyle = '#000'; // Фон должен быть черным для контраста
        this.offscreenCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем на нем наши капли
        this.metaballs.forEach(ball => {
            this.offscreenCtx.beginPath();
            this.offscreenCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            // Используем радиальный градиент для мягких краев
            const grad = this.offscreenCtx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); // В центре непрозрачный белый
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Края прозрачные
            this.offscreenCtx.fillStyle = grad;
            this.offscreenCtx.fill();
        });

        // Применяем фильтры для создания эффекта слияния
        this.offscreenCtx.filter = `blur(${this.settings.blurAmount}px) contrast(${this.settings.contrastAmount})`;
        // Копируем сами на себя, чтобы фильтр применился
        this.offscreenCtx.drawImage(this.offscreenCanvas, 0, 0);
        // Сбрасываем фильтр
        this.offscreenCtx.filter = 'none';

        // --- 3. Отрисовка на основном Canvas ---
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем фон
        this.ctx.fillStyle = this.themeColors.background || '#0a0a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем цветные капли, используя черно-белую маску с offscreen canvas
        this.ctx.globalCompositeOperation = 'lighter'; // Режим наложения для неонового свечения
        this.metaballs.forEach(ball => {
            this.ctx.fillStyle = ball.color;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius * 1.2, 0, Math.PI * 2); // Рисуем чуть больше для мягкого края
            this.ctx.fill();
        });

        // Накладываем нашу маску
        this.ctx.globalCompositeOperation = 'destination-in';
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);

        // Сбрасываем режим наложения
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.metaballs = [];
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('LiquidNeonRenderer', LiquidNeonRenderer);
}