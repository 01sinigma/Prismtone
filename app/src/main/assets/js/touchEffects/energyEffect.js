class EnergyEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {
            colorSource: 'note',
            baseOpacity: 1.0,
            energySpeed: 2,
            energyInterval: 200,
            maxRadius: 150,
            fadeDuration: 1000,
            spikes: 8,
            innerRadiusFactor: 0.5,
            spawnSpread: 5,
            strokeWidth: 0,
            compositeOperation: "lighter"
        };
        this.themeColors = {};
        this.energySystems = new Map();
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = { ...this.settings, ...initialSettings };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.energySystems.clear();
        console.log("[EnergyEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _createEnergy(system) {
        return {
            xOffset: (Math.random() - 0.5) * this.settings.spawnSpread,
            yOffset: (Math.random() - 0.5) * this.settings.spawnSpread,
            radius: 0,
            opacity: this.settings.baseOpacity,
            speed: this.settings.energySpeed * (0.8 + Math.random() * 0.4),
            angle: Math.random() * Math.PI * 2,
            rotationSpeed: (0.05 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1),
            life: 1.0
        };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;
        this.energySystems.delete(touchData.id);

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
            energies: [this._createEnergy()],
            lastEmitTime: performance.now(),
            fadeStartTime: 0
        };

        this.energySystems.set(touchData.id, newSystem);
    }

    onTouchMove(touchData) {
        const system = this.energySystems.get(touchData.id);
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
        const system = this.energySystems.get(touchId);
        if (system) {
            system.isActive = false;
            system.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.energySystems.size === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = this.settings.compositeOperation || 'lighter';

        this.energySystems.forEach((system, systemId) => {
            let systemOpacityMultiplier = 1.0;

            if (system.isActive) {
                if (now - system.lastEmitTime > this.settings.energyInterval) {
                    system.energies.push(this._createEnergy(system));
                    system.lastEmitTime = now;
                }
            } else {
                const fadeElapsed = now - system.fadeStartTime;
                systemOpacityMultiplier = 1.0 - Math.min(fadeElapsed / this.settings.fadeDuration, 1);

                if (systemOpacityMultiplier <= 0.01 && system.energies.length === 0) {
                    this.energySystems.delete(systemId);
                    return;
                }
            }

            system.energies = system.energies.filter(energy => {
                energy.radius += energy.speed;
                energy.angle += energy.rotationSpeed;
                energy.life -= 0.01;

                if (energy.life <= 0 || energy.opacity <= 0.01) return false;
                
                if (energy.radius > this.settings.maxRadius) return false;

                const currentOpacity = energy.opacity * systemOpacityMultiplier * energy.life;
                if (currentOpacity <= 0.01) return false;

                const points = [];
                const spikes = this.settings.spikes;
                const innerRadius = energy.radius * this.settings.innerRadiusFactor;
                const outerRadius = energy.radius;

                for (let i = 0; i < spikes * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (i * Math.PI) / spikes + energy.angle;
                    points.push({
                        x: system.x + energy.xOffset + Math.cos(angle) * radius,
                        y: system.y + energy.yOffset + Math.sin(angle) * radius
                    });
                }

                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(points[i].x, points[i].y);
                }
                this.ctx.closePath();

                const gradient = this.ctx.createRadialGradient(
                    system.x + energy.xOffset, system.y + energy.yOffset, 0,
                    system.x + energy.xOffset, system.y + energy.yOffset, outerRadius
                );
                gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(system.color, currentOpacity));
                gradient.addColorStop(0.7, this.globalVisualizerRef.getColorWithAlpha(system.color, currentOpacity * 0.5));
                gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(system.color, 0));
                
                this.ctx.fillStyle = gradient;
                this.ctx.fill();
                
                if (this.settings.strokeWidth > 0) {
                    this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(system.color, currentOpacity * 0.7);
                    this.ctx.lineWidth = this.settings.strokeWidth;
                    this.ctx.stroke();
                }

                return true;
            });

            if (!system.isActive && system.energies.length === 0) {
                this.energySystems.delete(systemId);
            }
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.energySystems.clear();
        this.ctx = null;
        this.canvas = null;
        console.log("[EnergyEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('EnergyEffect', EnergyEffect);
} else {
    window.EnergyEffect = EnergyEffect;
    console.warn('[EnergyEffect] Registered globally as visualizer object was not available at load time.');
} 