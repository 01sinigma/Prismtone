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

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this._isForestDirty = true;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            spiritCount: 200,
            windStrength: 0.2,
            treeRepulsion: 1.5, // Сила "обтекания" деревьев
            touchAttraction: 0.8,
            touchRadius: 180,
            tapRepulsion: 8,     // Сила выброса при тапе
            energyGainRate: 0.1,    // Как быстро звук заряжает духов
            energyDecayRate: 0.995, // Как быстро духи теряют заряд
            treeLayers: 4,
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        this.onResize();
        console.log("[SpiritForestRenderer v2.0] Initialized with advanced physics.");
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
        // ... (код создания частиц-духов, как в предыдущей реализации) ...
    }

    _renderStaticForest() {
        // ... (код отрисовки многослойного леса на offscreen-холст) ...
        // >>> NEW: Сохраняем позиции деревьев как препятствия <<<
        this.trees = [];
        // ... внутри цикла генерации деревьев ...
        // this.trees.push({ x: x, y: height, radius: treeWidth / 2 });
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

        this.ctx.globalCompositeOperation = 'source-over';
    }

    _updatePhysics(audioData, activeTouchStates, deviceTilt) {
        const windX = (deviceTilt.roll / 90) * this.settings.windStrength;
        const windY = (deviceTilt.pitch / 90) * this.settings.windStrength;

        let audioEnergy = 0;
        if (this.analyserNodeRef && audioData) {
            audioEnergy = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
        }

        // Заряжаем духов от звука
        if (audioEnergy > 0.1) {
            const chargeCount = Math.floor(audioEnergy * this.settings.energyGainRate * this.spirits.length);
            for (let i = 0; i < chargeCount; i++) {
                const spirit = this.spirits[Math.floor(Math.random() * this.spirits.length)];
                if (!spirit.isCharged) {
                    spirit.isCharged = true;
                    spirit.charge = 1.0;
                    // Цвет назначается от последнего активного касания, если оно есть
                    if (activeTouchStates.length > 0) {
                        const lastTouch = activeTouchStates[activeTouchStates.length - 1];
                        spirit.color = this.globalVisualizerRef.noteColors[lastTouch.noteInfo.midiNote % 12];
                    }
                }
            }
        }

        this.spirits.forEach(spirit => {
            let totalForceX = windX;
            let totalForceY = windY;

            // Отталкивание от деревьев (турбулентность)
            this.trees.forEach(tree => {
                const dx = spirit.x - tree.x;
                const dy = spirit.y - tree.y;
                const dist = Math.hypot(dx, dy);
                if (dist < tree.radius * 2) {
                    const force = (1 - dist / (tree.radius * 2)) * this.settings.treeRepulsion;
                    totalForceX += (dx / dist) * force;
                    totalForceY += (dy / dist) * force;
                }
            });

            // Притяжение к удерживаемым пальцам
            activeTouchStates.forEach(touch => {
                // ... (логика притяжения) ...
            });

            spirit.vx = (spirit.vx + totalForceX) * 0.98;
            spirit.vy = (spirit.vy + totalForceY) * 0.98;
            spirit.x += spirit.vx;
            spirit.y += spirit.vy;

            // Затухание заряда
            if (spirit.isCharged) {
                spirit.charge *= this.settings.energyDecayRate;
                if (spirit.charge < 0.01) spirit.isCharged = false;
            }

            // Возвращение на экран
            // ...
        });
    }

    _drawSpirits() {
        this.spirits.forEach(spirit => {
            const size = spirit.size * (spirit.isCharged ? 1 + spirit.charge : 1);
            const color = spirit.isCharged ? spirit.color : this.themeColors.primary;
            const alpha = spirit.baseAlpha * (spirit.isCharged ? 0.5 + spirit.charge * 0.5 : 1);

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
        if (activeTouchStates.length < 2) return;

        this.ctx.lineWidth = 1.5;
        for (let i = 0; i < activeTouchStates.length; i++) {
            for (let j = i + 1; j < activeTouchStates.length; j++) {
                const p1 = activeTouchStates[i];
                const p2 = activeTouchStates[j];
                const x1 = p1.x * this.canvas.width;
                const y1 = (1 - p1.y) * this.canvas.height;
                const x2 = p2.x * this.canvas.width;
                const y2 = (1 - p2.y) * this.canvas.height;

                const grad = this.ctx.createLinearGradient(x1, y1, x2, y2);
                grad.addColorStop(0, this.globalVisualizerRef.noteColors[p1.noteInfo.midiNote % 12]);
                grad.addColorStop(1, this.globalVisualizerRef.noteColors[p2.noteInfo.midiNote % 12]);
                this.ctx.strokeStyle = grad;

                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
        }
    }

    dispose() {
        this.spirits = [];
        this.trees = [];
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerRenderer) {
    visualizer.registerRenderer('SpiritForestRenderer', SpiritForestRenderer);
}