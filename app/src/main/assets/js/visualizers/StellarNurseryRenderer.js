// Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js
// ВЕРСИЯ 3.1: Продвинутая физика звезд (гравитация, полярность, отскок, сверхновая) и оптимизация.

class StellarNurseryRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particles = []; // Частицы фоновой туманности
        this.stars = [];     // "Рожденные" звезды
        this.touchCores = new Map(); // Активные касания

        // >>> OPTIMIZATION: Пул объектов для частиц от взрывов <<<
        this.explosionParticlePool = [];
        this.poolSize = 300; // Максимальное количество частиц от взрывов на экране
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas || !globalVisualizerRef) {
            console.error("[StellarNursery] FATAL: Ctx, Canvas, or GlobalVisualizerRef not provided!");
            return;
        }
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            starGravityFactor: 800,
            starPolarityStrength: 1200,
            starBounceDamping: -0.6,
            explosion: { particleCount: 40, maxSpeed: 3.5, lifeMs: 600, size: 2.5 },
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.stars = [];
        this.touchCores.clear();
        this.explosionParticlePool = [];
        for (let i = 0; i < this.poolSize; i++) {
            this.explosionParticlePool.push({ active: false });
        }

        this.onResize();
        console.log("[StellarNurseryRenderer v3.1] Initialized with Advanced Physics.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors || {};
        this._initParticles();
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        this._initParticles();
    }

    _initParticles() {
        if (!this.canvas || !this.globalVisualizerRef) return;
        this.particles = [];
        const count = this.settings.particleCount || 800;
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

        let coreColor = this.themeColors.accent || '#FFD54F';
        if (touchData.noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            coreColor = this.globalVisualizerRef.noteColors[touchData.noteInfo.midiNote % 12];
        }

        const core = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            energy: 0.1,
            color: coreColor,
            isActive: true,
            noteInfo: touchData.noteInfo,
            creationTime: performance.now(),
            size: this.settings.coreMinSize || 10,
            mass: 1.0,
            history: [{ x: touchData.x * this.canvas.width, y: (1 - touchData.y) * this.canvas.height, time: performance.now() }]
        };
        this.touchCores.set(touchData.id, core);
    }

    onTouchUp(touchId) {
        const core = this.touchCores.get(touchId);
        if (core) {
            let vx = (Math.random() - 0.5) * 2;
            let vy = (Math.random() - 0.5) * 2;
            if (core.history.length > 1) {
                const lastPoint = core.history[core.history.length - 1];
                const prevPoint = core.history[0];
                const timeDiff = (lastPoint.time - prevPoint.time) / 1000;
                if (timeDiff > 0.01) {
                    const inertiaDamping = this.settings.inertiaDamping || 30;
                    vx = (lastPoint.x - prevPoint.x) / timeDiff / inertiaDamping;
                    vy = (lastPoint.y - prevPoint.y) / timeDiff / inertiaDamping;
                }
            }

            this.stars.push({
                x: core.x, y: core.y,
                vx, vy,
                size: core.size,
                mass: core.mass,
                life: 1.0,
                decay: 0.001 + Math.random() * 0.001,
                color: core.color
            });
            this.touchCores.delete(touchId);
        }
    }

    _triggerStarExplosion(star) {
        const explosionSettings = this.settings.explosion || {};
        const particleCount = explosionSettings.particleCount || Math.floor(star.size * 1.5);
        const maxSpeed = explosionSettings.maxSpeed || 3;
        const lifeMs = explosionSettings.lifeMs || 600;

        for (let i = 0; i < particleCount; i++) {
            const p = this.explosionParticlePool.find(p => !p.active);
            if (!p) continue;

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * maxSpeed * (star.mass / 5);

            Object.assign(p, {
                active: true, x: star.x, y: star.y,
                vx: star.vx * 0.1 + Math.cos(angle) * speed,
                vy: star.vy * 0.1 + Math.sin(angle) * speed,
                size: Math.random() * (explosionSettings.size || 2) + 1,
                color: star.color,
                life: 1.0,
                decay: 1.0 / (lifeMs / 16.66)
            });
        }
    }

    _getColorDifference(color1, color2) {
        const rgb1 = this.globalVisualizerRef.hexToRgb(color1) || {r:0, g:0, b:0};
        const rgb2 = this.globalVisualizerRef.hexToRgb(color2) || {r:0, g:0, b:0};
        const diff = Math.sqrt(Math.pow(rgb1.r - rgb2.r, 2) + Math.pow(rgb1.g - rgb2.g, 2) + Math.pow(rgb1.b - rgb2.b, 2));
        return diff / 441.67; // Normalize to 0-1 (sqrt(255^2 * 3))
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;
        const now = performance.now();

        // 1. Очистка фона
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 10, ${this.settings.fadeSpeed || 0.25})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Обновление ядер касаний
        const activeTouchIds = new Set(activeTouchStates.map(t => t.id));
        this.touchCores.forEach((core, id) => { if (!activeTouchIds.has(id)) this.onTouchUp(id); });
        activeTouchStates.forEach(touch => {
            let core = this.touchCores.get(touch.id);
            if (core) {
                const newX = touch.x * this.canvas.width; const newY = (1 - touch.y) * this.canvas.height;
                core.history.push({ x: newX, y: newY, time: now });
                if (core.history.length > 5) core.history.shift();
                core.x = newX; core.y = newY;
                core.energy = Math.min(1, core.energy + touch.y * (this.settings.energyGain || 0.015));
                if (this.globalVisualizerRef.noteColors?.length > 0) core.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12] || core.color;
            } else { this.onTouchDown(touch); }
        });

        // 3. Вычисление сил
        const windStrength = this.settings.windStrength || 0.3;
        const windX = (deviceTilt.roll / 90) * windStrength;
        const windY = (deviceTilt.pitch / 90) * windStrength;
        const friction = this.settings.friction || 0.97;

        // 4. Анимация фоновых частиц
        this.particles.forEach(p => {
            let totalForceX = windX; let totalForceY = windY;
            this.touchCores.forEach(core => {
                const dx = core.x - p.x; const dy = core.y - p.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > 1) {
                    const force = core.energy * (this.settings.attraction || 50) / (distSq + 100);
                    totalForceX += dx * force; totalForceY += dy * force;
                }
            });
            this.stars.forEach(star => {
                const dx = star.x - p.x; const dy = star.y - p.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > 1) {
                    const force = (star.mass * (this.settings.starGravityFactor || 800)) / (distSq + 1000);
                    totalForceX += dx * force / Math.sqrt(distSq);
                    totalForceY += dy * force / Math.sqrt(distSq);
                }
            });
            p.vx = (p.vx + totalForceX) * friction; p.vy = (p.vy + totalForceY) * friction;
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) { p.x = 0; p.vx *= -0.5; } if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx *= -0.5; }
            if (p.y < 0) { p.y = 0; p.vy *= -0.5; } if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy *= -0.5; }
        });

        // 5. Анимация частиц от взрывов
        this.explosionParticlePool.forEach(p => {
            if (!p.active) return;
            p.vx = (p.vx + windX) * friction; p.vy = (p.vy + windY) * friction;
            p.x += p.vx; p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) p.active = false;
        });

        // 6. Анимация звезд
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const starA = this.stars[i];
            for (let j = i + 1; j < this.stars.length; j++) {
                const starB = this.stars[j];
                const dx = starB.x - starA.x; const dy = starB.y - starA.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 1) continue;
                const dist = Math.sqrt(distSq);
                const colorDiff = this._getColorDifference(starA.color, starB.color);
                const polarity = 1.0 - (colorDiff * (this.settings.starPolarityStrength || 2.0));
                const force = polarity * (this.settings.starGravity || 30) * starA.mass * starB.mass / (distSq + 100);
                const fx = (dx / dist) * force; const fy = (dy / dist) * force;
                starA.vx += fx / starA.mass; starA.vy += fy / starA.mass;
                starB.vx -= fx / starB.mass; starB.vy -= fy / starB.mass;
            }
            starA.vx = (starA.vx + windX) * friction; starA.vy = (starA.vy + windY) * friction;
            starA.x += starA.vx; starA.y += starA.vy;
            const damp = this.settings.starBounceDamping || -0.6;
            if (starA.x < starA.size) { starA.x = starA.size; starA.vx *= damp; }
            if (starA.x > this.canvas.width - starA.size) { starA.x = this.canvas.width - starA.size; starA.vx *= damp; }
            if (starA.y < starA.size) { starA.y = starA.size; starA.vy *= damp; }
            if (starA.y > this.canvas.height - starA.size) { starA.y = this.canvas.height - starA.size; starA.vy *= damp; }
            starA.life -= starA.decay;
            if (starA.life <= 0) {
                this._triggerStarExplosion(starA);
                this.stars.splice(i, 1);
            }
        }

        // 7. Отрисовка
        this.ctx.globalCompositeOperation = 'lighter';
        this.particles.forEach(p => {
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            const alpha = parseFloat(p.color.match(/[\d\.]+\)$/));
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(p.color, alpha * 0.8));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(p.color, 0));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); this.ctx.fill();
        });
        this.touchCores.forEach(core => {
            const holdDuration = now - core.creationTime;
            const sizeFactor = Math.min(1.0, holdDuration / (this.settings.timeToMaxSizeMs || 2000));
            core.size = (this.settings.coreMinSize || 10) + (this.settings.coreMaxSize || 40) * sizeFactor;
            core.mass = 1 + sizeFactor * (this.settings.maxMassFactor || 10);
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha('#FFFFFF', core.energy * 0.9));
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(core.x, core.y, core.size, 0, Math.PI * 2); this.ctx.fill();
        });
        this.stars.forEach(star => {
            const size = star.size * star.life;
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life));
            grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life * 0.5));
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(star.x, star.y, size, 0, Math.PI * 2); this.ctx.fill();
        });
        this.explosionParticlePool.forEach(p => {
            if (p.active) {
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, p.life * 0.9);
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.particles = [];
        this.stars = [];
        this.touchCores.clear();
        this.explosionParticlePool.forEach(p => p.active = false);
    }
}

// Саморегистрация в visualizer.js
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}