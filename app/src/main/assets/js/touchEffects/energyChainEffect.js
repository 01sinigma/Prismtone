// Файл: app/src/main/assets/js/touchEffects/energyChainEffect.js
// ВЕРСИЯ 1.0: Создает "энергетические цепи" между точками касания, реагирующие на гравитацию.

class EnergyChainEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        // activeTouchesMap из visualizer.js является источником данных, свой Map не нужен.
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки
            lineBaseColor: 'note',  // 'note', 'primary', 'accent'
            lineBaseWidth: 2,
            lineWidthYMultiplier: 3,
            glowWidthFactor: 3,
            glowOpacity: 0.5,
            gravityStrength: 0.8,   // Насколько сильно цепь "провисает"
            jitterAmount: 1,        // Легкая вибрация/дрожание линии
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        console.log("[EnergyChainEffect v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    // onTouchDown, onTouchMove, onTouchUp не нужны, т.к. эффект читает
    // общее состояние касаний из visualizer.activeTouchPointsMap в каждом кадре.

    /**
     * Основной цикл отрисовки.
     */
    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        const activeTouches = Array.from(this.globalVisualizerRef.activeTouchPointsMap.values());
        if (activeTouches.length < 2) {
            return; // Ничего не рисуем, если касаний меньше двух
        }

        // --- Получаем данные о гравитации ---
        const deviceTilt = app.state.deviceTilt;
        // Вертикальная сила "провисания" зависит от наклона вперед/назад
        const gravityY = (deviceTilt.pitch / 90) * (this.settings.gravityStrength * 100); // Увеличиваем масштаб для заметного провисания

        this.ctx.lineCap = 'round';
        this.ctx.globalCompositeOperation = 'lighter';

        // --- Рисуем линии между всеми парами точек ---
        for (let i = 0; i < activeTouches.length; i++) {
            for (let j = i + 1; j < activeTouches.length; j++) {
                const p1 = activeTouches[i];
                const p2 = activeTouches[j];

                // --- Физика линии ---
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                // Добавляем провисание под действием гравитации
                const controlY = midY + gravityY;

                // Добавляем легкое дрожание контрольной точке для "живости"
                const controlX = midX + (Math.random() - 0.5) * this.settings.jitterAmount;

                // --- Внешний вид линии ---
                const avgY = ((1 - p1.y / this.canvas.height) + (1 - p2.y / this.canvas.height)) / 2;
                const lineWidth = this.settings.lineBaseWidth + avgY * this.settings.lineWidthYMultiplier;

                // Определяем цвет на основе смешения цветов нот
                const color1 = this._getColor(p1.noteInfo);
                const color2 = this._getColor(p2.noteInfo);
                const grad = this.ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                grad.addColorStop(0, color1);
                grad.addColorStop(1, color2);

                // --- Отрисовка ---
                // 1. Свечение (Glow)
                this.ctx.strokeStyle = grad;
                this.ctx.lineWidth = lineWidth * this.settings.glowWidthFactor;
                this.ctx.globalAlpha = this.settings.glowOpacity;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.quadraticCurveTo(controlX, controlY, p2.x, p2.y);
                this.ctx.stroke();

                // 2. Ядро линии
                this.ctx.strokeStyle = '#FFFFFF'; // Ядро всегда белое для яркости
                this.ctx.lineWidth = lineWidth;
                this.ctx.globalAlpha = 1.0;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.quadraticCurveTo(controlX, controlY, p2.x, p2.y);
                this.ctx.stroke();
            }
        }

        this.ctx.globalCompositeOperation = 'source-over';
    }

    _getColor(noteInfo) {
        if (this.settings.lineBaseColor === 'note' && noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            return this.globalVisualizerRef.noteColors[noteInfo.midiNote % 12];
        } else if (this.settings.lineBaseColor === 'accent') {
            return this.themeColors.accent || '#FF4081';
        }
        return this.themeColors.primary || '#00BFFF';
    }

    dispose() {
        // Ничего не нужно делать, так как эффект не хранит собственного состояния между кадрами
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerTouchEffectRenderer) {
    visualizer.registerTouchEffectRenderer('EnergyChainEffect', EnergyChainEffect);
}