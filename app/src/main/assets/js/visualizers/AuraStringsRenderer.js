// Файл: app/src/main/assets/js/visualizers/AuraStringsRenderer.js
// Версия 2.1 (Исправленная и стабилизированная)

class AuraStringsRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.strings = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas) return;
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef; // <-- Важное исправление

        this._initStrings();
        console.log("[AuraStringsRenderer v2] Initialized.");
    }

    _initStrings() {
        if (!this.canvas || !this.globalVisualizerRef || this.globalVisualizerRef.noteColors.length === 0) return;
        this.strings = [];
        const numStrings = this.settings.stringCount || 9;

        for (let i = 0; i < numStrings; i++) {
            this.strings.push({
                baseX: (this.canvas.width / numStrings) * (i + 0.5),
                nodes: Array.from({ length: this.settings.nodesPerString || 20 }, (_, j) => ({
                    y: (j / ((this.settings.nodesPerString || 20) - 1)) * this.canvas.height,
                    x: (this.canvas.width / numStrings) * (i + 0.5),
                    vx: 0,
                })),
                color: this.globalVisualizerRef.noteColors[i % 12],
                energy: 0
            });
        }
    }

    onResize() { this._initStrings(); }
    onThemeChange(themeColors) { this.themeColors = themeColors; }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.settings.fadeSpeed || 0.15})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- ИСПРАВЛЕНИЕ ОСЕЙ (v4 - Финальная версия) ---
        // Горизонтальный ветер (X) -> от наклона ВПЕРЕД/НАЗАД (pitch)
        const windForceX = (deviceTilt.pitch / 90) * (this.settings.tiltWindForce || 0.1) * -1;
        // Вертикальный ветер (Y) -> от наклона ВЛЕВО/ВПРАВО (roll)
        const windForceY = (deviceTilt.roll / 90) * (this.settings.tiltWindForce || 0.1) * -1;
        // ---------------------------------------------

        const stiffness = this.settings.stiffness || 0.1;
        const damping = this.settings.damping || 0.92;

        this.ctx.lineCap = 'round';
        this.ctx.globalCompositeOperation = 'lighter';

        this.strings.forEach(str => {
            str.nodes.forEach(node => {
                let forceX = (str.baseX - node.x) * stiffness;
                forceX += windForceX; // Применяем горизонтальный ветер

                // Применяем вертикальный ветер к скорости
                node.vy = (node.vy || 0) + windForceY;
                node.y += node.vy;
                node.vy *= damping;
                // Возвращающая сила для вертикали, чтобы струны не улетали
                node.vy += ((str.nodes.indexOf(node) / (str.nodes.length - 1)) * this.canvas.height - node.y) * stiffness * 0.1;


                activeTouchStates.forEach(touch => {
                    const touchX = touch.x * this.canvas.width;
                    const touchY = (1 - touch.y) * this.canvas.height;
                    const dx = touchX - node.x;
                    const dy = touchY - node.y;
                    const dist = Math.hypot(dx, dy);
                    const touchRadius = (this.settings.touchRadius || 150) * touch.y;

                    if (dist < touchRadius) {
                        const pullForce = (1 - dist / touchRadius) * (this.settings.touchAttractionForce || 0.8) * touch.y;
                        forceX += dx * pullForce;
                    }
                });

                node.vx = (node.vx + forceX) * damping;
                node.x += node.vx;
            });

            // Отрисовка струны
            this.ctx.beginPath();
            this.ctx.moveTo(str.nodes[0].x, str.nodes[0].y);

            for (let k = 1; k < str.nodes.length - 2; k++) {
                const xc = (str.nodes[k].x + str.nodes[k + 1].x) / 2;
                const yc = (str.nodes[k].y + str.nodes[k + 1].y) / 2;
                this.ctx.quadraticCurveTo(str.nodes[k].x, str.nodes[k].y, xc, yc);
            }
             this.ctx.lineTo(str.nodes[str.nodes.length - 1].x, str.nodes[str.nodes.length - 1].y);

            const agitation = str.nodes.reduce((sum, node) => sum + Math.abs(node.vx), 0) / str.nodes.length;
            const lineWidth = (this.settings.minWidth || 1) + agitation * (this.settings.widthAgitationFactor || 20);
            const alpha = Math.min(1, 0.1 + str.energy + agitation * 0.5);

            if (alpha > 0.01) {
                this.ctx.lineWidth = lineWidth;
                this.ctx.strokeStyle = this.globalVisualizerRef.getColorWithAlpha(str.color, alpha);
                this.ctx.shadowColor = str.color;
                this.ctx.shadowBlur = agitation * (this.settings.glowAgitationFactor || 30);
                this.ctx.stroke();
            }
        });

        this.ctx.shadowBlur = 0;
    }

    dispose() {
        this.strings = [];
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('AuraStringsRenderer', AuraStringsRenderer);
}