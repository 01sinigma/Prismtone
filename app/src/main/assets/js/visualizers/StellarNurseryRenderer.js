// Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js
// ВЕРСИЯ 4.1: Рефакторинг, лимит звезд, антигравитация частиц, улучшенная полярность и столкновения звезд.

class StellarNurseryRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {}; // Будет заполнено в init
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particles = []; // Частицы фоновой туманности
        this.stars = [];     // "Рожденные" звезды
        this.touchCores = new Map(); // Активные касания (id -> coreObject)

        this.explosionParticlePool = [];
        this.poolSize = 300; // Максимальное количество частиц от взрывов на экране одновременно
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas || !globalVisualizerRef) {
            console.error("[StellarNurseryRenderer] FATAL: Ctx, Canvas, or GlobalVisualizerRef not provided!");
            return;
        }
        this.ctx = ctx;
        this.canvas = canvas;

        // Установка дефолтных значений, которые могут быть перезаписаны из initialSettings (из JSON)
        this.settings = {
            // Общие
            fadeSpeed: 0.25,
            particleCount: 800,
            windStrength: 0.3,
            friction: 0.97,
            // Ядра касаний
            coreMinSize: 8,
            coreMaxSize: 45,
            timeToMaxSizeMs: 2000,
            maxMassFactor: 10, // Насколько масса ядра может увеличиться
            energyGain: 0.015,
            inertiaDamping: 30,
            touchHistoryLength: 5, // Сколько точек хранить для импульса
            // Частицы туманности
            attraction: 50, // Сила притяжения частиц к ядрам
            particleRepulsion: 0.005, // Сила отталкивания частиц друг от друга
            particleRepulsionActive: true, // Включить/выключить отталкивание частиц (для производительности)
            particleRepulsionRadiusSq: 2500, // Квадрат радиуса для отталкивания частиц (оптимизация)
            // Звезды
            maxStars: 15,
            starGravityFactor: 800, // Гравитация между звездами и притяжение частиц звездой
            starPolarityStrength: 2.0, // Как сильно цвет влияет на притяжение/отталкивание (2.0 дает диапазон от -1 до 1)
            starBounceDamping: -0.6, // Затухание при отскоке от стен
            starDefaultDecay: 0.001, // Базовая скорость угасания звезды
            // Взрывы
            explosion: { particleCount: 40, maxSpeed: 3.5, lifeMs: 600, size: 2.5 },
            // Трансформированные частицы
            transformedParticle: { lifeMs: 3000, initialSpeedBoost: 1.5, gravityImmunityDurationMs: 1500, coolDownMs: 1000 }, // coolDownMs добавлено
            ...initialSettings // Перезаписываем дефолты пользовательскими настройками
        };

        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.stars = [];
        this.touchCores.clear();
        this.explosionParticlePool = [];
        for (let i = 0; i < this.poolSize; i++) {
            this.explosionParticlePool.push({ active: false }); // Инициализация пула
        }

        this.onResize(); // Вызовет _initParticles
        console.log(`[StellarNurseryRenderer v4.1] Initialized. Max stars: ${this.settings.maxStars}. Particle repulsion: ${this.settings.particleRepulsion}.`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors || {};
        this._initParticles(); // Переинициализация частиц с новыми цветами темы
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
            // console.warn("[StellarNurseryRenderer] Canvas not ready for resize or zero size.");
            return;
        }
        this._initParticles();
    }

    _initParticles() {
        if (!this.canvas || !this.globalVisualizerRef || !this.themeColors.primary) {
            // console.warn("[StellarNurseryRenderer] Cannot init particles - missing canvas, global ref or primary theme color.");
            return;
        }
        this.particles = [];
        const count = this.settings.particleCount;
        const baseColor = this.themeColors.primary || '#00BFFF';

        for (let i = 0; i < count; i++) {
            const particleColor = this.globalVisualizerRef.getColorWithAlpha(baseColor, Math.random() * 0.2 + 0.05);
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: 0, vy: 0,
                size: 0.5 + Math.random() * 1.5,
                color: particleColor,
                originalColor: particleColor, // Для возврата после трансформации
                isTransformed: false,
                transformEndTime: 0,
                gravityImmunityEndTime: 0
            });
        }
    }

    onTouchDown(touchData) {
        if (!touchData || !this.canvas || !this.globalVisualizerRef) return;

        let coreColor = this.themeColors.accent || '#FFD54F';
        if (touchData.noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            coreColor = this.globalVisualizerRef.noteColors[touchData.noteInfo.midiNote % 12];
        }

        const core = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height, // Y инвертирован в touchData
            energy: 0.1, // Начальная энергия
            color: coreColor,
            creationTime: performance.now(),
            size: this.settings.coreMinSize,
            mass: 1.0, // Начальная масса
            history: [{ x: touchData.x * this.canvas.width, y: (1 - touchData.y) * this.canvas.height, time: performance.now() }]
        };
        this.touchCores.set(touchData.id, core);
    }

    onTouchUp(touchId) {
        const core = this.touchCores.get(touchId);
        if (core) {
            if (this.stars.length >= this.settings.maxStars) {
                // console.log("[StellarNursery] Max stars reached. Core fades without creating a star.");
                this.touchCores.delete(touchId);
                return;
            }

            let vx = (Math.random() - 0.5) * 2; // Небольшой случайный начальный импульс
            let vy = (Math.random() - 0.5) * 2;
            if (core.history.length > 1) {
                const lastPoint = core.history[core.history.length - 1];
                const prevPoint = core.history[0]; // Используем первую точку для расчета импульса
                const timeDiff = (lastPoint.time - prevPoint.time) / 1000; // в секундах
                if (timeDiff > 0.01) {
                    vx = (lastPoint.x - prevPoint.x) / timeDiff / this.settings.inertiaDamping;
                    vy = (lastPoint.y - prevPoint.y) / timeDiff / this.settings.inertiaDamping;
                }
            }

            this.stars.push({
                x: core.x, y: core.y,
                vx, vy,
                size: core.size,
                mass: core.mass,
                life: 1.0,
                decay: (this.settings.starDefaultDecay || 0.001) + Math.random() * 0.001,
                color: core.color,
                id: performance.now() + Math.random() // Уникальный ID
            });
            this.touchCores.delete(touchId);
        }
    }

    _triggerStarExplosion(star) {
        const explosionSettings = this.settings.explosion;
        const particleCount = explosionSettings.particleCount || Math.floor(star.size * 1.5); // Количество частиц от размера звезды

        for (let i = 0; i < particleCount; i++) {
            const p = this.explosionParticlePool.find(particle => !particle.active);
            if (!p) continue;

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * explosionSettings.maxSpeed * (star.mass / 5 + 0.5); // Скорость зависит от массы

            Object.assign(p, {
                active: true, x: star.x, y: star.y,
                vx: star.vx * 0.1 + Math.cos(angle) * speed,
                vy: star.vy * 0.1 + Math.sin(angle) * speed,
                size: Math.random() * explosionSettings.size + 1,
                color: star.color,
                life: 1.0,
                decay: 1.0 / (explosionSettings.lifeMs / 16.66) // Расчет угасания для заданной длительности жизни
            });
        }
    }

    _transformNearbyParticles(sourceObject, eventType = "collision") {
        if (!this.settings.transformedParticle) return;
        const transformSettings = this.settings.transformedParticle;
        const radius = eventType === "collision" ? (sourceObject.size || 20) * 3 : (sourceObject.size || 10) * 2;
        const now = performance.now();

        this.particles.forEach(p => {
            if (p.isTransformed) return; // Не трансформируем уже трансформированные

            const dx = p.x - sourceObject.x;
            const dy = p.y - sourceObject.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < radius * radius) {
                p.isTransformed = true;
                p.originalColor = p.color; // Сохраняем оригинальный цвет
                p.transformEndTime = now + transformSettings.lifeMs;
                p.gravityImmunityEndTime = now + transformSettings.gravityImmunityDurationMs;

                const dist = Math.sqrt(distSq) || 1;
                const speedBoostFactor = (1 - dist / radius); // Сильнее у центра
                p.vx += (dx / dist) * transformSettings.initialSpeedBoost * speedBoostFactor;
                p.vy += (dy / dist) * transformSettings.initialSpeedBoost * speedBoostFactor;
                p.color = this.themeColors.accent || '#FFFFFF'; // Временный цвет трансформации
            }
        });
    }

    _getColorDifference(color1, color2) {
        if (color1 === color2) return 0; // Если строки цветов идентичны
        const rgb1 = this.globalVisualizerRef.hexToRgb(color1);
        const rgb2 = this.globalVisualizerRef.hexToRgb(color2);
        if (!rgb1 || !rgb2) return 0.5; // Если не удалось распознать цвет, считаем средней разницей

        const diff = Math.sqrt(
            Math.pow(rgb1.r - rgb2.r, 2) +
            Math.pow(rgb1.g - rgb2.g, 2) +
            Math.pow(rgb1.b - rgb2.b, 2)
        );
        return diff / 441.67; // Нормализация (max diff is sqrt(3 * 255^2) approx 441.67)
    }

    // ===================================================================================
    // ПРИВАТНЫЕ МЕТОДЫ ОБНОВЛЕНИЯ ЛОГИКИ
    // ===================================================================================

    _updateCores(activeTouchStates, now) {
        const activeTouchIds = new Set(activeTouchStates.map(t => t.id));

        this.touchCores.forEach((core, id) => {
            if (!activeTouchIds.has(id)) {
                this.onTouchUp(id);
            }
        });

        activeTouchStates.forEach(touch => {
            let core = this.touchCores.get(touch.id);
            if (core) {
                const newX = touch.x * this.canvas.width;
                const newY = (1 - touch.y) * this.canvas.height;

                core.history.push({ x: newX, y: newY, time: now });
                if (core.history.length > this.settings.touchHistoryLength) {
                    core.history.shift();
                }
                core.x = newX; core.y = newY;

                const holdDuration = now - core.creationTime;
                const sizeFactor = Math.min(1.0, holdDuration / this.settings.timeToMaxSizeMs);
                core.size = this.settings.coreMinSize + (this.settings.coreMaxSize - this.settings.coreMinSize) * sizeFactor;
                core.mass = 1 + (this.settings.maxMassFactor -1) * sizeFactor;
                core.energy = Math.min(1, core.energy + (touch.pressure || 0.5) * this.settings.energyGain);

                if (this.globalVisualizerRef.noteColors?.length > 0 && touch.noteInfo?.midiNote !== undefined) {
                    core.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12];
                }
            } else {
                this.onTouchDown(touch);
            }
        });
    }

    _updateParticles(windX, windY, friction, now) {
        const coolDownDuration = this.settings.transformedParticle?.coolDownMs || 1000; // 1 секунда на остывание по умолчанию

        this.particles.forEach(p => {
            if (p.isTransformed) {
                const timeLeft = p.transformEndTime - now;
                if (timeLeft <= 0) {
                    // Время трансформации истекло
                    p.isTransformed = false;
                    p.color = p.originalColor;
                } else if (timeLeft <= coolDownDuration) {
                    // Фаза остывания: плавно меняем цвет
                    const coolDownProgress = 1 - (timeLeft / coolDownDuration); // от 0 до 1

                    const startColorHex = this.themeColors.accent || '#FFFFFF'; // Цвет трансформации
                    const endColorHex = p.originalColor;

                    const startRGB = this.globalVisualizerRef.hexToRgb(startColorHex);
                    const endRGB = this.globalVisualizerRef.hexToRgb(this.globalVisualizerRef.extractBaseColor(endColorHex)); // Убираем альфу из оригинального цвета для интерполяции RGB
                    const originalAlpha = this.globalVisualizerRef.extractAlphaFromColor(endColorHex) || 0.3;


                    if (startRGB && endRGB) {
                        const r = Math.floor(startRGB.r + (endRGB.r - startRGB.r) * coolDownProgress);
                        const g = Math.floor(startRGB.g + (endRGB.g - startRGB.g) * coolDownProgress);
                        const b = Math.floor(startRGB.b + (endRGB.b - startRGB.b) * coolDownProgress);
                        // Альфа во время остывания может быть фиксированной или тоже интерполироваться
                        // Пока оставим альфу, соответствующую оригинальной альфе частицы, но можно сделать ее более заметной во время трансформации
                        const currentAlpha = originalAlpha; // Или, например, 0.8 - (0.8 - originalAlpha) * coolDownProgress;
                        p.color = `rgba(${r},${g},${b},${currentAlpha})`;
                    } else {
                        // Если не удалось получить RGB, просто меняем на оригинальный в конце остывания
                        if (timeLeft <= 0) p.color = p.originalColor;
                    }
                }
                // Если не в фазе остывания и не время истекло, цвет остается p.color (цвет трансформации)
            }

            let totalForceX = 0;
            let totalForceY = 0;
            const immunityActive = p.isTransformed && now < p.gravityImmunityEndTime;

            if (!immunityActive) {
                 totalForceX += windX;
                 totalForceY += windY;
            }

            if (this.settings.particleRepulsionActive && this.settings.particleRepulsion > 0 && !p.isTransformed) { // Отталкивание только для нетрансформированных и если активно
                this.particles.forEach(otherP => {
                    if (p === otherP || otherP.isTransformed) return;
                    const dx = p.x - otherP.x;
                    const dy = p.y - otherP.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 0.1 && distSq < this.settings.particleRepulsionRadiusSq) {
                        const dist = Math.sqrt(distSq);
                        const force = this.settings.particleRepulsion / dist;
                        totalForceX += (dx / dist) * force;
                        totalForceY += (dy / dist) * force;
                    }
                });
            }

            if (!immunityActive) {
                this.touchCores.forEach(core => {
                    const dx = core.x - p.x; const dy = core.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const force = core.energy * this.settings.attraction / (distSq + 100);
                        totalForceX += dx * force; totalForceY += dy * force;
                    }
                });

                this.stars.forEach(star => {
                    const dx = star.x - p.x; const dy = star.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const force = (star.mass * this.settings.starGravityFactor) / (distSq + 1000);
                        const dist = Math.sqrt(distSq) || 1;
                        totalForceX += dx * force / dist;
                        totalForceY += dy * force / dist;
                    }
                });
            }

            p.vx = (p.vx + totalForceX) * friction;
            p.vy = (p.vy + totalForceY) * friction;
            p.x += p.vx;
            p.y += p.vy;

            const bounceDamping = -0.5;
            if (p.x < 0) { p.x = 0; p.vx *= bounceDamping; }
            if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx *= bounceDamping; }
            if (p.y < 0) { p.y = 0; p.vy *= bounceDamping; }
            if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy *= bounceDamping; }
        });
    }

    _updateStars(windX, windY, friction) {
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const starA = this.stars[i];
            if (!starA) continue;

            for (let j = i - 1; j >= 0; j--) {
                const starB = this.stars[j];
                if (!starB) continue;

                const dx = starB.x - starA.x;
                const dy = starB.y - starA.y;
                const distSq = dx * dx + dy * dy;
                // Эффективный радиус для столкновения = сумма радиусов звезд (размер зависит от life)
                const effectiveRadiusA = (starA.size * starA.life * 0.5);
                const effectiveRadiusB = (starB.size * starB.life * 0.5);
                const minDistSq = Math.pow(effectiveRadiusA + effectiveRadiusB, 2);

                if (distSq < minDistSq && distSq > 0.01) { // Столкновение!
                    let biggerStar, smallerStar, biggerStarIndex, smallerStarIndex;
                    if (starA.mass >= starB.mass) {
                        biggerStar = starA; smallerStar = starB;
                        biggerStarIndex = i; smallerStarIndex = j;
                    } else {
                        biggerStar = starB; smallerStar = starA;
                        biggerStarIndex = j; smallerStarIndex = i;
                    }

                    biggerStar.mass += smallerStar.mass * 0.75; // Поглощение части массы
                    biggerStar.size = Math.min(biggerStar.size + smallerStar.size * 0.15, this.settings.coreMaxSize * 1.5); // Немного увеличиваем размер
                    biggerStar.life = Math.min(biggerStar.life + smallerStar.life * 0.2, 1.2); // Немного продлеваем жизнь

                    this._transformNearbyParticles(smallerStar, "collision");

                    this.stars.splice(smallerStarIndex, 1);

                    if (smallerStar === starA) { // Если starA была поглощена
                        break; // Прерываем внутренний цикл, внешний цикл перейдет к следующему i (который теперь указывает на другую звезду или конец массива)
                    } else { // starB была поглощена
                        // Если j < i, то удаление starB (на индексе j) сдвинет starA (на индексе i) на i-1.
                        // На следующей итерации внешнего цикла i уменьшится, и мы корректно обработаем звезду, которая теперь на i-1.
                        // Однако, чтобы внутренний цикл продолжал корректно работать с оставшимися звездами до starA, нужно уменьшить i для внешнего цикла, если j < i.
                        // Но так как мы идем в обратном порядке (i--), и j всегда меньше i, это уже учтено.
                        // Ничего дополнительно делать не нужно для индексов в этом случае.
                    }
                    continue; // Переходим к следующей паре для biggerStar (если starA не была удалена)
                }

                if (distSq > 1) {
                    const dist = Math.sqrt(distSq);
                    const colorDiff = this._getColorDifference(starA.color, starB.color); // 0 = одинаковые, 1 = разные

                    // Новая логика полярности:
                    // Разные цвета притягиваются (colorDiff ~ 1 => polarityFactor ~ 1)
                    // Одинаковые цвета отталкиваются (colorDiff ~ 0 => polarityFactor ~ -1)
                    // Используем starPolarityStrength (например, 2.0) для масштабирования эффекта.
                    // (colorDiff * strength) дает [0, strength]. Вычитаем 1 (или strength/2) для центрирования.
                    // Если strength = 2.0: (colorDiff * 2.0) - 1.0 => дает диапазон [-1.0, 1.0]
                    // colorDiff = 0 (одинаковые) => (0 * 2.0) - 1.0 = -1.0 (отталкивание)
                    // colorDiff = 1 (разные)   => (1 * 2.0) - 1.0 =  1.0 (притяжение)
                    // colorDiff = 0.5 (средне) => (0.5 * 2.0) - 1.0 = 0.0 (нейтрально)
                    const polarityFactor = (colorDiff * this.settings.starPolarityStrength) - (this.settings.starPolarityStrength / 2);

                    const forceMagnitude = polarityFactor *
                                           this.settings.starGravityFactor *
                                           starA.mass * starB.mass / (distSq + 100);

                    const fx = (dx / dist) * forceMagnitude;
                    const fy = (dy / dist) * forceMagnitude;

                    starA.vx += fx / starA.mass; starA.vy += fy / starA.mass;
                    starB.vx -= fx / starB.mass; starB.vy -= fy / starB.mass;
                }
            }
             if (!this.stars.includes(starA)) continue; // Если starA была поглощена, пропускаем остаток

            starA.vx = (starA.vx + windX) * friction;
            starA.vy = (starA.vy + windY) * friction;
            starA.x += starA.vx; starA.y += starA.vy;

            const damp = this.settings.starBounceDamping;
            const currentVisualSize = starA.size * starA.life;
            if (starA.x < currentVisualSize) { starA.x = currentVisualSize; starA.vx *= damp; }
            if (starA.x > this.canvas.width - currentVisualSize) { starA.x = this.canvas.width - currentVisualSize; starA.vx *= damp; }
            if (starA.y < currentVisualSize) { starA.y = currentVisualSize; starA.vy *= damp; }
            if (starA.y > this.canvas.height - currentVisualSize) { starA.y = this.canvas.height - currentVisualSize; starA.vy *= damp; }

            starA.life -= starA.decay;
            if (starA.life <= 0) {
                this._triggerStarExplosion(starA);
                this.stars.splice(i, 1);
            }
        }
    }

    _updateExplosionParticles(windX, windY, friction) {
        this.explosionParticlePool.forEach(p => {
            if (!p.active) return;
            p.vx = (p.vx + windX) * friction;
            p.vy = (p.vy + windY) * friction;
            p.x += p.vx; p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) p.active = false;
        });
    }

    // ===================================================================================
    // ОСНОВНОЙ МЕТОД DRAW (ОТРИСОВКА)
    // ===================================================================================
    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;
        const now = performance.now();

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.background || '#00000A', this.settings.fadeSpeed);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const windStrength = this.settings.windStrength;
        const windX = (deviceTilt.roll / 90) * windStrength;
        const windY = (deviceTilt.pitch / 90) * windStrength;
        const friction = this.settings.friction;

        this._updateCores(activeTouchStates, now);
        this._updateParticles(windX, windY, friction, now);
        this._updateStars(windX, windY, friction);
        this._updateExplosionParticles(windX, windY, friction);

        // --- Отрисовка ---
        this.ctx.globalCompositeOperation = 'lighter';

        this.particles.forEach(p => {
            const alphaBase = p.isTransformed ? 0.9 : (parseFloat(p.color.match(/[\d\.]+\)$/)) || 0.3);
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            // Используем p.color напрямую, если он уже содержит альфа, или добавляем ее
            let colorForGradient = p.isTransformed ? this.globalVisualizerRef.getColorWithAlpha(p.color, alphaBase * 0.8) : this.globalVisualizerRef.getColorWithAlpha(p.originalColor, alphaBase * 0.8);
            let colorForEdge = p.isTransformed ? this.globalVisualizerRef.getColorWithAlpha(p.color, 0) : this.globalVisualizerRef.getColorWithAlpha(p.originalColor, 0);
            if (p.isTransformed) { // Если трансформирована, цвет уже установлен на акцентный (без альфы)
                 colorForGradient = this.globalVisualizerRef.getColorWithAlpha(p.color, alphaBase * 0.8);
                 colorForEdge = this.globalVisualizerRef.getColorWithAlpha(p.color, 0);
            } else { // Обычная частица, p.color может уже содержать альфу
                 colorForGradient = this.globalVisualizerRef.getColorWithAlpha(p.color, alphaBase * 0.8, true); // true - color might have alpha
                 colorForEdge = this.globalVisualizerRef.getColorWithAlpha(p.color, 0, true);
            }

            grad.addColorStop(0, colorForGradient);
            grad.addColorStop(1, colorForEdge);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); this.ctx.fill();
        });

        this.touchCores.forEach(core => {
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.9));
            grad.addColorStop(0.3, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.5));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(core.color, 0));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(core.x, core.y, core.size, 0, Math.PI * 2); this.ctx.fill();
        });

        this.stars.forEach(star => {
            const currentVisualSize = star.size * star.life;
            if (currentVisualSize < 0.1) return;
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, currentVisualSize);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life));
            grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life * 0.5));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(star.color, 0));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(star.x, star.y, currentVisualSize, 0, Math.PI * 2); this.ctx.fill();
        });

        this.explosionParticlePool.forEach(p => {
            if (p.active) {
                const currentVisualSize = p.size * p.life;
                if (currentVisualSize < 0.1) return;
                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, p.life * 0.9);
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, currentVisualSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.particles = [];
        this.stars = [];
        this.touchCores.clear();
        this.explosionParticlePool.forEach(p => p.active = false);
        console.log("[StellarNurseryRenderer v4.1] Disposed.");
    }
}

// Саморегистрация в visualizer.js
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}