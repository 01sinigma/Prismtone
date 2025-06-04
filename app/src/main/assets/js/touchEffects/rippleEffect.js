class RippleEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.activeRipples = []; // Array of { id, x, y, startTime, duration, maxRadius, color, rings }
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeRipples = [];
        console.log("[RippleEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeRipples.forEach(ripple => {
            if (this.settings.colorSource === 'primary') {
                ripple.color = this.themeColors.primary || 'blue';
            } else if (this.settings.colorSource === 'accent') {
                ripple.color = this.themeColors.accent || 'red';
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        this.activeRipples = this.activeRipples.filter(r => r.id !== touchData.id);

        let color = this.themeColors.primary || 'blue';
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || 'red';
        } else if (this.settings.colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
            const noteIndex = touchData.noteInfo.midiNote % 12;
            const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = defaultNoteColors[noteIndex] || this.themeColors.primary;
        }

        this.activeRipples.push({
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            startTime: performance.now(),
            duration: this.settings.duration || 1000,
            maxRadius: this.settings.maxRadius || 100,
            color: color,
            rings: this.settings.rings || 3,
            ringSpacing: this.settings.ringSpacing || 0.2
        });
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;
        const ripple = this.activeRipples.find(r => r.id === touchData.id);
        if (ripple) {
            ripple.x = touchData.x * this.canvas.width;
            ripple.y = (1 - touchData.y) * this.canvas.height;
        }
    }

    onTouchUp(touchId) {
        const ripple = this.activeRipples.find(r => r.id === touchId);
        if (ripple) {
            ripple.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeRipples.length === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = 'lighter';

        this.activeRipples = this.activeRipples.filter(ripple => {
            const elapsed = now - ripple.startTime;
            if (elapsed >= ripple.duration) return false;

            const progress = elapsed / ripple.duration;
            const baseOpacity = this.settings.baseOpacity || 0.6;

            for (let i = 0; i < ripple.rings; i++) {
                const ringProgress = (progress + i * ripple.ringSpacing) % 1;
                if (ringProgress < 0) continue;

                const ringRadius = ripple.maxRadius * ringProgress;
                const ringAlpha = baseOpacity * (1 - ringProgress);

                if (ringAlpha <= 0.01) continue;

                this.ctx.beginPath();
                this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(ripple.color, ringAlpha);
                this.ctx.lineWidth = 2;
                this.ctx.arc(ripple.x, ripple.y, ringRadius, 0, Math.PI * 2);
                this.ctx.stroke();

                // Добавляем внутреннее свечение
                const glowGradient = this.ctx.createRadialGradient(
                    ripple.x, ripple.y, ringRadius - 2,
                    ripple.x, ripple.y, ringRadius + 2
                );
                glowGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(ripple.color, ringAlpha * 0.3));
                glowGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(ripple.color, 0));
                this.ctx.fillStyle = glowGradient;
                this.ctx.fill();
            }

            return true;
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.activeRipples = [];
        this.ctx = null;
        this.canvas = null;
        console.log("[RippleEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('RippleEffect', RippleEffect);
} else {
    window.RippleEffect = RippleEffect;
    console.warn('[RippleEffect] Registered globally as visualizer object was not available at load time.');
} 