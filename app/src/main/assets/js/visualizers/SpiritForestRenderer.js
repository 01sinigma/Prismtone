// Файл: app/src/main/assets/js/visualizers/spiritForestRenderer.js
// ВЕРСИЯ 2.0: Продвинутая симуляция леса с физикой ветра, препятствиями и энергетическими состояниями.

class SpiritForestRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        this.spirits = [];
        this.trees = []; // Массив для хранения данных о деревьях-препятствиях
        this.pollinationFlashes = []; // Для визуализации вспышек опыления
        this.lastTwoTouchState = null; // Для отслеживания жеста Pinch

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this._isForestDirty = true;

        // Object Pooling for spirits
        this.spiritPool = [];
        this.spiritPoolSize = 200; // Default, will be updated from settings
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = { ...initialSettings }; // Загружаем все из JSON
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        // Initialize spirit pool
        this.spiritPoolSize = this.settings.spirits?.poolSize || this.spiritPoolSize;
        this.spiritPool = [];
        for (let i = 0; i < this.spiritPoolSize; i++) {
            this.spiritPool.push({ isActiveInPool: false });
        }

        this.onResize(); // Calls _initSpirits which will use the pool
        console.log(`[SpiritForestRenderer v2.1-pool] Initialized with advanced physics and spirit pool size: ${this.spiritPoolSize}.`);
    }

    _getSpiritFromPool() {
        for (let i = 0; i < this.spiritPool.length; i++) {
            if (!this.spiritPool[i].isActiveInPool) {
                this.spiritPool[i].isActiveInPool = true;
                // Reset any critical properties if necessary, or rely on assigner to do so
                this.spiritPool[i].toBeRemoved = false;
                return this.spiritPool[i];
            }
        }
        console.warn("[SpiritForestRenderer] Spirit pool depleted. Consider increasing pool size.");
        // Create a new one if pool is empty, this one won't be returned to the fixed pool
        return { isActiveInPool: true, toBeRemoved: false };
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this._isForestDirty = true;
    }

    onResize() {
        if (!this.canvas || this.canvas.width === 0) return;
        this.offscreenCanvas.width = this.canvas.width;
        this.offscreenCanvas.height = this.canvas.height;
        this._isForestDirty = true;
        this._initSpirits();
    }

    _initSpirits() {
        // Return existing spirits to the pool before clearing
        this.spirits.forEach(s => { if (s.isActiveInPool) s.isActiveInPool = false; });
        this.spirits = [];
        const s = this.settings.spirits; // короткая ссылка для удобства
        const initialCount = s.initialCount || 50; // Fallback if not in settings

        for (let i = 0; i < initialCount; i++) {
            if (this.spirits.length >= (s.maxCount || 150) ) break; // Respect max count

            const spirit = this._getSpiritFromPool();
            if (!spirit) continue; // Should not happen if pool logic is correct or creates new ones

            Object.assign(spirit, {
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * s.baseSpeed,
                vy: (Math.random() - 0.5) * s.baseSpeed,
                size: s.minSize + Math.random() * (s.maxSize - s.minSize),
                baseAlpha: 0.5 + Math.random() * 0.5,
                color: this.themeColors.primary,

                state: 'wandering',
                energy: Math.random() * 0.1,
                pollinationTarget: null,
                age: 0,
                timeInState: 0,
                lastTouchedBy: null,
                forces: { x: 0, y: 0 }
                // isActiveInPool is already true
            });
            this.spirits.push(spirit);
        }
    }

    _renderStaticForest() {
        if (!this.offscreenCtx || !this.canvas) return;
        const ctx = this.offscreenCtx;
        const canvas = this.offscreenCanvas; // Рисуем на offscreen
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const forestSettings = this.settings.forest;
        this.trees = []; // Очищаем массив деревьев перед перерисовкой

        for (let i = 0; i < forestSettings.treeLayers; i++) {
            const layerRatio = (i + 1) / forestSettings.treeLayers;
            const layerAlpha = 0.1 + layerRatio * 0.3;
            const layerHeightMultiplier = forestSettings.baseTreeHeight + layerRatio * forestSettings.treeHeightVariance;

            ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.secondary, layerAlpha);

            const numTreesInLayer = 5 + i * 5; // Больше деревьев на дальних слоях для плотности
            for (let j = 0; j < numTreesInLayer; j++) {
                const x = (j / numTreesInLayer) * canvas.width + (Math.random() - 0.5) * (canvas.width / numTreesInLayer);
                const treeHeight = canvas.height * layerHeightMultiplier * (0.8 + Math.random() * 0.4);
                const treeWidth = treeHeight * (0.2 + Math.random() * 0.2);

                // Простая форма дерева (трапеция/треугольник)
                ctx.beginPath();
                ctx.moveTo(x - treeWidth / 2, canvas.height);
                ctx.lineTo(x - treeWidth / 3, canvas.height - treeHeight * 0.8);
                ctx.lineTo(x, canvas.height - treeHeight);
                ctx.lineTo(x + treeWidth / 3, canvas.height - treeHeight * 0.8);
                ctx.lineTo(x + treeWidth / 2, canvas.height);
                ctx.closePath();
                ctx.fill();

                // Сохраняем дерево для физики (ствол как основная точка взаимодействия)
                // Радиус упрощенно берем от ширины у основания
                if (i >= forestSettings.treeLayers - 2) { // Сохраняем только ближайшие слои для производительности
                    this.trees.push({
                        x: x,
                        y: canvas.height - treeHeight / 2, // Центр масс дерева по высоте (примерно)
                        radius: treeWidth / 2, // Эффективный радиус для отталкивания
                        height: treeHeight,
                        layer: i
                    });
                }
            }
        }
        this._isForestDirty = false;
        console.log(`[SpiritForestRenderer] Forest redrawn. Trees count for physics: ${this.trees.length}`);
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas) return;

        if (this._isForestDirty) this._renderStaticForest();

        // 1. Физика
        this._updatePhysics(audioData, activeTouchStates, deviceTilt);

        // 2. Отрисовка
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.offscreenCanvas) this.ctx.drawImage(this.offscreenCanvas, 0, 0);

        this.ctx.globalCompositeOperation = 'lighter';
        this._drawSpirits();
        this._drawTouchInteractions(activeTouchStates);
        this._drawPollinationFlashes(); // Отрисовка вспышек опыления
        this.ctx.globalCompositeOperation = 'source-over';
    }

    _updatePhysics(audioData, activeTouchStates, deviceTilt) {
        const phys = this.settings.physics;
        const inter = this.settings.interaction;

        const windX = (deviceTilt.roll / 90) * phys.windStrength;
        const windY = (deviceTilt.pitch / 90) * phys.windStrength;

        let audioLevel = 0;
        if (this.analyserNodeRef && audioData) {
            audioLevel = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
        }

        if (audioLevel > 0.05) {
            const chargePotential = audioLevel * phys.audioEnergyMultiplier;
            this.spirits.forEach(spirit => {
                if (Math.random() < chargePotential * 0.1 && spirit.energy < 1.0) {
                    spirit.energy = Math.min(1.0, spirit.energy + chargePotential * 0.2);
                    if (activeTouchStates.length > 0 && spirit.state === 'wandering') {
                        const lastTouch = activeTouchStates[activeTouchStates.length - 1];
                        spirit.color = this.globalVisualizerRef.noteColors[lastTouch.noteInfo.midiNote % 12];
                    }
                }
            });
        }

        // Обновление вспышек опыления
        this.pollinationFlashes = this.pollinationFlashes.filter(flash => {
            flash.age++;
            return flash.age < flash.duration;
        });

        this.spirits.forEach(spirit => {
            spirit.age++;
            spirit.timeInState++;
            spirit.forces.x = 0;
            spirit.forces.y = 0;

            let isInQuietZone = false;
            if (activeTouchStates.length >= 3) {
                const polygonVertices = activeTouchStates.map(touch => ({
                    x: touch.x * this.canvas.width,
                    y: (1 - touch.y) * this.canvas.height
                }));
                if (this._isPointInPolygon({ x: spirit.x, y: spirit.y }, polygonVertices)) {
                    isInQuietZone = true;
                }
            }

            if (!isInQuietZone) {
                spirit.forces.x += windX;
                spirit.forces.y += windY;
            }

            const treeRepulsionStrength = this.settings.treeRepulsion || 0;
            if (treeRepulsionStrength > 0) {
                this.trees.forEach(tree => {
                    const dx = spirit.x - tree.x;
                    const dy = spirit.y - tree.y;
                    const dist = Math.hypot(dx, dy);
                    const effectiveRadius = tree.radius * 1.2; // Немного уменьшил для более близкого взаимодействия
                    if (dist < effectiveRadius && dist > 0) {
                        const force = (1 - dist / effectiveRadius) * treeRepulsionStrength * 0.7; // Увеличил немного силу отталкивания
                        spirit.forces.x += (dx / dist) * force;
                        spirit.forces.y += (dy / dist) * force;
                    }
                });
            }

            this._handleTouchInteractions(spirit, activeTouchStates, inter, phys);

            // --- Взаимодействие дух-дух (передача энергии) ---
            this._handleSpiritToSpiritInteractions(spirit, phys);

            // --- Энергетический мост (2 касания) ---
            if (activeTouchStates.length === 2) {
                this._handleEnergyBridge(spirit, activeTouchStates, inter, phys);
            } else { // Если не мост, то обычное взаимодействие с касаниями
                this._handleTouchInteractions(spirit, activeTouchStates, inter, phys);
            }

            // --- TODO: Всплеск энергии (Pinch-out) ---
            this._handlePinchGesture(activeTouchStates, inter, phys);

            switch (spirit.state) {
                case 'wandering':
                    spirit.energy *= (1 - (1 - phys.friction) * 0.05);
                    if (spirit.energy < 0.01) spirit.energy = 0;
                    // Если дух достаточно заряжен, он может спонтанно искать опыление
                    if (spirit.energy > 0.6 && Math.random() < 0.001 && this.trees.length > 0) {
                        spirit.pollinationTarget = this._findClosestTree(spirit);
                        if (spirit.pollinationTarget) {
                            spirit.state = 'pollinating';
                            spirit.timeInState = 0;
                        }
                    }
                    break;
                case 'following':
                    spirit.energy *= (1 - (1 - phys.friction) * 0.01);
                    if (spirit.energy < 0.01 && !spirit.lastTouchedBy) { // Если энергия иссякла и палец отпущен
                        spirit.state = 'wandering';
                        spirit.timeInState = 0;
                    }
                    break;
                case 'pollinating':
                    if (!spirit.pollinationTarget || !this.trees.includes(spirit.pollinationTarget)) {
                        spirit.pollinationTarget = this._findClosestTree(spirit); // Ищем новую цель если старая невалидна
                        if(!spirit.pollinationTarget) {
                            spirit.state = 'wandering';
                            spirit.timeInState = 0;
                            break;
                        }
                    }

                    const target = spirit.pollinationTarget;
                    const dx = target.x - spirit.x;
                    const dy = target.y - spirit.y;
                    const distToTarget = Math.hypot(dx, dy);

                    if (distToTarget < Math.max(target.radius * 0.3, spirit.size * 2 + 5)) { // Дух достиг дерева
                        this._performPollination(spirit, target);
                    } else {
                        const moveSpeed = this.settings.spirits.baseSpeed * (0.6 + spirit.energy * 0.4); // Скорость к цели зависит от энергии
                        spirit.forces.x += (dx / distToTarget) * moveSpeed;
                        spirit.forces.y += (dy / distToTarget) * moveSpeed;
                        spirit.energy -= inter.pollination.energyCost * 0.005; // Теряет немного энергии при движении к цели
                        if(spirit.energy < 0.05) { // Если энергия кончилась на полпути
                            spirit.state = 'wandering';
                            spirit.timeInState = 0;
                        }
                    }
                    break;
                case 'dying':
                    spirit.size *= 0.96;
                    spirit.baseAlpha *= 0.96;
                    spirit.energy = 0;
                    if (spirit.size < 0.2 || spirit.baseAlpha < 0.02) {
                        spirit.toBeRemoved = true;
                    }
                    break;
            }

            spirit.vx = (spirit.vx + spirit.forces.x) * phys.friction;
            spirit.vy = (spirit.vy + spirit.forces.y) * phys.friction;

            if (isInQuietZone) {
                spirit.vx *= 0.9; // Значительное замедление в зоне спокойствия
                spirit.vy *= 0.9;
                spirit.energy = Math.min(1.0, spirit.energy + 0.001); // Очень медленная зарядка в зоне
            }

            const speed = Math.hypot(spirit.vx, spirit.vy);
            const maxSpeed = this.settings.spirits.baseSpeed * 2; // Например, двойная базовая скорость
            if (speed > maxSpeed) {
                spirit.vx = (spirit.vx / speed) * maxSpeed;
                spirit.vy = (spirit.vy / speed) * maxSpeed;
            }

            spirit.x += spirit.vx;
            spirit.y += spirit.vy;


            // Возвращение на экран (телепортация)
            if (spirit.x < 0) spirit.x = this.canvas.width;
            if (spirit.x > this.canvas.width) spirit.x = 0;
            if (spirit.y < 0) spirit.y = this.canvas.height;
            if (spirit.y > this.canvas.height) spirit.y = 0;
        });

        // Удаление "мертвых" духов и возврат в пул
        let writeIndexSpirits = 0;
        for (let readIndexSpirits = 0; readIndexSpirits < this.spirits.length; readIndexSpirits++) {
            const spirit = this.spirits[readIndexSpirits];
            if (!spirit.toBeRemoved) {
                if (writeIndexSpirits !== readIndexSpirits) {
                    this.spirits[writeIndexSpirits] = spirit;
                }
                writeIndexSpirits++;
            } else {
                spirit.isActiveInPool = false; // Return to pool
            }
        }
        this.spirits.length = writeIndexSpirits;


        // Ограничение максимального количества духов
        const maxSpiritCount = this.settings.spirits.maxCount || 150;
        while (this.spirits.length > maxSpiritCount) {
            // Удаляем самого старого или самого слабого духа (например, с наименьшей энергией и не умирающего)
            let spiritToRemoveIndex = -1;
            let minScore = Infinity;
            for (let i = 0; i < this.spirits.length; i++) {
                const s = this.spirits[i];
                // Ensure s is valid and not already marked for removal by other logic or in pool
                if (s && s.isActiveInPool && s.state !== 'dying') {
                    const score = s.energy + (s.age / 1000);
                    if (score < minScore) {
                        minScore = score;
                        spiritToRemoveIndex = i;
                    }
                }
            }
            if (spiritToRemoveIndex !== -1) {
                const removedSpirit = this.spirits.splice(spiritToRemoveIndex, 1)[0];
                if (removedSpirit) removedSpirit.isActiveInPool = false; // Return to pool
            } else {
                 // If all remaining spirits are 'dying' or some other edge case, try to find any non-dying to remove
                 const nonDyingSpiritIndex = this.spirits.findIndex(s => s && s.isActiveInPool && s.state !== 'dying');
                 if (nonDyingSpiritIndex !== -1) {
                    const removedSpirit = this.spirits.splice(nonDyingSpiritIndex, 1)[0];
                    if (removedSpirit) removedSpirit.isActiveInPool = false; // Return to pool
                 } else {
                    break; // All spirits are dying or pool is managed, nothing more to remove by this rule
                 }
            }
        }
    }

    _handleTouchInteractions(spirit, activeTouchStates, interSettings, physicsSettings) {
        let activelyTouched = false;
        let closestTouchDist = Infinity;
        let currentTouch = null;

        activeTouchStates.forEach(touch => {
            // Предполагаем, что touch.id уникален для каждого активного касания
            // Если нет, можно использовать сам объект или его индекс.
            // Для простоты, если touch.id нет, создадим его на лету (не лучшее решение для продакшена).
            if (touch.id === undefined) touch.id = Math.random().toString(36).substr(2, 9);

            const touchX = touch.x * this.canvas.width;
            const touchY = (1 - touch.y) * this.canvas.height; // Y инвертирован в activeTouchStates
            const dx = touchX - spirit.x;
            const dy = touchY - spirit.y;
            const dist = Math.hypot(dx, dy);

            if (dist < interSettings.touchRadius) {
                activelyTouched = true;
                if (dist < closestTouchDist) {
                    closestTouchDist = dist;
                    currentTouch = touch;
                }

                // Применение силы притяжения
                const forceMagnitude = (1 - dist / interSettings.touchRadius) * interSettings.touchAttraction;
                spirit.forces.x += (dx / dist) * forceMagnitude;
                spirit.forces.y += (dy / dist) * forceMagnitude;

                // Зарядка энергией
                spirit.energy = Math.min(1.0, spirit.energy + interSettings.energyChargeRate);
                spirit.color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12];

                if (spirit.state === 'wandering' || spirit.state === 'pollinating') {
                    spirit.state = 'following';
                    spirit.timeInState = 0;
                }
                spirit.lastTouchedBy = touch.id;
            }
        });

        if (!activelyTouched && spirit.lastTouchedBy) {
            // Палец был отпущен
            if ((spirit.state === 'following' || spirit.energy > 0.5) && this.trees.length > 0) {
                spirit.pollinationTarget = this._findClosestTree(spirit);
                if (spirit.pollinationTarget) {
                    spirit.state = 'pollinating';
                    spirit.timeInState = 0;
                } else {
                    spirit.state = 'wandering'; // Нет деревьев для опыления
                }
            } else if (spirit.state === 'following') { // Если энергии мало или нет деревьев
                 spirit.state = 'wandering';
            }
            spirit.lastTouchedBy = null;
        }
    }

    _findClosestTree(spirit) {
        let closestTree = null;
        let minDistSq = Infinity;

        this.trees.forEach(tree => {
            // Ищем только "активные" деревья, например, на передних слоях
            // if (tree.layer < this.settings.forest.treeLayers - 1) return;

            const dx = tree.x - spirit.x;
            const dy = tree.y - spirit.y; // Учитываем, что y дерева это его центр
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestTree = tree;
            }
        });
        return closestTree;
    }

    _performPollination(spirit, tree) {
        if (spirit.energy < this.settings.interaction.pollination.energyCost * 0.5) { // Нужно достаточно энергии
            spirit.state = 'wandering'; // Не хватило энергии, возвращаемся
            spirit.timeInState = 0;
            return;
        }

        this._createPollinationFlash(tree.x, tree.y - tree.height / 2 + 20, tree.radius); // Вспышка у верхушки дерева

        spirit.energy -= this.settings.interaction.pollination.energyCost;
        if (spirit.energy < 0) spirit.energy = 0;

        spirit.state = 'dying';
        spirit.timeInState = 0;

        // Рождение новых духов
        const newSpiritSettings = this.settings.spirits;
        const pollSettings = this.settings.interaction.pollination;
        for (let i = 0; i < pollSettings.newSpiritsCount; i++) {
            if (this.spirits.length >= (newSpiritSettings.maxCount || 150)) break;

            const newSpirit = this._getSpiritFromPool();
            if (!newSpirit) continue; // Pool depleted

            const angle = Math.random() * Math.PI * 2;
            Object.assign(newSpirit, {
                x: tree.x + Math.cos(angle) * tree.radius * 0.5,
                y: tree.y - tree.height * 0.3 + Math.sin(angle) * tree.radius * 0.3, // Рождаются ближе к кроне
                vx: (Math.random() - 0.5) * newSpiritSettings.baseSpeed * 0.5,
                vy: (Math.random() - 1.5) * newSpiritSettings.baseSpeed * 0.5, // Тенденция лететь вверх сначала
                size: newSpiritSettings.minSize * (0.5 + Math.random() * 0.5), // Маленькие
                baseAlpha: 0.7 + Math.random() * 0.3,
                color: spirit.color, // Наследуют цвет родителя (или дерева?)
                state: 'wandering',
                energy: 0.2 + Math.random() * 0.2, // Начальная энергия новых духов
                pollinationTarget: null,
                age: 0,
                timeInState: 0,
                lastTouchedBy: null,
                forces: { x: 0, y: 0 }
                // isActiveInPool is already true
            });
            this.spirits.push(newSpirit);
        }
    }

    _createPollinationFlash(x, y, radius) {
        this.pollinationFlashes.push({
            x: x,
            y: y,
            radius: radius * (1.5 + Math.random() * 0.5),
            alpha: 0.8,
            age: 0,
            duration: this.settings.interaction.pollination.flashDurationMs / (1000/60), // в кадрах (при 60 FPS)
            color: this.themeColors.accent || '#FFFFFF'
        });
    }

    _drawPollinationFlashes() {
        this.ctx.globalCompositeOperation = 'lighter'; // Яркие вспышки
        this.pollinationFlashes.forEach(flash => {
            const currentRadius = flash.radius * (flash.age / flash.duration);
            const currentAlpha = flash.alpha * (1 - flash.age / flash.duration);
            this.ctx.beginPath();
            this.ctx.arc(flash.x, flash.y, currentRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(flash.color, currentAlpha);
            this.ctx.fill();
        });
        this.ctx.globalCompositeOperation = 'source-over'; // Возвращаем стандартный режим
    }

    _handleEnergyBridge(spirit, activeTouchStates, interSettings, physicsSettings) {
        const t1 = activeTouchStates[0];
        const t2 = activeTouchStates[1];

        const p1x = t1.x * this.canvas.width;
        const p1y = (1 - t1.y) * this.canvas.height;
        const p2x = t2.x * this.canvas.width;
        const p2y = (1 - t2.y) * this.canvas.height;

        // Вектор линии моста
        const lineDx = p2x - p1x;
        const lineDy = p2y - p1y;
        const lineLengthSq = lineDx * lineDx + lineDy * lineDy;

        if (lineLengthSq === 0) return; // Точки касания в одном месте

        // Проекция точки духа на линию моста
        // t = [(spirit.x - p1x) * lineDx + (spirit.y - p1y) * lineDy] / lineLengthSq
        const t = ((spirit.x - p1x) * lineDx + (spirit.y - p1y) * lineDy) / lineLengthSq;

        let closestPointX, closestPointY;
        if (t < 0) { // Ближайшая точка - p1
            closestPointX = p1x;
            closestPointY = p1y;
        } else if (t > 1) { // Ближайшая точка - p2
            closestPointX = p2x;
            closestPointY = p2y;
        } else { // Ближайшая точка на отрезке
            closestPointX = p1x + t * lineDx;
            closestPointY = p1y + t * lineDy;
        }

        const distToLineX = closestPointX - spirit.x;
        const distToLineY = closestPointY - spirit.y;
        const distToLine = Math.hypot(distToLineX, distToLineY);

        const bridgeAttractionRadius = interSettings.touchRadius * 1.5; // Духи притягиваются к мосту с большего расстояния

        if (distToLine < bridgeAttractionRadius) {
            // Сила притяжения к ближайшей точке на линии
            const attractionStrength = (1 - distToLine / bridgeAttractionRadius) * interSettings.touchAttraction * 0.5; // Немного слабее, чем к пальцу
            spirit.forces.x += (distToLineX / distToLine) * attractionStrength;
            spirit.forces.y += (distToLineY / distToLine) * attractionStrength;

            // Сила движения вдоль линии (например, к центру моста или от одного конца к другому)
            // Для простоты, пусть движутся к центру моста
            const midPointX = p1x + lineDx * 0.5;
            const midPointY = p1y + lineDy * 0.5;
            const dxToMid = midPointX - spirit.x;
            const dyToMid = midPointY - spirit.y;
            const distToMid = Math.hypot(dxToMid, dyToMid);

            if (distToMid > 5) { // Чтобы не дрожали у центра
                 const flowStrength = 0.1 * spirit.energy; // Сила потока зависит от энергии духа
                 spirit.forces.x += (dxToMid / distToMid) * flowStrength;
                 spirit.forces.y += (dyToMid / distToMid) * flowStrength;
            }

            // Духи на мосту могут обмениваться энергией или заряжаться от моста
            spirit.energy = Math.min(1.0, spirit.energy + interSettings.energyChargeRate * 0.1); // Слабая зарядка от моста
            // Можно также менять цвет в зависимости от ближайшей точки касания
             if (t < 0.5 && t1.noteInfo) spirit.color = this.globalVisualizerRef.noteColors[t1.noteInfo.midiNote % 12];
             else if (t2.noteInfo) spirit.color = this.globalVisualizerRef.noteColors[t2.noteInfo.midiNote % 12];


            if (spirit.state === 'wandering') {
                 spirit.state = 'following'; // Используем 'following' как общее состояние "под влиянием касания"
                 spirit.timeInState = 0;
            }
            // lastTouchedBy здесь не так важен, т.к. это взаимодействие с мостом, а не с одним пальцем
            spirit.lastTouchedBy = null;
        }
    }

    _handleSpiritToSpiritInteractions(currentSpirit, physicsSettings) {
        if (currentSpirit.energy < 0.3 || currentSpirit.state === 'dying') return; // Только достаточно заряженные могут делиться

        const energyTransferAmount = 0.1 * currentSpirit.energy; // Сколько энергии передается за раз
        const interactionRadius = currentSpirit.size * 5; // Радиус для передачи энергии

        this.spirits.forEach(otherSpirit => {
            if (currentSpirit === otherSpirit || otherSpirit.state === 'dying') return;

            const dx = otherSpirit.x - currentSpirit.x;
            const dy = otherSpirit.y - currentSpirit.y;
            const dist = Math.hypot(dx, dy);

            if (dist < interactionRadius && otherSpirit.energy < currentSpirit.energy) {
                // Передача энергии
                otherSpirit.energy = Math.min(1.0, otherSpirit.energy + energyTransferAmount);
                currentSpirit.energy -= energyTransferAmount * 0.5; // Отдающий теряет чуть меньше, чтобы не истощиться мгновенно

                // Визуальный эффект (можно добавить маленькую вспышку или изменение цвета)
                otherSpirit.color = currentSpirit.color; // Принимающий может временно изменить цвет

                // Можно добавить небольшое отталкивание, чтобы они не слипались
                const pushForce = 0.05;
                currentSpirit.forces.x -= (dx / dist) * pushForce;
                currentSpirit.forces.y -= (dy / dist) * pushForce;
                otherSpirit.forces.x += (dx / dist) * pushForce;
                otherSpirit.forces.y += (dy / dist) * pushForce;

                if (currentSpirit.energy < 0.01) currentSpirit.energy = 0;
            }
        });
    }

    _drawSpirits() {
        this.spirits.forEach(spirit => {
            // Размер и цвет зависят от энергии
            const energyRatio = Math.min(1, spirit.energy * 2); // Усиление влияния энергии на размер/яркость
            const size = spirit.size * (1 + energyRatio * 0.5); // Духи становятся больше с энергией
            const color = spirit.energy > 0.01 ? spirit.color : this.themeColors.primary; // Используем цвет духа если есть энергия
            // Альфа зависит от базовой альфы и энергии, но не становится полностью непрозрачной только из-за энергии
            const alpha = spirit.baseAlpha * (1 + energyRatio * 0.2);

            // Рисуем шлейф
            this.ctx.beginPath();
            this.ctx.moveTo(spirit.x, spirit.y);
            this.ctx.lineTo(spirit.x - spirit.vx * 5, spirit.y - spirit.vy * 5);
            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(color, alpha * 0.5);
            this.ctx.lineWidth = size;
            this.ctx.stroke();

            // Рисуем "голову" духа
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(color, alpha);
            this.ctx.beginPath();
            this.ctx.arc(spirit.x, spirit.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    _drawTouchInteractions(activeTouchStates) {
        const bridgeSettings = this.settings.interaction.multiTouchBridge;

        if (activeTouchStates.length === 2) { // Только для двух касаний (энергетический мост)
            const p1 = activeTouchStates[0];
            const p2 = activeTouchStates[1];
            const x1 = p1.x * this.canvas.width;
            const y1 = (1 - p1.y) * this.canvas.height;
            const x2 = p2.x * this.canvas.width;
            const y2 = (1 - p2.y) * this.canvas.height;

            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';

            // Основная линия моста
            this.ctx.lineWidth = bridgeSettings.lineWidth;
            const grad = this.ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(this.globalVisualizerRef.noteColors[p1.noteInfo.midiNote % 12], 0.8));
            grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(this.globalVisualizerRef.noteColors[p2.noteInfo.midiNote % 12], 0.8));
            this.ctx.strokeStyle = grad;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();

            // Эффект свечения для моста
            if (bridgeSettings.glow > 0) {
                this.ctx.shadowBlur = bridgeSettings.glow;
                this.ctx.shadowColor = grad; // Используем тот же градиент для тени (свечения)
                this.ctx.stroke(); // Рисуем еще раз для эффекта свечения поверх
            }
            this.ctx.restore();

        } else if (activeTouchStates.length > 2) { // Для 3+ касаний рисуем полигон "Зоны Спокойствия"
            this.ctx.beginPath();
            const firstPoint = activeTouchStates[0];
            this.ctx.moveTo(firstPoint.x * this.canvas.width, (1 - firstPoint.y) * this.canvas.height);
            for (let i = 1; i < activeTouchStates.length; i++) {
                const p = activeTouchStates[i];
                this.ctx.lineTo(p.x * this.canvas.width, (1 - p.y) * this.canvas.height);
            }
            this.ctx.closePath();

            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.accent || '#00FFFF', 0.05);
            this.ctx.fill();
            this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(this.themeColors.accent || '#00FFFF', 0.2);
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        // Если activeTouchStates.length < 2, ничего не рисуем (старое поведение)
    }

    _isPointInPolygon(point, polygonVertices) {
        // Алгоритм пересечения лучей (Ray Casting Algorithm)
        let intersections = 0;
        const numVertices = polygonVertices.length;
        const x = point.x;
        const y = point.y;

        for (let i = 0; i < numVertices; i++) {
            const p1 = polygonVertices[i];
            const p2 = polygonVertices[(i + 1) % numVertices]; // Следующая вершина, замыкаем полигон

            // Проверяем, пересекает ли горизонтальный луч, идущий из точки вправо, ребро (p1, p2)
            // Условие 1: y-координата точки должна быть между y-координатами вершин ребра
            if (((p1.y <= y && y < p2.y) || (p2.y <= y && y < p1.y)) &&
                // Условие 2: x-координата точки пересечения луча с продолжением ребра должна быть справа от точки
                (x < (p2.x - p1.x) * (y - p1.y) / (p2.y - p1.y) + p1.x)) {
                intersections++;
            }
        }
        // Если число пересечений нечетное, точка внутри полигона
        return intersections % 2 === 1;
    }

    _handlePinchGesture(activeTouchStates, interSettings, physicsSettings) {
        const pinchSettings = interSettings.pinchExplosion;

        if (activeTouchStates.length === 2) {
            const t1 = activeTouchStates[0];
            const t2 = activeTouchStates[1];

            const p1x = t1.x * this.canvas.width;
            const p1y = (1 - t1.y) * this.canvas.height;
            const p2x = t2.x * this.canvas.width;
            const p2y = (1 - t2.y) * this.canvas.height;

            const currentDist = Math.hypot(p2x - p1x, p2y - p1y);
            const centerX = (p1x + p2x) / 2;
            const centerY = (p1y + p2y) / 2;

            const now = performance.now();

            if (this.lastTwoTouchState && this.lastTwoTouchState.touches.length === 2) {
                const lastDist = this.lastTwoTouchState.dist;
                const timeDiff = now - this.lastTwoTouchState.timestamp;

                // Порог скорости изменения расстояния для срабатывания жеста (пикселей в миллисекунду)
                const pinchSpeedThreshold = 1.5; // Нужно будет подобрать экспериментально

                if (timeDiff > 10 && timeDiff < 200) { // Жест должен быть достаточно быстрым, но не мгновенным
                    const distChangeSpeed = (currentDist - lastDist) / timeDiff;

                    if (distChangeSpeed > pinchSpeedThreshold && currentDist > lastDist + 30 ) { // Увеличилось расстояние + скорость достаточная
                        // Pinch-out detected!
                        console.log("[SpiritForestRenderer] Pinch-out detected!");
                        this.spirits.forEach(spirit => {
                            const dx = spirit.x - centerX;
                            const dy = spirit.y - centerY;
                            const distToCenter = Math.hypot(dx, dy);

                            if (distToCenter < pinchSettings.radius) {
                                // Мгновенно заряжаем духа
                                spirit.energy = Math.min(1.0, spirit.energy + 0.8); // Сильный заряд
                                if (t1.noteInfo) spirit.color = this.globalVisualizerRef.noteColors[t1.noteInfo.midiNote % 12]; // Цвет от одного из пальцев

                                // Придаем импульс от центра
                                const impulseStrength = pinchSettings.strength * (1 - distToCenter / pinchSettings.radius);
                                if (distToCenter > 0) { // Избегаем деления на ноль, если дух в центре
                                    spirit.vx += (dx / distToCenter) * impulseStrength;
                                    spirit.vy += (dy / distToCenter) * impulseStrength;
                                } else { // Если дух в центре, даем случайный импульс
                                    const randomAngle = Math.random() * Math.PI * 2;
                                    spirit.vx += Math.cos(randomAngle) * impulseStrength;
                                    spirit.vy += Math.sin(randomAngle) * impulseStrength;
                                }
                                if(spirit.state === 'wandering') {
                                    spirit.state = 'following'; // Переводим в активное состояние
                                    spirit.timeInState = 0;
                                }
                            }
                        });
                        this.lastTwoTouchState = null; // Сбрасываем состояние, чтобы жест не срабатывал повторно сразу
                        return; // Выходим, чтобы не обновлять lastTwoTouchState в этом кадре
                    }
                }
            }

            this.lastTwoTouchState = {
                touches: [ // Сохраняем копии, а не ссылки, если activeTouchStates может меняться
                    { x: t1.x, y: t1.y, id: t1.id },
                    { x: t2.x, y: t2.y, id: t2.id }
                ],
                dist: currentDist,
                centerX: centerX,
                centerY: centerY,
                timestamp: now
            };

        } else {
            this.lastTwoTouchState = null; // Сбрасываем, если не два касания
        }
    }

    dispose() {
        this.spirits = [];
        this.trees = [];
        this.pollinationFlashes = [];
        this.lastTwoTouchState = null;

        // Return all spirits to the pool
        this.spirits.forEach(s => { if (s.isActiveInPool) s.isActiveInPool = false; });
        this.spirits = [];
        // Optionally, fully clear the pool array itself if re-init always rebuilds it
        // this.spiritPool = [];
        console.log("[SpiritForestRenderer v2.1-pool] Disposed.");
    }
}

// Отладочная глобальная регистрация
if (typeof window !== 'undefined') {
    window.SpiritForestRenderer = SpiritForestRenderer;
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('SpiritForestRenderer', SpiritForestRenderer);
}