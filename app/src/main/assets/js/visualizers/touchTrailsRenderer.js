class TouchTrailsRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        // analyserNodeRef is not directly used in draw if audioMetrics are provided
        // this.analyserNodeRef = null;
        this.touchHistories = new Map();
        this.particles = []; // For sparks/particles
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            opacity: 0.7,
            trailLength: 15,
            trailColorSource: 'primary', // 'primary', 'accent', 'note'
            trailBaseWidth: 5,
            trailWidthMultiplierY: 2, // Original name, might mean width variation along trail
            trailDuration: 1000, // ms for how long a history is kept if no new points
            audioReactivity: { // Kept for compatibility, new properties are more specific
                opacityMultiplier: 1
            },
            // New audio-specific settings
            trailPulseFactor: 0.5, // How much overallVolume affects trail width/opacity
            beatReactionFactor: 1.5, // Multiplier for trail width/opacity on beatDetected
            // Particle settings
            enableParticles: true,
            particleSpawnRate: 0.5, // Chance (0-1) to spawn particle per point per active touch
            particleMaxCount: 200,
            particleBaseSize: 2,
            particleSizeAudioFactor: 1.0, // How much trebleEnergy affects particle size
            particleLifespan: 500, // ms
            particleSpeed: 1,
            particleGravityFactor: 0.5, // How much tilt affects particle direction
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        // this.analyserNodeRef = analyserNodeRef; // Store if needed for direct analysis
        this.touchHistories.clear();
        this.particles = [];
        console.log("[TouchTrailsRenderer] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    draw(audioData, activeTouchStates, audioMetrics, motionData) {
        if (!this.ctx || !this.canvas) return;

        const now = performance.now();

        // Audio Metrics
        const overallVolume = audioMetrics?.overallVolume ?? 0.3;
        const trebleEnergy = audioMetrics?.trebleEnergy ?? 0.3;
        const beatDetected = audioMetrics?.beatDetected ?? false;

        // Motion Data
        const tiltX = motionData?.tiltX ?? 0;
        const tiltY = motionData?.tiltY ?? 0; // Positive Y is typically device tilted "back"

        const baseOpacity = this.settings.opacity || 0.7;

        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[TouchTrailsRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            // Provide a simple fallback for color generation if needed
        }

        // Update touch histories and spawn particles
        if (activeTouchStates && activeTouchStates.length > 0) {
            activeTouchStates.forEach(touch => {
                if (!this.touchHistories.has(touch.id)) {
                    this.touchHistories.set(touch.id, { points: [], lastActivity: now });
                }
                const history = this.touchHistories.get(touch.id);
                history.lastActivity = now;
                const newPoint = {
                    x: touch.x * this.canvas.width,
                    y: (1 - touch.y) * this.canvas.height, // Invert Y for canvas coords
                    time: now,
                    noteInfo: touch.noteInfo
                };
                history.points.push(newPoint);

                if (history.points.length > (this.settings.trailLength || 15)) {
                    history.points.shift();
                }

                // Particle spawning
                if (this.settings.enableParticles && Math.random() < (this.settings.particleSpawnRate || 0.5) && this.particles.length < (this.settings.particleMaxCount || 200)) {
                    this.spawnParticle(newPoint, trebleEnergy, touch.noteInfo);
                }
            });
        }

        // Draw trails
        this.touchHistories.forEach((historyData, touchId) => {
            const history = historyData.points;
            if (history.length < 2) return;

            let color = this.themeColors.primary || '#007bff';
            if (this.settings.trailColorSource === 'accent') {
                color = this.themeColors.accent || '#ff0000';
            } else if (this.settings.trailColorSource === 'note' && history[history.length - 1].noteInfo?.midiNote !== undefined) {
                const noteIndex = history[history.length - 1].noteInfo.midiNote % 12;
                const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                color = defaultNoteColors[noteIndex] || this.themeColors.primary;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(history[0].x, history[0].y);

            for (let i = 1; i < history.length; i++) {
                const point = history[i];
                const progress = i / (history.length - 1); // Progress along this segment of history

                let width = (this.settings.trailBaseWidth || 5) * (1 + progress * (this.settings.trailWidthMultiplierY || 1));
                let currentOpacity = baseOpacity * (1 - progress);

                // Audio reaction for trails
                const pulseEffect = 1 + (overallVolume - 0.5) * (this.settings.trailPulseFactor || 0.5);
                width *= pulseEffect;
                currentOpacity *= pulseEffect;
                if (beatDetected) {
                    width *= (this.settings.beatReactionFactor || 1.5);
                    currentOpacity = Math.min(1, currentOpacity * (this.settings.beatReactionFactor || 1.5));
                }
                currentOpacity = Math.max(0, Math.min(1, currentOpacity));


                if (this.globalVisualizerRef?.getColorWithAlpha) {
                    this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(color, currentOpacity);
                } else {
                    this.ctx.strokeStyle = `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${currentOpacity})`;
                }
                this.ctx.lineWidth = Math.max(1, width);
                this.ctx.lineTo(point.x, point.y);
            }
            this.ctx.stroke();
        });

        // Update and draw particles
        this.updateAndDrawParticles(now, tiltX, tiltY, trebleEnergy);


        // Clean up old touch histories
        this.touchHistories.forEach((historyData, touchId) => {
            if (now - historyData.lastActivity > (this.settings.trailDuration || 1000)) {
                this.touchHistories.delete(touchId);
            } else { // Also prune very old points within active histories if not updated
                historyData.points = historyData.points.filter(p => now - p.time < (this.settings.trailDuration || 1000));
                if(historyData.points.length === 0 && activeTouchStates.every(t => t.id !== touchId)) {
                    this.touchHistories.delete(touchId);
                }
            }
        });
    }

    spawnParticle(position, audioIntensity, noteInfo) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 0.5 + 0.5) * (this.settings.particleSpeed || 1);
        let color = this.themeColors.primary || '#007bff';
        if (this.settings.trailColorSource === 'accent') { // Particles can share trail color logic
            color = this.themeColors.accent || '#ff0000';
        } else if (this.settings.trailColorSource === 'note' && noteInfo?.midiNote !== undefined) {
            const noteIndex = noteInfo.midiNote % 12;
            const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = defaultNoteColors[noteIndex] || this.themeColors.primary;
        }

        this.particles.push({
            x: position.x,
            y: position.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: (this.settings.particleBaseSize || 2) * (1 + audioIntensity * (this.settings.particleSizeAudioFactor || 1)),
            birthTime: performance.now(),
            lifespan: (this.settings.particleLifespan || 500) * (Math.random() * 0.5 + 0.75), // Add some variance
            color: color
        });
    }

    updateAndDrawParticles(now, tiltX, tiltY, audioIntensity) {
        if (!this.ctx || !this.canvas) return;
        const gravityFactor = (this.settings.particleGravityFactor || 0.5) * 0.1; // Scale factor for tilt

        this.particles = this.particles.filter(p => {
            const age = now - p.birthTime;
            if (age >= p.lifespan) return false;

            p.x += p.vx;
            p.y += p.vy;

            // Apply gravity based on tilt
            p.vx += tiltX * gravityFactor;
            p.vy += tiltY * gravityFactor; // tiltY is often positive when device front is tilted up (towards user)
                                          // so this will make particles fall "down" relative to device orientation

            // Keep particles within bounds (optional, or let them fly off)
            // if (p.x < 0 || p.x > this.canvas.width || p.y < 0 || p.y > this.canvas.height) return false;

            const remainingLife = 1 - (age / p.lifespan);
            const currentOpacity = (this.settings.opacity || 0.7) * remainingLife;
            const currentSize = p.size * remainingLife;

            if (currentSize < 0.5) return false;

            if (this.globalVisualizerRef?.getColorWithAlpha) {
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, currentOpacity);
            } else {
                this.ctx.fillStyle = `rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},${currentOpacity})`;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            this.ctx.fill();

            return true;
        });
    }


    dispose() {
        this.touchHistories.clear();
        this.particles = [];
        this.ctx = null;
        this.canvas = null;
        // this.analyserNodeRef = null;
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