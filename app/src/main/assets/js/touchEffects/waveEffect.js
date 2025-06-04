class WaveEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {
            colorSource: 'note',
            baseOpacity: 1.0,
            waveSpeed: 3,
            waveInterval: 300,
            maxRadius: 1000,
            minRadius: 40,
            fadeDuration: 1000,
            compositeOperation: "lighter"
        };
        this.themeColors = {};
        this.waveSystems = new Map();
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = { ...this.settings, ...initialSettings };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.waveSystems.clear();
        console.log("[WaveEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _createWave(system) {
        return {
            radius: this.settings.minRadius,
            opacity: this.settings.baseOpacity,
            startTime: performance.now()
        };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;
        this.waveSystems.delete(touchData.id);

        let color = this.themeColors.primary || 'blue';
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || 'red';
        } else if (this.settings.colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
            const noteIndex = touchData.noteInfo.midiNote % 12;
            const noteColors = this.globalVisualizerRef?.noteColors || 
                { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = noteColors[noteIndex] || this.themeColors.primary;
        }

        const newSystem = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            color: color,
            isActive: true,
            waves: [this._createWave()],
            lastEmitTime: performance.now(),
            fadeStartTime: 0
        };

        this.waveSystems.set(touchData.id, newSystem);
    }

    onTouchMove(touchData) {
        const system = this.waveSystems.get(touchData.id);
        if (system && system.isActive) {
            system.x = touchData.x * this.canvas.width;
            system.y = (1 - touchData.y) * this.canvas.height;

            if (this.settings.colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
                const noteIndex = touchData.noteInfo.midiNote % 12;
                const noteColors = this.globalVisualizerRef?.noteColors || 
                    { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                const newColor = noteColors[noteIndex] || this.themeColors.primary;
                
                if (newColor !== system.color) {
                    system.color = newColor;
                }
            }
        }
    }

    onTouchUp(touchId) {
        const system = this.waveSystems.get(touchId);
        if (system) {
            system.isActive = false;
            system.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.waveSystems.size === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = this.settings.compositeOperation || 'lighter';

        this.waveSystems.forEach((system, systemId) => {
            let systemOpacityMultiplier = 1.0;

            if (system.isActive) {
                if (now - system.lastEmitTime > this.settings.waveInterval) {
                    system.waves.push(this._createWave());
                    system.lastEmitTime = now;
                }
            } else {
                const fadeElapsed = now - system.fadeStartTime;
                systemOpacityMultiplier = 1.0 - Math.min(fadeElapsed / this.settings.fadeDuration, 1);

                if (systemOpacityMultiplier <= 0.01 && system.waves.length === 0) {
                    this.waveSystems.delete(systemId);
                    return;
                }
            }

            system.waves = system.waves.filter(wave => {
                const elapsed = now - wave.startTime;
                const progress = elapsed / (this.settings.waveInterval * 2);
                
                if (progress >= 1) return false;

                wave.radius = this.settings.minRadius + (this.settings.maxRadius - this.settings.minRadius) * progress;
                const alpha = wave.opacity * (1 - progress) * systemOpacityMultiplier;

                if (alpha <= 0.01) return false;

                const gradient = this.ctx.createRadialGradient(
                    system.x, system.y, 0,
                    system.x, system.y, wave.radius
                );

                gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(system.color, alpha));
                gradient.addColorStop(0.6, this.globalVisualizerRef.getColorWithAlpha(system.color, alpha * 0.4));
                gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(system.color, 0));

                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(system.x, system.y, wave.radius, 0, Math.PI * 2);
                this.ctx.fill();

                return true;
            });

            if (!system.isActive && system.waves.length === 0) {
                this.waveSystems.delete(systemId);
            }
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.waveSystems.clear();
        this.ctx = null;
        this.canvas = null;
        console.log("[WaveEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('WaveEffect', WaveEffect);
} else {
    window.WaveEffect = WaveEffect;
    console.warn('[WaveEffect] Registered globally as visualizer object was not available at load time.');
} 