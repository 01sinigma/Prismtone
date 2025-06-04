// Файл: app/src/main/assets/js/loading/stars-animation.js
// Анимация звездного поля: плавное появление по экрану + полет "на нас"

const starsAnimation = {
    canvas: null,
    ctx: null,
    starsArray: [],
    animationFrameId: null,
    phase: 'idle', // 'idle', 'running'
    settings: {
        starCount: 350,
        spawnRate: 4,           // Немного уменьшим частоту появления
        starMinRadius: 0.3,
        starMaxRadius: 1.3,     // Сделаем максимальный радиус чуть меньше
        starBaseColor: [200, 220, 255],
        starMinAlpha: 0.2,
        starMaxAlpha: 0.8,
        fadeInSpeed: 2.0,       // Скорость появления можно чуть замедлить

        // === УМЕНЬШЕНИЕ СКОРОСТИ ===
        initialSpeedFactor: 0.005, // Значительно уменьшаем начальную скорость
        acceleration: 1.01,     // Уменьшаем ускорение (ближе к 1 = медленнее)
        maxSpeed: 8,            // Уменьшаем максимальную скорость
        // === КОНЕЦ УМЕНЬШЕНИЯ СКОРОСТИ ===

        radiusFactor: 0.08,
        trailLengthFactor: 0.05,// Можно уменьшить хвост, если скорость низкая
        resetMargin: 50,
    },
    lastTimestamp: 0,

    init(canvasId, userSettings = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`StarsAnimation: Canvas with ID '${canvasId}' not found.`);
            return false;
        }
        try {
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) throw new Error("Failed to get 2D context.");
        } catch (error) {
            console.error("StarsAnimation: Failed to get canvas context:", error);
            return false;
        }
        this.settings = { ...this.settings, ...userSettings };
        this.resizeCanvas();
        window.addEventListener('resize', this.resizeCanvas.bind(this));
        console.log("StarsAnimation (v5): Initialized.");
        return true;
    },

    resizeCanvas() {
        if (!this.canvas || !this.canvas.parentElement) return;
        requestAnimationFrame(() => {
            const width = this.canvas.parentElement.clientWidth;
            const height = this.canvas.parentElement.clientHeight;
             if (width > 0 && height > 0) {
                if (this.canvas.width !== width || this.canvas.height !== height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                    console.log(`StarsAnimation: Canvas resized to ${width}x${height}`);
                    this.starsArray = [];
                }
            }
        });
    },

    start() {
        if (this.phase !== 'idle') {
            console.warn("StarsAnimation: Cannot start, already running.");
            return;
        }
        console.log("StarsAnimation: Starting animation loop.");
        this.phase = 'running';
        this.starsArray = [];
        this.lastTimestamp = performance.now();
        if (!this.animationFrameId) {
            this.animate();
        }
    },

    createStar(centerX, centerY) {
        if (!this.canvas || this.canvas.width === 0) return null;

        const x = Math.random() * this.canvas.width;
        const y = Math.random() * this.canvas.height;

        const dx = x - centerX;
        const dy = y - centerY;
        const angle = Math.atan2(dy, dx);
        // Используем initialSpeedFactor от maxSpeed
        const initialSpeed = this.settings.maxSpeed * this.settings.initialSpeedFactor * (0.5 + Math.random() * 0.5);
        const radius = Math.random() * (this.settings.starMaxRadius - this.settings.starMinRadius) + this.settings.starMinRadius;

        return {
            x: x,
            y: y,
            radius: radius,
            initialRadius: radius,
            alpha: 0,
            targetAlpha: Math.random() * (this.settings.starMaxAlpha - this.settings.starMinAlpha) + this.settings.starMinAlpha,
            angle: angle,
            speed: initialSpeed,
        };
    },

    animate(timestamp = performance.now()) {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

        if (this.phase !== 'running' || !this.ctx || !this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
            return;
        }

        const deltaTime = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        const deltaFrames = deltaTime * 60;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        this.ctx.fillStyle = 'rgba(0, 0, 10, 0.15)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const starsToSpawn = Math.max(1, Math.round(this.settings.spawnRate * deltaFrames));
        for (let i = 0; i < starsToSpawn && this.starsArray.length < this.settings.starCount; i++) {
            this.starsArray.push(this.createStar(centerX, centerY));
        }

        for (let i = this.starsArray.length - 1; i >= 0; i--) {
            const star = this.starsArray[i];

            if (star.alpha < star.targetAlpha) {
                star.alpha += this.settings.fadeInSpeed * deltaTime;
                star.alpha = Math.min(star.alpha, star.targetAlpha);
            }

            star.speed = Math.min(this.settings.maxSpeed, star.speed * Math.pow(this.settings.acceleration, deltaFrames));
            star.radius = star.initialRadius + star.speed * this.settings.radiusFactor;
            star.radius = Math.min(star.radius, this.settings.starMaxRadius * 1.5);

            star.x += Math.cos(star.angle) * star.speed * deltaFrames;
            star.y += Math.sin(star.angle) * star.speed * deltaFrames;

            const margin = this.settings.resetMargin;
            if (star.x < -margin || star.x > this.canvas.width + margin ||
                star.y < -margin || star.y > this.canvas.height + margin)
            {
                this.starsArray.splice(i, 1);
            } else {
                this.drawStar(star);
            }
        }
    },

    drawStar(star) {
        if (star.alpha <= 0) return;

        const color = `rgba(${this.settings.starBaseColor.join(',')}, ${star.alpha.toFixed(2)})`;
        const currentRadius = Math.max(0.1, star.radius);

        const trailLength = star.speed * this.settings.trailLengthFactor;
        if (trailLength > 1) {
            const prevX = star.x - Math.cos(star.angle) * trailLength;
            const prevY = star.y - Math.sin(star.angle) * trailLength;
            this.ctx.beginPath();
            this.ctx.moveTo(prevX, prevY);
            this.ctx.lineTo(star.x, star.y);
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = currentRadius * 1.5;
            this.ctx.stroke();
        }

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(star.x, star.y, currentRadius, 0, Math.PI * 2);
        this.ctx.fill();
    },

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.phase = 'idle';
        console.log("StarsAnimation: Stopped.");
    },

    cleanup() {
        this.stop();
        this.starsArray = [];
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        console.log("StarsAnimation: Cleaned up.");
        window.removeEventListener('resize', this.resizeCanvas.bind(this));
    }
};