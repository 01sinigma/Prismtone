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

        // Store graphics quality setting from initialSettings
        this.quality = initialSettings.graphicsQuality || 'high';
        // console.log(`[FlowingInkEffect] Graphics Quality set to: ${this.quality}`); // Optional

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
        // Adjust particle properties (speed, size, decay) based on graphics quality.
        let speedMultiplier = this.settings.splatMultiplier || 15;
        let maxSpeed = this.settings.maxSpeed || 5;
        let minSize = this.settings.minSize || 10;
        let sizeRange = this.settings.sizeRange || 25;
        let minDecay = this.settings.minDecay || 0.005;
        let decayRange = this.settings.decayRange || 0.01;

        if (this.quality === 'low') {
            speedMultiplier *= 0.5;
            maxSpeed *= 0.7;
            minSize *= 0.6;
            sizeRange *= 0.5;
            minDecay *= 1.5; // Faster decay
            decayRange *= 0.8;
        } else if (this.quality === 'medium') {
            speedMultiplier *= 0.75;
            maxSpeed *= 0.85;
            minSize *= 0.8;
            sizeRange *= 0.75;
            minDecay *= 1.2;
        }

        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * (this.settings.spread || 0.8);
        const speed = Math.min(maxSpeed, 1 + baseSpeed * speedMultiplier * (0.5 + Math.random()));

        return {
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            size: minSize + Math.random() * sizeRange,
            decay: minDecay + Math.random() * decayRange,
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
        // Reduce particle emission rate and maximum particle count for lower quality settings.
        let burstCount = this.settings.initialBurst || 40;
        if (this.quality === 'low') {
            burstCount = Math.floor(burstCount * 0.3);
        } else if (this.quality === 'medium') {
            burstCount = Math.floor(burstCount * 0.6);
        }
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

            // Reduce particle emission rate and maximum particle count for lower quality settings.
            let emitCount = this.settings.emitRate || 5;
            let maxParticles = this.settings.maxParticles || 1500;

            if (this.quality === 'low') {
                emitCount = Math.floor(emitCount * 0.3);
                maxParticles = 500;
            } else if (this.quality === 'medium') {
                emitCount = Math.floor(emitCount * 0.6);
                maxParticles = 1000;
            }

            for (let i = 0; i < emitCount; i++) {
                if (this.inkDrops.length < maxParticles) { // Use adjusted maxParticles
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
        // Increase dissipation (faster fade) for lower quality settings to reduce persistent particle load.
        let dissipation = this.settings.dissipation || 0.1;
        if (this.quality === 'low') {
            dissipation = Math.min(0.3, dissipation * 2); // Faster dissipation for low quality
        } else if (this.quality === 'medium') {
            dissipation = Math.min(0.2, dissipation * 1.5);
        }
        this.ctx.fillStyle = `rgba(0, 0, 0, ${dissipation})`;
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