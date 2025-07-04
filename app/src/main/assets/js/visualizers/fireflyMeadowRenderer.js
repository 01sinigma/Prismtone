class FireflyMeadowRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.fireflies = [];
        this.debugMode = false;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.themeColors = themeColors || { primary: 'rgba(255, 223, 186, 0.7)', accent: 'rgba(173, 255, 47, 0.7)', background: 'rgba(10,20,40,1)' }; // Light Orange/Yellow, Greenish, Dark Blue BG
        this.globalVisualizerRef = globalVisualizerRef;

        this.settings = {
            initialCount: 80,
            maxCount: 120,
            baseSpeed: 0.3,
            maxSpeed: 1.0,
            tiltForceFactor: 0.05, // Multiplier for tilt effect on velocity
            touchAttractionForce: 0.08,
            touchAttractionRadius: 200, // Radius within which fireflies are attracted to touch
            motherFireflyBaseRadius: 6,
            motherFireflyPulseAmount: 3,
            particleBaseRadius: 1.0,
            particlePulseAmount: 1.0,
            particleMaxAge: 8000, // in ms
            particleFlickerSpeed: 0.1,
            particleFlickerAmount: 0.3,
            audioPulseStrength: 0.7,
            backgroundColor: this.themeColors.background || 'rgba(10,20,40,1)',
            fireflyColor1: this.themeColors.primary || 'rgba(255, 223, 186, 1)', // Pale Yellow/Orange
            fireflyColor2: this.themeColors.accent || 'rgba(173, 255, 47, 1)',   // Light Green
            ...(initialSettings || {})
        };

        this.fireflies = [];
        for (let i = 0; i < this.settings.initialCount; i++) {
            this.fireflies.push(this._createFirefly());
        }

        if (this.globalVisualizerRef && this.globalVisualizerRef.debugMode) {
            this.debugMode = true;
        }
        if (this.debugMode) console.log('[FireflyMeadowRenderer] Initialized. Settings:', JSON.parse(JSON.stringify(this.settings)));
    }

    _createFirefly(x, y) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (this.settings.baseSpeed || 0.3) + Math.random() * 0.2;
        return {
            x: x || Math.random() * this.canvas.width,
            y: y || Math.random() * this.canvas.height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            baseRadius: (this.settings.particleBaseRadius || 1.0) + Math.random() * 0.5,
            currentRadius: this.settings.particleBaseRadius || 1.0,
            pulsePhase: Math.random() * Math.PI * 2,
            brightness: 0.5 + Math.random() * 0.5, // Base brightness
            flickerPhase: Math.random() * Math.PI * 2,
            color: Math.random() > 0.3 ? this.settings.fireflyColor1 : this.settings.fireflyColor2,
            age: 0,
            maxAge: (this.settings.particleMaxAge || 8000) * (0.75 + Math.random() * 0.5), // Vary max age
            targetX: null,
            targetY: null,
        };
    }

    onResize(newWidth, newHeight) {
        // Fireflies will naturally adjust due to canvas boundaries in draw loop
        if (this.debugMode) console.log(`[FireflyMeadowRenderer] Resized to ${newWidth}x${newHeight}`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.settings.backgroundColor = themeColors.background || this.settings.backgroundColor;
        this.settings.fireflyColor1 = themeColors.primary || this.settings.fireflyColor1;
        this.settings.fireflyColor2 = themeColors.accent || this.settings.fireflyColor2;
        // Update existing fireflies' colors if needed, or let them be replaced naturally
        if (this.debugMode) console.log('[FireflyMeadowRenderer] Theme changed.');
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (this.debugMode) console.log('[FireflyMeadowRenderer] Settings changed:', JSON.parse(JSON.stringify(this.settings)));
    }

    _updateFireflies(audioData, activeTouches, deviceTilt) {
        const touches = Array.isArray(activeTouches) ? activeTouches : (activeTouches instanceof Map ? Array.from(activeTouches.values()) : []);
        const tiltEffect = this.settings.tiltForceFactor || 0.05;
        const audioLevel = audioData ? audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length : 0;

        this.fireflies.forEach(f => {
            // Apply tilt
            if (deviceTilt) {
                f.vx += (deviceTilt.roll / 90) * tiltEffect;  // Max roll ~90 degrees
                f.vy += (-deviceTilt.pitch / 90) * tiltEffect; // Max pitch ~90 degrees
            }

            // Apply touch attraction
            f.targetX = null;
            f.targetY = null;
            if (touches.length > 0) {
                let closestTouchDist = Infinity;
                let target = null;
                touches.forEach(touch => {
                    const dist = Math.sqrt(Math.pow(touch.x - f.x, 2) + Math.pow(touch.y - f.y, 2));
                    if (dist < (this.settings.touchAttractionRadius || 200) && dist < closestTouchDist) {
                        closestTouchDist = dist;
                        target = touch;
                    }
                });
                if (target) {
                    f.targetX = target.x;
                    f.targetY = target.y;
                }
            }

            if (f.targetX !== null && f.targetY !== null) {
                const dx = f.targetX - f.x;
                const dy = f.targetY - f.y;
                const distToTarget = Math.sqrt(dx * dx + dy * dy);
                if (distToTarget > 1) { // Avoid division by zero or jitter
                    const attraction = (this.settings.touchAttractionForce || 0.08) * (1 - distToTarget / (this.settings.touchAttractionRadius || 200));
                    f.vx += (dx / distToTarget) * attraction;
                    f.vy += (dy / distToTarget) * attraction;
                }
            }

            // Limit speed
            const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
            const maxSpeed = this.settings.maxSpeed || 1.0;
            if (speed > maxSpeed) {
                f.vx = (f.vx / speed) * maxSpeed;
                f.vy = (f.vy / speed) * maxSpeed;
            }

            // Update position
            f.x += f.vx;
            f.y += f.vy;

            // Boundary check (wrap around)
            if (f.x < 0) f.x = this.canvas.width;
            if (f.x > this.canvas.width) f.x = 0;
            if (f.y < 0) f.y = this.canvas.height;
            if (f.y > this.canvas.height) f.y = 0;

            // Update age and brightness/radius
            f.age += 16; // Assuming ~60fps, approx 16ms per frame
            f.pulsePhase += 0.05 + audioLevel * (this.settings.audioPulseStrength || 0.7) * 0.1;
            f.currentRadius = f.baseRadius + Math.sin(f.pulsePhase) * (this.settings.particlePulseAmount || 1.0);

            f.flickerPhase += (this.settings.particleFlickerSpeed || 0.1);
            f.brightness = 0.5 + (Math.sin(f.flickerPhase) * 0.5 + 0.5) * 0.5 * (this.settings.particleFlickerAmount || 0.3) + (1-(this.settings.particleFlickerAmount || 0.3)); // Flicker effect
             f.brightness = Math.max(0.2, Math.min(1, f.brightness));


            // Respawn if too old
            if (f.age > f.maxAge) {
                Object.assign(f, this._createFirefly(Math.random() * this.canvas.width, Math.random() * this.canvas.height)); // Respawn
            }
        });

        // Maintain population
        while (this.fireflies.length < (this.settings.maxCount || 120) && Math.random() < 0.1) {
             this.fireflies.push(this._createFirefly());
        }
    }

    _drawFireflies() {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        this.fireflies.forEach(f => {
            const radius = Math.max(0.5, f.currentRadius);
            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius * 2); // Larger gradient for softer glow
            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(f.color, f.brightness));
            gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(f.color, f.brightness * 0.5));
            gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(f.color, 0));

            this.ctx.fillStyle = gradient;
            this.ctx.arc(f.x, f.y, radius * 2, 0, Math.PI * 2); // Draw the gradient glow
            this.ctx.fill();

            // Smaller, brighter core
            this.ctx.beginPath();
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(f.color, f.brightness * 0.8);
            this.ctx.arc(f.x, f.y, radius * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.restore();
    }

    _drawMotherFireflies(activeTouches, audioData) {
        if (!activeTouches || activeTouches.length === 0) return;
        const touches = Array.isArray(activeTouches) ? activeTouches : (activeTouches instanceof Map ? Array.from(activeTouches.values()) : []);
        const audioLevel = audioData ? audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length : 0;


        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        touches.forEach(touch => {
            const baseRadius = this.settings.motherFireflyBaseRadius || 6;
            const pulseAmount = this.settings.motherFireflyPulseAmount || 3;
            const radius = baseRadius + Math.sin(performance.now() * 0.005 + touch.id) * pulseAmount + audioLevel * 5 * (this.settings.audioPulseStrength || 0.7) ;

            let color = this.settings.fireflyColor1; // Default
            if (touch.noteInfo && this.globalVisualizerRef && this.globalVisualizerRef.noteColors) {
                const noteIndex = touch.noteInfo.midiNote % 12;
                color = this.globalVisualizerRef.noteColors[noteIndex] || color;
            }

            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(touch.x, touch.y, 0, touch.x, touch.y, radius);
            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(color, 0.9));
            gradient.addColorStop(0.3, this.globalVisualizerRef.getColorWithAlpha(color, 0.6));
            gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(color, 0));

            this.ctx.fillStyle = gradient;
            this.ctx.arc(touch.x, touch.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.restore();
    }

    draw(audioData, activeTouches, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        // Background
        this.ctx.fillStyle = this.settings.backgroundColor || 'rgba(10,20,40,1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this._updateFireflies(audioData, activeTouches, deviceTilt);
        this._drawFireflies();
        this._drawMotherFireflies(activeTouches, audioData);

        if (this.debugMode && this.fireflies.length > 0) {
            // console.log(`[FireflyMeadowRenderer] Drawing ${this.fireflies.length} fireflies.`);
        }
    }

    dispose() {
        this.fireflies = [];
        if (this.debugMode) console.log('[FireflyMeadowRenderer] Disposed.');
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('FireflyMeadowRenderer', FireflyMeadowRenderer);
} else {
    console.warn('[FireflyMeadowRenderer] Visualizer system not found for self-registration. Registering to window.');
    window.FireflyMeadowRenderer = FireflyMeadowRenderer;
}
