    // Файл: app/src/main/assets/js/visualizers/StellarNurseryRenderer.js
// ВЕРСИЯ 6.2.1: Исправлена ошибка с extractBaseColor.

class StellarNurseryRenderer {

    // Вспомогательная функция для глубокого слияния объектов
    _deepMerge(target, source) {
        const output = { ...target };
        if (this._isObject(target) && this._isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this._isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this._deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    _isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    _hslToRgb(hslColor) {
        if (this.hslToRgbCache.has(hslColor)) {
            return this.hslToRgbCache.get(hslColor);
        }
        if (typeof hslColor !== 'string') return null;
        const match = hslColor.match(/^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/i);
        if (!match) return null;

        let h = parseInt(match[1], 10);
        let s = parseFloat(match[2]) / 100;
        let l = parseFloat(match[3]) / 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hueToRgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            h /= 360;
            r = hueToRgb(p, q, h + 1 / 3);
            g = hueToRgb(p, q, h);
            b = hueToRgb(p, q, h - 1 / 3);
        }

        const result = {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
        this.hslToRgbCache.set(hslColor, result);
        return result;
    }

    _extractAlphaFromColor(colorString) {
        if (this.extractAlphaCache.has(colorString)) {
            return this.extractAlphaCache.get(colorString);
        }
        let alpha = 1.0;
        if (typeof colorString === 'string') {
            if (colorString.startsWith('rgba')) {
                const match = colorString.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
                if (match && match[1] !== undefined) {
                    alpha = parseFloat(match[1]);
                }
            } else if (colorString.startsWith('hsla')) {
                const match = colorString.match(/hsla\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*([\d.]+)\s*\)/i);
                if (match && match[1] !== undefined) {
                    alpha = parseFloat(match[1]);
                }
            }
        }
        this.extractAlphaCache.set(colorString, alpha);
        return alpha;
    }

    _getRgbComponents(colorString) {
        if (!colorString) return null;
        if (this.rgbComponentsCache.has(colorString)) {
            return this.rgbComponentsCache.get(colorString);
        }

        let result = null;
        if (typeof colorString === 'string') {
            if (colorString.startsWith('hsl')) {
                result = this._hslToRgb(colorString.replace('hsla', 'hsl'));
            } else if (colorString.startsWith('#') && this.globalVisualizerRef && typeof this.globalVisualizerRef.hexToRgb === 'function') {
                result = this.globalVisualizerRef.hexToRgb(colorString);
            } else if (colorString.startsWith('rgb')) {
                const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
                if (match) {
                    result = { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) };
                }
            }
        }
        if (!result) {
            // console.warn(`[StellarNurseryRenderer] Could not parse RGB from: ${colorString}`);
        }
        this.rgbComponentsCache.set(colorString, result);
        return result;
    }


    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.particlePool = [];
        this.particles = [];
        this.stars = [];
        this.touchCores = new Map();
        this.supernovaEffectQueue = [];

