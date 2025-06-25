class WavesRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.particles = [];
        this.lastParticleSpawnTime = 0;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            lineWidth: 2,
            opacity: 0.7,
            lineColor: 'primary',
            touchColorSource: 'note',
            reactToTouches: false,
            fill: false,
            fillColor: 'stroke',
            fillAlpha: 0.1,
            amplitudeAudioFactor: 1.0,
            lineWidthAudioFactor: 1.0,
            tiltEffectFactor: 0.2,
            // Phase 2 - Sub-waves
            numSubWaves: 2,
            subWaveAmplitudeFactor: 0.5, // Relative to main wave's calculated amplitude
            subWaveLineWidthFactor: 0.6, // Relative to main wave's calculated lineWidth
            subWaveOpacityFactor: 0.5,   // Relative to main wave's opacity
            subWaveYOffset: 10,          // Pixels per subwave
            // Phase 2 - Glow
            enableGlow: true,
            glowColorSource: 'auto', // 'auto' (uses line color), 'accent', 'primary', or a hex string
            baseGlowBlur: 5,
            glowBlurAudioFactor: 15, // Additional blur based on trebleEnergy
            // Phase 2 - Peak Particles
            enablePeakParticles: true,
            peakThreshold: 0.7, // Normalized audioData value to trigger particle
            particleSpawnRate: 100, // Min ms between spawns per peak point
            particleMaxCount: 100,
            particleLifespan: 700, // ms
            particleBaseSize: 1.5,
            particleSizeAudioFactor: 1.0, // overallVolume affects size
            particleSpeedY: -0.5, // Negative for upward movement
            particleSpeedXSpread: 0.5, // Random X speed range
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.particles = [];
        console.log("[WavesRenderer] Initialized with settings (Phase 2):", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    draw(audioData, activeTouchStates, audioMetrics, motionData) {
        if (!this.ctx || !this.canvas) return;
        if (!(audioData instanceof Float32Array) || audioData.length === 0) {
            // Optionally, draw a flat line if no audio data
            // this.ctx.beginPath();
            // this.ctx.moveTo(0, this.canvas.height / 2);
            // this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
            // this.ctx.stroke();
            return;
        }

        const bufferLength = audioData.length;
        const sliceWidth = this.canvas.width / bufferLength;
        let x = 0;

        // Audio Metrics
        const overallVolume = audioMetrics?.overallVolume ?? 0.5; // Default to 0.5 if not provided
        const bassEnergy = audioMetrics?.bassEnergy ?? 0.5; // Default to 0.5 if not provided

        // Motion Data
        const tiltY = motionData?.tiltY ?? 0; // Default to 0 if not provided

        // Settings
        const baseLineWidth = this.settings.lineWidth || 2;
        const opacity = this.settings.opacity || 0.7;
        let strokeColor = this.themeColors.primary || 'blue';
        const amplitudeFactor = this.settings.amplitudeAudioFactor || 1.0;
        const lineWidthFactor = this.settings.lineWidthAudioFactor || 1.0;
        const tiltEffectFactor = this.settings.tiltEffectFactor || 0.2;

        this.ctx.lineWidth = baseLineWidth + (baseLineWidth * bassEnergy * lineWidthFactor);

        if (this.settings.reactToTouches && activeTouchStates && activeTouchStates.length > 0) {
            const colorSource = this.settings.touchColorSource || 'note';
            const lastTouch = activeTouchStates[activeTouchStates.length - 1];
            if (colorSource === 'note' && lastTouch.noteInfo?.midiNote !== undefined) {
                const noteIndex = lastTouch.noteInfo.midiNote % 12;
                const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                strokeColor = defaultNoteColors[noteIndex] || this.themeColors.primary;
            } else if (this.settings.lineColor === 'accent' || (this.settings.lineColor === 'touch' && colorSource === 'accent')) {
                strokeColor = this.themeColors.accent || 'red';
            }
        } else if (this.settings.lineColor === 'accent') {
            strokeColor = this.themeColors.accent || 'red';
        }

        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[WavesRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            // Fallback or return if critical
            this.ctx.strokeStyle = strokeColor; // Simple fallback without alpha
        } else {
            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(strokeColor, opacity);
        }

        this.ctx.beginPath();

        const centerY = this.canvas.height / 2;
        const waveHeight = this.canvas.height * 0.5 * (1 + (overallVolume - 0.5) * amplitudeFactor);
        // Apply tilt effect: positive tiltY (device tilted "back") moves wave up, negative (tilted "forward") moves wave down.
        const verticalOffset = tiltY * this.canvas.height * tiltEffectFactor;


        this.ctx.moveTo(0, centerY + verticalOffset);

        for (let i = 0; i < bufferLength; i++) {
            const v = audioData[i]; // audioData is typically -1 to 1
            // Adjust y calculation based on waveHeight and center it
            const y = centerY + verticalOffset + (v * waveHeight);
            this.ctx.lineTo(x, Math.max(0, Math.min(this.canvas.height, y))); // Clamp y to canvas bounds
            x += sliceWidth;
        }
        this.ctx.lineTo(this.canvas.width, centerY + verticalOffset);
        this.ctx.stroke();

        if (this.settings.fill) {
            const fillColorSetting = this.settings.fillColor || 'stroke';
            let actualFillColor = strokeColor;
            if (fillColorSetting === 'accent') {
                actualFillColor = this.themeColors.accent || 'red';
            } else if (fillColorSetting === 'primary') {
                 actualFillColor = this.themeColors.primary || 'blue';
            }
            // If 'stroke', it's already strokeColor

            const fillAlpha = this.settings.fillAlpha || 0.1;

            // Ensure path closes correctly for fill under the tilted wave
            this.ctx.lineTo(this.canvas.width, this.canvas.height);
            this.ctx.lineTo(0, this.canvas.height);
            this.ctx.closePath();

            if (this.globalVisualizerRef && typeof this.globalVisualizerRef.getColorWithAlpha === 'function') {
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(actualFillColor, fillAlpha);
            } else {
                this.ctx.fillStyle = actualFillColor; // Fallback
            }
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