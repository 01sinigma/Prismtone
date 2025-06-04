class MarkerEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.activeMarkers = []; // Array of { id, x, y, color, startTime, isActive, points }
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeMarkers = [];
        console.log("[MarkerEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeMarkers.forEach(marker => {
            if (this.settings.colorSource === 'primary') {
                marker.color = this.themeColors.primary || 'blue';
            } else if (this.settings.colorSource === 'accent') {
                marker.color = this.themeColors.accent || 'red';
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

        this.activeMarkers.push({
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            color: color,
            startTime: performance.now(),
            isActive: true,
            points: [{
                x: touchData.x * this.canvas.width,
                y: (1 - touchData.y) * this.canvas.height,
                time: performance.now()
            }]
        });
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;
        const marker = this.activeMarkers.find(m => m.id === touchData.id);
        if (marker) {
            marker.x = touchData.x * this.canvas.width;
            marker.y = (1 - touchData.y) * this.canvas.height;
            
            // Добавляем новую точку в след
            marker.points.push({
                x: marker.x,
                y: marker.y,
                time: performance.now()
            });

            // Ограничиваем количество точек
            const maxPoints = this.settings.maxPoints || 50;
            if (marker.points.length > maxPoints) {
                marker.points.shift();
            }
        }
    }

    onTouchUp(touchId) {
        const marker = this.activeMarkers.find(m => m.id === touchId);
        if (marker) {
            marker.isActive = false;
            marker.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeMarkers.length === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = 'lighter';

        this.activeMarkers = this.activeMarkers.filter(marker => {
            if (!marker.isActive) {
                // Анимация исчезновения
                const fadeElapsed = now - marker.fadeStartTime;
                const fadeProgress = Math.min(fadeElapsed / 2000, 1); // 2 секунды на исчезновение
                if (fadeProgress >= 1) return false;

                // Рисуем след с затуханием
                this.drawTrail(marker, 1 - fadeProgress);
                return true;
            }

            // Рисуем активный след
            this.drawTrail(marker, 1);
            return true;
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawTrail(marker, fadeMultiplier) {
        if (marker.points.length < 2) return;

        const baseOpacity = this.settings.baseOpacity || 1.0;
        const maxWidth = this.settings.maxWidth || 20;
        const minWidth = this.settings.minWidth || 5;

        // Рисуем линию
        this.ctx.beginPath();
        this.ctx.moveTo(marker.points[0].x, marker.points[0].y);

        for (let i = 1; i < marker.points.length; i++) {
            const point = marker.points[i];
            const progress = i / (marker.points.length - 1);
            const width = minWidth + (maxWidth - minWidth) * (1 - progress);
            const alpha = baseOpacity * fadeMultiplier * (1 - progress * 0.5);

            this.ctx.lineWidth = width;
            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(marker.color, alpha);
            this.ctx.lineTo(point.x, point.y);
        }

        this.ctx.stroke();

        // Добавляем свечение в конце
        const lastPoint = marker.points[marker.points.length - 1];
        const glowRadius = maxWidth * 2;
        const gradient = this.ctx.createRadialGradient(
            lastPoint.x, lastPoint.y, 0,
            lastPoint.x, lastPoint.y, glowRadius
        );
        gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(marker.color, baseOpacity * fadeMultiplier));
        gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(marker.color, 0));

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(lastPoint.x, lastPoint.y, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    dispose() {
        this.activeMarkers = [];
        this.ctx = null;
        this.canvas = null;
        console.log("[MarkerEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('MarkerEffect', MarkerEffect);
} else {
    window.MarkerEffect = MarkerEffect;
    console.warn('[MarkerEffect] Registered globally as visualizer object was not available at load time.');
} 