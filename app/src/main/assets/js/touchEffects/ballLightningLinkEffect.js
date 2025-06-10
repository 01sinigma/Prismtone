class BallLightningLinkEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {
            // Настройки по умолчанию, будут перезаписаны из JSON
            colorSourceAura: 'note', coreBaseColor: '#FFFFFF', coreMinRadius: 8, coreRadiusYMultiplier: 15,
            corePulseSpeed: 1.5, corePulseAmount: 0.15, auraRadiusFactor: 2.5, auraBaseOpacity: 0.3,
            sparkEmitInterval: 50, sparksPerEmitBase: 2, sparksPerEmitYMultiplier: 4, sparkMaxLifetime: 400,
            sparkBaseLength: 15, sparkLengthYMultiplier: 30, sparkSegments: 3, sparkJitter: 8,
            sparkBranchChance: 0.1, sparkCoreColor: '#FFFFFF', sparkGlowOpacity: 0.7, sparkRotationSpeed: 0.01,
            sparkBundleSpread: Math.PI / 2, sparkAngleFactor: 3, sparkGlowWidthFactor: 3, sparkCoreWidthFactor: 1,
            attractionRadiusPx: 150, linkCoreColorStart: '#FFFFFF', linkCoreColorEnd: '#FFFFFF',
            linkGlowOpacity: 0.8, linkBaseThickness: 4, linkThicknessYMultiplier: 3, linkSegments: 7,
            linkJitter: 15, linkGlowThicknessFactor: 1.8, linkBranchChance: 0.05, linkSecondarySparks: true,
            linkSecondarySparkInterval: 100, linkSecondarySparkCount: 1,
            fadeDurationCore: 300, fadeDurationSparks: 200, fadeDurationLink: 250,
            compositeOperation: 'lighter'
        };
        this.themeColors = {};
        this.globalVisualizerRef = null;

        // Структуры данных
        // ballLightnings: Map<touchId, BallLightningObject>
        // BallLightningObject: { id, x, y, currentY, noteInfo, coreRadius, currentCoreRadius, auraColor,
        //                        sparks: Array<SparkObject>, lastSparkEmitTime, sparkBundleAngle,
        //                        isActive, fadeStartTime, activeLinkCount }
        // SparkObject: { startX, startY, basePoints: Array<{x,y}>, length, lifetime, startTime, color (если нужен свой) }
        this.ballLightnings = new Map();

        // activeLinks: Map<linkKey, LinkObject>
        // LinkObject: { key, id1, id2, points: [], branches: [], secondarySparks: [], thickness,
        //               color1, color2, isActive, fadeStartTime, fadeProgress,
        //               lastSecondarySparkTime, lastX1, lastY1, lastX2, lastY2 }
        this.activeLinks = new Map();
        this.lastDrawTime = performance.now();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = { ...this.settings, ...initialSettings };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.ballLightnings.clear();
        this.activeLinks.clear();
        this.lastDrawTime = performance.now();
        // Object pool для sparks
        this.sparkPool = [];
        for (let i = 0; i < (this.settings.maxSparksInPool || 200); i++) {
            this.sparkPool.push({ isActive: false });
        }
        console.log("[BallLightningLinkEffect v1.2-multi-final] Initialized with settings:", JSON.parse(JSON.stringify(this.settings)));
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.ballLightnings.forEach(bl => {
            if (this.settings.colorSourceAura !== 'note') { // Обновляем только если цвет ауры не от ноты
                bl.auraColor = this._getAuraColor(null); // Передаем null, чтобы взять из темы
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    // --- Вспомогательные функции ---
    _getAuraColor(noteInfo) {
        let color = this.themeColors.primary || '#007bff'; // Дефолт
        if (this.settings.colorSourceAura === 'accent') {
            color = this.themeColors.accent || '#ff4081';
        } else if (this.settings.colorSourceAura === 'note' && noteInfo?.midiNote !== undefined) {
            const noteIndex = noteInfo.midiNote % 12;
            // Убедимся, что noteColors существует в globalVisualizerRef
            const noteColors = this.globalVisualizerRef?.noteColors ||
                { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            color = noteColors[noteIndex] || color; // Fallback на текущий color (который из темы)
        }
        return color;
    }

    _generateSparkBasePoints(length, segments, jitter, mainAngle) {
        // Генерирует "скелет" искры от (0,0) в заданном направлении
        const points = [{ x: 0, y: 0 }];
        let currentX = 0;
        let currentY = 0;
        const segmentLen = length / segments;

        for (let i = 0; i < segments; i++) {
            // Добавляем дрожание к углу каждого сегмента относительно основного направления
            const angle = mainAngle + (Math.random() - 0.5) * (this.settings.sparkSegmentAngleJitter || 0.5); // jitter в радианах
            currentX += Math.cos(angle) * segmentLen;
            currentY += Math.sin(angle) * segmentLen;
            points.push({ x: currentX, y: currentY });
        }
        return points;
    }

    _drawSpark(spark, auraColor, coreColor, now) {
        const lifeProgress = Math.min((now - spark.startTime) / spark.lifetime, 1);
        if (lifeProgress >= 1) return false;

        // Анимация: искра "вырастает" до своей полной длины, а затем "втягивается" или исчезает
        let displayProgress;
        const growthDurationFactor = 0.3; // 30% времени на рост
        const shrinkStartTimeFactor = 0.7; // 70% времени существует, потом втягивается/исчезает

        if (lifeProgress < growthDurationFactor) { // Фаза роста
            displayProgress = lifeProgress / growthDurationFactor;
        } else if (lifeProgress < shrinkStartTimeFactor) { // Фаза существования
            displayProgress = 1.0;
        } else { // Фаза втягивания/исчезновения
            displayProgress = 1.0 - (lifeProgress - shrinkStartTimeFactor) / (1.0 - shrinkStartTimeFactor);
        }
        displayProgress = Math.max(0, Math.min(1, displayProgress)); // Clamp

        const currentLength = spark.length * displayProgress;
        const opacity = (1 - lifeProgress) * this.settings.sparkGlowOpacity;

        if (opacity <= 0.01 || currentLength < 1) return false;

        this.ctx.save();
        this.ctx.translate(spark.startX, spark.startY); // Перемещаемся к началу искры

        // Масштабируем и поворачиваем базовые точки для создания текущего вида искры
        // Рисуем от начала (0,0 в текущей системе координат)
        const dynamicPoints = [{x:0, y:0}];
        let currentX = 0;
        let currentY = 0;
        const segmentLen = currentLength / (spark.basePoints.length -1);

        for(let i = 1; i < spark.basePoints.length; i++){
            // Используем относительные координаты из basePoints
            const dxBase = spark.basePoints[i].x - spark.basePoints[i-1].x;
            const dyBase = spark.basePoints[i].y - spark.basePoints[i-1].y;
            const originalSegmentLength = Math.hypot(dxBase, dyBase);
            if (originalSegmentLength === 0) continue;

            // Масштабируем смещение сегмента
            currentX += (dxBase / originalSegmentLength) * segmentLen;
            currentY += (dyBase / originalSegmentLength) * segmentLen;
            dynamicPoints.push({x: currentX, y: currentY});
        }

        if (dynamicPoints.length < 2) {
             this.ctx.restore();
             return true; // Еще нечего рисовать, но искра жива
        }

        // Свечение искры
        this.ctx.beginPath();
        this.ctx.moveTo(dynamicPoints[0].x, dynamicPoints[0].y);
        for (let i = 1; i < dynamicPoints.length; i++) this.ctx.lineTo(dynamicPoints[i].x, dynamicPoints[i].y);
        this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(auraColor, opacity * 0.7);
        this.ctx.lineWidth = Math.max(0.5, (this.settings.sparkGlowWidthFactor || 3) * displayProgress);
        this.ctx.stroke();

        // Ядро искры
        this.ctx.beginPath();
        this.ctx.moveTo(dynamicPoints[0].x, dynamicPoints[0].y);
        for (let i = 1; i < dynamicPoints.length; i++) this.ctx.lineTo(dynamicPoints[i].x, dynamicPoints[i].y);
        this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(coreColor, opacity);
        this.ctx.lineWidth = Math.max(0.3, (this.settings.sparkCoreWidthFactor || 1) * displayProgress);
        this.ctx.stroke();

        this.ctx.restore();
        return true;
    }

    _generateLinkPoints(x1, y1, x2, y2, segments, jitter) {
        const points = [{x:x1, y:y1}];
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            // Дрожание максимально в центре дуги и уменьшается к концам
            const currentJitter = jitter * Math.sin(Math.PI * t);
            points.push({
                x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * currentJitter,
                y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * currentJitter
            });
        }
        points.push({x:x2, y:y2});
        return points;
    }

    _drawLinkSecondaryEffects(link, now, linkOpacity) {
        // Вторичные искры вдоль дуги
        if (this.settings.linkSecondarySparks && link.isActive) { // Только для активных дуг
            if (!link.lastSecondarySparkTime || (now - link.lastSecondarySparkTime > this.settings.linkSecondarySparkInterval)) {
                link.lastSecondarySparkTime = now;
                if (!link.secondarySparks) link.secondarySparks = [];

                for (let i = 0; i < this.settings.linkSecondarySparkCount; i++) {
                    if (link.points.length < 2) continue;
                    const pIndex = Math.floor(Math.random() * (link.points.length - 1));
                    const p1 = link.points[pIndex];
                    const p2 = link.points[pIndex + 1];
                    const startX = (p1.x + p2.x) / 2;
                    const startY = (p1.y + p2.y) / 2;

                    const tangentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    const angle = tangentAngle + (Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1) + (Math.random()-0.5)*0.5;
                    const length = (this.settings.sparkBaseLength || 15) * 0.6 * (0.5 + Math.random() * 0.5);
                    const sparkColor = Math.random() < 0.5 ? link.color1 : link.color2;

                    const newSpark = this._getSparkFromPool();
                    Object.assign(newSpark, {
                        startX: startX, startY: startY,
                        basePoints: this._generateSparkBasePoints(length, Math.max(1, Math.floor(this.settings.sparkSegments / 2)), this.settings.sparkJitter / 2, angle),
                        length: length,
                        lifetime: (this.settings.sparkMaxLifetime || 400) * 0.4,
                        startTime: now,
                        color: sparkColor
                    });
                    link.secondarySparks.push(newSpark);
                }
            }
        }
        if (link.secondarySparks) {
            link.secondarySparks = link.secondarySparks.filter(spark => {
                const alive = this._drawSpark(spark, spark.color, spark.color, now);
                if (!alive) spark.isActive = false;
                return alive;
            });
        }

        // Ответвления от основной дуги
        if (this.settings.linkBranchChance > 0 && link.isActive && Math.random() < this.settings.linkBranchChance) {
             if (!link.mainBranches) link.mainBranches = [];
             if (link.points.length < 2) return;
             const pIndex = Math.floor(Math.random() * (link.points.length - 1));
             const p1 = link.points[pIndex];
             const startX = p1.x;
             const startY = p1.y;
             const angle = Math.random() * Math.PI * 2; // Случайный угол
             const length = (this.settings.sparkBaseLength || 15) * (0.7 + Math.random() * 0.6);
             const branchColor = Math.random() < 0.5 ? link.color1 : link.color2;

             const newBranch = this._getSparkFromPool();
             Object.assign(newBranch, {
                startX: startX, startY: startY,
                basePoints: this._generateSparkBasePoints(length, this.settings.sparkSegments, this.settings.sparkJitter, angle),
                length: length,
                lifetime: (this.settings.sparkMaxLifetime || 400) * 0.6,
                startTime: now,
                color: branchColor
             });
             link.mainBranches.push(newBranch);
        }
         if (link.mainBranches) {
            link.mainBranches = link.mainBranches.filter(spark => {
                const alive = this._drawSpark(spark, spark.color, spark.color, now);
                if (!alive) spark.isActive = false;
                return alive;
            });
        }
    }

    _drawLinkArc(link, now) {
        const bl1 = this.ballLightnings.get(link.id1);
        const bl2 = this.ballLightnings.get(link.id2);

        if ((!bl1 || !bl1.isActive) && (!bl2 || !bl2.isActive) && link.isActive) {
            link.isActive = false;
            link.fadeStartTime = now;
        } else if ((!bl1 && bl2?.isActive && link.isActive) || (bl1?.isActive && !bl2 && link.isActive)) {
             if (link.isActive) {
                link.isActive = false;
                link.fadeStartTime = now;
            }
        }

        let currentOpacity = this.settings.linkGlowOpacity;
        let currentThickness = link.thickness;

        if (!link.isActive) {
            if (!link.fadeStartTime) link.fadeStartTime = now;
            link.fadeProgress = Math.min((now - link.fadeStartTime) / this.settings.fadeDurationLink, 1);
            if (link.fadeProgress >= 1) return false;
            currentOpacity *= (1 - link.fadeProgress);
            currentThickness *= (1 - link.fadeProgress);
        }

        if (currentOpacity <= 0.01 || currentThickness < 0.5) return false;

        const x1 = bl1 ? bl1.x : link.lastX1;
        const y1 = bl1 ? bl1.y : link.lastY1;
        const x2 = bl2 ? bl2.x : link.lastX2;
        const y2 = bl2 ? bl2.y : link.lastY2;

        link.lastX1 = x1; link.lastY1 = y1;
        link.lastX2 = x2; link.lastY2 = y2;

        const points = this._generateLinkPoints(x1, y1, x2, y2, this.settings.linkSegments, this.settings.linkJitter);
        link.points = points;
        if (points.length < 2) return true; // Нечего рисовать, но дуга может быть еще жива

        const color1 = bl1 ? bl1.auraColor : link.color1;
        const color2 = bl2 ? bl2.auraColor : link.color2;

        this.ctx.lineCap = 'round';
        // Свечение дуги
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for(let i=1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
        const grad = this.ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(color1, currentOpacity));
        grad.addColorStop(0.5, this.globalVisualizerRef.getColorWithAlpha(this.globalVisualizerRef.mixColors(color1, color2, 0.5), currentOpacity * 0.8)); // Центр чуть тусклее для глубины
        grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(color2, currentOpacity));
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = currentThickness * (this.settings.linkGlowThicknessFactor || 1.8);
        this.ctx.stroke();

        // Ядро дуги
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for(let i=1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
        const coreGrad = this.ctx.createLinearGradient(x1, y1, x2, y2);
        coreGrad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(this.settings.linkCoreColorStart, currentOpacity * 1.1)); // Ярче
        coreGrad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(this.settings.linkCoreColorEnd, currentOpacity * 1.1)); // Ярче
        this.ctx.strokeStyle = coreGrad;
        this.ctx.lineWidth = currentThickness;
        this.ctx.stroke();

        if (link.isActive || link.fadeProgress < 0.7) { // Вторичные эффекты только для активных или не сильно затухших дуг
             this._drawLinkSecondaryEffects(link, now, currentOpacity);
        }
        return true;
    }

    // --- Основные методы обработки касаний ---
    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        let bl = this.ballLightnings.get(touchData.id);
        const x = touchData.x * this.canvas.width;
        const y = (1 - touchData.y) * this.canvas.height;

        if (bl) { // Если шаровая молния уже существует (например, быстрое повторное касание)
            bl.x = x; bl.y = y; bl.currentY = touchData.y;
            bl.coreRadius = this.settings.coreMinRadius + touchData.y * this.settings.coreRadiusYMultiplier;
            bl.isActive = true;
            bl.fadeStartTime = 0; // Сбрасываем затухание
            bl.noteInfo = touchData.noteInfo; // Обновляем информацию о ноте
            bl.auraColor = this._getAuraColor(touchData.noteInfo); // Обновляем цвет ауры
            // Важно: не сбрасываем activeLinkCount здесь, updateLinks это сделает
        } else {
            bl = {
                id: touchData.id, x: x, y: y, currentY: touchData.y,
                noteInfo: touchData.noteInfo,
                coreRadius: this.settings.coreMinRadius + touchData.y * this.settings.coreRadiusYMultiplier,
                currentCoreRadius: this.settings.coreMinRadius + touchData.y * this.settings.coreRadiusYMultiplier,
                auraColor: this._getAuraColor(touchData.noteInfo),
                sparks: [], lastSparkEmitTime: performance.now(), sparkBundleAngle: Math.random() * Math.PI * 2,
                isActive: true, fadeStartTime: 0, activeLinkCount: 0
            };
            this.ballLightnings.set(touchData.id, bl);
        }
        this.updateLinks();
    }

    onTouchMove(touchData) {
        const bl = this.ballLightnings.get(touchData.id);
        if (bl && bl.isActive) {
            bl.x = touchData.x * this.canvas.width;
            bl.y = (1 - touchData.y) * this.canvas.height;
            bl.currentY = touchData.y;
            bl.coreRadius = this.settings.coreMinRadius + bl.currentY * this.settings.coreRadiusYMultiplier;

            const newAuraColor = this._getAuraColor(touchData.noteInfo);
            if (bl.auraColor !== newAuraColor) {
                bl.auraColor = newAuraColor;
                // Обновить цвета связанных дуг
                this.activeLinks.forEach(link => {
                    if (link.id1 === bl.id) link.color1 = newAuraColor;
                    if (link.id2 === bl.id) link.color2 = newAuraColor;
                });
            }
            bl.noteInfo = touchData.noteInfo; // Обновляем инфо о ноте
            this.updateLinks();
        }
    }

    onTouchUp(touchId) {
        const bl = this.ballLightnings.get(touchId);
        if (bl) {
            bl.isActive = false;
            if (!bl.fadeStartTime) bl.fadeStartTime = performance.now(); // Начинаем затухание, если еще не началось

            // Связанные дуги также должны начать затухать
            this.activeLinks.forEach(link => {
                if ((link.id1 === touchId || link.id2 === touchId) && link.isActive) {
                    link.isActive = false;
                    if (!link.fadeStartTime) link.fadeStartTime = performance.now();
                }
            });
        }
        // this.updateLinks(); // Не обязательно, drawActiveEffects справится
    }

    updateLinks() {
        const activeBLs = Array.from(this.ballLightnings.values()).filter(bl => bl.isActive);
        const attractionRadiusSq = this.settings.attractionRadiusPx * this.settings.attractionRadiusPx;

        // Сначала обнуляем счетчики связей у всех (даже неактивных, на всякий случай)
        this.ballLightnings.forEach(bl => bl.activeLinkCount = 0);

        const currentActiveLinkKeys = new Set();

        for (let i = 0; i < activeBLs.length; i++) {
            for (let j = i + 1; j < activeBLs.length; j++) {
                const bl1 = activeBLs[i];
                const bl2 = activeBLs[j];

                const dx = bl1.x - bl2.x;
                const dy = bl1.y - bl2.y;
                const distSq = dx * dx + dy * dy;
                const linkKey = [bl1.id, bl2.id].sort().join('-');

                if (distSq < attractionRadiusSq) {
                    currentActiveLinkKeys.add(linkKey);
                    bl1.activeLinkCount++;
                    bl2.activeLinkCount++;

                    let link = this.activeLinks.get(linkKey);
                    if (!link || !link.isActive) { // Если линка нет ИЛИ он был неактивен (затухал)
                        link = {
                            key: linkKey, id1: bl1.id, id2: bl2.id,
                            points: [], branches: [], secondarySparks: [],
                            thickness: this.settings.linkBaseThickness + ((bl1.currentY + bl2.currentY) / 2) * this.settings.linkThicknessYMultiplier,
                            color1: bl1.auraColor, color2: bl2.auraColor,
                            isActive: true, fadeStartTime: 0, fadeProgress: -1,
                            lastSecondarySparkTime: 0,
                            lastX1: bl1.x, lastY1: bl1.y, lastX2: bl2.x, lastY2: bl2.y
                        };
                        this.activeLinks.set(linkKey, link);
                    } else { // Линк уже существует и активен, просто обновляем цвета и толщину
                        link.color1 = bl1.auraColor;
                        link.color2 = bl2.auraColor;
                        link.thickness = this.settings.linkBaseThickness + ((bl1.currentY + bl2.currentY) / 2) * this.settings.linkThicknessYMultiplier;
                    }
                }
            }
        }

        // Деактивируем линки, которые больше не соответствуют условиям
        this.activeLinks.forEach((link, key) => {
            if (link.isActive && !currentActiveLinkKeys.has(key)) {
                link.isActive = false;
                if (!link.fadeStartTime) link.fadeStartTime = performance.now();
            }
        });
    }

    // --- Основной цикл отрисовки ---
    drawActiveEffects() {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        const now = performance.now();
        const deltaTime = Math.min(32, now - this.lastDrawTime) / 1000; // Ограничиваем deltaTime, в секундах
        this.lastDrawTime = now;

        this.ctx.globalCompositeOperation = this.settings.compositeOperation;

        this.updateLinks(); // Обновляем состояние связей перед отрисовкой

        // 1. Отрисовка связей
        this.activeLinks.forEach((link, key) => {
            if (!this._drawLinkArc(link, now)) {
                this.activeLinks.delete(key);
                // При удалении дуги activeLinkCount у связанных BL уже должен был быть обновлен в updateLinks,
                // либо будет обновлен на следующей итерации updateLinks, если BL еще активны.
            }
        });

        // 2. Отрисовка шаровых молний
        this.ballLightnings.forEach((bl, id) => {
            let coreOpacity = this.settings.baseOpacity ?? 1.0;
            let auraOpacity = this.settings.auraBaseOpacity ?? 0.3;
            let sparkEmissionAllowed = bl.isActive && bl.activeLinkCount === 0;

            if (!bl.isActive) {
                if(!bl.fadeStartTime) bl.fadeStartTime = now;
                const fadeProgress = Math.min((now - bl.fadeStartTime) / this.settings.fadeDurationCore, 1);

                coreOpacity *= (1 - fadeProgress);
                auraOpacity *= (1 - fadeProgress);
                bl.currentCoreRadius = bl.coreRadius * (1 - fadeProgress);

                if (fadeProgress >= 1 && bl.sparks.length === 0 && bl.activeLinkCount === 0) {
                    this.ballLightnings.delete(id);
                    return;
                }
            } else {
                const pulseFactor = (Math.sin(now * 0.001 * this.settings.corePulseSpeed) + 1) / 2;
                bl.currentCoreRadius = bl.coreRadius * (1 - this.settings.corePulseAmount / 2 + this.settings.corePulseAmount * pulseFactor);
            }

            if (bl.currentCoreRadius < 0.5 && !bl.isActive) {
                 if (bl.sparks.length === 0 && bl.activeLinkCount === 0) {
                    this.ballLightnings.delete(id); return;
                 }
            }

            // Рисуем Ауру
            if (auraOpacity > 0.01 && bl.currentCoreRadius > 0.5) {
                const auraRadius = bl.currentCoreRadius * this.settings.auraRadiusFactor;
                const auraGradient = this.ctx.createRadialGradient(bl.x, bl.y, bl.currentCoreRadius * 0.7, bl.x, bl.y, auraRadius);
                auraGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(bl.auraColor, auraOpacity * 0.8));
                auraGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(bl.auraColor, 0));
                this.ctx.fillStyle = auraGradient;
                this.ctx.beginPath();
                this.ctx.arc(bl.x, bl.y, auraRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Рисуем Ядро
            if (coreOpacity > 0.01 && bl.currentCoreRadius > 0.5) {
                const coreGradient = this.ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.currentCoreRadius);
                let coreColor = this.settings.coreBaseColor;
                // Делаем ядро чуть темнее/цветнее, если оно в цветной зоне
                if(this.settings.coreColorFromAura && bl.auraColor !== this.settings.coreBaseColor) {
                    coreColor = this.globalVisualizerRef.mixColors(this.settings.coreBaseColor, bl.auraColor, 0.3);
                }

                coreGradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(coreColor, coreOpacity));
                coreGradient.addColorStop(0.7, this.globalVisualizerRef.getColorWithAlpha(coreColor, coreOpacity * 0.6));
                coreGradient.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(coreColor, 0));
                this.ctx.fillStyle = coreGradient;
                this.ctx.beginPath();
                this.ctx.arc(bl.x, bl.y, bl.currentCoreRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Генерация и отрисовка исходящих искр
            if (sparkEmissionAllowed) {
                if (now - bl.lastSparkEmitTime > this.settings.sparkEmitInterval) {
                    bl.lastSparkEmitTime = now;
                    const numSparks = this.settings.sparksPerEmitBase + Math.floor(bl.currentY * this.settings.sparksPerEmitYMultiplier);
                    bl.sparkBundleAngle = (bl.sparkBundleAngle + this.settings.sparkRotationSpeed * deltaTime * 60);

                    for (let i = 0; i < numSparks; i++) {
                        const angle = bl.sparkBundleAngle + (Math.random() - 0.5) * (this.settings.sparkBundleSpread) + (i / numSparks) * (Math.PI * 2 / (this.settings.sparkAngleFactor));
                        const length = (this.settings.sparkBaseLength + bl.currentY * this.settings.sparkLengthYMultiplier) * (0.7 + Math.random() * 0.6);

                        const newSpark = this._getSparkFromPool();
                        Object.assign(newSpark, {
                            startX: bl.x, startY: bl.y,
                            basePoints: this._generateSparkBasePoints(length, this.settings.sparkSegments, this.settings.sparkJitter, angle),
                            length: length,
                            lifetime: this.settings.sparkMaxLifetime * (0.8 + Math.random() * 0.4),
                            startTime: now,
                        });
                        bl.sparks.push(newSpark);
                    }
                }
            }

            const sparkCoreRenderColor = this.settings.sparkCoreColorFromAura ? bl.auraColor : this.settings.sparkCoreColor;
            bl.sparks = bl.sparks.filter(spark => {
                let sparkIsAlive = this._drawSpark(spark, bl.auraColor, sparkCoreRenderColor, now);
                if (!bl.isActive) {
                    const fadeProgressCore = Math.min((now - bl.fadeStartTime) / this.settings.fadeDurationSparks, 1);
                    if (fadeProgressCore > 0.3) sparkIsAlive = false;
                }
                if (!sparkIsAlive) spark.isActive = false;
                return sparkIsAlive;
            });

            if (!bl.isActive && bl.activeLinkCount === 0 && bl.sparks.length === 0 &&
                ((now - bl.fadeStartTime) >= this.settings.fadeDurationCore)) {
                this.ballLightnings.delete(id);
            }
        });
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.ballLightnings.clear();
        this.activeLinks.clear();
        this.ctx = null;
        this.canvas = null;
        console.log("[BallLightningLinkEffect v1.2-multi-final] Disposed.");
    }

    _getSparkFromPool() {
        for (let i = 0; i < this.sparkPool.length; i++) {
            if (!this.sparkPool[i].isActive) {
                this.sparkPool[i].isActive = true;
                return this.sparkPool[i];
            }
        }
        // Если пул исчерпан, создаем новый
        const newSpark = { isActive: true };
        this.sparkPool.push(newSpark);
        return newSpark;
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('BallLightningLinkEffect', BallLightningLinkEffect);
} else {
    window.BallLightningLinkEffect = BallLightningLinkEffect;
    console.warn('[BallLightningLinkEffect v1.2-multi-final] Registered globally as visualizer object was not available at load time.');
}