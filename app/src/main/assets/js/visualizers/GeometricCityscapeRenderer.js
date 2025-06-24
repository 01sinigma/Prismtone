// Файл: app/src/main/assets/js/visualizers/GeometricCityscapeRenderer.js

class GeometricCityscapeRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        this.buildings = [];
        this.gridSize = 20; // Количество зданий по X и Z
        this.cellSize = 30; // Базовый размер ячейки для здания
        this.maxBuildingHeight = 200;
        this.minBuildingHeight = 20;

        // Параметры камеры/проекции
        this.camera = {
            fov: 75, // Поле зрения
            x: 0, y: 100, z: -150, // Позиция камеры (немного сверху и сзади от центра сетки)
            pitch: Math.PI / 8, // Наклон камеры (смотреть немного вниз)
            yaw: 0,             // Поворот камеры вокруг Y
            targetPitch: Math.PI / 8,
            targetYaw: 0,
            lerpFactor: 0.05 // Плавность изменения углов
        };

        this.bassPulse = 0;
        this.trebleRipple = 0;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas) return;
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        this._initCityscape();
        // Начальная позиция камеры, чтобы центр сетки был виден
        this.camera.x = (this.gridSize / 2) * this.cellSize;
        this.camera.z = (this.gridSize / 2) * this.cellSize - (this.gridSize * this.cellSize * 1.5); // Отодвинуть назад
        this.camera.y = this.maxBuildingHeight * 0.8; // Камера чуть выше средних зданий

        console.log("[GeometricCityscapeRenderer] Initialized.");
    }

    _initCityscape() {
        this.buildings = [];
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const x = i * this.cellSize;
                const z = j * this.cellSize;
                const baseHeight = this.minBuildingHeight + Math.random() * (this.maxBuildingHeight - this.minBuildingHeight);
                // Небольшой шанс на очень высокие здания в центре
                const distFromCenter = Math.hypot(i - this.gridSize/2, j - this.gridSize/2);
                const heightMultiplier = 1 + Math.max(0, 1 - distFromCenter / (this.gridSize * 0.3)) * 1.5;


                this.buildings.push({
                    x: x,         // Координата в мировой системе
                    y: 0,         // Основание на Y=0
                    z: z,
                    width: this.cellSize * (0.7 + Math.random() * 0.3), // Небольшая вариация ширины
                    depth: this.cellSize * (0.7 + Math.random() * 0.3),
                    height: Math.min(this.maxBuildingHeight * 1.8, baseHeight * heightMultiplier),
                    baseColor: [80 + Math.random() * 50, 80 + Math.random() * 50, 90 + Math.random() * 60], // Темно-серые/синие тона
                    neonColor: [50, 150, 255], // Для пульсации баса
                    ripplePhase: Math.random() * Math.PI * 2,
                    isTall: baseHeight * heightMultiplier > this.maxBuildingHeight * 0.8 // Флаг для высоких зданий
                });
            }
        }
    }

    onResize() {
        if (!this.canvas) return;
        // Пересчет FOV или других параметров камеры может быть нужен,
        // но простая 3D проекция обычно адаптируется через viewport.
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        // Можно изменить baseColor зданий или neonColor
    }

    // Простая 3D проекция точки
    _projectPoint(p3d) {
        const { x: camX, y: camY, z: camZ, pitch, yaw, fov } = this.camera;
        const camAspect = this.canvas.width / this.canvas.height;
        const f = 1 / Math.tan((fov * Math.PI / 180) / 2); // Focal length based on FOV

        // Трансформация относительно камеры
        let x = p3d.x - camX;
        let y = p3d.y - camY;
        let z = p3d.z - camZ;

        // Вращение вокруг Y (yaw)
        let xzAngle = Math.atan2(z, x) - yaw;
        let xzDist = Math.hypot(x, z);
        x = Math.cos(xzAngle) * xzDist;
        z = Math.sin(xzAngle) * xzDist;

        // Вращение вокруг X (pitch)
        let yzAngle = Math.atan2(y, z) - pitch; // z тут уже повернуто
        let yzDist = Math.hypot(y, z);
        y = Math.sin(yzAngle) * yzDist;
        z = Math.cos(yzAngle) * yzDist;


        if (z <= 0.1) return null; // Точка за камерой или слишком близко (clipping)

        // Перспективная проекция
        const screenX = (x * f / (z * camAspect)) * (this.canvas.width / 2) + (this.canvas.width / 2);
        const screenY = (-y * f / z) * (this.canvas.height / 2) + (this.canvas.height / 2); // Y инвертирован на экране

        return { x: screenX, y: screenY, depth: z };
    }


    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas) return;

        // 1. Обновление камеры на основе наклона акселерометра
        // Плавный наклон влево-вправо (roll -> gamma) -> поворот сцены (yaw)
        this.camera.targetYaw = (deviceTilt.gamma / 90) * (Math.PI / 3); // gamma: -90 to 90. Max rotation PI/3.
        // Плавный наклон вперед-назад (pitch -> beta) -> наклон сцены (pitch)
        this.camera.targetPitch = Math.PI / 8 + (deviceTilt.beta / 90) * (Math.PI / 4); // beta: -90 to 90. Max additional pitch PI/4.
        this.camera.targetPitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.camera.targetPitch)); // Ограничение

        this.camera.yaw += (this.camera.targetYaw - this.camera.yaw) * this.camera.lerpFactor;
        this.camera.pitch += (this.camera.targetPitch - this.camera.pitch) * this.camera.lerpFactor;


        // 2. Реакция на звук
        let bassEnergy = 0;
        let trebleEnergy = 0;
        if (audioData && audioData.frequencyData) {
            const fd = audioData.frequencyData;
            const bassEndIndex = Math.floor(fd.length * 0.1); // Нижние 10% частот для баса
            const trebleStartIndex = Math.floor(fd.length * 0.6); // Верхние 40% для высоких

            for (let k = 0; k < bassEndIndex; k++) bassEnergy += fd[k];
            bassEnergy = (bassEndIndex > 0 ? bassEnergy / bassEndIndex : 0) / 255;

            for (let k = trebleStartIndex; k < fd.length; k++) trebleEnergy += fd[k];
            trebleEnergy = (fd.length - trebleStartIndex > 0 ? trebleEnergy / (fd.length - trebleStartIndex) : 0) / 255;
        }

        this.bassPulse = bassEnergy > 0.6 ? 1 : this.bassPulse * 0.9; // Если бас сильный, пульс = 1, иначе затухает
        this.trebleRipple = trebleEnergy > 0.5 ? 0.5 + trebleEnergy * 0.5 : this.trebleRipple * 0.85; // Рябь активна при высоких

        // Очистка фона
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.themeColors.background || 'rgba(10, 15, 25, 1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Сортировка зданий по удаленности от камеры (для корректной отрисовки)
        const sortedBuildings = this.buildings.map(b => {
            const dx = b.x + b.width/2 - this.camera.x;
            const dy = b.y + b.height/2 - this.camera.y;
            const dz = b.z + b.depth/2 - this.camera.z;
            // Используем квадрат расстояния для производительности
            return { ...b, distSq: dx*dx + dy*dy + dz*dz };
        }).sort((a, b) => b.distSq - a.distSq); // От дальних к ближним


        sortedBuildings.forEach(b => {
            // Вершины призмы (локальные координаты относительно b.x, b.y, b.z)
            // Основание (y=0)
            const p0 = { x: b.x, y: b.y, z: b.z };
            const p1 = { x: b.x + b.width, y: b.y, z: b.z };
            const p2 = { x: b.x + b.width, y: b.y, z: b.z + b.depth };
            const p3 = { x: b.x, y: b.y, z: b.z + b.depth };
            // Крыша (y=b.height)
            const p4 = { x: b.x, y: b.y + b.height, z: b.z };
            const p5 = { x: b.x + b.width, y: b.y + b.height, z: b.z };
            const p6 = { x: b.x + b.width, y: b.y + b.height, z: b.z + b.depth };
            const p7 = { x: b.x, y: b.y + b.height, z: b.z + b.depth };

            // Проецируем вершины
            const s = [p0,p1,p2,p3,p4,p5,p6,p7].map(p => this._projectPoint(p));

            // Если хотя бы одна вершина не видна (за камерой), пропускаем (очень грубый клиппинг)
            if (s.some(p => p === null)) return;

            // Определение видимых граней (упрощенно, можно использовать нормали)
            // Для простоты, нарисуем три основные грани, если они "смотрят" на камеру.
            // Это неполное решение, но для стилизованного вида может подойти.

            const faces = [
                { points: [s[4],s[5],s[1],s[0]], normalZApprox: (p4.z + p5.z)/2 - this.camera.z }, // Передняя грань (если камера перед ней)
                { points: [s[5],s[6],s[2],s[1]], normalXApprox: (p5.x + p6.x)/2 - this.camera.x }, // Правая грань
                { points: [s[7],s[4],s[0],s[3]], normalXApprox: (p7.x + p4.x)/2 - this.camera.x }, // Левая грань (нормаль в другую сторону)
                { points: [s[6],s[7],s[3],s[2]], normalZApprox: (p6.z + p7.z)/2 - this.camera.z }, // Задняя грань
                { points: [s[4],s[5],s[6],s[7]], normalYApprox: (p4.y + p5.y)/2 - this.camera.y }  // Крыша
            ];

            // Отрисовка граней
            faces.forEach((face, index) => {
                // Простая проверка видимости (не очень точная)
                let isVisible = true;
                if (index === 0 && face.points[0].x > face.points[1].x) isVisible = false; // Передняя, если развернута
                if (index === 1 && face.points[0].y > face.points[1].y && face.points[0].x < face.points[3].x) isVisible = false; // Правая, если развернута
                // ... и т.д. Более точный back-face culling нужен.

                if (isVisible) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(face.points[0].x, face.points[0].y);
                    for (let k = 1; k < face.points.length; k++) {
                        this.ctx.lineTo(face.points[k].x, face.points[k].y);
                    }
                    this.ctx.closePath();

                    let r = b.baseColor[0], g = b.baseColor[1], bl = b.baseColor[2];
                    let alpha = 0.8;

                    // Освещение в зависимости от ориентации грани (фейковое)
                    let lightFactor = 1;
                    if (index === 4) lightFactor = 1.2; // Крыша чуть светлее
                    else if (index === 0 || index === 2) lightFactor = 0.9; // Боковые чуть темнее
                    else if (index === 1 || index === 3) lightFactor = 0.8;


                    // Пульсация для высоких зданий от баса
                    if (b.isTall && this.bassPulse > 0.1) {
                        const pulseAmount = this.bassPulse * 0.8; // Неполное перекрытие
                        r = b.neonColor[0] * pulseAmount + r * (1 - pulseAmount);
                        g = b.neonColor[1] * pulseAmount + g * (1 - pulseAmount);
                        bl = b.neonColor[2] * pulseAmount + bl * (1 - pulseAmount);
                        alpha = 0.6 + this.bassPulse * 0.4;
                    }

                    // Рябь на крышах низких зданий от высоких частот
                    if (index === 4 && !b.isTall && this.trebleRipple > 0.1) {
                        const rippleVal = Math.sin(b.ripplePhase + Date.now() * 0.01) * this.trebleRipple * 0.5;
                        r = Math.max(0, Math.min(255, r + rippleVal * 80));
                        g = Math.max(0, Math.min(255, g + rippleVal * 80));
                        bl = Math.max(0, Math.min(255, bl + rippleVal * 80));
                        alpha = 0.7 + this.trebleRipple * 0.3;
                    }


                    this.ctx.fillStyle = `rgba(${Math.floor(r*lightFactor)}, ${Math.floor(g*lightFactor)}, ${Math.floor(bl*lightFactor)}, ${alpha})`;
                    this.ctx.strokeStyle = `rgba(${Math.floor(r*lightFactor*0.7)}, ${Math.floor(g*lightFactor*0.7)}, ${Math.floor(bl*lightFactor*0.7)}, 1)`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.fill();
                    this.ctx.stroke();
                }
            });
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    dispose() {
        this.buildings = [];
        console.log("[GeometricCityscapeRenderer] Disposed.");
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('GeometricCityscapeRenderer', GeometricCityscapeRenderer);
}
