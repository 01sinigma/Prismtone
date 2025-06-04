class TouchTrailsRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.touchHistories = new Map(); // Map для хранения истории касаний
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;
        this.touchHistories.clear();
        console.log("[TouchTrailsRenderer] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas) return;

        let energy = 0;
        if (audioData && this.analyserNodeRef) {
            if (this.analyserNodeRef.type === 'waveform' && audioData instanceof Float32Array) {
                energy = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
            } else if (this.analyserNodeRef.type === 'fft' && audioData instanceof Float32Array) {
                const minDb = this.analyserNodeRef.minDecibels ?? -100;
                const dbRange = (this.analyserNodeRef.maxDecibels ?? -30) - minDb;
                if (dbRange > 0) {
                    const dbSum = audioData.reduce((sum, val) => sum + Math.max(0, (val - minDb) / dbRange), 0);
                    energy = Math.min(1, dbSum / (audioData.length * 0.7));
                }
            }
        }

        const intensity = Math.min(1, energy * (this.settings.energyMultiplier || 3));
        const baseOpacity = this.settings.opacity || 0.7;

        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[TouchTrailsRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            return;
        }

        // Обновление истории касаний
        if (activeTouchStates && activeTouchStates.length > 0) {
            activeTouchStates.forEach(touch => {
                if (!this.touchHistories.has(touch.id)) {
                    this.touchHistories.set(touch.id, []);
                }
                const history = this.touchHistories.get(touch.id);
                history.push({
                    x: touch.x * this.canvas.width,
                    y: (1 - touch.y) * this.canvas.height,
                    time: performance.now(),
                    noteInfo: touch.noteInfo
                });
                // Ограничиваем длину истории
                const maxLength = this.settings.trailLength || 15;
                if (history.length > maxLength) {
                    history.shift();
                }
            });
        }

        // Отрисовка трейлов
        this.touchHistories.forEach((history, touchId) => {
            if (history.length < 2) return;

            let color = this.themeColors.primary;
            if (this.settings.trailColorSource === 'accent') {
                color = this.themeColors.accent;
            } else if (this.settings.trailColorSource === 'note' && history[history.length - 1].noteInfo?.midiNote !== undefined) {
                const noteIndex = history[history.length - 1].noteInfo.midiNote % 12;
                const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                color = defaultNoteColors[noteIndex] || this.themeColors.primary;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(history[0].x, history[0].y);

            for (let i = 1; i < history.length; i++) {
                const point = history[i];
                const prevPoint = history[i - 1];
                const progress = i / (history.length - 1);
                const width = this.settings.trailBaseWidth * (1 + progress * (this.settings.trailWidthMultiplierY || 2));
                const alpha = baseOpacity * (1 - progress) * (1 + intensity * (this.settings.audioReactivity?.opacityMultiplier || 1));

                this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(color, alpha);
                this.ctx.lineWidth = width;
                this.ctx.lineTo(point.x, point.y);
            }

            this.ctx.stroke();
        });

        // Очистка старых трейлов
        const now = performance.now();
        this.touchHistories.forEach((history, touchId) => {
            const lastPoint = history[history.length - 1];
            if (now - lastPoint.time > (this.settings.trailDuration || 1000)) {
                this.touchHistories.delete(touchId);
            }
        });
    }

    dispose() {
        this.touchHistories.clear();
        this.ctx = null;
        this.canvas = null;
        this.analyserNodeRef = null;
        console.log("[TouchTrailsRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('TouchTrailsRenderer', TouchTrailsRenderer);
} else {
    window.TouchTrailsRenderer = TouchTrailsRenderer;
    console.warn('[TouchTrailsRenderer] Registered globally as visualizer object was not available at load time.');
} 