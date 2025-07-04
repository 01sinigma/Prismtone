class GeometricShardsEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {
            colorSource: 'note', emitRate: 15, maxActiveShardsPerTouch: 50,
            shardTypes: ["triangle", "rectangle", "line"], shardMaxSize: 18, shardMinSize: 5,
            shardLife: 800, launchSpeedBase: 0.5, launchSpeedYMultiplier: 1.5,
            rotationSpeed: 0.03, shrinkFactor: 0.98, fadeOutFactor: 0.97,
            gravity: 0.02, baseOpacity: 0.9, compositeOperation: 'lighter',
            fadeDurationOnUp: 300,
            shardPoolSize: 200 // Default pool size
        };
        this.themeColors = {};
        // activeTouches: Map<touchId, TouchData>
        // TouchData: { x, y, currentY, color, isActive, shards: Array<ShardObject>, lastEmitTime, fadeStartTime }
        // ShardObject: { x, y, vx, vy, life, initialLife, rotation, rotationSpeed, size, initialSize, type, opacity, color, isActiveInPool }
        this.activeTouches = new Map();
        this.globalVisualizerRef = null;
        this.lastDrawTime = performance.now();

        this.shardPool = [];
        this.poolSize = this.settings.shardPoolSize; // Will be updated in init
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = { ...this.settings, ...initialSettings };
        this.themeColors = themeColors;
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeTouches.clear();
        this.lastDrawTime = performance.now();

        // Initialize or re-initialize the shard pool
        this.poolSize = this.settings.shardPoolSize || 200;
        this.shardPool = [];
        for (let i = 0; i < this.poolSize; i++) {
            this.shardPool.push({ isActiveInPool: false });
        }
        console.log(`[GeometricShardsEffect v1.2-pool] Initialized with pool size: ${this.poolSize}`, this.settings);
    }

    _getShardFromPool() {
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.shardPool[i].isActiveInPool) {
                this.shardPool[i].isActiveInPool = true;
                return this.shardPool[i];
            }
        }
        // Pool depleted, create a new object (less ideal, but handles overflow)
        // This new object won't be part of the fixed-size pool for return,
        // effectively making the pool a minimum guarantee rather than a strict cap.
        // Alternatively, log a warning and return null, causing fewer shards.
        console.warn("[GeometricShardsEffect] Shard pool depleted. Consider increasing pool size.");
        const newShard = { isActiveInPool: true }; // Mark it as active as if it came from the pool
        // this.shardPool.push(newShard); // Optionally dynamically grow pool, but changes fixed-size nature
        // this.poolSize = this.shardPool.length;
        return newShard;
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        this.activeTouches.forEach(touch => {
            if (this.settings.colorSource !== 'note') {
                touch.color = this._getBaseColor(null); // Обновить цвет, если не от ноты
            }
        });
    }

    onSettingsChange(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    _getBaseColor(noteInfo) {
        let color = this.themeColors.primary || '#007bff';
        if (this.settings.colorSource === 'accent') {
            color = this.themeColors.accent || '#FF00FF';
        } else if (this.settings.colorSource === 'note' && noteInfo?.midiNote !== undefined) {
            const noteIndex = noteInfo.midiNote % 12;
            color = (this.globalVisualizerRef?.noteColors || {})[noteIndex] || color;
        }
        return color;
    }

    _createShard(touchSystem) {
        const angle = Math.random() * Math.PI * 2;
        const speed = this.settings.launchSpeedBase + touchSystem.currentY * this.settings.launchSpeedYMultiplier;
        const size = Math.random() * (this.settings.shardMaxSize - this.settings.shardMinSize) + this.settings.shardMinSize;
        const type = this.settings.shardTypes[Math.floor(Math.random() * this.settings.shardTypes.length)];

        const shard = this._getShardFromPool();
        if (!shard) return null; // Pool might be depleted and configured to return null

        // Assign properties
        shard.x = touchSystem.x;
        shard.y = touchSystem.y;
        shard.vx = Math.cos(angle) * speed * (0.5 + Math.random() * 0.5);
        shard.vy = Math.sin(angle) * speed * (0.5 + Math.random() * 0.5);
        shard.life = this.settings.shardLife;
        shard.initialLife = this.settings.shardLife;
        shard.rotation = Math.random() * Math.PI * 2;
        shard.rotationSpeed = (Math.random() - 0.5) * this.settings.rotationSpeed * 2;
        shard.size = size;
        shard.initialSize = size;
        shard.type = type;
        shard.opacity = this.settings.baseOpacity;
        shard.color = touchSystem.color; // Осколок наследует цвет системы касания
        // isActiveInPool is already true from _getShardFromPool
        return shard;
    }

    onTouchDown(touchData) {
        if (!this.ctx || !this.canvas) return;

        const x = touchData.x * this.canvas.width;
        const y = (1 - touchData.y) * this.canvas.height;

        let touchSystem = this.activeTouches.get(touchData.id);
        if (touchSystem) { // Если касание уже было (например, быстрое перекасание)
            touchSystem.x = x;
            touchSystem.y = y;
            touchSystem.currentY = touchData.y;
            touchSystem.isActive = true;
            touchSystem.fadeStartTime = 0; // Сбросить затухание
            touchSystem.color = this._getBaseColor(touchData.noteInfo); // Обновить цвет
        } else {
            touchSystem = {
                id: touchData.id,
                x: x,
                y: y,
                currentY: touchData.y,
                color: this._getBaseColor(touchData.noteInfo),
                isActive: true,
                shards: [],
                lastEmitTime: performance.now(),
                fadeStartTime: 0
            };
            this.activeTouches.set(touchData.id, touchSystem);
        }
        // Эмиттируем начальную пачку осколков
        const initialEmitCount = Math.floor(this.settings.emitRate / 4) + 1; // Например, четверть секунды эмиссии сразу
        for (let i = 0; i < initialEmitCount; i++) {
            if (touchSystem.shards.length < this.settings.maxActiveShardsPerTouch) {
                const newShard = this._createShard(touchSystem);
                if (newShard) { // Check if shard creation was successful (pool not depleted)
                    touchSystem.shards.push(newShard);
                } else {
                    break; // Stop trying if pool is empty
                }
            }
        }
    }

    onTouchMove(touchData) {
        const touchSystem = this.activeTouches.get(touchData.id);
        if (touchSystem && touchSystem.isActive) {
            touchSystem.x = touchData.x * this.canvas.width;
            touchSystem.y = (1 - touchData.y) * this.canvas.height;
            touchSystem.currentY = touchData.y;
            // Обновляем цвет, если он зависит от ноты
            if (this.settings.colorSource === 'note') {
                touchSystem.color = this._getBaseColor(touchData.noteInfo);
            }
        }
    }

    onTouchUp(touchId) {
        const touchSystem = this.activeTouches.get(touchId);
        if (touchSystem) {
            touchSystem.isActive = false;
            touchSystem.fadeStartTime = performance.now();
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeTouches.size === 0 || !this.globalVisualizerRef) return;

        const now = performance.now();
        const deltaTime = Math.min(33, now - this.lastDrawTime); // мс, ограничиваем для стабильности
        this.lastDrawTime = now;

        this.ctx.globalCompositeOperation = this.settings.compositeOperation;

        this.activeTouches.forEach((touchSystem, touchId) => {
            // 1. Эмиссия новых осколков, если касание активно
            if (touchSystem.isActive) {
                const emitInterval = 1000 / this.settings.emitRate; // мс
                if (now - touchSystem.lastEmitTime >= emitInterval) {
                    const numToEmit = Math.floor((now - touchSystem.lastEmitTime) / emitInterval);
                    for (let i = 0; i < numToEmit; i++) {
                        if (touchSystem.shards.length < this.settings.maxActiveShardsPerTouch) {
                            const newShard = this._createShard(touchSystem); // Already uses pool
                            if (newShard) {
                                touchSystem.shards.push(newShard);
                            } else {
                                break; // Pool depleted
                            }
                        } else {
                            break; // Достигнут лимит
                        }
                    }
                    touchSystem.lastEmitTime = now;
                }
            }

            // 2. Обновление и отрисовка существующих осколков
            let writeIndex = 0;
            for (let readIndex = 0; readIndex < touchSystem.shards.length; readIndex++) {
                const shard = touchSystem.shards[readIndex];

                shard.x += shard.vx * (deltaTime / 16.66); // Нормализация по времени
                shard.y += shard.vy * (deltaTime / 16.66);
                shard.vy += this.settings.gravity * (deltaTime / 16.66);
                shard.rotation += shard.rotationSpeed * (deltaTime / 16.66);
                shard.life -= deltaTime;

                if (touchSystem.isActive) { // Если касание активно
                    shard.size *= Math.pow(this.settings.shrinkFactor, deltaTime / 16.66);
                    shard.opacity *= Math.pow(this.settings.fadeOutFactor, deltaTime / 16.66);
                } else { // Если касание отпущено, ускоряем затухание
                    const fadeProgress = Math.min((now - touchSystem.fadeStartTime) / this.settings.fadeDurationOnUp, 1);
                    shard.opacity *= (1 - fadeProgress);
                    shard.size *= (1 - fadeProgress * 0.5); // Уменьшаются быстрее
                }

                let isAlive = true;
                if (shard.life <= 0 || shard.opacity <= 0.01 || shard.size < 0.5) {
                    isAlive = false;
                    shard.isActiveInPool = false; // Return to pool
                }

                if (isAlive) {
                    this.ctx.save();
                this.ctx.translate(shard.x, shard.y);
                this.ctx.rotate(shard.rotation);

                this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(shard.color, shard.opacity);

                // Опциональная обводка
                if (this.settings.strokeWidth > 0) {
                    this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(shard.color, shard.opacity * 0.7);
                    this.ctx.lineWidth = this.settings.strokeWidth;
                }


                if (shard.type === 'triangle') {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -shard.size / 1.5); // Более вытянутый треугольник
                    this.ctx.lineTo(shard.size / 2, shard.size / 3);
                    this.ctx.lineTo(-shard.size / 2, shard.size / 3);
                    this.ctx.closePath();
                } else if (shard.type === 'rectangle') {
                    this.ctx.beginPath();
                    this.ctx.rect(-shard.size / 1.5, -shard.size / 3, shard.size * 1.33, shard.size * 0.66); // Более тонкий
                } else if (shard.type === 'line') {
                    this.ctx.beginPath();
                    this.ctx.moveTo(-shard.size / 2, 0);
                    this.ctx.lineTo(shard.size / 2, 0);
                     // Для линии используем stroke вместо fill для видимости
                    this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(shard.color, shard.opacity);
                    this.ctx.lineWidth = Math.max(1, shard.size / 4); // Толщина линии
                    this.ctx.stroke();
                    this.ctx.restore();
                    if (writeIndex !== readIndex) {
                        touchSystem.shards[writeIndex] = shard;
                    }
                    writeIndex++;
                    continue; // Для линии fill не нужен, переходим к следующему
                }

                this.ctx.fill();
                if (this.settings.strokeWidth > 0) this.ctx.stroke();
                this.ctx.restore();

                if (writeIndex !== readIndex) {
                    touchSystem.shards[writeIndex] = shard;
                }
                writeIndex++;
                }
            }
            touchSystem.shards.length = writeIndex;


            // Если касание отпущено и все осколки исчезли, удаляем систему
            if (!touchSystem.isActive && touchSystem.shards.length === 0) {
                this.activeTouches.delete(touchId);
            }
        });
        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.activeTouches.clear();
        // Explicitly mark all pooled objects as inactive, though re-init should also handle this.
        for (const shard of this.shardPool) {
            shard.isActiveInPool = false;
        }
        // this.shardPool = []; // Optionally, fully clear and let init rebuild. Keeps it simpler.
        this.ctx = null;
        this.canvas = null;
        console.log("[GeometricShardsEffect v1.2-pool] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerTouchEffectRenderer === 'function') {
    visualizer.registerTouchEffectRenderer('GeometricShardsEffect', GeometricShardsEffect);
} else {
    window.GeometricShardsEffect = GeometricShardsEffect;
    console.warn('[GeometricShardsEffect v1.2-pool] Registered globally.');
}