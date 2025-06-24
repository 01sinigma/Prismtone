// Файл: app/src/main/assets/js/visualizers/InkInZeroGRenderer.js

class InkInZeroGRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        this.drops = [];
        this.maxDrops = 30;
        this.minDropSize = 20;
        this.maxDropSize = 100;
        this.dropColors = [ // Базовые цвета для капель, будут ассоциированы с нотами
            'rgba(255, 0, 80, 0.7)',   // Ярко-розовый / Маджента
            'rgba(0, 150, 255, 0.7)', // Ярко-синий / Циан
            'rgba(255, 220, 0, 0.7)', // Ярко-желтый
            'rgba(0, 200, 100, 0.7)', // Изумрудный / Зеленый
            'rgba(255, 100, 0, 0.7)', // Оранжевый
            'rgba(180, 0, 255, 0.7)', // Фиолетовый
        ];
        this.antiGravityForce = -0.03; // Сила, заставляющая капли "всплывать"
        this.touchAttractionPoints = []; // Центры притяжения от касаний
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas) return;
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        this._initDrops(10); // Начать с нескольких капель
        console.log("[InkInZeroGRenderer] Initialized.");
    }

    _initDrops(numInitialDrops = 5) {
        this.drops = [];
        for (let i = 0; i < numInitialDrops; i++) {
            this.addDrop(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height,
                this.minDropSize + Math.random() * (this.maxDropSize - this.minDropSize),
                this.dropColors[Math.floor(Math.random() * this.dropColors.length)]
            );
        }
    }

    addDrop(x, y, size, color, vx = (Math.random() - 0.5) * 0.5, vy = (Math.random() - 0.5) * 0.5) {
        if (this.drops.length >= this.maxDrops) {
            // Удаляем самую старую/маленькую каплю, чтобы освободить место
            this.drops.sort((a,b) => a.size - b.size); // Сортируем по размеру (самые маленькие в начале)
            if(this.drops.length > 0) this.drops.shift();
        }

        // Каждая капля - это набор точек (вершин) для создания аморфной формы
        const numPoints = 10 + Math.floor(size / 10); // Больше точек для больших капель
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const radius = size * (0.8 + Math.random() * 0.4); // Небольшая случайность для аморфности
            points.push({
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                baseRadius: radius,
                targetRadius: radius,
                vx: 0, // Скорость для деформации точек
                vy: 0
            });
        }

        this.drops.push({
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            size: size, // Общий размер/масса капли
            color: color,
            points: points,
            id: Date.now() + Math.random() // Уникальный ID для отслеживания
        });
    }

    onResize() {
        if (!this.canvas) return;
        // Можно адаптировать капли к новому размеру или просто пересоздать
        // this._initDrops(this.drops.length);
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        // Возможно, обновить базовые цвета капель, если они зависят от темы
    }

    // Упрощенное определение цвета по ноте
    _getColorForNoteFrequency(frequency) {
        // Пример: C4 ~261Hz, D4 ~293Hz, E4 ~329Hz, F4 ~349Hz, G4 ~392Hz, A4 ~440Hz, B4 ~493Hz
        if (frequency < 100) return null; // Слишком низкая частота

        if (frequency >= 250 && frequency < 280) return this.dropColors[0 % this.dropColors.length]; // C
        if (frequency >= 280 && frequency < 310) return this.dropColors[1 % this.dropColors.length]; // D
        if (frequency >= 310 && frequency < 340) return this.dropColors[2 % this.dropColors.length]; // E
        if (frequency >= 340 && frequency < 380) return this.dropColors[3 % this.dropColors.length]; // F
        if (frequency >= 380 && frequency < 420) return this.dropColors[4 % this.dropColors.length]; // G
        if (frequency >= 420 && frequency < 470) return this.dropColors[5 % this.dropColors.length]; // A
        // ... и так далее, можно добавить больше диапазонов
        return this.dropColors[Math.floor(Math.random() * this.dropColors.length)]; // Случайный, если не попали
    }

    // Смешивание цветов (упрощенное)
    _mixColors(color1, color2) {
        const c1 = color1.match(/\d+/g).map(Number);
        const c2 = color2.match(/\d+/g).map(Number);
        const mixed = [
            Math.floor((c1[0] + c2[0]) / 2),
            Math.floor((c1[1] + c2[1]) / 2),
            Math.floor((c1[2] + c2[2]) / 2),
            (c1[3] + c2[3]) / 2 // Alpha
        ];
        return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${mixed[3]})`;
    }


    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas) return;

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.themeColors.background || 'rgba(10, 10, 20, 1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Реакция на звук (рождение новой капли)
        if (audioData && audioData.peakFrequency && audioData.peakIntensity > 0.7) { // Резкая, громкая нота
            const newColor = this._getColorForNoteFrequency(audioData.peakFrequency);
            if (newColor && Math.random() < 0.1) { // Не слишком часто
                this.addDrop(
                    Math.random() * this.canvas.width,
                    Math.random() * this.canvas.height,
                    this.minDropSize + Math.random() * (this.maxDropSize - this.minDropSize) * 0.5, // Новые капли поменьше
                    newColor
                );
            }
        }

        // 2. Реакция на акселерометр (антигравитация)

        // >>> НАЧАЛО НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ <<<
        let windX = 0; // Not used by original anti-gravity, but standard block provides it
        let windY = 0; // This will become the basis for currentAntiGravity

        // Original antiGravityForce was -0.03.
        // Original logic: currentAntiGravity = antiGravityForce * ( (pitch/90) - 0.2 ) if (pitch/90) > 0.2
        // This was added to vy. So pitch affects Y.
        // If pitch > 0 (tilt forward/down), and (pitch/90) > 0.2, then (pitch/90) - 0.2 is positive.
        // currentAntiGravity = (-0.03) * (positive) = negative value. Negative vy is upwards.
        // So, positive pitch (tilt forward) -> upward force.
        // New standard: windY from pitch. For upward force with positive pitch, windY should be negative.
        // So, if strength is positive (e.g. 0.03), invertPitch should be true.
        const defaultSettingsStrength = this.settings.accelerometerAntiGravity?.forceFactor !== undefined ? Math.abs(this.settings.accelerometerAntiGravity.forceFactor) : 0.03;
        const tiltSettings = this.settings.tiltPhysics || {
            enabled: this.settings.accelerometerAntiGravity?.enabled !== undefined ? this.settings.accelerometerAntiGravity.enabled : true,
            strength: defaultSettingsStrength,
            invertPitch: true, // to make positive pitch result in negative Y force (upwards)
            invertRoll: false
        };

        let currentAntiGravity = 0;
        if (tiltSettings.enabled && deviceTilt) {
            const pitchFactor = tiltSettings.invertPitch ? -1 : 1;
            // const rollFactor = tiltSettings.invertRoll ? -1 : 1; // roll not used for anti-gravity here

            // windX = (deviceTilt.roll / 90) * tiltSettings.strength * rollFactor; // Available if needed
            windY = (deviceTilt.pitch / 90) * tiltSettings.strength * pitchFactor;

            // Apply original threshold logic
            const verticalTiltEffect = deviceTilt.pitch / 90; // Raw normalized pitch
            const threshold = this.settings.accelerometerAntiGravity?.tiltThreshold !== undefined ? this.settings.accelerometerAntiGravity.tiltThreshold : 0.2;

            if ( (tiltSettings.invertPitch && verticalTiltEffect < -threshold) || // e.g. pitch is -30 (-0.33), -0.33 < -0.2. Upward tilt.
                 (!tiltSettings.invertPitch && verticalTiltEffect > threshold) ) {  // e.g. pitch is 30 (0.33), 0.33 > 0.2. Downward tilt.
                // The universal block already applied strength and inversion.
                // If currentAntiGravity was simply windY, the (verticalTiltEffect - threshold) logic is tricky.
                // Let's recalculate based on the *direction* of windY, but magnitude from raw tilt vs threshold.
                // If windY is negative (upward force intended by positive pitch with invertPitch:true)
                // and raw pitch effect > threshold, apply.
                // This way, strength is from tiltPhysics, direction from invertPitch, and threshold is applied.

                // Simpler: use the calculated windY but only if threshold is met.
                // The magnitude of windY is already scaled by strength.
                // The (verticalTiltEffect - threshold) was a way to scale magnitude *after* threshold.
                // Let's keep it simple: if threshold met, use windY. Otherwise 0.
                // This might change behavior slightly if forceFactor was meant to multiply the (diff from threshold).

                // Option 1: Use calculated windY if threshold met
                // currentAntiGravity = windY;

                // Option 2: Try to replicate original magnitude scaling more closely
                // Strength from tiltPhysics is applied. invertPitch handles direction.
                // The original scaling was: strength * (abs_normalized_tilt - threshold)
                // Current windY = (normalized_tilt * strength_from_json * inversion_factor)
                // We want: sign(windY) * strength_from_json * (abs_normalized_tilt - threshold)
                let baseForce = tiltSettings.strength;
                if ( (verticalTiltEffect > threshold && !tiltSettings.invertPitch) || (verticalTiltEffect < -threshold && tiltSettings.invertPitch) ) {
                     currentAntiGravity = (tiltSettings.invertPitch ? -1 : 1) * baseForce * (Math.abs(verticalTiltEffect) - threshold);
                }


            } else {
                currentAntiGravity = 0;
            }
        }
        // >>> КОНЕЦ НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ <<<


        // 3. Реакция на касания
        this.touchAttractionPoints = activeTouchStates.map(touch => ({
            x: touch.x * this.canvas.width,
            y: (1 - touch.y) * this.canvas.height,
            isSwipe: touch.isSwipe || false,
            id: touch.id // Для отслеживания разрезания
        }));


        // Обновление и отрисовка капель
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];

            // Антигравитация
            drop.vy += currentAntiGravity;

            // Притяжение к точкам касания (если не свайп)
            this.touchAttractionPoints.forEach(touchPoint => {
                if (!touchPoint.isSwipe) {
                    const dx = touchPoint.x - drop.x;
                    const dy = touchPoint.y - drop.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 1 && dist < 200) { // Не притягивать, если слишком близко или далеко
                        const force = 1 / dist * 0.5; // Сила притяжения
                        drop.vx += dx * force * 0.05; // Масштабируем, чтобы не было слишком резко
                        drop.vy += dy * force * 0.05;
                    }
                }
            });


            drop.x += drop.vx;
            drop.y += drop.vy;

            // Затухание скорости
            drop.vx *= 0.98;
            drop.vy *= 0.98;

            // Деформация точек капли (для аморфности)
            drop.points.forEach(p => {
                p.targetRadius = p.baseRadius * (0.9 + Math.random() * 0.2 + Math.sin(Date.now() * 0.001 + drop.x + drop.y) * 0.1);
                const currentRadius = p.baseRadius + (p.targetRadius - p.baseRadius) * 0.1; // Плавное изменение

                // Небольшое "дыхание" точек
                p.vx += (Math.random() - 0.5) * 0.1;
                p.vy += (Math.random() - 0.5) * 0.1;
                p.vx *= 0.9;
                p.vy *= 0.9;
                p.x += p.vx;
                p.y += p.vy;

                // Возвращение точек к базовому радиусу (чтобы не разлетались слишком сильно)
                const angle = Math.atan2(p.y, p.x);
                p.x = Math.cos(angle) * currentRadius;
                p.y = Math.sin(angle) * currentRadius;
            });


            // Отскок от стенок (упрощенный)
            if (drop.x - drop.size / 2 < 0 || drop.x + drop.size / 2 > this.canvas.width) {
                drop.vx *= -0.7;
                drop.x = Math.max(drop.size / 2, Math.min(drop.x, this.canvas.width - drop.size / 2));
            }
            if (drop.y - drop.size / 2 < 0 || drop.y + drop.size / 2 > this.canvas.height) {
                drop.vy *= -0.7;
                drop.y = Math.max(drop.size / 2, Math.min(drop.y, this.canvas.height - drop.size / 2));
            }


            // Отрисовка капли (как замкнутый путь через точки)
            this.ctx.beginPath();
            this.ctx.fillStyle = drop.color;
            this.ctx.strokeStyle = this._adjustColorAlpha(drop.color, 1); // Более яркая обводка
            this.ctx.lineWidth = 2;

            const firstPoint = drop.points[0];
            this.ctx.moveTo(drop.x + firstPoint.x, drop.y + firstPoint.y);
            for (let j = 1; j < drop.points.length; j++) {
                // Для гладкости используем quadraticCurveTo
                const p1 = drop.points[j];
                const p2 = drop.points[(j + 1) % drop.points.length]; // Следующая точка
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                this.ctx.quadraticCurveTo(drop.x + p1.x, drop.y + p1.y, drop.x + midX, drop.y + midY);
            }
            this.ctx.closePath();
            this.ctx.fill();
            // this.ctx.stroke(); // Обводка может быть лишней

            this.ctx.shadowColor = drop.color;
            this.ctx.shadowBlur = drop.size * 0.3;
            this.ctx.fill(); // Еще раз для тени
            this.ctx.shadowBlur = 0;


            // Взаимодействие капель (слияние)
            for (let j = i - 1; j >= 0; j--) {
                const otherDrop = this.drops[j];
                const dx = drop.x - otherDrop.x;
                const dy = drop.y - otherDrop.y;
                const dist = Math.hypot(dx, dy);

                if (dist < (drop.size / 2 + otherDrop.size / 2) * 0.8) { // Если капли соприкасаются
                    // Большая капля поглощает меньшую
                    const bigger = drop.size > otherDrop.size ? drop : otherDrop;
                    const smaller = drop.size <= otherDrop.size ? drop : otherDrop;

                    // Новый цвет - смешение
                    bigger.color = this._mixColors(bigger.color, smaller.color);
                    // Новый размер (сохранение "массы" - площади)
                    const newArea = Math.PI * Math.pow(bigger.size/2, 2) + Math.PI * Math.pow(smaller.size/2, 2);
                    bigger.size = Math.sqrt(newArea / Math.PI) * 2;
                    bigger.size = Math.min(bigger.size, this.maxDropSize * 1.5); // Ограничение максимального размера

                    // Обновление точек большей капли (просто масштабируем)
                    const scaleFactor = bigger.size / (bigger.points.reduce((sum,p) => sum + p.baseRadius, 0) / bigger.points.length * 2); // Примерный старый размер
                     bigger.points.forEach(p => {
                        p.baseRadius *= scaleFactor;
                        p.targetRadius *= scaleFactor;
                     });


                    // Удаляем меньшую каплю
                    this.drops.splice(this.drops.indexOf(smaller), 1);
                    if (smaller === drop) { // Если текущая капля была поглощена, прекращаем ее обработку
                        break; // Выход из внутреннего цикла (j)
                    }
                    // Если otherDrop была поглощена, то i и j остаются корректными
                }
            }
            if (!this.drops.includes(drop)) continue; // Если текущая капля была удалена (поглощена)

            // Разрезание капель свайпом
            this.touchAttractionPoints.forEach(touchPoint => {
                if (touchPoint.isSwipe && drop.size > this.minDropSize * 2) { // Только если свайп и капля достаточно большая
                    const dx = touchPoint.x - drop.x;
                    const dy = touchPoint.y - drop.y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < drop.size / 2) { // Если свайп проходит через каплю
                        const numNewDrops = 2 + Math.floor(Math.random() * 2); // 2-3 новые капли
                        const newSize = drop.size / numNewDrops * 1.2; // Чуть больше, чтобы сохранить объем

                        for (let k = 0; k < numNewDrops; k++) {
                            const angle = Math.random() * Math.PI * 2;
                            this.addDrop(
                                drop.x + Math.cos(angle) * drop.size * 0.1,
                                drop.y + Math.sin(angle) * drop.size * 0.1,
                                newSize,
                                drop.color, // Новые капли того же цвета
                                drop.vx + (Math.random() - 0.5) * 2, // Разлетаются
                                drop.vy + (Math.random() - 0.5) * 2
                            );
                        }
                        this.drops.splice(i, 1); // Удаляем исходную разрезанную каплю
                    }
                }
            });
             if (!this.drops.includes(drop)) continue;
        }

        // TODO: Несколько касаний: Каждое касание создает свой центр притяжения,
        // заставляя капли растягиваться и разрываться между пальцами.
        // Текущая реализация притяжения уже обрабатывает несколько касаний.
        // "Разрывание" между пальцами потребует более сложной логики деформации точек капли.

        this.ctx.globalCompositeOperation = 'source-over';
    }

    _adjustColorAlpha(rgbaColor, newAlpha) {
        if (!rgbaColor || typeof rgbaColor !== 'string') return `rgba(128,128,128,${newAlpha})`;
        const parts = rgbaColor.match(/[\d\.]+/g);
        if (parts && parts.length >= 3) {
            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${newAlpha})`;
        }
        return `rgba(128,128,128,${newAlpha})`; // Fallback
    }

    dispose() {
        this.drops = [];
        console.log("[InkInZeroGRenderer] Disposed.");
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('InkInZeroGRenderer', InkInZeroGRenderer);
}
