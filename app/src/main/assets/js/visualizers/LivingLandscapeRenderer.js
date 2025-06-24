// Файл: app/src/main/assets/js/visualizers/LivingLandscapeRenderer.js
// Версия 1.1 (Исправленная и стабилизированная)

class LivingLandscapeRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        this.terrainPoints = [];
        this.numPoints = 256;
        this.clouds = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas) return;
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef; // <-- Важное исправление

        this.onResize();
        this._initClouds();
        console.log("[LivingLandscapeRenderer] Initialized.");
    }

    onResize() {
        if (!this.canvas) return;
        this.terrainPoints = new Array(this.numPoints).fill(this.canvas.height * 0.8);
        this._initClouds();
    }

    onThemeChange(themeColors) { this.themeColors = themeColors; }

    _initClouds() {
        if (!this.canvas || this.canvas.width === 0) return;
        this.clouds = [];
        const numClouds = this.settings.cloudCount || 20;
        for (let i = 0; i < numClouds; i++) {
            this.clouds.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height * 0.4,
                size: (this.settings.cloudMinSize || 20) + Math.random() * (this.settings.cloudSizeRange || 60),
                speed: (this.settings.cloudBaseSpeed || 0.1) + Math.random() * 0.2,
                opacity: 0.1 + Math.random() * 0.3
            });
        }
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        let lowFreqEnergy = 0, midFreqEnergy = 0;
        // --- Безопасный анализ звука ---
        if (this.analyserNodeRef && audioData instanceof Float32Array && this.analyserNodeRef.type === 'fft') {
            const bufferLength = audioData.length;
            const lowSlice = Math.floor(bufferLength * 0.1);
            const midSlice = Math.floor(bufferLength * 0.4);
            const minDb = this.analyserNodeRef.minDecibels;
            const dbRange = this.analyserNodeRef.maxDecibels - minDb;

            if (dbRange > 0) {
                let lowSum = 0, midSum = 0;
                for (let i = 0; i < midSlice; i++) {
                    const normalizedValue = (audioData[i] - minDb) / dbRange;
                    if (i < lowSlice) lowSum += normalizedValue;
                    else midSum += normalizedValue;
                }
                lowFreqEnergy = Math.min(1.0, lowSum / lowSlice);
                midFreqEnergy = Math.min(1.0, midSum / (midSlice - lowSlice));
            }
        }

        // --- Отрисовка ---
        const skyColor = this.themeColors.primary || '#87CEEB';
        const groundColor = this.themeColors.background || '#228B22';

        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(skyColor, 0.5));
        skyGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(groundColor, 0.8));
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // >>> НАЧАЛО НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ (for clouds) <<<
        let cloudWindX = 0;
        let cloudWindY = 0;

        // Original used factor of /20 and -1. Strength should account for this.
        // (tilt/20) * -1  vs (tilt/90) * strength * invertFactor
        // If strength = 4.5 and invertFactor = -1, then (tilt/90) * 4.5 * -1 = (tilt/20) * -1.
        const defaultTiltStrength = 4.5; // Approximates original /20 factor with new /90 base
        const tiltSettings = this.settings.tiltPhysics || {
            enabled: true,
            strength: defaultTiltStrength,
            invertPitch: true, // Original X effect used pitch * -1
            invertRoll: true   // Original Y effect used roll * -1
        };

        if (tiltSettings.enabled && deviceTilt) {
            const pitchFactor = tiltSettings.invertPitch ? -1 : 1;
            const rollFactor = tiltSettings.invertRoll ? -1 : 1;

            // Original: cloud.x affected by pitch*-1, cloud.y by roll*-1
            // New standard: windX from roll, windY from pitch.
            // So, effect on cloud.x must use new windY (pitch-based).
            // And effect on cloud.y must use new windX (roll-based).
            cloudWindX = (deviceTilt.pitch / 90) * tiltSettings.strength * pitchFactor; // This will be added to cloud.x
            cloudWindY = (deviceTilt.roll / 90) * tiltSettings.strength * rollFactor;  // This will be added to cloud.y
        }
        // >>> КОНЕЦ НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ <<<

        this.clouds.forEach(cloud => {
            cloud.x += cloud.speed + cloudWindX; // cloudWindX is pitch-based, affecting X
            cloud.y += cloudWindY;             // cloudWindY is roll-based, affecting Y

            if (cloud.x > this.canvas.width + cloud.size) cloud.x = -cloud.size;
            if (cloud.x < -cloud.size) cloud.x = this.canvas.width + cloud.size;

            const verticalBounds = this.canvas.height * 0.6;
            if (cloud.y > verticalBounds) { cloud.y = verticalBounds; }
            if (cloud.y < -cloud.size) { cloud.y = -cloud.size; }

            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha('#FFFFFF', cloud.opacity);
            this.ctx.beginPath();
            this.ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        for (let i = 0; i < this.numPoints; i++) {
            const baseHeight = this.canvas.height * 0.8;
            const mountain = (lowFreqEnergy * 200) * Math.sin(i / 20 + performance.now() / 2000);
            const hills = (midFreqEnergy * 100) * Math.sin(i / 5 + performance.now() / 1000);
            this.terrainPoints[i] += (baseHeight - mountain + hills - this.terrainPoints[i]) * 0.05;
        }

        activeTouchStates.forEach(touch => {
            const index = Math.floor(touch.x * (this.numPoints - 1));
            const strength = touch.y * (this.settings.touchStrength || 5);
            if (this.terrainPoints[index] !== undefined) {
                this.terrainPoints[index] -= strength;
            }
        });

        this.ctx.beginPath();
        this.ctx.moveTo(-1, this.canvas.height);
        for (let i = 0; i < this.numPoints; i++) {
            const x = (i / (this.numPoints - 1)) * this.canvas.width;
            this.ctx.lineTo(x, this.terrainPoints[i]);
        }
        this.ctx.lineTo(this.canvas.width + 1, this.canvas.height);
        this.ctx.closePath();

        this.ctx.fillStyle = groundColor;
        this.ctx.fill();
    }

    dispose() {
        this.terrainPoints = [];
        this.clouds = [];
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('LivingLandscapeRenderer', LivingLandscapeRenderer);
}