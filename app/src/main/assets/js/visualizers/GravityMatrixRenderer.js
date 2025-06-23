// Файл: app/src/main/assets/js/visualizers/GravityMatrixRenderer.js

class GravityMatrixRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;

        this.letters = [];
        this.grid = { columns: 0, rows: 0 };

        this.fontSize = 16;
        this.charWidth = 10;
        this.charHeight = 20;
        this.lettersAndSymbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;

        this.onResize();
        console.log("[GravityMatrixRenderer] Initialized.");
    }

    onThemeChange(themeColors) { this.themeColors = themeColors; }

    onResize() {
        if (!this.canvas) return;
        const { width, height } = this.canvas;
        const columns = Math.ceil(width / this.charWidth);
        const rows = Math.ceil(height / this.charHeight);

        if (this.grid.columns !== columns || this.grid.rows !== rows) {
            this.grid = { columns, rows };
            this._initializeLetters(columns, rows);
        }
    }

    _initializeLetters(columns, rows) {
        this.letters = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                this.letters.push({
                    char: this._getRandomChar(),
                    x: c * this.charWidth,
                    y: r * this.charHeight,
                    vx: 0,
                    vy: 0,
                    color: this._getRandomColor()
                });
            }
        }
    }

    _getRandomChar() {
        return this.lettersAndSymbols[Math.floor(Math.random() * this.lettersAndSymbols.length)];
    }

    _getRandomColor() {
        const palette = this.settings.glitchColors || [this.themeColors.primary, this.themeColors.accent, '#FFFFFF'];
        return palette[Math.floor(Math.random() * palette.length)];
    }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.settings.fadeSpeed || 0.25})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const gravityStrength = this.settings.gravityStrength || 0.2;
        const gravityX = (deviceTilt.roll / 90) * gravityStrength * -1;
        const gravityY = (deviceTilt.pitch / 90) * gravityStrength;

        const friction = this.settings.friction || 0.98;

        this.letters.forEach(letter => {
            letter.vx += gravityX;
            letter.vy += gravityY;

            activeTouchStates.forEach(touch => {
                const touchX = touch.x * this.canvas.width;
                const touchY = (1 - touch.y) * this.canvas.height;
                const dx = letter.x - touchX;
                const dy = letter.y - touchY;
                const distSq = dx * dx + dy * dy;
                const pushRadiusSq = Math.pow(this.settings.touchPushRadius || 150, 2);

                if (distSq < pushRadiusSq) {
                    const dist = Math.sqrt(distSq) || 1;
                    const force = (1 - dist / Math.sqrt(pushRadiusSq)) * (this.settings.touchPushStrength || 1);
                    letter.vx += (dx / dist) * force;
                    letter.vy += (dy / dist) * force;
                }
            });

            letter.vx *= friction;
            letter.vy *= friction;
            letter.x += letter.vx;
            letter.y += letter.vy;

            // Отскок от стен
            if (letter.x < 0) { letter.x = 0; letter.vx *= -0.5; }
            if (letter.x > this.canvas.width) { letter.x = this.canvas.width; letter.vx *= -0.5; }
            if (letter.y < 0) { letter.y = 0; letter.vy *= -0.5; }
            if (letter.y > this.canvas.height) { letter.y = this.canvas.height; letter.vy *= -0.5; }

            if (Math.hypot(letter.vx, letter.vy) > 2) {
                letter.char = this._getRandomChar();
            }
        });

        this.ctx.font = `${this.fontSize}px monospace`;
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';

        this.letters.forEach(letter => {
            this.ctx.fillStyle = letter.color;
            this.ctx.fillText(letter.char, letter.x, letter.y);
        });
    }

    dispose() {
        this.letters = [];
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('GravityMatrixRenderer', GravityMatrixRenderer);
}