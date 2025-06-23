class LinkedParticlesEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.particles = []; // Array to store active particles: { id, x, y, noteInfo, color, radius, opacity, isFading, fadeStartTime }
        this.debugMode = false;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {
            particleRadius: 5,
            particleMaxRadius: 10, // Can grow with note velocity or duration
            particleBaseOpacity: 0.8,
            particleFadeSpeed: 0.03,
            lineBaseThickness: 1,
            lineMaxThickness: 3,
            lineBaseOpacity: 0.5,
            connectionDistanceThreshold: 300, // Max distance to draw a line
            colorSource: 'note', // 'note', 'primary', 'accent', 'mixed'
            showParticles: true,
            showLines: true
        };
        this.themeColors = themeColors || { primary: 'rgba(33, 150, 243, 0.7)', accent: 'rgba(255, 64, 129, 0.7)' };
        this.globalVisualizerRef = globalVisualizerRef;
        this.particles = [];

        if (this.globalVisualizerRef && this.globalVisualizerRef.debugMode) {
            this.debugMode = true;
        }
        if (this.debugMode) console.log('[LinkedParticlesEffect] Initialized. Settings:', JSON.parse(JSON.stringify(this.settings)));
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        // If particles/lines derive color from theme directly (not note-based), update them here
        if (this.debugMode) console.log('[LinkedParticlesEffect] Theme changed.');
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (this.debugMode) console.log('[LinkedParticlesEffect] Settings changed:', JSON.parse(JSON.stringify(this.settings)));
    }

    _getParticleColor(noteInfo) {
        let color = this.themeColors.primary || 'blue'; // Default
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || 'red';
        } else if (this.settings.colorSource === 'note' && noteInfo?.midiNote !== undefined) {
            const noteIndex = noteInfo.midiNote % 12;
            if (this.globalVisualizerRef && this.globalVisualizerRef.noteColors && this.globalVisualizerRef.noteColors[noteIndex]) {
                color = this.globalVisualizerRef.noteColors[noteIndex];
            } else { // Fallback note colors if global palette is not available
                const defaultNoteColors = ['#FF0000', '#FF4500', '#FFA500', '#FFD700', '#FFFF00', '#9ACD32', '#32CD32', '#00BFFF', '#0000FF', '#8A2BE2', '#FF00FF', '#FF1493'];
                color = defaultNoteColors[noteIndex];
            }
        } else if (this.settings.colorSource === 'mixed' && noteInfo?.midiNote !== undefined) {
            // Example: Mix note color with accent
            const noteIndex = noteInfo.midiNote % 12;
            let noteColor = this.themeColors.primary;
             if (this.globalVisualizerRef && this.globalVisualizerRef.noteColors && this.globalVisualizerRef.noteColors[noteIndex]) {
                noteColor = this.globalVisualizerRef.noteColors[noteIndex];
            }
            if (this.globalVisualizerRef && typeof this.globalVisualizerRef.mixColors === 'function') {
                color = this.globalVisualizerRef.mixColors(noteColor, this.themeColors.accent, 0.5);
            } else {
                color = noteColor; // Fallback if mixColors is not available
            }
        }
        return color;
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        const particleColor = this._getParticleColor(touchData.noteInfo);
        const newParticle = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height, // Y is inverted from pad.js
            noteInfo: touchData.noteInfo ? { ...touchData.noteInfo } : null,
            color: particleColor,
            radius: this.settings.particleRadius || 5,
            opacity: this.settings.particleBaseOpacity || 0.8,
            isFading: false,
            createdAt: performance.now(),
            pulsePhase: Math.random() * Math.PI * 2 // For subtle pulsing
        };
        this.particles.push(newParticle);
        if (this.debugMode) console.log(`[LinkedParticlesEffect] Touch Down: ID ${touchData.id}, Count: ${this.particles.length}`);
    }

    onTouchMove(touchData) {
        if (!this.canvas) return;
        const particle = this.particles.find(p => p.id === touchData.id);
        if (particle) {
            particle.x = touchData.x * this.canvas.width;
            particle.y = (1 - touchData.y) * this.canvas.height; // Y is inverted
        }
    }

    onTouchUp(touchId) {
        const particle = this.particles.find(p => p.id === touchId);
        if (particle) {
            particle.isFading = true;
            particle.fadeStartTime = performance.now();
            if (this.debugMode) console.log(`[LinkedParticlesEffect] Touch Up: ID ${touchId}. Marking for fade.`);
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.save();

        // 1. Update and filter particles
        this.particles = this.particles.filter(p => {
            if (p.isFading) {
                const fadeElapsed = now - p.fadeStartTime;
                // Fade out over ~0.5 seconds
                p.opacity = (this.settings.particleBaseOpacity || 0.8) * (1 - Math.min(fadeElapsed / 500, 1));
                return p.opacity > 0.01;
            }
            // Subtle pulse for active particles
            p.pulsePhase += 0.05;
            p.currentRadius = (p.radius || 5) + Math.sin(p.pulsePhase) * 2;
            return true;
        });

        // 2. Draw lines between active (not fading) particles
        if (this.settings.showLines !== false) { // Default to true if not set
            const activeParticles = this.particles.filter(p => !p.isFading);
            if (activeParticles.length > 1) {
                this.ctx.globalCompositeOperation = 'lighter'; // For additive blending of lines

                for (let i = 0; i < activeParticles.length; i++) {
                    for (let j = i + 1; j < activeParticles.length; j++) {
                        const p1 = activeParticles[i];
                        const p2 = activeParticles[j];

                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        const distThreshold = this.settings.connectionDistanceThreshold || this.canvas.width / 2;
                        if (distance < distThreshold) {
                            const opacityFactor = 1 - (distance / distThreshold);
                            const lineOpacity = (this.settings.lineBaseOpacity || 0.5) * opacityFactor;

                            let lineColor = this.themeColors.accent || '#FF00FF';
                            // Potentially mix colors of p1 and p2 or use a theme color
                            if (this.settings.colorSource === 'mixed') {
                                lineColor = this.globalVisualizerRef.mixColors(p1.color, p2.color, 0.5);
                            } else if (this.settings.colorSource === 'primary') {
                                lineColor = this.themeColors.primary;
                            }


                            const thickness = (this.settings.lineBaseThickness || 1) + (this.settings.lineMaxThickness - this.settings.lineBaseThickness || 2) * opacityFactor;

                            this.ctx.beginPath();
                            this.ctx.moveTo(p1.x, p1.y);
                            this.ctx.lineTo(p2.x, p2.y);
                            this.ctx.lineWidth = Math.max(0.5, thickness);
                            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(lineColor, lineOpacity);
                            this.ctx.stroke();
                        }
                    }
                }
                this.ctx.globalCompositeOperation = 'source-over'; // Reset
            }
        }

        // 3. Draw particles
        if (this.settings.showParticles !== false) { // Default to true if not set
             this.ctx.globalCompositeOperation = 'lighter';
            this.particles.forEach(p => {
                const radius = p.isFading ? p.currentRadius * p.opacity : p.currentRadius; // Shrink on fade
                if (radius < 0.5) return;

                this.ctx.beginPath();
                const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
                gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(p.color, p.opacity));
                gradient.addColorStop(0.7, this.globalVisualizerRef.getColorWithAlpha(p.color, p.opacity * 0.3));
                gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(p.color, 0));

                this.ctx.fillStyle = gradient;
                this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalCompositeOperation = 'source-over'; // Reset
        }

        this.ctx.restore();

        if (this.debugMode && this.particles.length > 0) {
            // console.log(`[LinkedParticlesEffect] Drawing. Particle count: ${this.particles.length}`);
        }
    }

    dispose() {
        this.particles = [];
        if (this.debugMode) console.log('[LinkedParticlesEffect] Disposed.');
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('LinkedParticlesEffect', LinkedParticlesEffect);
} else {
    console.warn('[LinkedParticlesEffect] Visualizer system not found for self-registration. Registering to window.');
    window.LinkedParticlesEffect = LinkedParticlesEffect;
}
