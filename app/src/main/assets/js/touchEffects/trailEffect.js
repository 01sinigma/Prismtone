class TrailEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.activeTrails = []; // Array of { id, points, color, lastUpdate, isActive }
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeTrails = [];
        console.log("[TrailEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeTrails.forEach(trail => {
            if (this.settings.colorSource === 'primary') {
                trail.color = this.themeColors.primary || 'blue';
            } else if (this.settings.colorSource === 'accent') {
                trail.color = this.themeColors.accent || 'red';
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

        this.activeTrails.push({
            id: touchData.id,
            points: [{
                x: touchData.x * this.canvas.width,
                y: (1 - touchData.y) * this.canvas.height,
                time: performance.now()
            }],
            color: color,
            lastUpdate: performance.now(),
            isActive: true
        });
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;
        const trail = this.activeTrails.find(t => t.id === touchData.id);
        if (trail) {
            const now = performance.now();
            if (now - trail.lastUpdate > (this.settings.updateInterval || 16)) {
                trail.points.push({
                    x: touchData.x * this.canvas.width,
                    y: (1 - touchData.y) * this.canvas.height,
                    time: now
                });
                trail.lastUpdate = now;

                // Ограничиваем количество точек
                const maxPoints = this.settings.maxPoints || 50;
                if (trail.points.length > maxPoints) {
                    trail.points = trail.points.slice(-maxPoints);
                }
            }
        }
    }

    onTouchUp(touchId) {
        const trail = this.activeTrails.find(t => t.id === touchId);
        if (trail) {
            trail.isActive = false;
            trail.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeTrails.length === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = 'lighter';

        this.activeTrails = this.activeTrails.filter(trail => {
            if (trail.points.length < 2) return false;

            const baseOpacity = this.settings.baseOpacity || 0.8;
            const trailDuration = this.settings.trailDuration || 1000;

            // Рисуем след
            this.ctx.beginPath();
            this.ctx.moveTo(trail.points[0].x, trail.points[0].y);

            for (let i = 1; i < trail.points.length; i++) {
                const point = trail.points[i];
                const elapsed = now - point.time;
                const progress = elapsed / trailDuration;
                
                if (!trail.isActive && progress >= 1) {
                    trail.points = trail.points.slice(i);
                    break;
                }

                const alpha = trail.isActive ? baseOpacity : baseOpacity * (1 - progress);
                const width = trail.isActive ? this.settings.maxWidth || 4 : (this.settings.maxWidth || 4) * (1 - progress);

                this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(trail.color, alpha);
                this.ctx.lineWidth = width;
                this.ctx.lineTo(point.x, point.y);
            }

            this.ctx.stroke();

            // Добавляем свечение в конце следа
            if (trail.points.length > 0) {
                const lastPoint = trail.points[trail.points.length - 1];
                const elapsed = now - lastPoint.time;
                const progress = elapsed / trailDuration;
                const alpha = trail.isActive ? baseOpacity : baseOpacity * (1 - progress);

                const glowGradient = this.ctx.createRadialGradient(
                    lastPoint.x, lastPoint.y, 0,
                    lastPoint.x, lastPoint.y, this.settings.glowRadius || 20
                );
                glowGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(trail.color, alpha * 0.3));
                glowGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(trail.color, 0));

                this.ctx.fillStyle = glowGradient;
                this.ctx.beginPath();
                this.ctx.arc(lastPoint.x, lastPoint.y, this.settings.glowRadius || 20, 0, Math.PI * 2);
                this.ctx.fill();
            }

            return trail.points.length > 0;
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.activeTrails = [];
        this.ctx = null;
        this.canvas = null;
        console.log("[TrailEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('TrailEffect', TrailEffect);
} else {
    window.TrailEffect = TrailEffect;
    console.warn('[TrailEffect] Registered globally as visualizer object was not available at load time.');
} 