class ReactiveRipplesRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.ripples = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;
        this.ripples = [];
        console.log("[ReactiveRipplesRenderer] Initialized with settings:", this.settings);
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
        const baseOpacity = this.settings.opacity || 0.5;

        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[ReactiveRipplesRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            return;
        }

        // Обработка активных касаний
        if (this.settings.reactToTouches && activeTouchStates && activeTouchStates.length > 0) {
            activeTouchStates.forEach(touch => {
                this.ripples.push({
                    x: touch.x * this.canvas.width,
                    y: (1 - touch.y) * this.canvas.height,
                    radius: 0,
                    maxRadius: this.settings.rippleMaxRadius || 100,
                    startTime: performance.now(),
                    duration: this.settings.rippleDuration || 1000,
                    color: this.settings.rippleColor || this.themeColors.primary
                });
            });
        }

        // Отрисовка и обновление ряби
        const now = performance.now();
        this.ripples = this.ripples.filter(ripple => {
            const elapsed = now - ripple.startTime;
            if (elapsed >= ripple.duration) return false;

            const progress = elapsed / ripple.duration;
            const currentRadius = ripple.maxRadius * progress;
            const alpha = baseOpacity * (1 - progress);

            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, currentRadius, 0, Math.PI * 2);
            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(ripple.color, alpha);
            this.ctx.lineWidth = this.settings.rippleLineWidth || 2;
            this.ctx.stroke();

            return true;
        });

        // Автоматическое создание ряби при наличии аудио
        if (this.settings.reactToAudio && intensity > 0.1) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            this.ripples.push({
                x: centerX,
                y: centerY,
                radius: 0,
                maxRadius: this.settings.rippleMaxRadius * (1 + intensity),
                startTime: now,
                duration: this.settings.rippleDuration * (1 - intensity * 0.5),
                color: this.settings.rippleColor || this.themeColors.primary
            });
        }
    }

    dispose() {
        this.ripples = [];
        this.ctx = null;
        this.canvas = null;
        this.analyserNodeRef = null;
        console.log("[ReactiveRipplesRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('ReactiveRipplesRenderer', ReactiveRipplesRenderer);
} else {
    window.ReactiveRipplesRenderer = ReactiveRipplesRenderer;
    console.warn('[ReactiveRipplesRenderer] Registered globally as visualizer object was not available at load time.');
} 