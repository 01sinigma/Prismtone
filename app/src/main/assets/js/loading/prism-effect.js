// Файл: app/src/main/assets/js/loading/prism-effect.js
// Анимация эффекта радужной ударной волны при финальном переходе

const prismEffect = {
    canvas: null,
    ctx: null,
    animationFrameId: null,
    startTime: 0,
    settings: {
        duration: 700,          // Длительность анимации в мс
        ringCount: 5,           // Количество колец в волне
        maxRadiusMultiplier: 0.8, // Макс. радиус кольца (относительно меньшей стороны canvas)
        initialLineWidth: 6,    // Начальная толщина линии кольца
        lineWidthFadeFactor: 0.8,// Насколько быстро утончается линия (0-1, 1=не утончается)
        expansionCurve: (t) => t * (2 - t), // Кривая расширения (ease-out quad)
        opacityCurve: (t) => 1 - t,      // Кривая затухания прозрачности (линейная)
        hueShiftSpeed: 200,     // Скорость смены оттенка радуги (градусы в секунду)
        glowIntensity: 10,      // Интенсивность свечения (blur)
        glowColorSaturation: 90,// Насыщенность цвета свечения (%)
        glowColorLightness: 65, // Светлота цвета свечения (%)
    },
    rings: [], // Массив активных колец { radius, alpha, lineWidth, hue }
    origin: { x: 0.5, y: 0.5 }, // Центр вспышки по умолчанию
    onCompleteCallback: null,
    isActive: false,
    baseHue: 0, // Базовый оттенок для сдвига

    init(canvasId, userSettings = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`PrismEffect: Canvas with ID '${canvasId}' not found.`);
            return false;
        }
        try {
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) throw new Error("Failed to get 2D context.");
        } catch (error) {
            console.error("PrismEffect: Failed to get canvas context:", error);
            return false;
        }
        this.settings = { ...this.settings, ...userSettings };
        this.resizeCanvas();
        window.addEventListener('resize', this.resizeCanvas.bind(this));
        console.log("PrismEffect (v2): Initialized.");
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
                    console.log(`PrismEffect: Canvas resized to ${width}x${height}`);
                }
            }
        });
    },

    /**
     * Запускает анимацию волны.
     * @param {function} callback - Функция, вызываемая по завершении анимации.
     * @param {{x: number, y: number} | null} [originCoords=null] - Координаты точки касания (0-1).
     */
    play(callback, originCoords = null) {
        if (this.isActive) {
            console.warn("PrismEffect: Animation already playing.");
            return;
        }
        if (!this.ctx || !this.canvas) {
            console.error("PrismEffect: Cannot play, not initialized correctly.");
            if (callback) callback();
            return;
        }
        console.log("PrismEffect: Playing shockwave animation...");
        this.isActive = true;
        this.onCompleteCallback = callback;
        this.startTime = performance.now();
        this.baseHue = Math.random() * 360; // Случайный начальный оттенок

        // Определяем центр волны
        this.origin = originCoords || { x: 0.5, y: 0.5 };

        // Создаем кольца
        this.rings = [];
        for (let i = 0; i < this.settings.ringCount; i++) {
            // Добавляем небольшую задержку для каждого следующего кольца
            const delayFactor = i / this.settings.ringCount * 0.3; // Задержка до 30% от общей длительности
            this.rings.push({
                startTimeOffset: this.settings.duration * delayFactor,
                radius: 0,
                alpha: 0,
                lineWidth: this.settings.initialLineWidth,
                hue: (this.baseHue + (i * (360 / this.settings.ringCount))) % 360 // Распределяем цвета
            });
        }

        // Делаем canvas видимым
        this.canvas.style.opacity = '1';
        this.canvas.style.visibility = 'visible';

        // Запускаем цикл анимации
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.animate();
    },

    /**
     * Основной цикл анимации волны.
     * @param {number} timestamp - Время с начала анимации.
     */
    animate(timestamp = performance.now()) {
        if (!this.isActive) return;

        const elapsedTotal = timestamp - this.startTime;

        if (!this.ctx || !this.canvas) {
            console.error("PrismEffect: Context or canvas became unavailable during animation.");
            this.stop();
            if (this.onCompleteCallback) this.onCompleteCallback();
            return;
        }

        // Очистка холста с небольшим затуханием
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Очень легкое затухание для яркости
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Устанавливаем режим смешивания для яркости
        this.ctx.globalCompositeOperation = 'lighter';

        const canvasMinDim = Math.min(this.canvas.width, this.canvas.height);
        const maxRadiusPx = canvasMinDim * this.settings.maxRadiusMultiplier;
        const originX = this.origin.x * this.canvas.width;
        const originY = this.origin.y * this.canvas.height;
        let activeRings = 0;

        // Обновляем и рисуем кольца
        this.rings.forEach(ring => {
            const elapsedRing = elapsedTotal - ring.startTimeOffset;
            if (elapsedRing <= 0) return; // Кольцо еще не должно появиться

            const progress = Math.min(1.0, elapsedRing / (this.settings.duration * (1 - ring.startTimeOffset / this.settings.duration))); // Прогресс для этого кольца
            if (progress >= 1) return; // Кольцо уже исчезло

            activeRings++;

            // Обновляем параметры кольца
            ring.radius = this.settings.expansionCurve(progress) * maxRadiusPx;
            ring.alpha = this.settings.opacityCurve(progress);
            ring.lineWidth = this.settings.initialLineWidth * Math.pow(this.settings.lineWidthFadeFactor, progress * 5); // Утончается быстрее к концу
            ring.hue = (ring.hue + this.settings.hueShiftSpeed * (elapsedRing / 1000)) % 360; // Сдвигаем цвет

            if (ring.alpha <= 0 || ring.lineWidth < 0.1 || ring.radius < 0) return; // Не рисуем невидимые

            // Рисуем кольцо
            const color = `hsla(${ring.hue}, ${this.settings.glowColorSaturation}%, ${this.settings.glowColorLightness}%, ${ring.alpha.toFixed(2)})`;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = Math.max(0.1, ring.lineWidth);

            // Применяем свечение через фильтр blur
            try {
                const blurAmount = this.settings.glowIntensity * ring.alpha * (1 - progress); // Свечение угасает
                if (blurAmount > 0.5) {
                    this.ctx.filter = `blur(${blurAmount.toFixed(1)}px)`;
                } else {
                    this.ctx.filter = 'none';
                }
            } catch(e) { this.ctx.filter = 'none'; } // Игнорируем ошибку, если blur не поддерживается

            this.ctx.beginPath();
            this.ctx.arc(originX, originY, ring.radius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Сбрасываем фильтр для следующего кольца
            this.ctx.filter = 'none';
        });

        // Сбрасываем режим смешивания
        this.ctx.globalCompositeOperation = 'source-over';

        // Проверяем завершение анимации (когда все кольца исчезли)
        if (activeRings === 0 && elapsedTotal > this.settings.duration * 0.5) { // Добавляем проверку на прошедшее время
            this.stop();
            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
        } else {
            // Запрашиваем следующий кадр
            this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        }
    },

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isActive = false;
        if (this.canvas) {
            this.canvas.style.opacity = '0';
            this.canvas.style.visibility = 'hidden';
        }
        this.rings = [];
        console.log("PrismEffect: Stopped.");
    },

    cleanup() {
        this.stop();
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        console.log("PrismEffect: Cleaned up.");
        window.removeEventListener('resize', this.resizeCanvas.bind(this));
    }
};