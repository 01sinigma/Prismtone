// Файл: app/src/main/assets/js/touchEffects/viscousDropEffect.js
// ВЕРСИЯ 1.0: Эффект вязкой капли, реагирующей на гироскоп и оставляющей шлейф.

class ViscousDropEffect {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        // Map<touchId, DropObject>
        // DropObject: { x, y, radius, color, vx, vy, trail: [{x,y,size}], isActive, ... }
        this.activeDrops = new Map();
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = {
            // Дефолтные настройки физики
            baseRadius: 20,
            radiusYMultiplier: 15,
            gravityStrength: 0.4,   // Сила "стекания" от наклона
            friction: 0.96,         // Трение, замедляющее каплю
            elasticity: 0.1,        // Насколько сильно капля "прилипает" к пальцу
            trailLength: 40,        // Максимальное количество сегментов в шлейфе
            trailFadeSpeed: 0.95,   // Как быстро исчезает шлейф
            ...initialSettings
        };
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.activeDrops.clear();
        console.log("[ViscousDropEffect v1.0] Initialized.");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    _getColor(noteInfo) {
        // Цвет капли может зависеть от ноты
        if (this.settings.colorSource === 'note' && noteInfo?.midiNote !== undefined && this.globalVisualizerRef.noteColors?.length > 0) {
            return this.globalVisualizerRef.noteColors[noteInfo.midiNote % 12];
        }
        return this.themeColors.accent || '#FFFFFF';
    }

    onTouchDown(touchData) {
        if (!this.canvas) return;
        const x = touchData.x * this.canvas.width;
        const y = (1 - touchData.y) * this.canvas.height;

        const drop = {
            id: touchData.id,
            targetX: x, targetY: y, // Позиция пальца
            x: x, y: y,             // Текущая позиция капли
            vx: 0, vy: 0,           // Скорость капли
            radius: this.settings.baseRadius + touchData.y * this.settings.radiusYMultiplier,
            color: this._getColor(touchData.noteInfo),
            trail: [],
            isActive: true
        };
        this.activeDrops.set(touchData.id, drop);
    }

    onTouchMove(touchData) {
        const drop = this.activeDrops.get(touchData.id);
        if (drop && this.canvas) {
            // Обновляем только целевую позицию (где палец)
            drop.targetX = touchData.x * this.canvas.width;
            drop.targetY = (1 - touchData.y) * this.canvas.height;
            drop.radius = this.settings.baseRadius + touchData.y * this.settings.radiusYMultiplier;
            // Цвет может меняться при смене ноты
            drop.color = this._getColor(touchData.noteInfo);
        }
    }

    onTouchUp(touchId) {
        const drop = this.activeDrops.get(touchId);
        if (drop) {
            drop.isActive = false; // Капля больше не привязана к пальцу
        }
    }

    drawActiveEffects() {
        if (!this.ctx || !this.canvas || this.activeDrops.size === 0) return;

        const deviceTilt = app.state.deviceTilt;
        const gravityX = (deviceTilt.roll / 90) * this.settings.gravityStrength;
        const gravityY = (deviceTilt.pitch / 90) * this.settings.gravityStrength;

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.activeDrops.forEach((drop, id) => {
            // --- 1. Физика капли ---

            if (drop.isActive) {
                // Если палец на экране, капля стремится к нему (эластичность)
                const dx = drop.targetX - drop.x;
                const dy = drop.targetY - drop.y;
                drop.vx += dx * this.settings.elasticity;
                drop.vy += dy * this.settings.elasticity;
            }

            // Применяем гравитацию от наклона устройства
            drop.vx += gravityX;
            drop.vy += gravityY;

            // Применяем трение
            drop.vx *= this.settings.friction;
            drop.vy *= this.settings.friction;

            // Двигаем каплю
            drop.x += drop.vx;
            drop.y += drop.vy;

            // Добавляем текущую позицию в начало шлейфа
            drop.trail.unshift({ x: drop.x, y: drop.y, radius: drop.radius });

            // Ограничиваем длину шлейфа
            if (drop.trail.length > this.settings.trailLength) {
                drop.trail.pop();
            }

            // --- 2. Отрисовка шлейфа и капли ---
            if (drop.trail.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(drop.trail[0].x, drop.trail[0].y);

                for (let i = 1; i < drop.trail.length; i++) {
                    const p1 = drop.trail[i-1];
                    const p2 = drop.trail[i];
                    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    this.ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
                }

                // Создаем градиент вдоль шлейфа
                const grad = this.ctx.createLinearGradient(drop.trail[0].x, drop.trail[0].y, drop.trail[drop.trail.length-1].x, drop.trail[drop.trail.length-1].y);
                grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(drop.color, 0.7));
                grad.addColorStop(1, this.globalVisualizerRef.getColorWithAlpha(drop.color, 0));

                this.ctx.strokeStyle = grad;
                // Ширина линии уменьшается к концу шлейфа
                this.ctx.lineWidth = drop.radius * 2;
                this.ctx.stroke();
            }

            // Если капля отпущена и шлейф почти исчез, удаляем ее
            if (!drop.isActive && drop.trail.length < 2) {
                this.activeDrops.delete(id);
            }
        });
    }

    dispose() {
        this.activeDrops.clear();
    }
}

// Саморегистрация
if (typeof visualizer !== 'undefined' && visualizer.registerTouchEffectRenderer) {
    visualizer.registerTouchEffectRenderer('ViscousDropEffect', ViscousDropEffect);
}