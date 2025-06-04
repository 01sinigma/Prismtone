class NebulaRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.stars = [];
        this.nebulaBackground = null; // Offscreen canvas for static nebula background
    }

    _generateNebulaBackground() {
        if (!this.canvas) {
            console.error("[Nebula] _generateNebulaBackground: Canvas is null!");
            return;
        }
        // debugger; // Точка останова для отладки DOMException - Закомментируем пока
        const width = this.canvas.width;
        const height = this.canvas.height;
        console.log(`[Nebula INTERNAL] _generateNebulaBackground: Canvas dimensions ${width}x${height}`); // Новый лог
        console.log(`[Nebula] _generateNebulaBackground: Canvas dimensions before offscreen ${width}x${height}`);
        if (width === 0 || height === 0) {
            console.warn("[Nebula] _generateNebulaBackground: Canvas dimensions are zero, skipping offscreen creation.");
            this.nebulaBackground = null;
            return;
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        console.log(`[Nebula] _generateNebulaBackground: Offscreen canvas dimensions ${offscreen.width}x${offscreen.height}`);
        const ctx = offscreen.getContext('2d');
        // Несколько цветных пятен/градиентов
        const nebulaColors = [
            this.themeColors.primary || '#b388ff',
            this.themeColors.accent || '#ffd180',
            '#b3e5fc', '#ff8a80', '#fffbe6', '#ffe0b2'
        ];
        for (let i = 0; i < 3; i++) {
            const cx = width * (0.2 + 0.6 * Math.random());
            const cy = height * (0.2 + 0.6 * Math.random());
            const r = width * (0.2 + 0.2 * Math.random());
            const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(color, 0.8));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(color, 0));
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        this.nebulaBackground = offscreen;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;
        this.stars = [];
        console.log("[NebulaRenderer] Initializing. Canvas dimensions on init:", this.canvas?.width, this.canvas?.height);
        this._initNebula();
        // this._generateNebulaBackground(); // НЕ вызываем здесь, отложим до первого draw или resize
        console.log("[NebulaRenderer] Initialized with settings:", this.settings);
        console.log("[NebulaRenderer] AnalyserNodeRef:", this.analyserNodeRef);
    }

    _createStar() {
        const minRadius = this.settings.starMinRadius || 2;
        const maxRadius = this.settings.starMaxRadius || 5;
        const radius = Math.random() * (maxRadius - minRadius) + minRadius;
        const minSpeed = this.settings.starMinSpeed || 0.1;
        const maxSpeed = this.settings.starMaxSpeed || 0.5;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (maxSpeed - minSpeed) + minSpeed;
        // Цвет звезды
        let starColors = this.settings.starColors || [this.themeColors.text || '#fff'];
        const color = starColors[Math.floor(Math.random() * starColors.length)];
        // Фаза для плавного мерцания
        const twinklePhase = Math.random() * Math.PI * 2;
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius,
            baseAlpha: Math.random() * 0.5 + 0.5,
            mass: radius * radius,
            color,
            twinklePhase,
        };
    }

    _initNebula() {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) return;
        this.stars = [];
        const maxStars = this.settings.starCount || 200;
        for (let i = 0; i < maxStars; i++) {
            this.stars.push(this._createStar());
        }
    }

    _applyGravityAndCollisions(activeTouchStates) {
        const gravityStrength = this.settings.gravityStrength || 0.08;
        const touchGravityStrength = this.settings.touchGravityStrength || 8;
        const collisionShrinkFactor = this.settings.collisionShrinkFactor || 0.7;
        const width = this.canvas.width;
        const height = this.canvas.height;
        for (let i = 0; i < this.stars.length; i++) {
            let starA = this.stars[i];
            for (let j = i + 1; j < this.stars.length; j++) {
                let starB = this.stars[j];
                let dx = starB.x - starA.x;
                let dy = starB.y - starA.y;
                let distSq = dx * dx + dy * dy;
                let dist = Math.sqrt(distSq) + 0.01;
                if (dist < starA.radius + starB.radius) {
                    starA.radius *= collisionShrinkFactor;
                    starB.radius *= collisionShrinkFactor;
                    let overlap = (starA.radius + starB.radius) - dist;
                    let nx = dx / dist;
                    let ny = dy / dist;
                    starA.x -= nx * overlap / 2;
                    starA.y -= ny * overlap / 2;
                    starB.x += nx * overlap / 2;
                    starB.y += ny * overlap / 2;
                }
                let force = gravityStrength * starA.mass * starB.mass / distSq;
                let fx = force * dx / dist;
                let fy = force * dy / dist;
                starA.vx += fx / starA.mass;
                starA.vy += fy / starA.mass;
                starB.vx -= fx / starB.mass;
                starB.vy -= fy / starB.mass;
            }
            // Мощная гравитация от касания (почти не зависит от расстояния)
            if (activeTouchStates && Array.isArray(activeTouchStates)) {
                for (const touch of activeTouchStates) {
                    let tx = touch.x * width;
                    let ty = touch.y * height;
                    let dx = tx - starA.x;
                    let dy = ty - starA.y;
                    let distSq = dx * dx + dy * dy + 1;
                    let dist = Math.sqrt(distSq);
                    // Сила почти не убывает с расстоянием
                    let force = touchGravityStrength * starA.mass / (Math.pow(dist, 0.7) + 10);
                    let fx = force * dx / dist;
                    let fy = force * dy / dist;
                    starA.vx += fx / starA.mass;
                    starA.vy += fy / starA.mass;
                }
            }
        }
        for (let star of this.stars) {
            star.x += star.vx;
            star.y += star.vy;
            if (star.x < 0) { star.x = 0; star.vx *= -1; }
            if (star.x > width) { star.x = width; star.vx *= -1; }
            if (star.y < 0) { star.y = 0; star.vy *= -1; }
            if (star.y > height) { star.y = height; star.vy *= -1; }
            if (star.radius < (this.settings.starMinRadius || 2) * 0.5) {
                Object.assign(star, this._createStar());
            }
        }
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this._generateNebulaBackground(); // При смене темы фон перегенерируем
    }

    onSettingsChange(newSettings) {
        const oldStarCount = this.settings.starCount;
        this.settings = { ...this.settings, ...newSettings };
        if (this.settings.starCount !== oldStarCount) {
            this._initNebula();
        }
        this._generateNebulaBackground(); // При смене настроек фон перегенерируем
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas) return;

        // Логика отложенного создания фона
        if (!this.nebulaBackground && this.canvas.width > 0 && this.canvas.height > 0) { // Создаем фон при первом вызове draw с корректными размерами
            console.log("[Nebula] Lazily generating nebula background in draw()");
            this._generateNebulaBackground();
        }

        // === СТАТИЧНЫЙ ФОН-ТУМАННОСТЬ ===
        if (this.nebulaBackground) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.nebulaBackground, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        // === ФИЗИКА ===
        this._applyGravityAndCollisions(activeTouchStates);
        let energy = 0;
        if (audioData && this.analyserNodeRef) {
            if (this.analyserNodeRef.type === 'waveform' && audioData instanceof Float32Array) {
                energy = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
            } else if (this.analyserNodeRef.type === 'fft' && audioData instanceof Float32Array) {
                const minDb = this.analyserNodeRef.minDecibels ?? -100;
                const dbRange = (this.analyserNodeRef.maxDecibels ?? -30) - minDb;
                if (dbRange > 0) {
                    const dbSum = audioData.reduce((sum, val) => sum + Math.max(0, (val - minDb) / dbRange), 0);
                    energy = Math.min(1, dbSum / (audioData.length * 0.7));
                }
            }
        }
        const intensity = Math.min(1, energy * (this.settings.energyMultiplier || 3));
        const baseOpacity = this.settings.opacity || 0.5;
        const starBrightnessMultiplier = 1 + intensity * (this.settings.starBrightnessMultiplier || 0.5);
        if (!this.globalVisualizerRef || typeof this.globalVisualizerRef.getColorWithAlpha !== 'function') {
            console.error("[NebulaRenderer] globalVisualizerRef.getColorWithAlpha is not available");
            return;
        }
        // === ОТРИСОВКА ЗВЁЗД ===
        const now = performance.now() / 1000;
        if (this.stars.length > 0) {
            for (let star of this.stars) {
                this.ctx.save();
                this.ctx.beginPath();
                // Плавное мерцание радиуса и альфы
                const twinkle = 1 + 0.25 * Math.sin(now * 6 + star.twinklePhase) + (Math.random() - 0.5) * (this.settings.starTwinkleFactor || 0.2);
                const drawRadius = star.radius * (0.95 + 0.1 * twinkle);
                const alpha = Math.min(1, star.baseAlpha * starBrightnessMultiplier * (0.8 + 0.4 * twinkle));
                this.ctx.arc(star.x, star.y, drawRadius, 0, Math.PI * 2);
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(star.color, alpha);
                this.ctx.shadowColor = star.color;
                this.ctx.shadowBlur = 8 + 8 * twinkle;
                this.ctx.fill();
                this.ctx.restore();
            }
        }
        // === ОБЛАКО ===
        // УДАЛЕНО: не рисуем облако поверх фона
        // if (intensity > 0.01) {
        //     const cloudRadius = this.canvas.width * ((this.settings.cloudBaseSize || 0.4) + intensity * (this.settings.cloudSizeReact || 0.4));
        //     const gradient = this.ctx.createRadialGradient(
        //         this.canvas.width / 2, this.canvas.height / 2, 0,
        //         this.canvas.width / 2, this.canvas.height / 2, cloudRadius
        //     );
        //     const primaryAlpha = Math.min(1, (this.settings.primaryAlpha || 0.3) * baseOpacity * (1 + intensity));
        //     const accentAlpha = Math.min(1, (this.settings.accentAlpha || 0.1) * baseOpacity * (1 + intensity));
        //     const primaryColorWithAlpha = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.primary, primaryAlpha);
        //     const accentColorWithAlpha = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.accent, accentAlpha);
        //     const backgroundColorWithAlpha = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.background || 'rgba(0,0,0,0)', 0);
        //     gradient.addColorStop(0, primaryColorWithAlpha);
        //     gradient.addColorStop(this.settings.gradientMidpoint || 0.5, accentColorWithAlpha);
        //     gradient.addColorStop(1, backgroundColorWithAlpha);
        //     this.ctx.fillStyle = gradient;
        //     this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // }
    }

    onResize(newWidth, newHeight) { 
        console.log("[Nebula] Resized to", newWidth, newHeight, ", regenerating nebula background.");
        // Проверяем, что размеры ненулевые перед перегенерацией
        if (newWidth > 0 && newHeight > 0) {
             this._generateNebulaBackground();
        }
        // Переинициализируем звезды, т.к. их позиции зависят от размеров канваса
        this._initNebula();
    }

    dispose() {
        this.stars = [];
        this.ctx = null;
        this.canvas = null;
        this.analyserNodeRef = null;
        console.log("[NebulaRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('NebulaRenderer', NebulaRenderer);
} else {
    window.NebulaRenderer = NebulaRenderer;
    console.warn('[NebulaRenderer] Registered globally as visualizer object was not available at load time.');
}