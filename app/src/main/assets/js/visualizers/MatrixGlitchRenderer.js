// Файл: app/src/main/assets/js/visualizers/MatrixGlitchRenderer.js
// Версия 2.2.0 с рендерингом в атлас, мягким смещением и пулингом объектов

class MatrixGlitchRenderer {
    constructor() {
        // Основные свойства
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;

        // Состояния анимации
        this.letters = [];
        this.grid = { columns: 0, rows: 0 };
        this.lastGlitchTime = 0;

        // Для "дождя"
        this.rainStreams = [];
        this.rainStreamPool = []; // <-- ОПТИМИЗАЦИЯ: Пул объектов для дождя

        // Для рендеринга в атлас
        this.charAtlas = null;      // <-- ОПТИМИЗАЦИЯ: Канвас-атлас
        this.atlasMap = new Map();  // <-- ОПТИМИЗАЦИЯ: Карта координат символов в атласе

        // Константы
        this.fontSize = 16;
        this.charWidth = 10;
        this.charHeight = 20;
        this.lettersAndSymbols =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
            'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' + // Кириллица
            '0123456789' +
            'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' + // Японская Катакана
            '人一大小中月日年早木林山川土空田天生花草虫犬人名女男女目耳口手足見音力気円入出立休' + // Кандзи
            '가나다라마바사아자차카타파하' + // Корейский Хангыль (сокращен для разнообразия)
            '!@#$%^&*()_+-=[]{}|;:",.<>/?`~' + // Стандартные
            '¦§©«»®¯°±²³´µ¶·¸¹º»¼½¾¿' +      // Латинские-1
            '×÷∀∂∃∅∇∈∉∋∏∑−∗√∝∞∠∧∨∩∪∫∮' +  // Математические
            '∴∵∶∷⸸∹∺∻∼∽≀≁≂≃≄≅≆≇≈≉≊≋≌≍≎≏' + // Еще математические
            '≡≠≤≥≦≧≨≩≪≫─│┌┐└┘├┤┬┴┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬' + // Псевдографика
            '▀▄█▌▐░▒▓■□▪▫▬▲►▼◄◊○●◘◙◦☺☻☼♀♂♠♣♥♦♪♫' + // Разные символы
            'ΩθμπΣδ∞φπεξψωικλ' // Греческие буквы
            ;
        this.dynamicColorPalette = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;

        this.lastGlitchTime = performance.now();
        this.onThemeChange(this.themeColors);
        this.onResize();
        console.log("[MatrixGlitchRenderer] Initialized v2.2 (Optimized).");
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
        const baseColors = [this.themeColors.primary, this.themeColors.accent, this.themeColors.textSecondary].filter(Boolean);
        const settingColors = this.settings.glitchColors || [];
        this.dynamicColorPalette = [...new Set([...baseColors, ...settingColors])];
        if (this.dynamicColorPalette.length === 0) this.dynamicColorPalette.push('#39ff14');
        this._createCharAtlas();
    }

    onResize() {
        if (!this.canvas) return;
        const { width, height } = this.canvas;
        const columns = Math.ceil(width / this.charWidth);
        const rows = Math.ceil(height / this.charHeight);

        if (this.grid.columns !== columns || this.grid.rows !== rows) {
            this.grid = { columns, rows };
            this._initializeLetters();
        }
    }