        this.hslToRgbCache = new Map();
        this.extractAlphaCache = new Map();
        this.rgbComponentsCache = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas || !globalVisualizerRef) {
            console.error(`[StellarNurseryRenderer v6.2.1] FATAL: Ctx, Canvas, or GlobalVisualizerRef not provided! Renderer: ${this.constructor.name}`);
            return;
        }
        this.ctx = ctx;
        this.canvas = canvas;

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
                attractionToTransformedAntimatter: 75,
                transformed: {
                    lifeMs: 3000,
                    initialSpeedBoost: 1.5,
                    gravityImmunityDurationMs: 1500,
                    coolDownMs: 1000
                },
                antimatterTransformation: {
                    durationMs: 2000,
                    coolDownMs: 1500,
                    impulseFactor: 1.5,
                    color: "themeError",
                    repulsionFromStarsFactor: 0.2,
                    repulsionFromCoresFactor: 0.2,
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
                windInfluence: 0.5
            },
            stars: {
                maxCount: 15,
                gravityFactor: 800,
                polarityStrength: 2.0,
                bounceDamping: -0.6,
                defaultDecay: 0.0025,
                fadeStartSize: 15,
                supernova: {
                    starPushForce: 5,
                    antimatterConversionRadiusFactor: 4,
                    maxParticlesToTransform: 30,
                    maxQueueLength: 5
                }
            }
        };

        this.settings = this._deepMerge(defaultSettings, initialSettings || {});

        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.stars = [];
        this.touchCores.clear();
        this.supernovaEffectQueue = [];

        this.hslToRgbCache.clear();
        this.extractAlphaCache.clear();
        this.rgbComponentsCache.clear();


        this.onResize();
        console.log(`[StellarNurseryRenderer v6.2.1] Initialized. Max stars: ${this.settings.stars?.maxCount}.`);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors || {};
        this.hslToRgbCache.clear();
        this.extractAlphaCache.clear();
        this.rgbComponentsCache.clear();
        this._initBackgroundParticles();
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
            return;
        }
        this._initBackgroundParticles();
    }

    _initBackgroundParticles() {
        if (!this.canvas || !this.globalVisualizerRef || !this.settings.backgroundParticles) {
            console.warn("[StellarNurseryRenderer._initBackgroundParticles] Missing prerequisites, skipping particle init.");
            return;
        }
        // Ensure themeColors.primary exists, or use a default
        const baseColor = (this.themeColors && this.themeColors.primary) ? this.themeColors.primary : '#00BFFF';


        const settings = this.settings.backgroundParticles;
        const count = settings.count;

        for (let i = 0; i < count; i++) {
            let p = this.particlePool[i];
            if (!p) {
                p = {};
                this.particlePool[i] = p;
            }

            const particleColor = this.globalVisualizerRef.getColorWithAlpha(baseColor, Math.random() * 0.3 + 0.4);

            p.x = Math.random() * this.canvas.width;
            p.y = Math.random() * this.canvas.height;
            p.vx = 0; p.vy = 0;
            p.size = 0.5 + Math.random() * 1.5;
            p.color = particleColor;
            p.originalColor = particleColor;

            p.isTransformed = false;
            p.transformEndTime = 0;
            p.gravityImmunityEndTime = 0;

            p.isAntimatter = false;
            p.antimatterEndTime = 0;
            p.originalColorBeforeAntimatter = null;
            p.antimatterTransformationStartTime = 0;
            p.antimatterStartRgb = null;
            p.antimatterEndRgb = null;
            p.id = i;
        }
        this.particles = this.particlePool.slice(0, count);
        if (this.particlePool.length > count) {
             this.particlePool.length = count;
        }
    }

    _processSupernovaEffects(now) {
        if (this.supernovaEffectQueue.length === 0) return;

        for (let i = this.supernovaEffectQueue.length - 1; i >= 0; i--) {
            const effect = this.supernovaEffectQueue[i];
            let particlesProcessedThisFrame = 0;

            while (effect.processedIndex < effect.candidates.length && particlesProcessedThisFrame < effect.particlesToTransformPerFrame) {
                if (!effect.candidates || effect.processedIndex >= effect.candidates.length) {
                    console.warn("[StellarNurseryRenderer._processSupernovaEffects] Invalid state in supernova queue (candidates list or index out of bounds). Effect aborted.");
                    effect.processedIndex = effect.candidates ? effect.candidates.length : 0;
                    break;
                }
                const p = effect.candidates[effect.processedIndex];

                if (!p) {
                    console.warn(`[StellarNurseryRenderer._processSupernovaEffects] Undefined particle in supernova queue at index ${effect.processedIndex}. Effect:`, effect);
                    effect.processedIndex++;
                    particlesProcessedThisFrame++;
                    continue;
                }

                if (p.isAntimatter || p.isTransformed) {
                    effect.processedIndex++;
                    particlesProcessedThisFrame++;
                    continue;
                }

                if (!effect.amTransformSettings || typeof effect.conversionRadius === 'undefined' || typeof effect.antimatterColorString === 'undefined') {
                    console.error("[StellarNurseryRenderer._processSupernovaEffects] Missing critical effect settings. Effect aborted.", effect);
                    effect.processedIndex = effect.candidates.length;
                    break;
                }

                const originalColor = p.color;
                const startRgb = this._getRgbComponents(effect.antimatterColorString);
                const endRgb = this._getRgbComponents(originalColor);

                if (!startRgb || !endRgb) {
                    console.warn(`[StellarNurseryRenderer._processSupernovaEffects] Failed to parse RGB for AM transform. Skipping particle. Start: ${effect.antimatterColorString}, End: ${originalColor}`);
                    effect.processedIndex++;
                    particlesProcessedThisFrame++;
                    continue;
                }

                p.isAntimatter = true;
                p.originalColorBeforeAntimatter = originalColor;
                p.color = effect.antimatterColorString;
                p.antimatterEndTime = now + (effect.amTransformSettings.durationMs || 2000);
                p.antimatterTransformationStartTime = now;
                p.antimatterStartRgb = startRgb;
                p.antimatterEndRgb = endRgb;

                const dx = p.x - effect.sourceStarX;
                const dy = p.y - effect.sourceStarY;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq) || 1;

                const speed = (effect.amTransformSettings.impulseFactor || 1.0) *
                              (1 + effect.sourceStarMass / 15) *
                              (1 - dist / effect.conversionRadius);

                p.vx = effect.sourceStarVx * 0.05 + (dx / dist) * speed;
                p.vy = effect.sourceStarVy * 0.05 + (dy / dist) * speed;

                p.isTransformed = false;
                p.transformEndTime = 0;
                p.gravityImmunityEndTime = 0;

                effect.processedIndex++;
                particlesProcessedThisFrame++;
            }

            if (effect.processedIndex >= effect.candidates.length) {
                this.supernovaEffectQueue.splice(i, 1);
            }
        }
    }

    onTouchDown(touchData) {
        if (!touchData || !this.canvas || !this.globalVisualizerRef || !this.settings.touchCores) return;
        const coreSettings = this.settings.touchCores;

        let coreColor = (this.themeColors && this.themeColors.accent) ? this.themeColors.accent : '#FFD54F';
        if (touchData.noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            coreColor = this.globalVisualizerRef.noteColors[touchData.noteInfo.midiNote % 12];
        }

        const core = {
            id: touchData.id,
            x: touchData.x * this.canvas.width,
            y: (1 - touchData.y) * this.canvas.height,
            vx: 0, vy: 0,
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
                decay: (starSettings.defaultDecay || 0.001) + Math.random() * 0.0005,
                color: core.color,
                id: performance.now() + Math.random()
            });
            this.touchCores.delete(touchId);
        }
    }

    _triggerSupernova(star) {
        if (!this.settings.stars?.supernova || !this.settings.backgroundParticles?.antimatterTransformation) return;
        const supernovaSettings = this.settings.stars.supernova;
        const amTransformSettings = this.settings.backgroundParticles.antimatterTransformation;

        this.stars.forEach(otherStar => {
            if (otherStar.id === star.id) return;
            const dx = otherStar.x - star.x;
            const dy = otherStar.y - star.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < (star.size * 10) * (star.size * 10) && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const force = (supernovaSettings.starPushForce || 0) / (dist + 10) * star.mass;
                otherStar.vx += (dx / dist) * force / otherStar.mass;
                otherStar.vy += (dy / dist) * force / otherStar.mass;
            }
        });

        if (this.supernovaEffectQueue.length >= (supernovaSettings.maxQueueLength || 5)) {
            return;
        }

        const candidates = [];
        const conversionRadius = star.size * (supernovaSettings.antimatterConversionRadiusFactor || 1);
        const conversionRadiusSq = conversionRadius * conversionRadius;

        this.particles.forEach(p => {
            if (p.isAntimatter || p.isTransformed) return;

            const dx = p.x - star.x;
            const dy = p.y - star.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < conversionRadiusSq) {
                candidates.push(p);
            }
        });

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                const distSqA = Math.pow(a.x - star.x, 2) + Math.pow(a.y - star.y, 2);
                const distSqB = Math.pow(b.x - star.x, 2) + Math.pow(b.y - star.y, 2);
                return distSqA - distSqB;
            });

            const particlesToTake = Math.min(candidates.length, supernovaSettings.maxParticlesToTransform || 10);
            const selectedCandidates = candidates.slice(0, particlesToTake);

            let amColorString = amTransformSettings.color;
            if (amColorString === "themeError" || amColorString === "error") {
                amColorString = (this.themeColors && this.themeColors.error) ? this.themeColors.error : '#FF1744';
            }

            this.supernovaEffectQueue.push({
                sourceStarX: star.x,
                sourceStarY: star.y,
                sourceStarMass: star.mass,
                sourceStarVx: star.vx,
                sourceStarVy: star.vy,
                conversionRadius: conversionRadius,
                candidates: selectedCandidates,
                processedIndex: 0,
                particlesToTransformPerFrame: 5,
                amTransformSettings: { ...amTransformSettings },
                antimatterColorString: amColorString
            });
        }
    }

    _transformNearbyParticles(sourceObject, eventType = "collision") {
        if (!this.settings.backgroundParticles?.transformed) return;
        const transformSettings = this.settings.backgroundParticles.transformed;
        const radius = eventType === "collision" ? (sourceObject.size || 20) * 3 : (sourceObject.size || 10) * 2;
        const now = performance.now();

        this.particles.forEach(p => {
            if (p.isTransformed || p.isAntimatter) return;

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
                p.color = (this.themeColors && this.themeColors.accent) ? this.themeColors.accent : '#FFFFFF';
            }
        });
    }

    _getColorDifference(color1, color2) {
        if (color1 === color2) return 0;
        const rgb1 = this._getRgbComponents(color1);
        const rgb2 = this._getRgbComponents(color2);

        if (!rgb1 || !rgb2) {
            return 0.5;
        }
        const diff = Math.sqrt(
            Math.pow(rgb1.r - rgb2.r, 2) +
            Math.pow(rgb1.g - rgb2.g, 2) +
            Math.pow(rgb1.b - rgb2.b, 2)
        );
        return diff / 441.67;
    }

    _updateCores(activeTouchStates, windX, windY, now) {
        if (!this.settings.touchCores || !this.settings.backgroundParticles?.antimatterTransformation) return;
        const coreSettings = this.settings.touchCores;
        const amTransformSettings = this.settings.backgroundParticles.antimatterTransformation;
        const globalFriction = this.settings.globalFriction;

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
                if (core.history.length > coreSettings.historyLength) {
                    core.history.shift();
                }
                core.x = newX; core.y = newY;

                const holdDuration = now - core.creationTime;
                const sizeFactor = Math.min(1.0, holdDuration / coreSettings.timeToMaxSizeMs);
                core.size = coreSettings.minSize + (coreSettings.maxSize - coreSettings.minSize) * sizeFactor;
                core.mass = 1 + (coreSettings.maxMassFactor - 1) * sizeFactor;
                core.energy = Math.min(1, core.energy + (touch.pressure || 0.5) * coreSettings.energyGain);

                if (this.globalVisualizerRef.noteColors?.length > 0 && touch.noteInfo?.midiNote !== undefined) {
                    core.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12];
                }

                const windEffect = (coreSettings.windInfluence || 0) / core.mass;
                core.vx += windX * windEffect;
                core.vy += windY * windEffect;

                this.particles.forEach(p => {
                    if (p.isAntimatter) {
                        const dx = core.x - p.x;
                        const dy = core.y - p.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq > 1 && distSq < (core.size + p.size + 150) * (core.size + p.size + 150)) {
                            const dist = Math.sqrt(distSq);
                            const force = (amTransformSettings.repulsionFromCoresFactor || 0) * p.size / (distSq * 0.005 + 1);
                            core.vx += (dx / dist) * force / core.mass;
                            core.vy += (dy / dist) * force / core.mass;
                        }
                    }
                });

                core.vx *= globalFriction;
                core.vy *= globalFriction;
                if (isNaN(core.vx) || isNaN(core.vy) || !isFinite(core.vx) || !isFinite(core.vy)) {
                    core.vx = 0; core.vy = 0;
                }
            } else {
                this.onTouchDown(touch);
            }
        });
    }

    _updateBackgroundParticles(windX, windY, now) {
        if (!this.settings.backgroundParticles || !this.settings.touchCores || !this.settings.stars) return;

        const bgSettings = this.settings.backgroundParticles;
        const transformSettings = bgSettings.transformed;
        const amTransformSettings = bgSettings.antimatterTransformation;
        const globalFriction = this.settings.globalFriction;

        this.particles.forEach(p => {
            let totalForceX = 0;
            let totalForceY = 0;
            let immunityActive = false;

            if (p.isAntimatter) {
                immunityActive = true;
                const amTimeLeft = p.antimatterEndTime - now;

                if (amTimeLeft <= 0) {
                    const coolDownProgress = Math.min(1, (now - p.antimatterEndTime) / (amTransformSettings.coolDownMs || 1));
                    const startRGB = p.antimatterStartRgb;
                    const endRGB = p.antimatterEndRgb;

                    if (startRGB && endRGB) {
                        const targetAlpha = this._extractAlphaFromColor(p.originalColorBeforeAntimatter || p.originalColor) || 0.5;
                        const r = Math.floor(startRGB.r + (endRGB.r - startRGB.r) * coolDownProgress);
                        const g = Math.floor(startRGB.g + (endRGB.g - startRGB.g) * coolDownProgress);
                        const b = Math.floor(startRGB.b + (endRGB.b - startRGB.b) * coolDownProgress);
                        p.color = `rgba(${r},${g},${b},${targetAlpha})`;
                    } else {
                        p.color = p.originalColorBeforeAntimatter || p.originalColor || '#FFFFFF';
                    }

                    if (coolDownProgress >= 1) {
                        p.isAntimatter = false;
                        p.color = p.originalColorBeforeAntimatter || p.originalColor;
                        p.originalColorBeforeAntimatter = null;
                        p.antimatterStartRgb = null;
                        p.antimatterEndRgb = null;
                        immunityActive = false;
                    }
                }
                this.stars.forEach(star => {
                    const dx = p.x - star.x; const dy = p.y - star.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const dist = Math.sqrt(distSq);
                        const force = (amTransformSettings.repulsionFromStarsFactor || 0) * star.mass / (distSq * 0.01 + 1);
                        totalForceX += (dx / dist) * force; totalForceY += (dy / dist) * force;
                    }
                });
                this.touchCores.forEach(core => {
                    const dx = p.x - core.x; const dy = p.y - core.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1) {
                        const dist = Math.sqrt(distSq);
                        const force = (amTransformSettings.repulsionFromCoresFactor || 0) * core.mass / (distSq * 0.01 + 1);
                        totalForceX += (dx / dist) * force; totalForceY += (dy / dist) * force;
                    }
                });

            } else if (p.isTransformed) {
                immunityActive = now < p.gravityImmunityEndTime;
                const timeLeft = p.transformEndTime - now;

                if (timeLeft <= 0) {
                    p.isTransformed = false;
                    p.color = p.originalColor;
                    immunityActive = false;
                } else if (timeLeft <= transformSettings.coolDownMs) {
                    const coolDownProgress = 1 - (timeLeft / transformSettings.coolDownMs);
                    const startColorHex = (this.themeColors && this.themeColors.accent) ? this.themeColors.accent : '#FFFFFF';
                    const endColorString = p.originalColor;

                    const startRGB = this._getRgbComponents(startColorHex);
                    // ***** Исправленная строка *****
                    const endRGB = this._getRgbComponents(endColorString);
                    // *****************************
                    const originalAlpha = this._extractAlphaFromColor(endColorString) || 0.3;

                    if (startRGB && endRGB) {
                        const r = Math.floor(startRGB.r + (endRGB.r - startRGB.r) * coolDownProgress);
                        const g = Math.floor(startRGB.g + (endRGB.g - startRGB.g) * coolDownProgress);
                        const b = Math.floor(startRGB.b + (endRGB.b - startRGB.b) * coolDownProgress);
                        p.color = `rgba(${r},${g},${b},${originalAlpha})`;
                    } else if (timeLeft <=0) {
                         p.color = p.originalColor;
                    }
                }
            }

            if (!immunityActive) {
                 totalForceX += windX * (bgSettings.windStrength || 0.1);
                 totalForceY += windY * (bgSettings.windStrength || 0.1);
            }

            if (bgSettings.repulsionActive && (bgSettings.repulsionFactor || 0) > 0 && !p.isAntimatter && !p.isTransformed) {
                for (let j = 0; j < this.particles.length; j++) {
                    const otherP = this.particles[j];
                    if (p === otherP || otherP.isAntimatter || otherP.isTransformed) continue;

                    const dx = p.x - otherP.x;
                    const dy = p.y - otherP.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq > 0.1 && distSq < (bgSettings.repulsionRadiusSq || 2500)) {
                        const dist = Math.sqrt(distSq);
                        const force = bgSettings.repulsionFactor / dist;
                        totalForceX += (dx / dist) * force;
                        totalForceY += (dy / dist) * force;
                    }
                }
            }

            if (!immunityActive && !p.isAntimatter) {
                this.touchCores.forEach(core => {
                    const dxCore = core.x - p.x; const dyCore = core.y - p.y;
                    const distSqCore = dxCore * dxCore + dyCore * dyCore;
                    if (distSqCore > 1) {
                        const force = core.energy * (bgSettings.attractionToCores || 0) / (distSqCore + 100);
                        totalForceX += dxCore * force; totalForceY += dyCore * force;
                    }
                });
                this.stars.forEach(star => {
                    const dxStar = star.x - p.x; const dyStar = star.y - p.y;
                    const distSqStar = dxStar * dxStar + dyStar * dyStar;
                    if (distSqStar > 1) {
                        const distStar = Math.sqrt(distSqStar);
                        const force = (star.mass * (this.settings.stars?.gravityFactor || 0)) / (distSqStar + 1000);
                        totalForceX += (dxStar / distStar) * force;
                        totalForceY += (dyStar / distStar) * force;
                    }
                });
                this.particles.forEach(otherP => {
                    if (p === otherP || !otherP.isAntimatter) return;

                    const dx = otherP.x - p.x;
                    const dy = otherP.y - p.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq > 0.1 && distSq < ((bgSettings.repulsionRadiusSq || 2500) * 4)) {
                        const dist = Math.sqrt(distSq);
                        const force = (bgSettings.attractionToTransformedAntimatter || 0) / (distSq * 0.001 + 50);
                        totalForceX += (dx / dist) * force;
                        totalForceY += (dy / dist) * force;
                    }
                });
            }

            p.vx = (p.vx + totalForceX) * globalFriction;
            p.vy = (p.vy + totalForceY) * globalFriction;

            if (isNaN(p.vx) || isNaN(p.vy) || !isFinite(p.vx) || !isFinite(p.vy)) {
                p.vx = (Math.random() - 0.5) * 0.1; p.vy = (Math.random() - 0.5) * 0.1;
            }

            p.x += p.vx; p.y += p.vy;

            if (isNaN(p.x) || isNaN(p.y) || !isFinite(p.x) || !isFinite(p.y)) {
                p.x = Math.random() * this.canvas.width; p.y = Math.random() * this.canvas.height;
                p.vx = 0; p.vy = 0;
            }

            const bounceDamping = -0.5;
            if (p.x < 0) { p.x = 0; p.vx *= bounceDamping; }
            if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx *= bounceDamping; }
            if (p.y < 0) { p.y = 0; p.vy *= bounceDamping; }
            if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy *= bounceDamping; }
        });
    }

    _updateStars(windX, windY, now) {
        if (!this.settings.stars || !this.settings.touchCores || !this.settings.backgroundParticles?.antimatterTransformation) return;
        const starSettings = this.settings.stars;
        const coreSettings = this.settings.touchCores;
        const amTransformSettings = this.settings.backgroundParticles.antimatterTransformation;
        const globalFriction = this.settings.globalFriction;

        for (let i = this.stars.length - 1; i >= 0; i--) {
            const starA = this.stars[i];
            if (!starA) continue;

            for (let j = i - 1; j >= 0; j--) {
                const starB = this.stars[j];
                if (!starB) continue;

                const dx = starB.x - starA.x;
                const dy = starB.y - starA.y;
                const distSq = dx * dx + dy * dy;
                const effectiveRadiusA = (starA.size * starA.life * 0.5);
                const effectiveRadiusB = (starB.size * starB.life * 0.5);
                const minDistSq = Math.pow(effectiveRadiusA + effectiveRadiusB, 2);

                if (distSq < minDistSq && distSq > 0.01) {
                    let biggerStar, smallerStar;
                    if (starA.mass >= starB.mass) { biggerStar = starA; smallerStar = starB; }
                    else { biggerStar = starB; smallerStar = starA; }

                    biggerStar.mass += smallerStar.mass * 0.75;
                    biggerStar.size = Math.min(biggerStar.size + smallerStar.size * 0.15, (coreSettings.maxSize || 45) * 1.5);
                    biggerStar.life = Math.min(biggerStar.life + smallerStar.life * 0.2, 1.2);
                    this._transformNearbyParticles(smallerStar, "collision");

                    if (smallerStar === starA) {
                        this.stars.splice(i, 1);
                        break;
                    } else {
                        this.stars.splice(j, 1);
                    }
                    continue;
                }

                if (distSq > 1) {
                    const dist = Math.sqrt(distSq);
                    const colorDiff = this._getColorDifference(starA.color, starB.color);
                    const polarityFactor = (colorDiff * (starSettings.polarityStrength || 0)) - ((starSettings.polarityStrength || 0) / 2);
                    const forceMagnitude = polarityFactor * (starSettings.gravityFactor || 0) * starA.mass * starB.mass / (distSq + 100);

                    const fx = (dx / dist) * forceMagnitude;
                    const fy = (dy / dist) * forceMagnitude;

                    starA.vx += fx / starA.mass; starA.vy += fy / starA.mass;
                    starB.vx -= fx / starB.mass; starB.vy -= fy / starB.mass;
                }
            }
             if (!this.stars.includes(starA)) continue;


            this.particles.forEach(p => {
                if (p.isAntimatter) {
                    const dx = starA.x - p.x;
                    const dy = starA.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 1 && distSq < (starA.size * starA.life + p.size + 200) * (starA.size * starA.life + p.size + 200) ) {
                        const dist = Math.sqrt(distSq);
                        const force = (amTransformSettings.repulsionFromStarsFactor || 0) * p.size / (distSq * 0.005 + 1);
                        starA.vx += (dx / dist) * force / starA.mass;
                        starA.vy += (dy / dist) * force / starA.mass;
                    }
                }
            });

            starA.vx = (starA.vx + windX) * globalFriction;
            starA.vy = (starA.vy + windY) * globalFriction;

            if (isNaN(starA.vx) || isNaN(starA.vy) || !isFinite(starA.vx) || !isFinite(starA.vy)) {
                starA.vx = (Math.random() - 0.5) * 0.1; starA.vy = (Math.random() - 0.5) * 0.1;
            }
            starA.x += starA.vx; starA.y += starA.vy;
            if (isNaN(starA.x) || isNaN(starA.y) || !isFinite(starA.x) || !isFinite(starA.y)) {
                starA.x = Math.random() * this.canvas.width; starA.y = Math.random() * this.canvas.height;
            }

            const damp = starSettings.bounceDamping;
            const currentVisualSize = starA.size * starA.life;
            if (starA.x < currentVisualSize) { starA.x = currentVisualSize; starA.vx *= damp; }
            if (starA.x > this.canvas.width - currentVisualSize) { starA.x = this.canvas.width - currentVisualSize; starA.vx *= damp; }
            if (starA.y < currentVisualSize) { starA.y = currentVisualSize; starA.vy *= damp; }
            if (starA.y > this.canvas.height - currentVisualSize) { starA.y = this.canvas.height - currentVisualSize; starA.vy *= damp; }

            if (starA.size >= starSettings.fadeStartSize) {
                starA.life -= (starSettings.defaultDecay || 0.001);
            } else {
                 starA.life -= (starSettings.defaultDecay || 0.001) * 0.5;
            }
            starA.life = Math.max(0, starA.life);


            if (starA.life <= 0) {
                this._triggerSupernova(starA);
                this.stars.splice(i, 1);
            }
        }
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef || !this.settings) return;
        const now = performance.now();

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha((this.themeColors && this.themeColors.background) ? this.themeColors.background : '#00000A', this.settings.fadeSpeed);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const windX = (deviceTilt.roll / 90) * (this.settings.windStrength || 0);
        const windY = (deviceTilt.pitch / 90) * (this.settings.windStrength || 0);

        this._updateCores(activeTouchStates, windX, windY, now);
        this._updateBackgroundParticles(windX, windY, now);
        this._updateStars(windX, windY, now);
        this._processSupernovaEffects(now);

        this.ctx.globalCompositeOperation = 'lighter';

        this.particles.forEach(p => {
            let displayColor = p.color;
            const defaultParticleAlpha = this._extractAlphaFromColor(p.originalColor) || 0.6;
            const effectAlphaBoost = 0.95;

            let baseAlpha;
            if (p.isAntimatter || p.isTransformed) {
                baseAlpha = effectAlphaBoost;
                const currentAlphaInColor = this._extractAlphaFromColor(displayColor);
                if (currentAlphaInColor < 1.0 && currentAlphaInColor > 0) {
                    baseAlpha = currentAlphaInColor;
                }
            } else {
                baseAlpha = this._extractAlphaFromColor(displayColor);
                 if (baseAlpha === 1.0 && defaultParticleAlpha < 1.0) { // Если цвет HEX/HSL, а originalColor был с альфой
                    baseAlpha = defaultParticleAlpha;
                }
            }

            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(displayColor, baseAlpha * 0.8, true));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(displayColor, 0, true));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); this.ctx.fill();
        });

        this.touchCores.forEach(core => {
            if (!this.settings.touchCores) return;
            const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.size);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.9, true));
            grad.addColorStop(0.3, this.globalVisualizerRef.getColorWithAlpha(core.color, core.energy * 0.5, true));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(core.color, 0, true));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(core.x, core.y, core.size, 0, Math.PI * 2); this.ctx.fill();
        });

        this.stars.forEach(star => {
            if (!this.settings.stars) return;
            const currentVisualSize = star.size * star.life;
            if (currentVisualSize < 0.1) return;
            const grad = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, currentVisualSize);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life, true));
            grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(star.color, star.life * 0.5, true));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(star.color, 0, true));
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.arc(star.x, star.y, currentVisualSize, 0, Math.PI * 2); this.ctx.fill();
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        console.log("[StellarNurseryRenderer v6.2.1] dispose() called."); // Added log

        this.particles = [];
        this.particlePool = [];
        this.stars = [];
        this.touchCores.clear();
        this.supernovaEffectQueue = [];

        this.hslToRgbCache.clear();
        this.extractAlphaCache.clear();
        this.rgbComponentsCache.clear();

        if (this.ctx) {
            // Resetting more properties to their common defaults
            // Some of these are already in the original dispose, kept for clarity
            // Some are new, to be absolutely sure.

            this.ctx.globalCompositeOperation = 'source-over'; // Already there, good
            this.ctx.globalAlpha = 1.0;                      // Already there, good

            this.ctx.fillStyle = '#000000'; // Default fillStyle (black)
            this.ctx.strokeStyle = '#000000'; // Default strokeStyle (black)
            this.ctx.lineWidth = 1;
            this.ctx.lineCap = 'butt';
            this.ctx.lineJoin = 'miter';
            this.ctx.miterLimit = 10;

            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;
            this.ctx.shadowBlur = 0;                         // Already there, good
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0)';       // Already there, good (fully transparent black)

            if (typeof this.ctx.filter !== 'undefined') {
                this.ctx.filter = 'none';                    // Already there, good
            }

            this.ctx.font = '10px sans-serif'; // Default font
            this.ctx.textAlign = 'start';
            this.ctx.textBaseline = 'alphabetic';

            // Clear any transformations
            if (typeof this.ctx.resetTransform === 'function') {
                this.ctx.resetTransform(); // Modern way
            } else {
                // Fallback for older browsers if needed, though setTransform is common
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            }

            // Attempt to clear the canvas content itself, though the next renderer should do this.
            // if (this.canvas) {
            // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // }

        } else {
            console.warn("[StellarNurseryRenderer v6.2.1] dispose(): this.ctx is null, cannot reset context properties.");
        }

        // The original canvas resizing can be removed if clearRect is used,
        // or kept if it serves a specific purpose in the host application.
        if (this.canvas) {
            this.canvas.width = 1;
            this.canvas.height = 1;
        }

        this.ctx = null;
        this.canvas = null;
        this.settings = null;
        this.themeColors = null;
        this.globalVisualizerRef = null;

        console.log("[StellarNurseryRenderer v6.2.1] dispose() completed."); // Original log, good for checking completion
    }
}

if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('StellarNurseryRenderer', StellarNurseryRenderer);
}