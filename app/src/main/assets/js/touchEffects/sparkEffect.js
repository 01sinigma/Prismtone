class SparkEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {
            colorSource: 'note',
            baseOpacity: 1.0,
            sparkCount: 8,
            minLength: 10,
            maxLength: 50,
            reactToAudio: true,
            audioReactivity: {
                lengthMultiplier: 1.5,
                opacityMultiplier: 1.2
            }
        };
        this.themeColors = {};
        this.activeSparks = []; // Array of { id, x, y, color, startTime, isActive, sparks }
        this.globalVisualizerRef = null;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeSparks = [];
        console.log("[SparkEffect] Initialized with settings:", this.settings);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeSparks.forEach(spark => {
            if (this.settings.colorSource === 'primary') {
                spark.color = this.themeColors.primary || 'blue';
            } else if (this.settings.colorSource === 'accent') {
                spark.color = this.themeColors.accent || 'red';
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    createSpark(x, y, color) {
        const angle = Math.random() * Math.PI * 2;
        const length = Math.random() * (this.settings.maxLength || 50) + (this.settings.minLength || 10);
        const segments = Math.floor(Math.random() * 3) + 2;
        const points = [];
        let currentX = x;
        let currentY = y;

        for (let i = 0; i < segments; i++) {
            const segmentLength = length / segments;
            const segmentAngle = angle + (Math.random() - 0.5) * Math.PI / 2;
            currentX += Math.cos(segmentAngle) * segmentLength;
            currentY += Math.sin(segmentAngle) * segmentLength;
            points.push({ x: currentX, y: currentY });
        }

        return {
            points: points,
            life: 1.0,
            speed: Math.random() * 2 + 1
        };
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        let color = this.themeColors.primary || 'blue';
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || 'red';
        } else if (this.settings.colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
            const noteIndex = touchData.noteInfo.midiNote % 12;
            const defaultNoteColors = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = defaultNoteColors[noteIndex] || this.themeColors.primary;
        }

        const x = touchData.x * this.canvas.width;
        const y = (1 - touchData.y) * this.canvas.height;
        const sparks = [];

        // Создаем начальные искры
        const sparkCount = this.settings.sparkCount || 8;
        for (let i = 0; i < sparkCount; i++) {
            sparks.push(this.createSpark(x, y, color));
        }

        this.activeSparks.push({
            id: touchData.id,
            x: x,
            y: y,
            color: color,
            startTime: performance.now(),
            isActive: true,
            sparks: sparks
        });
    }

    onTouchMove(touchData) {
        if (!this.ctx || !this.canvas) return;
        const spark = this.activeSparks.find(s => s.id === touchData.id);
        if (spark) {
            spark.x = touchData.x * this.canvas.width;
            spark.y = (1 - touchData.y) * this.canvas.height;

            // Добавляем новые искры при движении
            if (Math.random() < 0.3) { // 30% шанс создания новой искры
                spark.sparks.push(this.createSpark(spark.x, spark.y, spark.color));
            }
        }
    }

    onTouchUp(touchId) {
        const spark = this.activeSparks.find(s => s.id === touchId);
        if (spark) {
            spark.isActive = false;
            spark.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeSparks.length === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        this.ctx.globalCompositeOperation = 'lighter';

        this.activeSparks = this.activeSparks.filter(spark => {
            if (!spark.isActive) {
                // Анимация исчезновения
                const fadeElapsed = now - spark.fadeStartTime;
                const fadeProgress = Math.min(fadeElapsed / 500, 1);
                if (fadeProgress >= 1) return false;

                spark.sparks.forEach(s => {
                    s.life = 1 - fadeProgress;
                });
            }

            // Обновляем и рисуем искры
            spark.sparks = spark.sparks.filter(s => {
                s.life -= 0.02;

                if (s.life <= 0) return false;

                const alpha = (this.settings.baseOpacity || 1.0) * s.life;

                // Рисуем искру
                this.ctx.beginPath();
                this.ctx.moveTo(spark.x, spark.y);

                s.points.forEach((point, index) => {
                    const progress = index / (s.points.length - 1);
                    const pointAlpha = alpha * (1 - progress * 0.5);
                    this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(spark.color, pointAlpha);
                    this.ctx.lineWidth = 2 * (1 - progress);
                    this.ctx.lineTo(point.x, point.y);
                });

                this.ctx.stroke();

                return true;
            });

            return spark.sparks.length > 0;
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.activeSparks = [];
        this.ctx = null;
        this.canvas = null;
        console.log("[SparkEffect] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('SparkEffect', SparkEffect);
} else {
    window.SparkEffect = SparkEffect;
    console.warn('[SparkEffect] Registered globally as visualizer object was not available at load time.');
} 