// Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js
// Версия 2.2 (Финальная, с исправленной реакцией на касания и оси гироскопа)

class StellarNurseryRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particles = [];
        this.stars = [];
        // Map<touchId, {x, y, energy, color, noteInfo}>
        this.touchCores = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        if (!ctx || !canvas || !globalVisualizerRef) {
            console.error("[StellarNursery] FATAL: Ctx, Canvas, or GlobalVisualizerRef not provided!");
            return;
        }
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || { primary: '#4FC3F7', accent: '#FFD54F' };
        this.globalVisualizerRef = globalVisualizerRef;

        this.particles = [];
        this.stars = [];
        this.touchCores.clear();

        this.onResize(); // Вызываем для первоначального создания частиц
        console.log("[StellarNurseryRenderer v2.2] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors || {};
        this._initParticles(); // Пересоздаем частицы, так как они могут зависеть от цвета темы
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        this._initParticles();
    }

    _initParticles() {
        if (!this.canvas || !this.globalVisualizerRef) return;
        this.particles = [];
        const count = this.settings.particleCount || 1000;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: 0, vy: 0,
                size: 0.5 + Math.random() * 1.5,
                color: this.globalVisualizerRef.getColorWithAlpha(this.themeColors.primary || '#00BFFF', Math.random() * 0.2 + 0.05)
            });
        }
    }

    onTouchDown(touchData) {
        if (!touchData || !this.canvas || !this.globalVisualizerRef) return;

        const core = {
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            energy: 0.1,
            color: this.globalVisualizerRef.noteColors[touchData.noteInfo.midiNote % 12] || this.themeColors.accent,
            isActive: true,
            noteInfo: touchData.noteInfo
        };
        this.touchCores.set(touchData.id, core);
    }

    onTouchUp(touchId) {
        const core = this.touchCores.get(touchId);
        if (core) {
            // Рождаем звезду
            this.stars.push({
                x: core.x, y: core.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: 5 + core.energy * 25,
                life: 1.0,
                decay: 0.001 + Math.random() * 0.001,
                color: core.color
            });
            this.touchCores.delete(touchId);
        }
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        // 1. Очистка фона с эффектом шлейфа
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 10, ${this.settings.fadeSpeed || 0.25})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Обновление активных ядер касаний (КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ)
        const activeTouchIds = new Set(activeTouchStates.map(t => t.id));

        // Удаляем ядра, которых больше нет в activeTouchStates
        this.touchCores.forEach((core, id) => {
            if (!activeTouchIds.has(id)) {
                this.onTouchUp(id); // Вызываем логику "отпускания"
            }
        });

        // Обновляем или создаем ядра для текущих касаний
        activeTouchStates.forEach(touch => {
            let core = this.touchCores.get(touch.id);
            if (core) { // Если ядро уже существует, обновляем его
                core.x = touch.x * this.canvas.width;
                core.y = (1 - touch.y) * this.canvas.height;
                core.energy = Math.min(1, core.energy + touch.y * (this.settings.energyGain || 0.015));
                core.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12] || core.color;
            } else { // Если это новое касание
                this.onTouchDown(touch);
            }
        });

        // 3. Вычисление сил от гироскопа
        const windStrength = this.settings.windStrength || 0.3;
        const windX = (deviceTilt.pitch / 90) * windStrength * -1; // Горизонтальный ветер
        const windY = (deviceTilt.roll / 90) * windStrength * -1;  // Вертикальный ветер
        const friction = this.settings.friction || 0.97;

        // 4. Анимация частиц туманности
        this.particles.forEach(p => {
            p.vx += windX;
            p.vy += windY;

            // Суммируем силы от всех активных касаний
            this.touchCores.forEach(core => {
                const dx = core.x - p.x;
                const dy = core.y - p.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > 1) { // Избегаем деления на ноль и слишком больших сил
                    const force = core.energy * (this.settings.attraction || 50) / (distSq + 100);
                    p.vx += dx * force;
                    p.vy += dy * force;
                }
            });

            p.vx *= friction;
            p.vy *= friction;
            p.x += p.vx;
            p.y += p.vy;

            // Зацикливание на экране
            if (p.x < 0) p.x += this.canvas.width;
            if (p.x > this.canvas.width) p.x -= this.canvas.width;
            if (p.y < 0) p.y += this.canvas.height;
            if (p.y > this.canvas.height) p.y -= this.canvas.height;
        });

        // 5. Анимация звезд
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const star = this.stars[i];
            star.vx += windX * 0.5;
            star.vy += windY * 0.5;
            star.vx *= friction;
            star.vy *= friction;
            star.x += star.vx;
            star.y += star.vy;
            star.life -= star.decay;

            if (star.life <= 0) {
                this.stars.splice(i, 1);
            }
        }

        // 6. Отрисовка
        this.ctx.globalCompositeOperation = 'lighter';

        this.particles.forEach(p => {
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        });

        this.touchCores.forEach(core => {
            const radius = core.energy * (this.settings.coreMaxSize || 40);
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, radius);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha('#FFFFFF', core.energy * 0.9));
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(core.x, core.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.stars.forEach(star => {
            const size = star.size * star.life;
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life));
            grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life * 0.5));
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    dispose() {
        this.particles = [];
        this.stars = [];
        this.touchCores.clear();
        this.particlePool.forEach(p => p.active = false);
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}