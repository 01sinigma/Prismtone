// Файл: app/src/main/assets/js/touchEffects/DataStreamEffect.js
// Версия 2.0 (Оптимизированная с пулингом объектов)

class DataStreamEffect {
    constructor() {
        this.rendererType = '2d';

        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        // Map для хранения активных "потоков" (лучей)
        this.streams = new Map();

        // Пул для переиспользования объектов частиц
        this.particlePool = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.streams.clear();
        this.particlePool = []; // Очищаем пул при инициализации

        // Предварительно заполняем пул для избежания созданий в цикле
        const poolSize = this.settings.maxParticles || 200;
        for (let i = 0; i < poolSize; i++) {
            this.particlePool.push({ active: false });
        }

        console.log(`[DataStreamEffect v2] Initialized with pool size ${poolSize}.`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _getStreamColor(noteInfo) {
        if (this.settings.colorSource === 'note' && noteInfo?.midiNote !== undefined) {
            const noteColors = this.globalVisualizerRef?.noteColors || {};
            return noteColors[noteInfo.midiNote % 12] || this.themeColors.primary;
        }
        return this.themeColors.accent || '#03DAC6';
    }

    // --- Управление касаниями ---

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        const newStream = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            width: this.settings.beamWidth || 90,
            color: this._getStreamColor(touchData.noteInfo),
            isActive: true,
            opacity: 0,
            lastEmitTime: performance.now(),
            particles: [] // Каждому лучу - свой массив частиц
        };

        this.streams.set(touchData.id, newStream);
    }

    onTouchMove(touchData) {
        const stream = this.streams.get(touchData.id);
        if (stream && stream.isActive) {
            stream.x = touchData.x * this.canvas.width;
            // Обновляем цвет, если он зависит от ноты
            stream.color = this._getStreamColor(touchData.noteInfo);
        }
    }

    onTouchUp(touchId) {
        const stream = this.streams.get(touchId);
        if (stream) {
            stream.isActive = false; // Помечаем для затухания
        }
    }

    // --- Логика частиц с использованием пула ---

    _createParticle(stream) {
        const p = this.particlePool.find(p => !p.active);
        if (!p) return null; // Пул исчерпан

        const direction = Math.random() > 0.5 ? 1 : -1; // 1 = вниз, -1 = вверх
        const speed = (this.settings.particleBaseSpeed || 0.5) + Math.random() * (this.settings.particleSpeedRange || 1);

        p.active = true;
        p.x = stream.x + (Math.random() - 0.5) * stream.width;
        p.y = Math.random() * this.canvas.height; // Начать в случайном месте по высоте
        p.vy = speed * direction;
        p.life = 1.0;
        p.size = (this.settings.particleMinSize || 1) + Math.random() * (this.settings.particleSizeRange || 2);
        p.decay = 0.01 + Math.random() * 0.01; // Скорость затухания

        return p;
    }

    // --- Главный цикл отрисовки ---

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        this.ctx.globalCompositeOperation = 'lighter';
        const now = performance.now();

        this.streams.forEach((stream, touchId) => {
            // 1. Анимация появления/исчезновения луча
            if (stream.isActive && stream.opacity < 1) {
                stream.opacity = Math.min(1, stream.opacity + 0.05);
            } else if (!stream.isActive) {
                stream.opacity = Math.max(0, stream.opacity - 0.03);
            }

            if (stream.opacity <= 0.01 && !stream.isActive) {
                // Возвращаем частицы луча в пул перед удалением
                stream.particles.forEach(p => p.active = false);
                this.streams.delete(touchId);
                return; // Переходим к следующему лучу
            }

            // 2. Рисуем сам луч (световой канал)
            const beamOpacity = (this.settings.beamOpacity || 0.1) * stream.opacity;
            if (beamOpacity > 0) {
                const gradient = this.ctx.createLinearGradient(stream.x - stream.width / 2, 0, stream.x + stream.width / 2, 0);
                gradient.addColorStop(0, "rgba(0,0,0,0)");
                gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(stream.color, beamOpacity));
                gradient.addColorStop(1, "rgba(0,0,0,0)");

                this.ctx.fillStyle = gradient;
                this.ctx.fillRect(stream.x - stream.width / 2, 0, stream.width, this.canvas.height);
            }

            // 3. Генерируем новые частицы
            const emitInterval = 1000 / (this.settings.emitRate || 30);
            if (stream.isActive && now - stream.lastEmitTime > emitInterval) {
                const numToEmit = this.settings.particlesPerEmit || 2;
                for (let i = 0; i < numToEmit; i++) {
                    const newParticle = this._createParticle(stream);
                    if (newParticle) {
                        stream.particles.push(newParticle);
                    }
                }
                stream.lastEmitTime = now;
            }

            // 4. Обновляем и рисуем частицы
            for (let i = stream.particles.length - 1; i >= 0; i--) {
                const p = stream.particles[i];

                p.y += p.vy;
                p.life -= p.decay;

                // Если частица "умерла" или вышла за пределы экрана
                if (p.life <= 0 || p.y < -p.size || p.y > this.canvas.height + p.size) {
                    p.active = false; // Возвращаем в пул
                    stream.particles.splice(i, 1);
                    continue;
                }

                // Рисуем частицу
                this.ctx.beginPath();
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(stream.color, p.life * stream.opacity);
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.streams.clear();
        this.particlePool = [];
        console.log("[DataStreamEffect v2] Disposed.");
    }
}

// Саморегистрация класса
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer) {
    visualizer.registerTouchEffectRenderer('DataStreamEffect', DataStreamEffect);
}