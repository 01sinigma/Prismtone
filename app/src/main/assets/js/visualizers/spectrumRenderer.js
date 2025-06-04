class SpectrumRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.particles = [];
        this.lastSpawn = 0;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;
        this.particles = [];
        this.lastSpawn = 0;
        console.log("[SpectrumRenderer] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _getBackgroundGradient() {
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, this.themeColors.background || '#181c2a');
        grad.addColorStop(1, this.themeColors.primary || '#23234a');
        return grad;
    }

    _getParticleGradient(x, y, r, touchColors) {
        const ctx = this.ctx;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        if (touchColors && touchColors.length > 1) {
            for (let i = 0; i < touchColors.length; i++) {
                grad.addColorStop(i / (touchColors.length - 1), touchColors[i]);
            }
        } else if (touchColors && touchColors.length === 1) {
            grad.addColorStop(0, touchColors[0]);
            grad.addColorStop(1, this.themeColors.accent || '#fffbe6');
        } else {
            grad.addColorStop(0, this.themeColors.primary || '#69f0ae');
            grad.addColorStop(1, this.themeColors.accent || '#b388ff');
        }
        return grad;
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas || !this.analyserNodeRef) return;
        if (!(audioData instanceof Float32Array) || audioData.length === 0) return;
        // === ФОН ===
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = this._getBackgroundGradient();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // === Fade trails ===
        this.ctx.globalAlpha = 0.18;
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalAlpha = 1.0;
        // === Цвета для нот/касаний ===
        let noteColors = [];
        if (activeTouchStates && activeTouchStates.length > 0) {
            for (const t of activeTouchStates) {
                if (t.noteInfo && t.noteInfo.color) {
                    noteColors.push(t.noteInfo.color);
                } else if (this.themeColors.accent) {
                    noteColors.push(this.themeColors.accent);
                }
            }
        }
        if (noteColors.length === 0) {
            noteColors = [this.themeColors.primary || '#69f0ae', this.themeColors.accent || '#b388ff'];
        }
        // === Генерация новых частиц ===
        const downsample = 4;
        const bufferLength = Math.floor(audioData.length / downsample);
        const minDb = this.analyserNodeRef.minDecibels ?? -100;
        const maxDb = this.analyserNodeRef.maxDecibels ?? -30;
        const dbRange = maxDb - minDb;
        let zoneCount = noteColors.length;
        let zoneWidth = Math.floor(bufferLength / zoneCount);
        for (let i = 0; i < bufferLength; i++) {
            const srcIdx = i * downsample;
            const dbValue = audioData[srcIdx];
            const normalized = dbRange > 0 ? Math.max(0, Math.min(1, (dbValue - minDb) / dbRange)) : 0;
            if (normalized > 0.18 && Math.random() < normalized * 0.7) {
                const x = (i + 0.5) * (this.canvas.width / bufferLength) + (Math.random() - 0.5) * 4;
                const y = this.canvas.height + 2;
                let zoneIdx = Math.min(zoneCount - 1, Math.floor(i / zoneWidth));
                let color = noteColors[zoneIdx];
                const r = 2 + normalized * 3 + Math.random() * 1.2;
                const g = 0.38 + 0.12 * Math.random();
                const maxHeight = this.canvas.height * (0.25 + 0.65 * normalized);
                const v0 = -Math.sqrt(2 * g * maxHeight);
                // Для вспышки на пике
                const willFlash = Math.random() < 0.04 && normalized > 0.7;
                this.particles.push({
                    x, y, r,
                    vy: v0,
                    g,
                    alpha: 0.9,
                    color,
                    life: 0,
                    maxLife: (-v0) / g,
                    flash: willFlash,
                    flashed: false
                });
            }
        }
        // === Анимация и удаление частиц ===
        const dt = 1 / 60;
        let nextParticles = [];
        for (let p of this.particles) {
            p.y += p.vy;
            p.vy += p.g;
            p.life += dt;
            // Альфа линейно убывает к моменту достижения вершины
            p.alpha = Math.max(0, 1 - p.life / p.maxLife);
            // === Вспышка на пике ===
            if (p.flash && !p.flashed && p.life > p.maxLife * 0.95) {
                p.alpha = 1.0;
                p.r *= 1.7;
                p.flashed = true;
            }
            if (p.y < -10 || p.y > this.canvas.height + 10 || p.alpha < 0.05 || p.life > p.maxLife) continue;
            nextParticles.push(p);
        }
        this.particles = nextParticles.slice(-500);
        // === Отрисовка частиц ===
        const now = performance.now() / 1000;
        for (let p of this.particles) {
            // === Пульсация радиуса ===
            const pulse = 0.85 + 0.18 * Math.sin(now * 3 + p.x * 0.01 + p.life * 6);
            let drawR = p.r * pulse;
            // === Градиент цвета по высоте ===
            let grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, drawR);
            grad.addColorStop(0, p.color);
            grad.addColorStop(1, '#fffbe6');
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, drawR, 0, Math.PI * 2);
            this.ctx.fillStyle = grad;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 8;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            this.ctx.restore();
        }
    }

    dispose() {
        this.ctx = null;
        this.canvas = null;
        console.log("[SpectrumRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('SpectrumRenderer', SpectrumRenderer);
} else {
    window.SpectrumRenderer = SpectrumRenderer;
    console.warn('[SpectrumRenderer] Registered globally as visualizer object was not available at load time.');
}