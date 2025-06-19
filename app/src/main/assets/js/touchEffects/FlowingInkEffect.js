// Файл: app/src/main/assets/js/touchEffects/FlowingInkEffect.js

class FlowingInkEffect {
    constructor() {
        this.rendererType = '2d'; // Явно указываем, что это 2D рендерер

        this.ctx = null;
        this.canvas = null;
        this.settings = {}; // Настройки из JSON
        this.themeColors = {};
        this.globalVisualizerRef = null;

        // Массив для хранения всех "капель" чернил
        this.inkDrops = [];
        // Map для отслеживания активных касаний
        this.touches = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.inkDrops = [];
        this.touches.clear();
        console.log("[FlowingInkEffect] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _generateColor(noteInfo) {
        // Используем цвета нот, если они есть, или случайный цвет
        if (noteInfo?.midiNote !== undefined && this.globalVisualizerRef?.noteColors) {
            const noteIndex = noteInfo.midiNote % 12;
            return this.globalVisualizerRef.noteColors[noteIndex] || this.themeColors.primary || '#8A2BE2';
        }
        const h = Math.random() * 360;
        return `hsl(${h}, 90%, 65%)`;
    }

    _createInkDrop(x, y, dx, dy, color) {
        const baseSpeed = Math.hypot(dx, dy);
        const speedMultiplier = this.settings.splatMultiplier || 15;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * (this.settings.spread || 0.8);
        const speed = Math.min(this.settings.maxSpeed || 5, 1 + baseSpeed * speedMultiplier * (0.5 + Math.random()));

        return {
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            size: (this.settings.minSize || 10) + Math.random() * (this.settings.sizeRange || 25),
            decay: (this.settings.minDecay || 0.005) + Math.random() * (this.settings.decayRange || 0.01),
            color: color
        };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        const x = touchData.x * this.canvas.width;
        const y = (1.0 - touchData.y) * this.canvas.height;

        const touch = {
            id: touchData.id,
            x, y,
            prevX: x, prevY: y,
            color: this._generateColor(touchData.noteInfo)
        };
        this.touches.set(touchData.id, touch);

        // Создаем начальный всплеск
        const burstCount = this.settings.initialBurst || 40;
        for (let i = 0; i < burstCount; i++) {
            this.inkDrops.push(this._createInkDrop(x, y, (Math.random() - 0.5), (Math.random() - 0.5), touch.color));
        }
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;

        const touch = this.touches.get(touchData.id);
        if (touch) {
            const newX = touchData.x * this.canvas.width;
            const newY = (1.0 - touchData.y) * this.canvas.height;

            touch.prevX = touch.x;
            touch.prevY = touch.y;
            touch.x = newX;
            touch.y = newY;

            const dx = touch.x - touch.prevX;
            const dy = touch.y - touch.prevY;

            const emitCount = this.settings.emitRate || 5;
            for (let i = 0; i < emitCount; i++) {
                if (this.inkDrops.length < (this.settings.maxParticles || 1500)) {
                    this.inkDrops.push(this._createInkDrop(touch.x, touch.y, dx, dy, touch.color));
                }
            }

            // Плавно меняем цвет со временем
            if(Math.random() > 0.95) {
                touch.color = this._generateColor(touchData.noteInfo);
            }
        }
    }

    onTouchUp(touchId) {
        this.touches.delete(touchId);
    }

    drawActiveEffects() {
        if (!this.ctx) return;

        // 1. Очистка с эффектом затухания
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.settings.dissipation || 0.1})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Обновление и отрисовка частиц
        this.ctx.globalCompositeOperation = 'lighter';

        for (let i = this.inkDrops.length - 1; i >= 0; i--) {
            const drop = this.inkDrops[i];

            drop.life -= drop.decay;

            if (drop.life <= 0) {
                this.inkDrops.splice(i, 1);
                continue;
            }

            drop.x += drop.vx;
            drop.y += drop.vy;
            drop.vx *= (this.settings.friction || 0.97);
            drop.vy *= (this.settings.friction || 0.97);

            const size = drop.size * drop.life;
            const alpha = drop.life * 0.5;

            this.ctx.beginPath();
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(drop.color, alpha);
            this.ctx.arc(drop.x, drop.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    dispose() {
        this.inkDrops = [];
        this.touches.clear();
        console.log("[FlowingInkEffect] Disposed.");
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('FlowingInkEffect', FlowingInkEffect);
}