// Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js

class StellarNurseryRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particles = [];
        this.stars = [];
        // Map<touchId, {x, y, energy, birthTime}>
        this.touchCores = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this._initParticles();
        console.log("[StellarNurseryRenderer] Initialized.");
    }

    onThemeChange(themeColors) { this.themeColors = themeColors; }
    onResize() { this._initParticles(); }

    _initParticles() {
        if (!this.canvas) return;
        this.particles = [];
        const count = this.settings.particleCount || 1500;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: 0,
                vy: 0,
                size: 0.5 + Math.random() * 1.5,
                color: this.globalVisualizerRef.getColorWithAlpha(this.themeColors.primary, Math.random() * 0.3 + 0.1)
            });
        }
    }

    _spawnStar(x, y, energy) {
        const star = {
            x, y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: 5 + energy * 20,
            life: 1.0,
            decay: 0.001 + Math.random() * 0.001
        };
        this.stars.push(star);
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 10, ${this.settings.fadeSpeed || 0.2})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const windX = (deviceTilt.roll / 45) * (this.settings.windStrength || 0.3);
        const windY = (deviceTilt.pitch / 45) * (this.settings.windStrength || 0.3);
        const friction = this.settings.friction || 0.98;

        // Обновляем ядра от активных касаний
        const activeTouchIds = new Set(activeTouchStates.map(t => t.id));
        this.touchCores.forEach((core, id) => {
            if (!activeTouchIds.has(id)) this.touchCores.delete(id);
        });

        activeTouchStates.forEach(touch => {
            let core = this.touchCores.get(touch.id);
            if (!core) {
                core = { x: 0, y: 0, energy: 0, birthTime: performance.now() };
                this.touchCores.set(touch.id, core);
            }
            core.x = touch.x * this.canvas.width;
            core.y = (1 - touch.y) * this.canvas.height;
            core.energy += touch.y * (this.settings.energyGain || 0.01);
            core.energy = Math.min(1, core.energy);
        });

        // Анимация частиц
        this.particles.forEach(p => {
            p.vx += windX;
            p.vy += windY;

            this.touchCores.forEach(core => {
                const dx = core.x - p.x;
                const dy = core.y - p.y;
                const distSq = dx * dx + dy * dy;
                const force = core.energy * (this.settings.attraction || 50) / (distSq + 100);
                p.vx += dx * force;
                p.vy += dy * force;
            });

            p.vx *= friction;
            p.vy *= friction;
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x += this.canvas.width;
            if (p.x > this.canvas.width) p.x -= this.canvas.width;
            if (p.y < 0) p.y += this.canvas.height;
            if (p.y > this.canvas.height) p.y -= this.canvas.height;
        });

        // Анимация звезд
        this.stars = this.stars.filter(star => {
            star.vx += windX;
            star.vy += windY;
            star.vx *= friction;
            star.vy *= friction;
            star.x += star.vx;
            star.y += star.vy;
            star.life -= star.decay;
            return star.life > 0;
        });

        // Отрисовка
        this.ctx.globalCompositeOperation = 'lighter';

        this.particles.forEach(p => {
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.touchCores.forEach(core => {
            const radius = core.energy * (this.settings.coreMaxSize || 40);
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, radius);
            grad.addColorStop(0, `rgba(255, 255, 255, ${core.energy * 0.9})`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(core.x, core.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.stars.forEach(star => {
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * star.life);
            grad.addColorStop(0, `rgba(255, 255, 220, ${star.life})`);
            grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size * star.life, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    onTouchUp(touchId) {
        const core = this.touchCores.get(touchId);
        if (core) {
            this._spawnStar(core.x, core.y, core.energy);
            this.touchCores.delete(touchId);
        }
    }

    dispose() {
        this.particles = [];
        this.stars = [];
        this.touchCores.clear();
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}