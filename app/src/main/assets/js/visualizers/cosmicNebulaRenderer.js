class CosmicNebulaRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null; // Reference to the main visualizer object
        this.stars = []; // To store active stars from touches
        this.noiseCanvas = null; // Offscreen canvas for noise generation
        this.noiseCtx = null;
        this.noiseDetail = 0.03; // Lower for smoother, larger patterns
        this.noiseSpeed = 0.0005;
        this.noiseTime = 0;

        // Nebula layers configuration
        this.nebulaLayers = [
            { color: [60, 20, 120], alpha: 0.3, scale: 0.02, speedFactor: 0.8, offsetFactor: 1.5 }, // Deep purple
            { color: [20, 40, 150], alpha: 0.25, scale: 0.03, speedFactor: 1, offsetFactor: 2.0 },   // Dark blue
            { color: [100, 20, 100], alpha: 0.2, scale: 0.025, speedFactor: 1.2, offsetFactor: 1.0 } // Magenta/Pinkish
        ];
        this.debugMode = false; // Set to true for verbose logging
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {
            starBaseRadius: 3,
            starMaxRadius: 8,
            starBrightness: 0.8,
            starFadeSpeed: 0.02,
            tiltEffectStrength: 50, // Pixels of displacement at max tilt
            nebulaBaseAlpha: 0.5
        };
        this.themeColors = themeColors || { primary: 'rgba(33, 150, 243, 0.7)', accent: 'rgba(255, 64, 129, 0.7)' };
        this.globalVisualizerRef = globalVisualizerRef;
        this.stars = [];
        this.noiseTime = Math.random() * 1000; // Random start time for noise

        // Initialize offscreen canvas for noise
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCtx = this.noiseCanvas.getContext('2d');
        this._resizeNoiseCanvas();

        if (this.globalVisualizerRef && this.globalVisualizerRef.debugMode) {
            this.debugMode = true;
        }
        if (this.debugMode) console.log('[CosmicNebulaRenderer] Initialized. Settings:', JSON.parse(JSON.stringify(this.settings)));
    }

    _resizeNoiseCanvas() {
        if (this.canvas && this.noiseCanvas) {
            // Render noise at a lower resolution for performance, then scale up
            this.noiseCanvas.width = this.canvas.width / 2;
            this.noiseCanvas.height = this.canvas.height / 2;
        }
    }

    onResize(newWidth, newHeight) {
        this._resizeNoiseCanvas();
        if (this.debugMode) console.log(`[CosmicNebulaRenderer] Resized to ${newWidth}x${newHeight}`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        // Update nebula layer base colors if they are theme-dependent
        // For now, they are fixed, but this is where one might adjust them.
        if (this.debugMode) console.log('[CosmicNebulaRenderer] Theme changed.');
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (this.debugMode) console.log('[CosmicNebulaRenderer] Settings changed:', JSON.parse(JSON.stringify(this.settings)));
    }

    // Simple pseudo-random number generator (PRNG) for consistent noise
    _seededRandom(seed) {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    // Basic Perlin-like noise function (very simplified)
    _simpleNoise(x, y, t) {
        const X = Math.floor(x);
        const Y = Math.floor(y);
        const T = Math.floor(t);
        const fx = x - X;
        const fy = y - Y;
        const ft = t - T;

        const n = (ix, iy, it) => {
            const seed = ix + iy * 57 + it * 1013; // Arbitrary prime numbers
            return this._seededRandom(seed);
        };

        const v000 = n(X, Y, T);
        const v100 = n(X + 1, Y, T);
        const v010 = n(X, Y + 1, T);
        const v110 = n(X + 1, Y + 1, T);
        const v001 = n(X, Y, T + 1);
        const v101 = n(X + 1, Y, T + 1);
        const v011 = n(X, Y + 1, T + 1);
        const v111 = n(X + 1, Y + 1, T + 1);

        // Interpolate (linear for simplicity)
        const smooth = val => val * val * (3 - 2 * val); // Smoothstep
        const u = smooth(fx);
        const v = smooth(fy);
        const w = smooth(ft);

        return (
            v000 * (1 - u) * (1 - v) * (1 - w) +
            v100 * u * (1 - v) * (1 - w) +
            v010 * (1 - u) * v * (1 - w) +
            v110 * u * v * (1 - w) +
            v001 * (1 - u) * (1 - v) * w +
            v101 * u * (1 - v) * w +
            v011 * (1 - u) * v * w +
            v111 * u * v * w
        );
    }

    _drawNebula(deviceTilt, audioData) {
        if (!this.noiseCtx || !this.noiseCanvas) return;

        this.noiseTime += this.noiseSpeed;
        const tiltX = (deviceTilt && deviceTilt.roll) ? (deviceTilt.roll / 90) * this.settings.tiltEffectStrength : 0; // Max roll = 90 degrees
        const tiltY = (deviceTilt && deviceTilt.pitch) ? (-deviceTilt.pitch / 90) * this.settings.tiltEffectStrength : 0; // Max pitch = 90 degrees

        const baseAudioEffect = audioData ? Math.min(1, audioData.reduce((a, b) => a + Math.abs(b), 0) / audioData.length * 5) : 0;

        this.noiseCtx.clearRect(0, 0, this.noiseCanvas.width, this.noiseCanvas.height);
        this.noiseCtx.globalCompositeOperation = 'lighter';

        this.nebulaLayers.forEach(layer => {
            const imageData = this.noiseCtx.createImageData(this.noiseCanvas.width, this.noiseCanvas.height);
            const data = imageData.data;
            const time = this.noiseTime * layer.speedFactor;

            for (let y = 0; y < this.noiseCanvas.height; y++) {
                for (let x = 0; x < this.noiseCanvas.width; x++) {
                    const noiseX = (x + tiltX * layer.offsetFactor) * layer.scale;
                    const noiseY = (y + tiltY * layer.offsetFactor) * layer.scale;

                    let noiseVal = 0;
                    // Multi-octave noise for more detail (simplified)
                    noiseVal += this._simpleNoise(noiseX, noiseY, time) * 0.6;
                    noiseVal += this._simpleNoise(noiseX * 2, noiseY * 2, time * 1.5) * 0.3;
                    noiseVal += this._simpleNoise(noiseX * 4, noiseY * 4, time * 2) * 0.1;
                    noiseVal = (noiseVal + 1) / 2; // Normalize to 0-1

                    const audioModulatedAlpha = Math.min(1, layer.alpha + baseAudioEffect * 0.3);
                    const alpha = Math.pow(noiseVal, 2) * audioModulatedAlpha * 255; // Pow for contrast

                    const i = (y * this.noiseCanvas.width + x) * 4;
                    data[i] = layer.color[0];
                    data[i + 1] = layer.color[1];
                    data[i + 2] = layer.color[2];
                    data[i + 3] = Math.max(0, Math.min(255, alpha));
                }
            }
            this.noiseCtx.putImageData(imageData, 0, 0);
        });

        this.ctx.save();
        this.ctx.globalAlpha = this.settings.nebulaBaseAlpha || 0.5;
        this.ctx.drawImage(this.noiseCanvas, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        this.ctx.globalCompositeOperation = 'source-over'; // Reset
    }

    _updateAndDrawStars(activeTouches, audioData) {
        const now = performance.now();
        const baseRadius = this.settings.starBaseRadius || 3;
        const maxRadius = this.settings.starMaxRadius || 8;
        const brightness = this.settings.starBrightness || 0.8;
        const fadeSpeed = this.settings.starFadeSpeed || 0.02;

        // Fade out and remove old stars
        this.stars = this.stars.filter(star => {
            if (!star.isActive) {
                star.currentBrightness -= fadeSpeed;
            }
            return star.currentBrightness > 0;
        });

        // Update active stars and add new ones
        const currentStarIds = this.stars.map(s => s.id);
        activeTouches.forEach(touch => {
            let star = this.stars.find(s => s.id === touch.id);
            if (star) { // Existing star
                star.x = touch.x;
                star.y = touch.y;
                star.isActive = true; // Mark as active if it was fading
                star.currentBrightness = brightness; // Reset brightness on move/hold
            } else { // New star
                const noteColorIndex = touch.noteInfo ? touch.noteInfo.midiNote % 12 : Math.floor(Math.random() * 12);
                const starColor = (this.globalVisualizerRef && this.globalVisualizerRef.noteColors && this.globalVisualizerRef.noteColors[noteColorIndex])
                                ? this.globalVisualizerRef.noteColors[noteColorIndex]
                                : `hsl(${Math.random() * 360}, 100%, 70%)`;

                this.stars.push({
                    id: touch.id,
                    x: touch.x,
                    y: touch.y,
                    radius: baseRadius + Math.random() * (maxRadius - baseRadius),
                    color: starColor,
                    currentBrightness: brightness,
                    isActive: true,
                    createdAt: now
                });
            }
        });

        // Mark stars that are no longer in activeTouches as inactive
        this.stars.forEach(star => {
            if (star.isActive && !activeTouches.find(t => t.id === star.id)) {
                star.isActive = false;
            }
        });

        // Draw stars
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        this.stars.forEach(star => {
            const alpha = star.currentBrightness;
            const radius = star.radius * (0.5 + star.currentBrightness * 0.5); // Smaller when dimmer

            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius);
            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, alpha));
            gradient.addColorStop(0.4, this.globalVisualizerRef.getColorWithAlpha(star.color, alpha * 0.5));
            gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(star.color, 0));

            this.ctx.fillStyle = gradient;
            this.ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Optional: tiny core
            this.ctx.beginPath();
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha('#FFFFFF', alpha * 0.7);
            this.ctx.arc(star.x, star.y, radius * 0.2, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.restore();
    }

    draw(audioData, activeTouches, deviceTilt) {
        if (!this.ctx || !this.canvas) return;

        // Ensure activeTouches is an array
        const touches = Array.isArray(activeTouches) ? activeTouches : (activeTouches instanceof Map ? Array.from(activeTouches.values()) : []);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this._drawNebula(deviceTilt, audioData);
        this._updateAndDrawStars(touches, audioData);

        if (this.debugMode && touches.length > 0) {
            // console.log(`[CosmicNebulaRenderer] Drawing with ${touches.length} active touches. Tilt: P ${deviceTilt?.pitch?.toFixed(1)}, R ${deviceTilt?.roll?.toFixed(1)}`);
        }
    }

    dispose() {
        this.stars = [];
        this.noiseCanvas = null; // Allow GC
        this.noiseCtx = null;
        if (this.debugMode) console.log('[CosmicNebulaRenderer] Disposed.');
    }
}

// Self-registration (important for the visualizer.js to find this class)
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('CosmicNebulaRenderer', CosmicNebulaRenderer);
} else {
    // Fallback or warning if visualizer system is not ready
    console.warn('[CosmicNebulaRenderer] Visualizer system not found for self-registration. Registering to window.');
    window.CosmicNebulaRenderer = CosmicNebulaRenderer;
}
