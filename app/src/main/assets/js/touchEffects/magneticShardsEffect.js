// Файл: app/src/main/assets/js/touchEffects/magneticShardsEffect.js
// ВЕРСИЯ 1.0: Эффект магнитных опилок, реагирующих на касания и гироскоп.

class MagneticShardsEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.shards = []; // Массив для хранения всех "опилок"
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки
            shardCount: 2500,       // Количество опилок на экране
            shardLength: 8,         // Длина каждой опилки
            shardWidth: 1.5,        // Толщина
            touchStrength: 100,     // Сила влияния касания
            globalFieldStrength: 1.5, // Сила влияния наклона устройства
            color: 'accent',        // 'primary', 'accent' или HEX-код
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.onResize();
        console.log("[MagneticShardsEffect v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        this._initShards();
    }

    /**
     * Создает начальное распределение "опилок" по экрану.
     * @private
     */
    _initShards() {
        if (!this.canvas) return;
        this.shards = [];
        for (let i = 0; i < this.settings.shardCount; i++) {
            this.shards.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                angle: Math.random() * Math.PI * 2 // Начальный случайный угол
            });
        }
    }

    // Этот эффект не зависит от конкретного момента касания, а от их общего состояния,
    // поэтому onTouchDown/Move/Up остаются пустыми. Вся логика в drawActiveEffects.
    onTouchDown() {}
    onTouchMove() {}
    onTouchUp() {}

    /**
     * Основной цикл отрисовки.
     */
    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        // Получаем текущие данные о касаниях и наклоне
        const activeTouches = Array.from(this.globalVisualizerRef.activeTouchPointsMap.values());
        const deviceTilt = app.state.deviceTilt;

        const color = this.themeColors[this.settings.color] || this.settings.color || this.themeColors.accent;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = this.settings.shardWidth;
        this.ctx.lineCap = 'round';

        // 1. Вычисляем направление глобального "магнитного поля" от гироскопа
        const globalFieldAngle = Math.atan2(deviceTilt.pitch, deviceTilt.roll);
        const globalFieldStrength = Math.hypot(deviceTilt.pitch, deviceTilt.roll) / 90 * this.settings.globalFieldStrength;

        // 2. Перебираем все "опилки" и вычисляем их новый угол
        this.shards.forEach(shard => {
            let totalVx = Math.cos(globalFieldAngle) * globalFieldStrength;
            let totalVy = Math.sin(globalFieldAngle) * globalFieldStrength;

            // Вычисляем суммарный вектор от всех активных касаний
            activeTouches.forEach(touch => {
                const dx = shard.x - touch.x;
                const dy = shard.y - touch.y;
                const distSq = dx * dx + dy * dy;

                if (distSq > 1) {
                    // Сила поля убывает с квадратом расстояния
                    const force = this.settings.touchStrength / distSq;

                    // Вектор поля перпендикулярен вектору к точке касания (как у магнита)
                    totalVx += -dy * force;
                    totalVy += dx * force;
                }
            });

            // Если есть влияние, вычисляем новый угол
            if (Math.abs(totalVx) > 0.01 || Math.abs(totalVy) > 0.01) {
                const targetAngle = Math.atan2(totalVy, totalVx);

                // Плавный поворот к целевому углу для "живости"
                let angleDiff = targetAngle - shard.angle;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                shard.angle += angleDiff * 0.1; // 0.1 - скорость поворота
            }

            // 3. Отрисовываем "опилку" с новым углом
            this.ctx.save();
            this.ctx.translate(shard.x, shard.y);
            this.ctx.rotate(shard.angle);

            const halfLen = this.settings.shardLength / 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-halfLen, 0);
            this.ctx.lineTo(halfLen, 0);
            this.ctx.stroke();

            this.ctx.restore();
        });
    }

    dispose() {
        this.shards = [];
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerTouchEffectRenderer) {
    visualizer.registerTouchEffectRenderer('MagneticShardsEffect', MagneticShardsEffect);
}