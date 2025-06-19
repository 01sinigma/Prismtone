// Файл: app/src/main/assets/js/touchEffects/Fluid2DEffect.js

class Fluid2DEffect {
    constructor() {
        // Указываем, что это 2D рендерер
        this.rendererType = '2d';

        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        // Map для хранения систем частиц для каждого активного касания
        // ключ: touchId, значение: { x, y, color, particles: [...] }
        this.touchSystems = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.touchSystems.clear();
        console.log("[Fluid2DEffect] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    // Этот метод теперь не нужен, так как настройки всегда будут в `this.settings`
    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _generateColor() {
        // Простая функция генерации случайного яркого цвета
        const h = Math.random() * 360;
        return `hsl(${h}, 90%, 65%)`;
    }

    // --- Обработка касаний ---

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        const system = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            color: this._generateColor(),
            particles: [],
            isActive: true
        };

        // Создаем начальный всплеск частиц
        const particleCount = this.settings.initialBurstCount || 50;
        for (let i = 0; i < particleCount; i++) {
            system.particles.push(this._createParticle(system.x, system.y, system.color));
        }

        this.touchSystems.set(touchData.id, system);
    }

    onTouchMove(touchData) {
        const system = this.touchSystems.get(touchData.id);
        if (system && system.isActive) {
            system.x = touchData.x * this.canvas.width;
            system.y = (1 - touchData.y) * this.canvas.height;

            // Добавляем частицы при движении
            const particleCount = this.settings.moveEmitCount || 5;
            for (let i = 0; i < particleCount; i++) {
                system.particles.push(this._createParticle(system.x, system.y, system.color));
            }
        }
    }

    onTouchUp(touchId) {
        const system = this.touchSystems.get(touchId);
        if (system) {
            system.isActive = false; // Перестаем создавать новые частицы
        }
    }

    // --- Логика частиц ---

    _createParticle(x, y, color) {
        const angle = Math.random() * 2 * Math.PI;
        const speed = Math.random() * (this.settings.maxSpeed || 3);
        const life = (this.settings.minLife || 500) + Math.random() * (this.settings.lifeRange || 1000);

        return {
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: life,
            initialLife: life,
            size: (this.settings.minSize || 2) + Math.random() * (this.settings.sizeRange || 4),
            color
        };
    }

    // --- Главный цикл отрисовки ---

    drawActiveEffects() {
        if (!this.ctx || this.touchSystems.size === 0) return;

        // Используем 'lighter' для красивого смешивания цветов
        this.ctx.globalCompositeOperation = 'lighter';

        this.touchSystems.forEach((system, touchId) => {
            // Обновляем и рисуем частицы
            system.particles = system.particles.filter(p => {
                p.x += p.vx;
                p.y += p.vy;

                // Замедление
                p.vx *= (this.settings.friction || 0.96);
                p.vy *= (this.settings.friction || 0.96);

                p.life -= 16; // Примерное время кадра
                if (p.life <= 0) return false;

                const lifeRatio = p.life / p.initialLife;
                const alpha = Math.sin(lifeRatio * Math.PI); // Плавное появление и исчезновение
                const size = p.size * lifeRatio;

                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, alpha * 0.5);
                this.ctx.fill();

                return true;
            });

            // Если касание отпущено и все частицы исчезли, удаляем систему
            if (!system.isActive && system.particles.length === 0) {
                this.touchSystems.delete(touchId);
            }
        });

        // Возвращаем стандартный режим смешивания
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.touchSystems.clear();
        console.log("[Fluid2DEffect] Disposed.");
    }
}

// Саморегистрация класса
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('Fluid2DEffect', Fluid2DEffect);
} else {
    console.error("[Fluid2DEffect] Could not register. 'visualizer' object is not available.");
}