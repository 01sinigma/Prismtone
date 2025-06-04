class GlowEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.activeGlows = []; // Array of { id, x, y, color, startTime, isActive, growth }
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeGlows = [];
        console.log("[GlowEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeGlows.forEach(glow => {
            if (this.settings.colorSource === 'primary') {
                glow.color = this.themeColors.primary || 'blue';
            } else if (this.settings.colorSource === 'accent') {
                glow.color = this.themeColors.accent || 'red';
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        let color = this.themeColors.primary || 'blue';
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || 'red';
        } else if (this.settings.colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
            const noteIndex = touchData.noteInfo.midiNote % 12;
            const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = defaultNoteColors[noteIndex] || this.themeColors.primary;
        }

        this.activeGlows.push({
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            color: color,
            startTime: performance.now(),
            isActive: true,
            growth: 0
        });
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;
        const glow = this.activeGlows.find(g => g.id === touchData.id);
        if (glow) {
            glow.x = touchData.x * this.canvas.width;
            glow.y = (1 - touchData.y) * this.canvas.height;
        }
    }

    onTouchUp(touchId) {
        const glow = this.activeGlows.find(g => g.id === touchId);
        if (glow) {
            glow.isActive = false;
            glow.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeGlows.length === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = 'lighter';

        this.activeGlows = this.activeGlows.filter(glow => {
            if (!glow.isActive) {
                // Анимация исчезновения
                const fadeElapsed = now - glow.fadeStartTime;
                const fadeProgress = Math.min(fadeElapsed / 500, 1);
                if (fadeProgress >= 1) return false;

                const baseOpacity = this.settings.baseOpacity || 1.0;
                const alpha = baseOpacity * (1 - fadeProgress);
                const radius = (this.settings.maxRadius || 100) * (1 - fadeProgress * 0.5);

                const gradient = this.ctx.createRadialGradient(
                    glow.x, glow.y, 0,
                    glow.x, glow.y, radius
                );
                gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(glow.color, alpha));
                gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(glow.color, alpha * 0.5));
                gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(glow.color, 0));

                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(glow.x, glow.y, radius, 0, Math.PI * 2);
                this.ctx.fill();

                return true;
            }

            // Увеличиваем рост со временем
            const elapsed = now - glow.startTime;
            glow.growth = Math.min(elapsed / 2000, 1); // Рост за 2 секунды

            const baseOpacity = this.settings.baseOpacity || 1.0;
            const pulseSpeed = this.settings.pulseSpeed || 2;
            const maxRadius = this.settings.maxRadius || 100;
            const minRadius = this.settings.minRadius || 60;

            // Комбинируем пульсацию с ростом
            const pulse = (Math.sin(now * 0.001 * pulseSpeed) + 1) * 0.5;
            const radius = (minRadius + (maxRadius - minRadius) * pulse) * (1 + glow.growth);
            const alpha = baseOpacity * (0.5 + pulse * 0.5);

            // Рисуем свечение
            const gradient = this.ctx.createRadialGradient(
                glow.x, glow.y, 0,
                glow.x, glow.y, radius
            );
            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(glow.color, alpha));
            gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(glow.color, alpha * 0.5));
            gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(glow.color, 0));

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(glow.x, glow.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            return true;
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.activeGlows = [];
        this.ctx = null;
        this.canvas = null;
        console.log("[GlowEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('GlowEffect', GlowEffect);
} else {
    window.GlowEffect = GlowEffect;
    console.warn('[GlowEffect] Registered globally as visualizer object was not available at load time.');
}