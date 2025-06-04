class WavesRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null; // Ссылка на основной объект visualizer
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        console.log("[WavesRenderer] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas) return;
        if (!(audioData instanceof Float32Array) || audioData.length === 0) {
            return;
        }

        const bufferLength = audioData.length;
        const sliceWidth = this.canvas.width / bufferLength;
        let x = 0;

        this.ctx.lineWidth = this.settings.lineWidth || 2;
        const opacity = this.settings.opacity || 0.7;
        let strokeColor = this.themeColors.primary || 'blue';

        if (this.settings.reactToTouches && activeTouchStates && activeTouchStates.length > 0) {
            const colorSource = this.settings.touchColorSource || 'note';
            const lastTouch = activeTouchStates[activeTouchStates.length - 1];
            if (colorSource === 'note' && lastTouch.noteInfo?.midiNote !== undefined) {
                const noteIndex = lastTouch.noteInfo.midiNote % 12;
                const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                strokeColor = defaultNoteColors[noteIndex] || this.themeColors.primary;
            } else if (this.settings.lineColor === 'accent') {
                strokeColor = this.themeColors.accent || 'red';
            }
        } else if (this.settings.lineColor === 'accent') {
            strokeColor = this.themeColors.accent || 'red';
        }
        
        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[WavesRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            return;
        }

        this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(strokeColor, opacity);

        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height / 2);

        for (let i = 0; i < bufferLength; i++) {
            const v = audioData[i];
            const y = (v * 0.5 + 0.5) * this.canvas.height;
            this.ctx.lineTo(x, y);
            x += sliceWidth;
        }
        this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
        this.ctx.stroke();

        if (this.settings.fill) {
            const fillColor = this.settings.fillColor === 'accent' ? (this.themeColors.accent || 'red') : strokeColor;
            const fillAlpha = this.settings.fillAlpha || 0.1;
            this.ctx.lineTo(this.canvas.width, this.canvas.height);
            this.ctx.lineTo(0, this.canvas.height);
            this.ctx.closePath();
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(fillColor, fillAlpha);
            this.ctx.fill();
        }
    }

    dispose() {
        this.ctx = null;
        this.canvas = null;
        console.log("[WavesRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('WavesRenderer', WavesRenderer);
} else {
    window.WavesRenderer = WavesRenderer;
    console.warn('[WavesRenderer] Registered globally as visualizer object was not available at load time.');
}