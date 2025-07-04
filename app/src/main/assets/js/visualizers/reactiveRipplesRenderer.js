class ReactiveRipplesRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.ripples = [];
        this.lastBeatRippleTime = 0;
        this.interactionParticles = []; // For ripple interactions
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            opacity: 0.5,
            rippleMaxRadius: 100,
            rippleDuration: 1000,
            rippleLineWidth: 2,
            rippleColor: 'primary',
            reactToTouches: true,
            reactToAudio: true,
            // Phase 2 - Fill
            enableFill: true,
            fillOpacityFactor: 0.3, // Relative to stroke opacity
            // Phase 2 - Motion Drift
            enableDrift: true,
            rippleDriftFactor: 1.0, // Pixels per second based on max tilt
            // Phase 2 - Interaction
            enableInteraction: true,
            interactionParticleCount: 5,
            interactionParticleLifespan: 300,
            interactionParticleSize: 2.5,
            interactionThresholdFactor: 0.8, // How close ripples need to be (factor of sum of radii)
            // Existing advanced settings
            audioRadiusFactor: 1.0,
            audioDurationFactor: 0.5,
            beatRippleFactor: 1.5,
            beatRippleThrottle: 200,
            lineWidthAudioFactor: 1.0,
            tiltOffsetFactor: 0.3,
            maxRipples: 50,
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.ripples = [];
        this.interactionParticles = [];
        console.log("[ReactiveRipplesRenderer] Initialized with settings (Phase 2):", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _spawnInteractionParticles(x, y, color) {
        if (!this.settings.enableInteraction) return;
        for (let i = 0; i < (this.settings.interactionParticleCount || 5); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 1; // Random speed
            this.interactionParticles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: (this.settings.interactionParticleSize || 2.5) * (Math.random() * 0.5 + 0.75),
                birthTime: performance.now(),
                lifespan: (this.settings.interactionParticleLifespan || 300) * (Math.random() * 0.5 + 0.75),
                color: color,
                opacity: (this.settings.opacity || 0.5) * 1.5 // Brighter initially
            });
        }
    }

    _updateAndDrawInteractionParticles(now) {
        if (!this.ctx || !this.settings.enableInteraction) {
            this.interactionParticles = []; // Clear if disabled
            return;
        }
        this.interactionParticles = this.interactionParticles.filter(p => {
            const age = now - p.birthTime;
            if (age >= p.lifespan) return false;

            p.x += p.vx;
            p.y += p.vy;
            // Optional: add slight drag p.vx *= 0.98; p.vy *= 0.98;

            const remainingLife = 1 - (age / p.lifespan);
            const currentOpacity = p.opacity * remainingLife;
            const currentSize = p.size * remainingLife;

            if (currentSize < 0.3 || currentOpacity < 0.01) return false;

            let drawColor = p.color;
            if (this.globalVisualizerRef?.getColorWithAlpha) {
                drawColor = this.globalVisualizerRef.getColorWithAlpha(p.color, currentOpacity);
            }
            this.ctx.fillStyle = drawColor;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            this.ctx.fill();
            return true;
        });
    }


    draw(audioData, activeTouchStates, audioMetrics, motionData) {
        if (!this.ctx || !this.canvas) return;
        const now = performance.now();
        const deltaTime = this.globalVisualizerRef?.deltaTime ?? (1/60); // Estimate delta time for physics

        const overallVolume = audioMetrics?.overallVolume ?? 0.1;
        const bassEnergy = audioMetrics?.bassEnergy ?? 0.3;
        const beatDetected = audioMetrics?.beatDetected ?? false;
        const tiltX = motionData?.tiltX ?? 0;
        const tiltY = motionData?.tiltY ?? 0;
        const baseOpacity = this.settings.opacity || 0.5;

        // Create new ripples from touches
        if (this.settings.reactToTouches && activeTouchStates && activeTouchStates.length > 0) {
            activeTouchStates.forEach(touch => {
                if (this.ripples.length < (this.settings.maxRipples || 50)) {
                    let color = this.themeColors.primary || '#007bff';
                    if (this.settings.rippleColor === 'accent') color = this.themeColors.accent || '#ff0000';
                    else if (this.settings.rippleColor === 'touchNote' && touch.noteInfo?.midiNote !== undefined) {
                        const noteIndex = touch.noteInfo.midiNote % 12;
                        const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
                        color = defaultNoteColors[noteIndex] || this.themeColors.primary;
                    }
                    const newRipple = {
                        id: `touch_${touch.id}_${now}`, x: touch.x * this.canvas.width, y: (1 - touch.y) * this.canvas.height,
                        radius: 0, currentActualRadius: 0, maxRadius: (this.settings.rippleMaxRadius || 100) * (1 + overallVolume * 0.5),
                        startTime: now, duration: (this.settings.rippleDuration || 1000), color: color, isBeatRipple: false,
                        interacted: false // Flag for interaction
                    };
                    this.ripples.push(newRipple);
                    // Check for interaction with existing ripples when a new one is added
                    // this.checkRippleInteractions(newRipple); // This could be one place to check
                }
            });
        }

        // Auto-generate ripples from audio volume
        const audioIntensity = overallVolume;
        if (this.settings.reactToAudio && audioIntensity > 0.05 && Math.random() < audioIntensity * 0.1) {
             if (this.ripples.length < (this.settings.maxRipples || 50)) {
                const centerX = this.canvas.width / 2 + (tiltX * this.canvas.width * (this.settings.tiltOffsetFactor || 0.3));
                const centerY = this.canvas.height / 2 + (tiltY * this.canvas.height * (this.settings.tiltOffsetFactor || 0.3));
                let color = this.themeColors.primary || '#007bff';
                if (this.settings.rippleColor === 'accent') color = this.themeColors.accent || '#ff0000';

                const newRipple = {
                    id: `audio_${now}`, x: Math.max(0, Math.min(this.canvas.width, centerX)), y: Math.max(0, Math.min(this.canvas.height, centerY)),
                    radius: 0, currentActualRadius: 0, maxRadius: (this.settings.rippleMaxRadius || 100) * (1 + audioIntensity * (this.settings.audioRadiusFactor || 1.0)),
                    startTime: now, duration: (this.settings.rippleDuration || 1000) * Math.max(0.5, (1 - audioIntensity * (this.settings.audioDurationFactor || 0.5))),
                    color: color, isBeatRipple: false, interacted: false
                };
                this.ripples.push(newRipple);
            }
        }

        // Auto-generate ripples on beat
        if (this.settings.reactToAudio && beatDetected && (now - this.lastBeatRippleTime > (this.settings.beatRippleThrottle || 200))) {
            if (this.ripples.length < (this.settings.maxRipples || 50)) {
                this.lastBeatRippleTime = now;
                const centerX = this.canvas.width / 2 + (tiltX * this.canvas.width * (this.settings.tiltOffsetFactor || 0.3));
                const centerY = this.canvas.height / 2 + (tiltY * this.canvas.height * (this.settings.tiltOffsetFactor || 0.3));
                let color = this.themeColors.accent || this.themeColors.primary || '#FFFF00';

                const newRipple = {
                    id: `beat_${now}`, x: Math.max(0, Math.min(this.canvas.width, centerX)), y: Math.max(0, Math.min(this.canvas.height, centerY)),
                    radius: 0, currentActualRadius: 0, maxRadius: (this.settings.rippleMaxRadius || 100) * (this.settings.beatRippleFactor || 1.5),
                    startTime: now, duration: (this.settings.rippleDuration || 1000) * 0.8, color: color, isBeatRipple: true, interacted: false
                };
                this.ripples.push(newRipple);
            }
        }

        // Update and draw ripples
        this.ctx.lineCap = 'round';
        const newRipplesList = []; // Build a new list to handle ripple removal and potential interactions
        for (let i = 0; i < this.ripples.length; i++) {
            const ripple = this.ripples[i];
            const elapsed = now - ripple.startTime;
            if (elapsed >= ripple.duration) {
                ripple.interacted = true; // Mark as done for interaction checks
                continue; // Skip this ripple
            }

            const progress = elapsed / ripple.duration;
            ripple.currentActualRadius = ripple.maxRadius * progress; // Store actual radius for interaction checks

            // Motion Drift
            if(this.settings.enableDrift){
                const driftSpeed = (this.settings.rippleDriftFactor || 1.0) * 50; // pixels per second at max tilt
                ripple.x += tiltX * driftSpeed * deltaTime;
                ripple.y += tiltY * driftSpeed * deltaTime; // tiltY is often positive when device front is tilted up (towards user)
                // Optional: Keep ripples within canvas bounds after drifting
                // ripple.x = Math.max(ripple.currentActualRadius, Math.min(this.canvas.width - ripple.currentActualRadius, ripple.x));
                // ripple.y = Math.max(ripple.currentActualRadius, Math.min(this.canvas.height - ripple.currentActualRadius, ripple.y));
            }

            let alpha = baseOpacity * (1 - progress);
            if (ripple.isBeatRipple) alpha = baseOpacity * Math.min(1, (1 - progress) * 2);
            alpha = Math.max(0, alpha);

            const baseLineWidth = this.settings.rippleLineWidth || 2;
            const lineWidth = baseLineWidth + (baseLineWidth * bassEnergy * (this.settings.lineWidthAudioFactor || 1.0) * (ripple.isBeatRipple ? 1.5 : 1));

            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, ripple.currentActualRadius, 0, Math.PI * 2);

            let strokeColor = ripple.color;
            if (this.globalVisualizerRef?.getColorWithAlpha) {
                strokeColor = this.globalVisualizerRef.getColorWithAlpha(ripple.color, alpha);
            }
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = Math.max(0.5, lineWidth);
            this.ctx.stroke();

            // Fill
            if (this.settings.enableFill) {
                let fillColor = ripple.color;
                const fillAlpha = alpha * (this.settings.fillOpacityFactor || 0.3);
                if (this.globalVisualizerRef?.getColorWithAlpha) {
                    fillColor = this.globalVisualizerRef.getColorWithAlpha(ripple.color, fillAlpha);
                }
                this.ctx.fillStyle = fillColor;
                this.ctx.fill();
            }

            // Check for interactions with subsequent ripples (simplified O(N^2/2) but with early exit)
            if (this.settings.enableInteraction && !ripple.interacted) {
                for (let j = i + 1; j < this.ripples.length; j++) {
                    const otherRipple = this.ripples[j];
                    if (otherRipple.interacted) continue;

                    const dx = ripple.x - otherRipple.x;
                    const dy = ripple.y - otherRipple.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const sumRadii = ripple.currentActualRadius + otherRipple.currentActualRadius;

                    if (distance < sumRadii * (this.settings.interactionThresholdFactor || 0.8)) {
                        const midX = (ripple.x + otherRipple.x) / 2;
                        const midY = (ripple.y + otherRipple.y) / 2;
                        this._spawnInteractionParticles(midX, midY, ripple.isBeatRipple ? ripple.color : otherRipple.color);
                        // Mark both as interacted to prevent further particles from this pair this frame
                        // A more robust system might be needed for continuous interaction effects
                        ripple.interacted = true;
                        otherRipple.interacted = true;
                        // break; // Only interact with one other ripple per frame to reduce particle spam
                    }
                }
            }
            newRipplesList.push(ripple); // Keep active ripple
        }
        this.ripples = newRipplesList;

        if (this.ripples.length > (this.settings.maxRipples || 50) * 1.2) {
            this.ripples.splice(0, this.ripples.length - (this.settings.maxRipples || 50));
        }

        // Update and draw interaction particles
        this._updateAndDrawInteractionParticles(now);
    }

    dispose() {
        this.ripples = [];
        this.interactionParticles = [];
        this.ctx = null;
        this.canvas = null;
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