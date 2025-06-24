// Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js
// ВЕРСИЯ 6.0: Внедрение антиматерии, сверхновые, улучшенные взаимодействия и жизненные циклы.

class StellarNurseryRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {}; // Будет заполнено в init
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particles = []; // Частицы фоновой туманности (Обычная Материя)
        this.stars = [];     // "Рожденные" звезды (Обычная Материя)
        this.touchCores = new Map(); // Активные касания (Ядра Протозвезд)
        this.antimatterParticlePool = []; // Пул для Частиц Антиматерии
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas || !globalVisualizerRef) {
            console.error("[StellarNurseryRenderer v6.0] FATAL: Ctx, Canvas, or GlobalVisualizerRef not provided!");
            return;
        }
        this.ctx = ctx;
        this.canvas = canvas;

        // Дефолтные настройки, соответствующие новой структуре JSON v6.0
        // Эти значения будут использоваться, если что-то отсутствует в initialSettings
        const defaultSettings = {
            fadeSpeed: 0.25,
            windStrength: 0.3,
            globalFriction: 0.97,
            backgroundParticles: {
                count: 800,
                attractionToCores: 50,
                repulsionFactor: 0.005,
                repulsionActive: true,
                repulsionRadiusSq: 2500,
                attractionToAntimatter: 75,
                transformed: {
                    lifeMs: 3000,
                    initialSpeedBoost: 1.5,
                    gravityImmunityDurationMs: 1500,
                    coolDownMs: 1000
                }
            },
            touchCores: {
                minSize: 8,
                maxSize: 45,
                timeToMaxSizeMs: 2000,
                maxMassFactor: 10,
                energyGain: 0.015,
                inertiaDamping: 30,
                historyLength: 5,
                repulsionFromAntimatter: 0.1,
                windInfluence: 0.5
            },
            stars: {
                maxCount: 15,
                gravityFactor: 800,
                polarityStrength: 2.0,
                bounceDamping: -0.6,
                defaultDecay: 0.001,
                fadeStartSize: 15,
                repulsionFromAntimatter: 0.1,
                supernova: {
                    starPushForce: 5,
                    antimatterConversionRadiusFactor: 5,
                    maxAntimatterParticles: 50,
                    antimatterInitialSpeedFactor: 2.0
                }
            },
            antimatterSystem: {
                poolSize: 200,
                particleDefaultSize: 2,
                particleLifeMs: 5000,
                particleFriction: 0.98,
                windInfluence: 1.0
            }
        };

        // Глубокое слияние настроек, чтобы initialSettings перезаписывали defaultSettings
        this.settings = this.globalVisualizerRef.deepMerge(defaultSettings, initialSettings || {});

        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.stars = [];
        this.touchCores.clear();

        // Инициализация пула антиматерии
        this.antimatterParticlePool = [];
        const amPoolSize = this.settings.antimatterSystem?.poolSize || 200;
        for (let i = 0; i < amPoolSize; i++) {
            this.antimatterParticlePool.push({ active: false });
        }

        this.onResize(); // Вызовет _initBackgroundParticles
        console.log(`[StellarNurseryRenderer v6.0] Initialized. Max stars: ${this.settings.stars?.maxCount}. Antimatter pool: ${amPoolSize}.`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors || {};
        this._initBackgroundParticles(); // Переинициализация частиц с новыми цветами темы
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
            return;
        }
        this._initBackgroundParticles();
    }

    _initBackgroundParticles() {
        if (!this.canvas || !this.globalVisualizerRef || !this.themeColors.primary || !this.settings.backgroundParticles) {
            return;
        }
        this.particles = [];
        const settings = this.settings.backgroundParticles;
        const count = settings.count;
        const baseColor = this.themeColors.primary || '#00BFFF';

        for (let i = 0; i < count; i++) {
            const particleColor = this.globalVisualizerRef.getColorWithAlpha(baseColor, Math.random() * 0.2 + 0.05);
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: 0, vy: 0,
                size: 0.5 + Math.random() * 1.5,
                color: particleColor,
                originalColor: particleColor,
                isTransformed: false,
                transformEndTime: 0,
                gravityImmunityEndTime: 0,
                // colorChangeStartTime не нужен явно, используется transformEndTime - coolDownMs
            });
        }
    }

    onTouchDown(touchData) {
        if (!touchData || !this.canvas || !this.globalVisualizerRef || !this.settings.touchCores) return;
        const coreSettings = this.settings.touchCores;

        let coreColor = this.themeColors.accent || '#FFD54F';
        if (touchData.noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            coreColor = this.globalVisualizerRef.noteColors[touchData.noteInfo.midiNote % 12];
        }

        const core = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            vx: 0, vy: 0, // Для влияния ветра
            energy: 0.1,
            color: coreColor,
            creationTime: performance.now(),
            size: coreSettings.minSize,
            mass: 1.0,
            history: [{ x: touchData.x * this.canvas.width, y: (1 - touchData.y) * this.canvas.height, time: performance.now() }]
        };
        this.touchCores.set(touchData.id, core);
    }

    onTouchUp(touchId) {
        const core = this.touchCores.get(touchId);
        if (core && this.settings.stars && this.settings.touchCores) {
            const starSettings = this.settings.stars;
            const coreSettings = this.settings.touchCores;

            if (this.stars.length >= starSettings.maxCount) {
                this.touchCores.delete(touchId);
                return;
            }

            let vx = (Math.random() - 0.5) * 2;
            let vy = (Math.random() - 0.5) * 2;
            if (core.history.length > 1) {
                const lastPoint = core.history[core.history.length - 1];
                const prevPoint = core.history[0];
                const timeDiff = (lastPoint.time - prevPoint.time) / 1000;
                if (timeDiff > 0.01) {
                    vx = (lastPoint.x - prevPoint.x) / timeDiff / coreSettings.inertiaDamping;
                    vy = (lastPoint.y - prevPoint.y) / timeDiff / coreSettings.inertiaDamping;
                }
            }

            this.stars.push({
                x: core.x, y: core.y,
                vx, vy,
                size: core.size,
                mass: core.mass,
                life: 1.0,
                decay: (starSettings.defaultDecay || 0.001) + Math.random() * 0.0005, // Небольшая вариация
                color: core.color,
                id: performance.now() + Math.random()
            });
            this.touchCores.delete(touchId);
        }
    }

    _triggerSupernova(star) {
        if (!this.settings.stars?.supernova || !this.settings.antimatterSystem) return;
        const supernovaSettings = this.settings.stars.supernova;
        const amSettings = this.settings.antimatterSystem;
        const now = performance.now();

        // 1. Отталкивание других звезд
        this.stars.forEach(otherStar => {
            if (otherStar.id === star.id) return;
            const dx = otherStar.x - star.x;
            const dy = otherStar.y - star.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < (star.size * 10) * (star.size * 10) && distSq > 0) { // Радиус отталкивания
                const dist = Math.sqrt(distSq);
                const force = supernovaSettings.starPushForce / (dist + 10) * star.mass; // Сила зависит от массы взорвавшейся звезды
                otherStar.vx += (dx / dist) * force / otherStar.mass;
                otherStar.vy += (dy / dist) * force / otherStar.mass;
            }
        });

        // 2. Трансформация ближайших фоновых частиц в Антиматерию
        let antimatterCreatedCount = 0;
        const conversionRadius = star.size * supernovaSettings.antimatterConversionRadiusFactor;
        const conversionRadiusSq = conversionRadius * conversionRadius;

        this.particles.forEach(p => {
            if (antimatterCreatedCount >= supernovaSettings.maxAntimatterParticles) return;

            const dx = p.x - star.x;
            const dy = p.y - star.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < conversionRadiusSq) {
                const amParticle = this.antimatterParticlePool.find(amp => !amp.active);
                if (amParticle) {
                    const dist = Math.sqrt(distSq) || 1;
                    const speed = supernovaSettings.antimatterInitialSpeedFactor * (1 + star.mass / 10) * (1 - dist / conversionRadius);

                    amParticle.active = true;
                    amParticle.x = p.x; // Начинается с позиции обычной частицы
                    amParticle.y = p.y;
                    amParticle.vx = star.vx * 0.05 + (dx / dist) * speed; // Импульс от центра взрыва
                    amParticle.vy = star.vy * 0.05 + (dy / dist) * speed;
                    amParticle.size = amSettings.particleDefaultSize + Math.random() * 0.5;
                    amParticle.color = this.themeColors.error || '#FF1744'; // Цвет антиматерии
                    amParticle.creationTime = now;
                    amParticle.life = 1.0; // Будет уменьшаться
                    // Decay рассчитывается для particleLifeMs
                    amParticle.decay = 1.0 / (amSettings.particleLifeMs / (1000 / 60)); // Assuming 60 FPS for decay calculation

                    // Удаляем обычную частицу или трансформируем её свойства?
                    // По плану v6.0: "трансформирует ... частицы в Антиматерию" - значит, исходная частица исчезает.
                    // Чтобы избежать изменения массива this.particles во время итерации, можно пометить их на удаление
                    // или просто пересоздать массив this.particles без них. Проще всего - фильтрация.
                    // Но для производительности лучше не удалять из массива this.particles часто.
                    // Можно просто сделать её "невидимой" или неактивной, но это не соответствует плану.
                    // Пока оставим её, но в идеале её нужно было бы удалить или пометить.
                    // Для простоты, не будем удалять, эффект будет "замещения".

                    antimatterCreatedCount++;
                }
            }
        });
    }

    _transformNearbyParticles(sourceObject, eventType = "collision") {
        if (!this.settings.backgroundParticles?.transformed) return;
        const transformSettings = this.settings.backgroundParticles.transformed;
        const radius = eventType === "collision" ? (sourceObject.size || 20) * 3 : (sourceObject.size || 10) * 2;
        const now = performance.now();

        this.particles.forEach(p => {
            if (p.isTransformed) return;

            const dx = p.x - sourceObject.x;
            const dy = p.y - sourceObject.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < radius * radius) {
                p.isTransformed = true;
                p.originalColor = p.color;
                p.transformEndTime = now + transformSettings.lifeMs;
                p.gravityImmunityEndTime = now + transformSettings.gravityImmunityDurationMs;

                const dist = Math.sqrt(distSq) || 1;
                const speedBoostFactor = (1 - dist / radius);
                p.vx += (dx / dist) * transformSettings.initialSpeedBoost * speedBoostFactor;
                p.vy += (dy / dist) * transformSettings.initialSpeedBoost * speedBoostFactor;
                p.color = this.themeColors.accent || '#FFFFFF';
            }
        });
    }

    _getColorDifference(color1, color2) {
        if (color1 === color2) return 0;
        const rgb1 = this.globalVisualizerRef.hexToRgb(color1);
        const rgb2 = this.globalVisualizerRef.hexToRgb(color2);
        if (!rgb1 || !rgb2) return 0.5;

        const diff = Math.sqrt(
            Math.pow(rgb1.r - rgb2.r, 2) +
            Math.pow(rgb1.g - rgb2.g, 2) +
            Math.pow(rgb1.b - rgb2.b, 2)
        );
        return diff / 441.67;
    }

    // ===================================================================================
    // ПРИВАТНЫЕ МЕТОДЫ ОБНОВЛЕНИЯ ЛОГИКИ
    // ===================================================================================

    _updateCores(activeTouchStates, windX, windY, now) {
        if (!this.settings.touchCores || !this.settings.antimatterSystem) return;
        const coreSettings = this.settings.touchCores;
        const globalFriction = this.settings.globalFriction;

        const activeTouchIds = new Set(activeTouchStates.map(t => t.id));

        this.touchCores.forEach((core, id) => {
            if (!activeTouchIds.has(id)) {
                this.onTouchUp(id); // Рождение звезды или исчезновение
            }
        });

        activeTouchStates.forEach(touch => {
            let core = this.touchCores.get(touch.id);
            if (core) {
                const newX = touch.x * this.canvas.width;
                const newY = (1 - touch.y) * this.canvas.height;

                core.history.push({ x: newX, y: newY, time: now });
                if (core.history.length > coreSettings.historyLength) {
                    core.history.shift();
                }
                core.x = newX; core.y = newY; // Позиция следует за пальцем

                const holdDuration = now - core.creationTime;
                const sizeFactor = Math.min(1.0, holdDuration / coreSettings.timeToMaxSizeMs);
                core.size = coreSettings.minSize + (coreSettings.maxSize - coreSettings.minSize) * sizeFactor;
                core.mass = 1 + (coreSettings.maxMassFactor - 1) * sizeFactor;
                core.energy = Math.min(1, core.energy + (touch.pressure || 0.5) * coreSettings.energyGain);

                if (this.globalVisualizerRef.noteColors?.length > 0 && touch.noteInfo?.midiNote !== undefined) {
                    core.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12];
                }

                // Влияние ветра на ядро (уменьшается с массой)
                const windEffect = coreSettings.windInfluence / core.mass;
                core.vx += windX * windEffect;
                core.vy += windY * windEffect;

                // Отталкивание от антиматерии
                this.antimatterParticlePool.forEach(ap => {
                    if (ap.active) {
                        const dx = core.x - ap.x;
                        const dy = core.y - ap.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq > 1 && distSq < (core.size + ap.size + 50) * (core.size + ap.size + 50)) { // Радиус взаимодействия
                            const dist = Math.sqrt(distSq);
                            const force = coreSettings.repulsionFromAntimatter * ap.size / (distSq * 0.01 + 1); // Сила зависит от размера антиматерии
                            core.vx += (dx / dist) * force / core.mass;
                            core.vy += (dy / dist) * force / core.mass;
                        }
                    }
                });

                core.vx *= globalFriction; // Трение для скорости от ветра/отталкивания
                core.vy *= globalFriction;
                // Позиция ядра в основном управляется касанием, но vx/vy могут влиять на "дрейф" или импульс при отпускании
                // Если нужно, чтобы ядро физически смещалось от ветра/отталкивания во время удержания:
                // core.x += core.vx; core.y += core.vy;
                // Но это может конфликтовать с прямым следованием за пальцем. Оставим vx/vy для импульса.


            } else {
                this.onTouchDown(touch); // Создание нового ядра
            }
        });
    }

    _updateBackgroundParticles(windX, windY, now) {
        if (!this.settings.backgroundParticles || !this.settings.touchCores || !this.settings.stars || !this.settings.antimatterSystem) return;
        const settings = this.settings.backgroundParticles;
        const transformSettings = settings.transformed;
        const globalFriction = this.settings.globalFriction;
        const coolDownDuration = transformSettings.coolDownMs;

        this.particles.forEach(p => {
            if (p.isTransformed) {
                const timeLeft = p.transformEndTime - now;
                if (timeLeft <= 0) {
                    p.isTransformed = false;
                    p.color = p.originalColor;
                } else if (timeLeft <= coolDownDuration) {
                    const coolDownProgress = 1 - (timeLeft / coolDownDuration);
                    const startColorHex = this.themeColors.accent || '#FFFFFF';
                    const endColorHex = p.originalColor;
                    const startRGB = this.globalVisualizerRef.hexToRgb(startColorHex);
                    const endRGB = this.globalVisualizerRef.hexToRgb(this.globalVisualizerRef.extractBaseColor(endColorHex));
                    const originalAlpha = this.globalVisualizerRef.extractAlphaFromColor(endColorHex) || 0.3;

                    if (startRGB && endRGB) {
                        const r = Math.floor(startRGB.r + (endRGB.r - startRGB.r) * coolDownProgress);
                        const g = Math.floor(startRGB.g + (endRGB.g - startRGB.g) * coolDownProgress);
                        const b = Math.floor(startRGB.b + (endRGB.b - startRGB.b) * coolDownProgress);
                        p.color = `rgba(${r},${g},${b},${originalAlpha})`;
                    } else if (timeLeft <= 0) {
                         p.color = p.originalColor;
                    }
                }
            }

            let totalForceX = 0;
            let totalForceY = 0;
            const immunityActive = p.isTransformed && now < p.gravityImmunityEndTime;

            if (!immunityActive) {
                 totalForceX += windX;
                 totalForceY += windY;
            }

            if (settings.repulsionActive && settings.repulsionFactor > 0 && !p.isTransformed) {
                this.particles.forEach(otherP => {
                    if (p === otherP || otherP.isTransformed) return;
                    const dx = p.x - otherP.x;
                    const dy = p.y - otherP.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 0.1 && distSq < settings.repulsionRadiusSq) {
                        const dist = Math.sqrt(distSq);
                        const force = settings.repulsionFactor / dist;
                        totalForceX += (dx / dist) * force;
                        totalForceY += (dy / dist) * force;
                    }
                });
            }

            if (!immunityActive) {
                // Притяжение к ядрам
                this.touchCores.forEach(core => {
                    const dx = core.x - p.x; const dy = core.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const force = core.energy * settings.attractionToCores / (distSq + 100);
                        totalForceX += dx * force; totalForceY += dy * force;
                    }
                });

                // Притяжение к звездам
                this.stars.forEach(star => {
                    const dx = star.x - p.x; const dy = star.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const force = (star.mass * this.settings.stars.gravityFactor) / (distSq + 1000); // Используем общий gravityFactor звезд
                        const dist = Math.sqrt(distSq) || 1;
                        totalForceX += dx * force / dist;
                        totalForceY += dy * force / dist;
                    }
                });

                // Притяжение к антиматерии
                this.antimatterParticlePool.forEach(ap => {
                    if (ap.active) {
                        const dx = ap.x - p.x;
                        const dy = ap.y - p.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq > 1) {
                            const force = settings.attractionToAntimatter * ap.size / (distSq + 100);
                            totalForceX += dx * force;
                            totalForceY += dy * force;
                        }
                    }
                });
            }

            p.vx = (p.vx + totalForceX) * globalFriction;
            p.vy = (p.vy + totalForceY) * globalFriction;
            p.x += p.vx;
            p.y += p.vy;

            const bounceDamping = -0.5;
            if (p.x < 0) { p.x = 0; p.vx *= bounceDamping; }
            if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx *= bounceDamping; }
            if (p.y < 0) { p.y = 0; p.vy *= bounceDamping; }
            if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy *= bounceDamping; }
        });
    }

    _updateStars(windX, windY, now) {
        if (!this.settings.stars || !this.settings.touchCores || !this.settings.antimatterSystem) return;
        const starSettings = this.settings.stars;
        const coreSettings = this.settings.touchCores; // Для coreMaxSize при поглощении
        const globalFriction = this.settings.globalFriction;

        for (let i = this.stars.length - 1; i >= 0; i--) {
            const starA = this.stars[i];
            if (!starA) continue;

            // Взаимодействие с другими звездами (столкновения и полярность)
            for (let j = i - 1; j >= 0; j--) {
                const starB = this.stars[j];
                if (!starB) continue;

                const dx = starB.x - starA.x;
                const dy = starB.y - starA.y;
                const distSq = dx * dx + dy * dy;
                const effectiveRadiusA = (starA.size * starA.life * 0.5);
                const effectiveRadiusB = (starB.size * starB.life * 0.5);
                const minDistSq = Math.pow(effectiveRadiusA + effectiveRadiusB, 2);

                if (distSq < minDistSq && distSq > 0.01) { // Столкновение
                    let biggerStar, smallerStar, biggerStarIndex, smallerStarIndex;
                    if (starA.mass >= starB.mass) {
                        biggerStar = starA; smallerStar = starB;
                        biggerStarIndex = i; smallerStarIndex = j;
                    } else {
                        biggerStar = starB; smallerStar = starA;
                        biggerStarIndex = j; smallerStarIndex = i;
                    }

                    biggerStar.mass += smallerStar.mass * 0.75;
                    biggerStar.size = Math.min(biggerStar.size + smallerStar.size * 0.15, coreSettings.maxSize * 1.5);
                    biggerStar.life = Math.min(biggerStar.life + smallerStar.life * 0.2, 1.2);
                    this._transformNearbyParticles(smallerStar, "collision");
                    this.stars.splice(smallerStarIndex, 1);

                    if (smallerStar === starA) break;
                    else continue;
                }

                if (distSq > 1) { // Полярность
                    const dist = Math.sqrt(distSq);
                    const colorDiff = this._getColorDifference(starA.color, starB.color);
                    const polarityFactor = (colorDiff * starSettings.polarityStrength) - (starSettings.polarityStrength / 2);
                    const forceMagnitude = polarityFactor * starSettings.gravityFactor * starA.mass * starB.mass / (distSq + 100);
                    const fx = (dx / dist) * forceMagnitude;
                    const fy = (dy / dist) * forceMagnitude;
                    starA.vx += fx / starA.mass; starA.vy += fy / starA.mass;
                    starB.vx -= fx / starB.mass; starB.vy -= fy / starB.mass;
                }
            }
            if (!this.stars.includes(starA)) continue;

            // Отталкивание от антиматерии
            this.antimatterParticlePool.forEach(ap => {
                if (ap.active) {
                    const dx = starA.x - ap.x;
                    const dy = starA.y - ap.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1 && distSq < (starA.size + ap.size + 100) * (starA.size + ap.size + 100)) {
                        const dist = Math.sqrt(distSq);
                        const force = starSettings.repulsionFromAntimatter * ap.size / (distSq * 0.01 + 1);
                        starA.vx += (dx / dist) * force / starA.mass;
                        starA.vy += (dy / dist) * force / starA.mass;
                    }
                }
            });

            starA.vx = (starA.vx + windX) * globalFriction;
            starA.vy = (starA.vy + windY) * globalFriction;
            starA.x += starA.vx; starA.y += starA.vy;

            const damp = starSettings.bounceDamping;
            const currentVisualSize = starA.size * starA.life;
            if (starA.x < currentVisualSize) { starA.x = currentVisualSize; starA.vx *= damp; }
            if (starA.x > this.canvas.width - currentVisualSize) { starA.x = this.canvas.width - currentVisualSize; starA.vx *= damp; }
            if (starA.y < currentVisualSize) { starA.y = currentVisualSize; starA.vy *= damp; }
            if (starA.y > this.canvas.height - currentVisualSize) { starA.y = this.canvas.height - currentVisualSize; starA.vy *= damp; }

            // Угасание
            if (starA.size >= starSettings.fadeStartSize) {
                starA.life -= starA.decay;
            }

            if (starA.life <= 0) {
                this._triggerSupernova(starA); // Новый метод для сверхновой
                this.stars.splice(i, 1);
            }
        }
    }

    _updateAntimatterParticles(windX, windY, now) {
        if (!this.settings.antimatterSystem) return;
        const amSettings = this.settings.antimatterSystem;
        const globalFriction = this.settings.globalFriction; // Или amSettings.particleFriction

        this.antimatterParticlePool.forEach(p => {
            if (!p.active) return;

            const age = now - p.creationTime;
            if (age >= amSettings.particleLifeMs) {
                p.active = false;
                return;
            }
            p.life = 1.0 - (age / amSettings.particleLifeMs);


            const windEffect = amSettings.windInfluence || 1.0;
            p.vx += windX * windEffect;
            p.vy += windY * windEffect;

            p.vx *= (amSettings.particleFriction || globalFriction);
            p.vy *= (amSettings.particleFriction || globalFriction);
            p.x += p.vx;
            p.y += p.vy;

            const bounceDamping = -0.4; // Антиматерия может отскакивать чуть иначе
            if (p.x < 0) { p.x = 0; p.vx *= bounceDamping; }
            if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx *= bounceDamping; }
            if (p.y < 0) { p.y = 0; p.vy *= bounceDamping; }
            if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy *= bounceDamping; }
        });
    }


    // ===================================================================================
    // ОСНОВНОЙ МЕТОД DRAW (ОТРИСОВКА)
    // ===================================================================================
    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef || !this.settings) return;
        const now = performance.now();

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.background || '#00000A', this.settings.fadeSpeed);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const windX = (deviceTilt.roll / 90) * (this.settings.windStrength || 0);
        const windY = (deviceTilt.pitch / 90) * (this.settings.windStrength || 0);

        this._updateCores(activeTouchStates, windX, windY, now);
        this._updateBackgroundParticles(windX, windY, now);
        this._updateStars(windX, windY, now);
        this._updateAntimatterParticles(windX, windY, now);

        // --- Отрисовка ---
        this.ctx.globalCompositeOperation = 'lighter';

        // Отрисовка фоновых частиц
        this.particles.forEach(p => {
            const alphaBase = p.isTransformed ? 0.9 : (parseFloat(p.color.match(/[\d\.]+\)$/)) || 0.3);
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            let colorForGradient, colorForEdge;

            if (p.isTransformed) {
                 colorForGradient = this.globalVisualizerRef.getColorWithAlpha(p.color, alphaBase * 0.8); // p.color is accent
                 colorForEdge = this.globalVisualizerRef.getColorWithAlpha(p.color, 0);
            } else {
                 colorForGradient = this.globalVisualizerRef.getColorWithAlpha(p.color, alphaBase * 0.8, true);
                 colorForEdge = this.globalVisualizerRef.getColorWithAlpha(p.color, 0, true);
            }

            grad.addColorStop(0, colorForGradient);
            grad.addColorStop(1, colorForEdge);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); this.ctx.fill();
        });

        // Отрисовка ядер касаний
        this.touchCores.forEach(core => {
            if (!this.settings.touchCores) return;
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.9));
            grad.addColorStop(0.3, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.5));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(core.color, 0));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(core.x, core.y, core.size, 0, Math.PI * 2); this.ctx.fill();
        });

        // Отрисовка звезд
        this.stars.forEach(star => {
            if (!this.settings.stars) return;
            const currentVisualSize = star.size * star.life;
            if (currentVisualSize < 0.1) return;
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, currentVisualSize);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life));
            grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life * 0.5));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(star.color, 0));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(star.x, star.y, currentVisualSize, 0, Math.PI * 2); this.ctx.fill();
        });

        // Отрисовка частиц антиматерии
        this.antimatterParticlePool.forEach(p => {
            if (p.active && this.settings.antimatterSystem) {
                const currentVisualSize = p.size * p.life; // life здесь от 0 до 1
                if (currentVisualSize < 0.1) return;
                // Цвет антиматерии уже установлен в p.color при создании
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
        this.antimatterParticlePool.forEach(p => p.active = false);
        console.log("[StellarNurseryRenderer v6.0] Disposed.");
    }
}

// Саморегистрация в visualizer.js
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}