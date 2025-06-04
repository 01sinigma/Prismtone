// Файл: app/src/main/assets/js/touchEffects/novaSparkEffect.js
class NovaSparkEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = { /* Заполнится из init */ };
        this.themeColors = {};
        this.activeEffects = new Map();
        this.globalVisualizerRef = null;
        this.lastDrawTime = 0;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        const defaultSettings = { /* Копипаста из JSON NovaSparkEffect v1.0 */
            coreColorSource: "note", coreBrightnessFactor: 0.95, coreMinRadius: 7, coreMaxRadiusYFactor: 15,
            corePulseSpeed: 2.0, corePulseAmount: 0.15, auraGlowColorSource: "note",
            auraRadiusFactor: 2.2, auraOpacityFactor: 0.35, sparkEmitIntervalMs: 40, sparksPerEmit: 2,
            sparkCoreBrightnessFactor: 0.9, sparkGlowColorSource: "note", sparkLineWidthBase: 1.0,
            sparkLineWidthYFactor: 0.6, sparkMaxSegments: 3, sparkSegmentLengthBase: 12,
            sparkSegmentLengthYFactor: 35, sparkJitter: 7, sparkLifeTimeMs: 400,
            sparkOpacityCore: 0.8, sparkOpacityGlow: 0.6, sparkAngleSpreadDeg: 140, sparkBranchChance: 0.1,
            connectionCoreCenterColor: "rgba(255, 255, 255, 1.0)", connectionCoreEdgeBrightnessFactor: 0.85,
            connectionGlowColorMixType: "gradient", connectionLineWidthBase: 3.0,
            connectionLineWidthYFactor: 2.0, connectionWidthBoost: 1.9, connectionMaxSegments: 9,
            connectionJitter: 20, connectionBranchChanceMain: 0.12, connectionBranchColorSource: "mixed",
            opacityConnectionCore: 1.0, opacityConnectionGlow: 0.9,
            lineGlowRadiusFactor: 1.6, lineGlowOpacityFactor: 0.65,
            attractionRadiusPx: 180, targetAttractionFactor: 0.3,
            fadeDurationMs: 200, compositeOperation: "lighter"
        };
        this.settings = { ...defaultSettings, ...initialSettings };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeEffects.clear();
        this.lastDrawTime = performance.now();
        console.log("[NovaSparkEffect v1.0] Initialized. Settings:", JSON.parse(JSON.stringify(this.settings)));
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeEffects.forEach(effect => {
            if (effect.originalTouchData) {
                effect.coreColor = this._getAdjustedNoteColor(effect.originalTouchData, 'coreColorSource', 'coreBrightnessFactor');
                effect.auraColor = this._getAdjustedNoteColor(effect.originalTouchData, 'auraGlowColorSource', 1.0); // Аура может быть обычным цветом ноты
                effect.sparkGlowColor = this._getAdjustedNoteColor(effect.originalTouchData, 'sparkGlowColorSource', 1.0);
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _getAdjustedNoteColor(touchData, colorSourceSettingKey, brightnessFactorSettingKey) {
        const colorSource = this.settings[colorSourceSettingKey] || 'note';
        let baseColorHex = this.themeColors.accent || '#00AEEF';
        const brightnessFactor = this.settings[brightnessFactorSettingKey] || 1.0;

        if (!touchData || !this.settings || !this.globalVisualizerRef) return baseColorHex;

        if (colorSource === 'primary') {
            baseColorHex = this.themeColors.primary || '#007BFF';
        } else if (colorSource === 'note' && touchData.noteInfo?.midiNote !== undefined) {
            const noteIndex = touchData.noteInfo.midiNote % 12;
            const noteColors = this.globalVisualizerRef.noteColors;
            if (noteColors && typeof noteColors === 'object' && noteColors[noteIndex]) {
                baseColorHex = noteColors[noteIndex];
            }
        }

        // Преобразуем в RGB и делаем светлее
        const rgb = this.globalVisualizerRef.hexToRgb(baseColorHex);
        if (rgb) {
            const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (1 - brightnessFactor)));
            const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (1 - brightnessFactor)));
            const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (1 - brightnessFactor)));
            return `rgb(${r},${g},${b})`;
        }
        return baseColorHex; // Фоллбэк
    }

    _getCoreColorForSpark(touchData){
         const noteColor = this._getAdjustedNoteColor(touchData, 'sparkGlowColorSource', this.settings.sparkCoreBrightnessFactor);
         // Можно смешать с белым для ядра искры
         const whiteRgb = {r: 255, g: 255, b: 255};
         const noteRgb = this.globalVisualizerRef.hexToRgb(noteColor) || whiteRgb;
         const coreR = Math.floor(noteRgb.r * 0.5 + whiteRgb.r * 0.5);
         const coreG = Math.floor(noteRgb.g * 0.5 + whiteRgb.g * 0.5);
         const coreB = Math.floor(noteRgb.b * 0.5 + whiteRgb.b * 0.5);
         return `rgb(${coreR},${coreG},${coreB})`;
    }


    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        const touchX = touchData.x * this.canvas.width;
        const touchY = (1 - touchData.y) * this.canvas.height;

        const effectData = {
            id: touchData.id,
            touchX: touchX, touchY: touchY, normY: touchData.y,
            originalTouchData: JSON.parse(JSON.stringify(touchData)),
            coreColor: this._getAdjustedNoteColor(touchData, 'coreColorSource', 'coreBrightnessFactor'),
            auraColor: this._getAdjustedNoteColor(touchData, 'auraGlowColorSource', 1.0), // Яркость ауры управляется opacity
            sparkGlowColor: this._getAdjustedNoteColor(touchData, 'sparkGlowColorSource', 1.0),
            sparkCoreColor: this._getCoreColorForSpark(touchData),
            isActive: true,
            coreRadius: 0, currentCorePulse: Math.random(),
            sparks: [], lastSparkEmitTime: 0, currentSparkAngleOffset: Math.random() * Math.PI * 2,
            targetPoint: null, // { id, x, y, coreColor: targetCoreColor, auraColor: targetAuraColor }
            connectionPath: { points: [], mainBranches: [], secondarySparks: [] },
            currentConnectionEndPoint: { x: touchX, y: touchY },
            fadeStartTime: 0, overallAlpha: 1.0
        };
        this.activeEffects.set(touchData.id, effectData);
    }

    onTouchMove(touchData) {
        const effect = this.activeEffects.get(touchData.id);
        if (effect && effect.isActive) {
            effect.touchX = touchData.x * this.canvas.width;
            effect.touchY = (1 - touchData.y) * this.canvas.height;
            effect.normY = touchData.y;

            const oldNoteMidi = effect.originalTouchData.noteInfo?.midiNote;
            effect.originalTouchData = JSON.parse(JSON.stringify(touchData));
            if (touchData.noteInfo?.midiNote !== oldNoteMidi) {
                effect.coreColor = this._getAdjustedNoteColor(effect.originalTouchData, 'coreColorSource', 'coreBrightnessFactor');
                effect.auraColor = this._getAdjustedNoteColor(effect.originalTouchData, 'auraGlowColorSource', 1.0);
                effect.sparkGlowColor = this._getAdjustedNoteColor(effect.originalTouchData, 'sparkGlowColorSource', 1.0);
                effect.sparkCoreColor = this._getCoreColorForSpark(effect.originalTouchData);
            }
        }
    }

    onTouchUp(touchId) {
        const effect = this.activeEffects.get(touchId);
        if (effect) {
            effect.isActive = false;
            effect.fadeStartTime = performance.now();
        }
    }

    // --- Генерация Геометрии (без изменений от BallLightningEffect v1.1) ---
    _generateSparkPath(startX, startY, angle, length, maxSegments, jitter) { /* ... как в BallLightningEffect v1.1 ... */
        const points = [{ x: startX, y: startY }];
        let currentX = startX; let currentY = startY;
        const numSegments = Math.max(1, Math.min(maxSegments, Math.floor(length / (this.settings.sparkSegmentLengthBase * 0.3)) + 1));
        const segmentLen = length / numSegments;
        for (let i = 0; i < numSegments; i++) {
            const segAngle = angle + (Math.random() - 0.5) * (jitter / Math.max(1,length)) * Math.PI * 0.3 * (i / numSegments + 0.2);
            currentX += Math.cos(segAngle) * segmentLen;
            currentY += Math.sin(segAngle) * segmentLen;
            points.push({ x: currentX, y: currentY });
        }
        return points;
    }
    _generateMainArcPath(startX, startY, endX, endY, maxSegments, jitter) { /* ... как в BallLightningEffect v1.1 ... */
        const points = [{ x: startX, y: startY }];
        const dxTotal = endX - startX; const dyTotal = endY - startY;
        const totalDistance = Math.hypot(dxTotal, dyTotal);
        if (totalDistance < 1) { points.push({ x: endX, y: endY }); return points; }
        const numSegments = Math.max(2, maxSegments);
        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const currentJitter = jitter * Math.sin(t * Math.PI) * 0.7;
            const currentX = startX + dxTotal * t + (Math.random() - 0.5) * currentJitter;
            const currentY = startY + dyTotal * t + (Math.random() - 0.5) * currentJitter;
            points.push({ x: currentX, y: currentY });
        }
        points.push({ x: endX, y: endY });
        return points;
    }

    // --- Обновление состояния ---
    _updateCoreAndAura(effect, now, deltaTimeMs) { /* ... как в BallLightningEffect v1.1 ... */
        const baseCoreRadius = this.settings.coreMinRadius + effect.normY * this.settings.coreMaxRadiusYFactor;
        effect.currentCorePulse = (effect.currentCorePulse + deltaTimeMs * 0.001 * this.settings.corePulseSpeed) % 1;
        const pulseFactor = 1 + Math.sin(effect.currentCorePulse * Math.PI * 2) * this.settings.corePulseAmount;
        effect.coreRadius = baseCoreRadius * pulseFactor;
    }

    _updateSparks(effect, now) { /* ... как в BallLightningEffect v1.1 (но используем effect.sparkGlowColor) ... */
        effect.sparks = effect.sparks.filter(spark => {
            const age = now - spark.creationTime;
            spark.life = 1.0 - Math.min(age / this.settings.sparkLifeTimeMs, 1.0);
            return spark.life > 0;
        });
        if (effect.isActive && (now - effect.lastSparkEmitTime > this.settings.sparkEmitIntervalMs)) {
            const angleSpreadRad = this.settings.sparkAngleSpreadDeg * (Math.PI / 180);
            for (let i = 0; i < this.settings.sparksPerEmit; i++) {
                effect.currentSparkAngleOffset += (Math.random() - 0.5) * angleSpreadRad * 0.15;
                const angle = effect.currentSparkAngleOffset + (Math.random() - 0.5) * angleSpreadRad;
                const length = (this.settings.sparkSegmentLengthBase + this.settings.sparkSegmentLengthYFactor * effect.normY) * (0.6 + Math.random() * 0.7);
                effect.sparks.push({
                    points: this._generateSparkPath(effect.touchX, effect.touchY, angle, length, this.settings.sparkMaxSegments, this.settings.sparkJitter),
                    creationTime: now, life: 1.0, opacityMultiplier: 0.7 + Math.random()*0.3
                });
            }
            effect.lastSparkEmitTime = now;
        }
    }

    _updateConnectionPath(effect, targetEffect) { /* ... как в BallLightningEffect v1.1, но переименовано ... */
        const pathData = { points: [], mainBranches: [], secondarySparks: [] };
        pathData.points = this._generateMainArcPath(
            effect.touchX, effect.touchY,
            effect.currentConnectionEndPoint.x, effect.currentConnectionEndPoint.y,
            this.settings.connectionMaxSegments, this.settings.connectionJitter
        );
        if (pathData.points.length > 2 && Math.random() < this.settings.connectionBranchChanceMain) {
            const branchFromIndex = Math.floor(1 + Math.random() * (pathData.points.length - 2));
            const p = pathData.points[branchFromIndex];
            const angleToTarget = Math.atan2(targetEffect.touchY - p.y, targetEffect.touchX - p.x);
            const branchAngle = angleToTarget + (Math.random() - 0.5) * Math.PI * 0.8;
            const branchLength = (this.settings.sparkSegmentLengthBase + this.settings.sparkSegmentLengthYFactor * effect.normY) *
                                 (this.settings.connectionBranchMaxSegments || 3) * (0.2 + Math.random() * 0.3);
            pathData.mainBranches.push(
                this._generateSparkPath(p.x, p.y, branchAngle, branchLength,
                                       this.settings.connectionBranchMaxSegments || 3, this.settings.connectionJitter * 0.7)
            );
        }
        if(this.settings.connectionSecondarySparks && Math.random() < 0.5 && pathData.points.length > 1){
             const sparkStartIdx = Math.floor(Math.random() * (pathData.points.length -1));
             const sparkEndIdx = Math.min(pathData.points.length -1, sparkStartIdx + 1 + Math.floor(Math.random()*2));
             const subPath = pathData.points.slice(sparkStartIdx, sparkEndIdx +1);
             if(subPath.length > 1) {
                 pathData.secondarySparks.push({
                     points: subPath,
                     color: Math.random() < 0.5 ? effect.auraColor : targetEffect.auraColor,
                     life: 1.0
                 });
             }
        }
        effect.connectionPath = pathData;
    }

    // --- Отрисовка ---
    _drawRawPath(ctx, points, lineWidth, strokeStyleColor, alpha) { /* ... как в BallLightningEffect v1.1 ... */
        if (points.length < 2 || alpha <= 0.01 || lineWidth < 0.1) return;
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(strokeStyleColor, alpha);
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i-1], p2 = points[i];
            const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * lineWidth * 0.1;
            const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * lineWidth * 0.1;
            ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
    }

    _drawStyledPath(ctx, pathPoints, lineWidth, coreColor, glowColor, glowRadiusFactor, coreOpacityFactor, glowOpacityFactor, overallAlpha) {
        // ... как в BallLightningEffect v1.1 ...
        if (pathPoints.length < 2 || overallAlpha <= 0.01) return;
        const glowRadius = Math.max(0.1, lineWidth * glowRadiusFactor);
        const finalGlowOpacity = this.settings.opacity * glowOpacityFactor * this.settings.lineGlowOpacityFactor * overallAlpha;
        const coreAlphaMatch = coreColor.match(/rgba?\([\d\s,]+(?:,\s*([\d.]+))?\)/i);
        const coreBaseAlphaFromColor = coreAlphaMatch && coreAlphaMatch[1] ? parseFloat(coreAlphaMatch[1]) : 1.0;
        const finalCoreOpacity = coreBaseAlphaFromColor * this.settings.opacity * coreOpacityFactor * overallAlpha;

        if (glowRadius > 0.5 && finalGlowOpacity > 0.01) {
            ctx.save(); ctx.filter = `blur(${glowRadius}px)`;
            this._drawRawPath(ctx, pathPoints, lineWidth, glowColor, finalGlowOpacity); // Свечение той же толщины, блюр расширит
            ctx.restore();
        }
        if (finalCoreOpacity > 0.01) {
            this._drawRawPath(ctx, pathPoints, lineWidth, coreColor, finalCoreOpacity);
        }
    }

    // Новый метод для отрисовки градиентной соединительной дуги
    _drawGradientConnectionArc(ctx, pathPoints, lineWidth, coreCenterColor, startGlowColor, endGlowColor, glowRadiusFactor, coreOpacityFactor, glowOpacityFactor, overallAlpha) {
        if (pathPoints.length < 2 || overallAlpha <= 0.01) return;

        const finalGlowOpacity = this.settings.opacity * glowOpacityFactor * this.settings.lineGlowOpacityFactor * overallAlpha;
        const finalCoreOpacity = this.settings.opacity * coreOpacityFactor * overallAlpha;
        const glowRadius = Math.max(0.1, lineWidth * glowRadiusFactor);

        // --- Отрисовка свечения с градиентом ---
        if (glowRadius > 0.5 && finalGlowOpacity > 0.01) {
            const gradient = ctx.createLinearGradient(pathPoints[0].x, pathPoints[0].y, pathPoints[pathPoints.length - 1].x, pathPoints[pathPoints.length - 1].y);
            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(startGlowColor, finalGlowOpacity));
            if (startGlowColor !== endGlowColor && this.settings.connectionGlowColorMixType === 'gradient') {
                 gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(startGlowColor, finalGlowOpacity * 0.7)); // Можно добавить промежуточные цвета
                 gradient.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(endGlowColor, finalGlowOpacity * 0.7));
            }
            gradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(endGlowColor, finalGlowOpacity));

            ctx.save();
            ctx.strokeStyle = gradient;
            ctx.lineWidth = lineWidth; // Свечение рисуем той же толщиной, что и ядро
            ctx.filter = `blur(${glowRadius}px)`;
            this._drawRawPath(ctx, pathPoints, lineWidth, "rgba(0,0,0,0)", 1); // Рисуем путь для блюра
            ctx.restore();
        }

        // --- Отрисовка ядра с градиентом ---
        if (finalCoreOpacity > 0.01) {
            const coreGradient = ctx.createLinearGradient(pathPoints[0].x, pathPoints[0].y, pathPoints[pathPoints.length - 1].x, pathPoints[pathPoints.length - 1].y);
            const startCoreColor = this._getAdjustedNoteColor({ noteInfo: { midiNote: this.activeEffects.get(this.globalVisualizerRef.activeTouchPointsMap.get(pathPoints[0].originalTouchId)?.id)?.originalTouchData.noteInfo.midiNote } } , 'coreColorSource', this.settings.connectionCoreEdgeBrightnessFactor); // Цвет ноты на краю
            const endCoreColor = this._getAdjustedNoteColor({ noteInfo: { midiNote: this.activeEffects.get(this.globalVisualizerRef.activeTouchPointsMap.get(pathPoints[pathPoints.length-1].originalTouchId)?.id)?.originalTouchData.noteInfo.midiNote } } , 'coreColorSource', this.settings.connectionCoreEdgeBrightnessFactor); // Цвет ноты на краю

            coreGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(startCoreColor, finalCoreOpacity));
            coreGradient.addColorStop(0.4, this.globalVisualizerRef.getColorWithAlpha(coreCenterColor, finalCoreOpacity)); // Белый к центру
            coreGradient.addColorStop(0.6, this.globalVisualizerRef.getColorWithAlpha(coreCenterColor, finalCoreOpacity)); // Белый от центра
            coreGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(endCoreColor, finalCoreOpacity));

            this._drawRawPath(ctx, pathPoints, lineWidth, coreGradient, 1.0); // Alpha уже в градиенте
        }
    }


    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef?.activeTouchPointsMap) return;
        const now = performance.now();
        const deltaTimeMs = now - this.lastDrawTime;
        this.lastDrawTime = now;

        this.ctx.globalCompositeOperation = this.settings.compositeOperation;
        this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';

        // 1. Обновление состояний и определение целей
        this.activeEffects.forEach(effect => { /* ... как в v1.1 ... */
            if (!effect.isActive) {
                effect.overallAlpha = 1.0 - Math.min((now - effect.fadeStartTime) / this.settings.fadeDurationMs, 1);
                if (effect.overallAlpha <= 0.01 && effect.sparks.length === 0) {
                    this.activeEffects.delete(effect.id); return;
                }
            } else { effect.overallAlpha = 1.0; }
            this._updateCoreAndAura(effect, now, deltaTimeMs);

            effect.targetPoint = null;
            if (effect.isActive && this.globalVisualizerRef.activeTouchPointsMap.size > 1) {
                let closestDistSq = Math.pow(this.settings.attractionRadiusPx, 2);
                this.globalVisualizerRef.activeTouchPointsMap.forEach(otherMapPoint => {
                    if (otherMapPoint.id !== effect.id) {
                        const otherEffect = this.activeEffects.get(otherMapPoint.id);
                        if (otherEffect && otherEffect.isActive && (!otherEffect.targetPoint || otherEffect.targetPoint.id === effect.id)) {
                            const distSq = Math.pow(effect.touchX - otherMapPoint.x, 2) + Math.pow(effect.touchY - otherMapPoint.y, 2);
                            if (distSq < closestDistSq) {
                                closestDistSq = distSq;
                                effect.targetPoint = {
                                    id: otherMapPoint.id, x: otherMapPoint.x, y: otherMapPoint.y,
                                    auraColor: this._getAdjustedNoteColor(otherEffect.originalTouchData, 'auraGlowColorSource', 1.0), // Цвет ауры цели
                                    coreColor: this._getAdjustedNoteColor(otherEffect.originalTouchData, 'coreColorSource', 'coreBrightnessFactor') // Цвет ядра цели
                                };
                            }
                        }
                    }
                });
            }
            let targetCX = effect.touchX, targetCY = effect.touchY;
            if(effect.targetPoint) { targetCX = effect.targetPoint.x; targetCY = effect.targetPoint.y; }
            effect.currentConnectionEndPoint.x += (targetCX - effect.currentConnectionEndPoint.x) * this.settings.targetAttractionFactor;
            effect.currentConnectionEndPoint.y += (targetCY - effect.currentConnectionEndPoint.y) * this.settings.targetAttractionFactor;
        });

        // 2. Отрисовка
        let drawnConnections = new Set(); // Чтобы не рисовать соединение дважды

        this.activeEffects.forEach(effect => {
            if (effect.overallAlpha <= 0.01 && !effect.isActive && effect.sparks.length === 0) return;

            // A. Рисуем Ядро и Ауру "Новы"
            const finalCoreRadius = Math.max(0.1, effect.coreRadius * effect.overallAlpha);
            if (finalCoreRadius > 0.1) {
                const auraRadius = finalCoreRadius * this.settings.auraRadiusFactor;
                const auraAlpha = this.settings.auraOpacityFactor * effect.overallAlpha;
                if (auraAlpha > 0.01 && auraRadius > 0.5) {
                    const auraGradient = this.ctx.createRadialGradient(effect.touchX, effect.touchY, finalCoreRadius * 0.7, effect.touchX, effect.touchY, auraRadius);
                    auraGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(effect.auraColor, auraAlpha * 0.8));
                    auraGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(effect.auraColor, 0));
                    this.ctx.fillStyle = auraGradient;
                    this.ctx.beginPath(); this.ctx.arc(effect.touchX, effect.touchY, auraRadius, 0, Math.PI * 2); this.ctx.fill();
                }
                const coreGradient = this.ctx.createRadialGradient(effect.touchX, effect.touchY, 0, effect.touchX, effect.touchY, finalCoreRadius);
                const coreEffectiveColor = effect.isActive ? effect.coreColor : this.settings.coreBaseColor; // При затухании ядро может стать белым
                const coreFinalAlpha = effect.isActive ? 1.0 : effect.overallAlpha; // Ядро не затухает пока активно

                coreGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(coreEffectiveColor, 1.0 * coreFinalAlpha));
                coreGradient.addColorStop(0.8, this.globalVisualizerRef.getColorWithAlpha(coreEffectiveColor, 0.5 * coreFinalAlpha));
                coreGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(coreEffectiveColor, 0));
                this.ctx.fillStyle = coreGradient;
                this.ctx.beginPath(); this.ctx.arc(effect.touchX, effect.touchY, finalCoreRadius, 0, Math.PI * 2); this.ctx.fill();
            }

            const glowRadiusForLines = (this.settings.glowRadiusBase + this.settings.glowRadiusYFactor * effect.normY);

            // B. Соединительная дуга или Искры
            if (effect.targetPoint) {
                const targetEffect = this.activeEffects.get(effect.targetPoint.id);
                // Рисуем соединение, только если оно взаимное и мы "меньший" ID, или если цель уже неактивна/не целится в нас
                const canDrawConnection = targetEffect && targetEffect.isActive && targetEffect.targetPoint?.id === effect.id && effect.id < targetEffect.id;
                const isStretchingToInactiveTarget = !targetEffect || !targetEffect.isActive;

                if (canDrawConnection || isStretchingToInactiveTarget) {
                    const connKey = effect.id < (targetEffect?.id || effect.targetPoint.id) ? `${effect.id}-${targetEffect?.id || effect.targetPoint.id}` : `${targetEffect?.id || effect.targetPoint.id}-${effect.id}`;
                    if (!drawnConnections.has(connKey)) {
                        this._updateConnectionPath(effect, targetEffect || effect.targetPoint); // Передаем effect.targetPoint если targetEffect уже нет

                        const avgNormY = targetEffect ? (effect.normY + targetEffect.normY) / 2 : effect.normY;
                        let lineWidth = (this.settings.connectionLineWidthBase + this.settings.connectionLineWidthYFactor * avgNormY) * this.settings.connectionWidthBoost;
                        lineWidth = Math.max(0.1, lineWidth * effect.overallAlpha);

                        // --- Используем новый метод для градиентной дуги ---
                        this._drawGradientConnectionArc(this.ctx, effect.connectionPath.points, lineWidth,
                            this.settings.connectionCoreCenterColor,
                            effect.auraColor, // Цвет свечения от текущей точки
                            effect.targetPoint.auraColor || effect.auraColor, // Цвет свечения от целевой точки
                            this.settings.lineGlowRadiusFactor,
                            this.settings.opacityConnectionCore,
                            this.settings.opacityConnectionGlow,
                            effect.overallAlpha
                        );
                        // --- Конец использования нового метода ---

                        // Ветви основной дуги
                        effect.connectionPath.mainBranches.forEach(branchPoints => {
                             this._drawStyledPath(this.ctx, branchPoints, lineWidth * 0.35,
                                 this.settings.coreColorSpark, effect.auraColor, // Ветви от цвета текущей точки
                                 glowRadiusForLines * 0.5, this.settings.sparkOpacityCore,
                                 this.settings.sparkOpacityGlow, effect.overallAlpha);
                        });
                        // Вторичные искры
                        if(this.settings.connectionSecondarySparks){ /* ... как в v1.1 ... */ }

                        drawnConnections.add(connKey);
                    }
                }
                if (effect.isActive) effect.sparks = [];
            } else { // Режим Искр
                this._updateSparks(effect, now);
                effect.sparks.forEach(spark => {
                    if (spark.life > 0 && spark.points.length >= 2) {
                        const sparkLineWidth = this.settings.sparkLineWidthBase + this.settings.sparkLineWidthYFactor * effect.normY;
                        const sparkTotalAlpha = spark.opacityMultiplier * spark.life * effect.overallAlpha;

                        this._drawStyledPath(this.ctx, spark.points, sparkLineWidth,
                                             effect.sparkCoreColor, effect.sparkGlowColor,
                                             glowRadiusForLines * 0.6,
                                             this.settings.sparkOpacityCore,
                                             this.settings.sparkOpacityGlow,
                                             sparkTotalAlpha);
                    }
                });
                effect.connectionPath = { points: [], mainBranches: [], secondarySparks: [] };
            }
        });
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() { /* ... как в v1.1 ... */
        this.activeEffects.clear(); this.ctx = null; this.canvas = null;
        console.log("[NovaSparkEffect v1.0] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('NovaSparkEffect', NovaSparkEffect); // Имя КЛАССА!
} else {
    window.NovaSparkEffect = NovaSparkEffect;
    console.warn('[NovaSparkEffect v1.0] Registered globally.');
}