    _createCharAtlas() {
        this.charAtlas = document.createElement('canvas');
        const atlasCtx = this.charAtlas.getContext('2d');
        this.atlasMap.clear();

        const chars = this.lettersAndSymbols;
        const colors = this.dynamicColorPalette;

        this.charAtlas.width = this.charWidth * chars.length;
        this.charAtlas.height = this.charHeight * colors.length;

        atlasCtx.font = `${this.fontSize}px monospace`;
        atlasCtx.textBaseline = 'top';

        for (let c = 0; c < colors.length; c++) {
            atlasCtx.fillStyle = colors[c];
            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const x = i * this.charWidth;
                const y = c * this.charHeight;
                atlasCtx.fillText(char, x, y);
                this.atlasMap.set(`${char}_${colors[c]}`, { x, y });
            }
        }
        console.log(`[MatrixGlitchRenderer] Character atlas created (${this.charAtlas.width}x${this.charAtlas.height}px).`);
    }

    _initializeLetters() {
        const totalLetters = this.grid.columns * this.grid.rows;
        this.letters = Array.from({ length: totalLetters }, () => ({
            char: this._getRandomChar(),
            color: this._getRandomColor(),
            xOffset: 0,
            yOffset: 0,
        }));
    }

    _getRandomChar() {
        return this.lettersAndSymbols[Math.floor(Math.random() * this.lettersAndSymbols.length)];
    }

    _getRandomColor() {
        return this.dynamicColorPalette[Math.floor(Math.random() * this.dynamicColorPalette.length)];
    }

    _updateBaseGlitch(energy) {
        if (this.letters.length === 0) return;
        const glitchFactor = 1 + (energy * (this.settings.audioReactivity || 15));
        const updateCount = Math.max(1, Math.floor(this.letters.length * 0.01 * glitchFactor));

        for (let i = 0; i < updateCount; i++) {
            const index = Math.floor(Math.random() * this.letters.length);
            if (this.letters[index]) {
                this.letters[index].char = this._getRandomChar();
                this.letters[index].color = this._getRandomColor();
            }
        }
    }

    _updateAndDrawRain(highestY) {
        if(!this.ctx || !this.canvas) return;

        const rainChance = (this.settings.rainMaxChance || 0.5) * highestY;
        if (Math.random() < rainChance) {
            const stream = this.rainStreamPool.pop() || {};
            stream.col = Math.floor(Math.random() * this.grid.columns);
            stream.y = -this.charHeight;
            stream.speed = (this.settings.rainBaseSpeed || 1.5) + highestY * (this.settings.rainSpeedYFactor || 4);
            stream.length = Math.floor(this.settings.rainStreamLength || 20);
            stream.characters = Array.from({ length: stream.length }, () => this._getRandomChar());
            stream.headColor = this.settings.rainGlowColor || '#FFFFFF';
            this.rainStreams.push(stream);
        }

        this.ctx.font = `${this.fontSize}px monospace`;
        this.ctx.textBaseline = 'top';

        for (let i = this.rainStreams.length - 1; i >= 0; i--) {
            const stream = this.rainStreams[i];
            stream.y += stream.speed;

            for (let j = 0; j < stream.length; j++) {
                const charY = stream.y - (j * this.charHeight);
                if (charY > this.canvas.height || charY < -this.charHeight) continue;

                const char = stream.characters[j % stream.characters.length];
                const charX = stream.col * this.charWidth;

                if (j === 0) {
                    this.ctx.fillStyle = stream.headColor;
                    this.ctx.shadowColor = stream.headColor;
                    this.ctx.shadowBlur = 15;
                } else {
                    const progress = j / stream.length;
                    this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(this.dynamicColorPalette[0], 1.0 - progress);
                    this.ctx.shadowBlur = 0;
                }
                this.ctx.fillText(char, charX, charY);
            }

            if (stream.y - (stream.length * this.charHeight) > this.canvas.height) {
                this.rainStreams.splice(i, 1);
                this.rainStreamPool.push(stream);
            }
        }
        this.ctx.shadowBlur = 0;
    }

    _drawTouchHighlights(activeTouchStates) {
        if (!this.settings.touchHighlight || activeTouchStates.length === 0) return;

        this.ctx.globalCompositeOperation = 'lighter';
        activeTouchStates.forEach(touch => {
            const x = touch.x * this.canvas.width;
            const y = (1 - touch.y) * this.canvas.height;
            const radius = this.settings.touchHighlightRadius || 100;
            const opacity = this.settings.touchHighlightOpacity || 0.1;
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
            const color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12] || this.themeColors.primary;

            gradient.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(color, opacity));
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalCompositeOperation = 'source-over';
    }

    _drawVignette() {
        if (!this.settings.outerVignette) return;
        const { width, height } = this.canvas;
        const outerGradient = this.ctx.createRadialGradient(width/2, height/2, width * 0.3, width/2, height/2, width * 0.7);
        outerGradient.addColorStop(0, 'rgba(0,0,0,0)');
        outerGradient.addColorStop(1, 'rgba(0,0,0,1)');
        this.ctx.fillStyle = outerGradient;
        this.ctx.fillRect(0, 0, width, height);
    }

    _updateDisplacements(activeTouchStates) {
        this.letters.forEach(letter => {
            if (Math.abs(letter.xOffset) > 0.01 || Math.abs(letter.yOffset) > 0.01) {
                letter.xOffset *= (1 - (this.settings.displacementReturnSpeed || 0.1));
                letter.yOffset *= (1 - (this.settings.displacementReturnSpeed || 0.1));
            } else {
                letter.xOffset = 0;
                letter.yOffset = 0;
            }
        });

        if (!this.settings.displacementEnabled || activeTouchStates.length === 0) return;

        activeTouchStates.forEach(touch => {
            const touchX = touch.x * this.canvas.width;
            const touchY = (1 - touch.y) * this.canvas.height;
            const dispRadius = this.settings.displacementRadius || 120;
            const dispRadiusSq = dispRadius * dispRadius;
            const dispStrength = this.settings.displacementStrength || 25;

            const startCol = Math.floor((touchX - dispRadius) / this.charWidth);
            const endCol = Math.ceil((touchX + dispRadius) / this.charWidth);
            const startRow = Math.floor((touchY - dispRadius) / this.charHeight);
            const endRow = Math.ceil((touchY + dispRadius) / this.charHeight);

            for (let r = startRow; r < endRow; r++) {
                if (r < 0 || r >= this.grid.rows) continue;
                for (let c = startCol; c < endCol; c++) {
                    if (c < 0 || c >= this.grid.columns) continue;

                    const index = c + r * this.grid.columns;
                    const letter = this.letters[index];
                    if (!letter) continue;

                    const letterX = c * this.charWidth + this.charWidth / 2;
                    const letterY = r * this.charHeight + this.charHeight / 2;

                    const dx = letterX - touchX;
                    const dy = letterY - touchY;
                    const distanceSq = dx * dx + dy * dy;

                    if (distanceSq < dispRadiusSq) {
                        const distance = Math.sqrt(distanceSq);
                        const progress = distance / dispRadius;
                        const force = Math.sin(progress * Math.PI) * dispStrength;
                        const angle = Math.atan2(dy, dx);

                        letter.xOffset += Math.cos(angle) * force;
                        letter.yOffset += Math.sin(angle) * force;
                    }
                }
            }
        });
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas || !this.charAtlas || this.canvas.width === 0) return;

        const now = performance.now();
        const glitchSpeed = this.settings.glitchSpeed || 80;

        if (now - this.lastGlitchTime >= glitchSpeed) {
            let energy = audioData ? Math.sqrt(audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length) : 0;
            this._updateBaseGlitch(energy);
            this.lastGlitchTime = now;
        }

        this._updateDisplacements(activeTouchStates);

        this.ctx.fillStyle = this.themeColors.background || '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.letters.forEach((letter, index) => {
            const atlasCoords = this.atlasMap.get(`${letter.char}_${letter.color}`);
            if (atlasCoords) {
                const baseX = (index % this.grid.columns) * this.charWidth;
                const baseY = Math.floor(index / this.grid.columns) * this.charHeight;
                this.ctx.drawImage(
                    this.charAtlas,
                    atlasCoords.x, atlasCoords.y, this.charWidth, this.charHeight,
                    baseX + letter.xOffset, baseY + letter.yOffset, this.charWidth, this.charHeight
                );
            }
        });

        const blurAmount = this.settings.backgroundBlur || '0px';
        if (blurAmount !== '0px') {
            this.ctx.filter = `blur(${blurAmount})`;
            this.ctx.drawImage(this.canvas, 0, 0);
            this.ctx.filter = 'none';
        }

        const highestY = activeTouchStates.length > 0 ? activeTouchStates.reduce((max, touch) => Math.max(max, touch.y), 0) : 0;

        this._updateAndDrawRain(highestY);
        this._drawTouchHighlights(activeTouchStates);
        this._drawVignette();
    }

    dispose() {
        this.letters = [];
        this.rainStreams = [];
        this.rainStreamPool = [];
        this.charAtlas = null;
        this.atlasMap.clear();
        console.log("[MatrixGlitchRenderer] Disposed.");
    }
}

// Саморегистрация класса
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer) {
    visualizer.registerRenderer('MatrixGlitchRenderer', MatrixGlitchRenderer);
}