// Файл: app/src/main/assets/js/visualizer.js
/**
 * @file visualizer.js
 * @description
 * This module is responsible for rendering all visual aspects on the main XY pad canvas.
 * It manages different types of visualizers (e.g., waveform, particles, nebula) and touch effects.
 * Key functionalities include:
 * - Initializing the canvas and its 2D rendering context.
 * - Registering and managing different renderer modules for main visualizations and touch feedback.
 * - Dynamically switching between visualizer types (`setVisualizerType`) and touch effects (`setTouchEffectType`).
 * - Handling canvas resizing to adapt to different screen dimensions.
 * - Running the main animation loop (`draw`) using `fpsManager` for consistent frame rates.
 * - Receiving touch event notifications (`notifyTouchDown`, `notifyTouchMove`, `notifyTouchUp`) from `pad.js`
 *   to trigger touch-specific visual effects.
 * - Integrating with the `synth.js` analyser node to get audio data for visualizations.
 * - Managing theme color updates and applying them to renderers.
 * - Drawing pad-specific hints like active note highlights or harmonic markers (`updatePadHints`).
 */
const visualizer = {
    canvas: null,
    ctx: null,
    analyser: null,
    currentVizType: 'waves',
    currentTouchEffectType: 'glow',
    activeRenderer: null,
    activeTouchEffectRenderer: null,
    vizModuleSettings: {},
    touchEffectModuleSettings: {},
    animationFrameId: null,
    isReady: false,
    activeTouchPointsMap: new Map(),
    themeColors: {
        primary: 'rgba(33, 150, 243, 0.7)',
        accent: 'rgba(255, 64, 129, 0.7)',
        background: 'rgba(255, 255, 255, 0)',
        text: '#333333',
        border: 'rgba(224, 224, 224, 1)'
    },
    noteColors: [], // Массив для хранения 12 цветов нот
    renderersRegistry: {},
    touchEffectRenderersRegistry: {},
    _padHints: [], // Храним текущие активные сияния/индикаторы
    padHintsRendererInstance: null,
    _padHintsToDraw: [], // --- НОВОЕ СВОЙСТВО ДЛЯ ПОДСКАЗОК ПЭДА ---
    _prevPadHintsToDraw: null,
    _fadingPadHints: [],
    debugMode: true, // Set to true for verbose logging
    fpsManager: null,
    _hexToRgbCache: {}, // Глобальный кеш для hexToRgb
    _colorWithAlphaCache: {}, // Глобальный кеш для getColorWithAlpha

    // [НОВОЕ] Свойства для отслеживания жестов
    _gestureState: {
        isPinching: false,
        initialPinchDistance: 0,
        
        isRotating: false,
        initialRotationAngle: 0,
        
        lastTap: { time: 0, x: 0, y: 0, count: 0 },
        lastPointerDown: { time: 0, x: 0, y: 0 }
    },

    // Добавить новый вспомогательный метод в visualizer.js
    _resetCanvasContext() {
        if (!this.ctx) return;
        this.ctx.globalAlpha = 1.0;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = '#000000';
        this.ctx.strokeStyle = '#000000';
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'butt';
        this.ctx.lineJoin = 'miter';
        if (typeof this.ctx.filter !== 'undefined') {
            this.ctx.filter = 'none';
        }
        this.ctx.beginPath(); // Очищаем любой незавершенный путь
        if (this.debugMode) console.log('[Visualizer v4.1] Canvas context reset to defaults.');
    },

    /**
     * Initializes the visualizer module.
     * Sets up the canvas, rendering context, and FPS manager.
     * Registers a resize listener and prepares the PadHintsRenderer.
     * @param {HTMLCanvasElement} canvasElement - The canvas element to draw on.
     * @param {Tone.Analyser|null} [analyserInstance=null] - Optional. An analyser node from the synth.
     *                                                      If not provided, it will try to get it from `synth.js`.
     * @async
     */
    async init(canvasElement, analyserInstance = null) {
        if (this.debugMode) console.log('[Visualizer LOG init] Initializing visualizer...');
        if (!canvasElement) {
            if (this.debugMode) console.error('[Visualizer LOG init] Canvas element not provided!');
            this.isReady = false;
            return;
        }
        this.canvas = canvasElement;
        this.activeTouchPointsMap = new Map();
        try {
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) throw new Error("Failed to get 2D context.");
        } catch (error) {
            if (this.debugMode) console.error('[Visualizer LOG init] Failed to get canvas context:', error);
            this.isReady = false;
            return;
        }

        this.isReady = false;
        this.analyser = analyserInstance;
        if (this.debugMode && this.analyser) console.log('[Visualizer LOG init] Analyser instance provided directly:', this.analyser);

        if (!this.analyser) {
            if (this.debugMode) console.warn('[Visualizer LOG init] Analyser instance not provided directly. Polling for synth readiness...');
            let attempts = 0;
            const maxAttempts = 10; // Poll for up to 2 seconds (10 * 200ms)
            while (attempts < maxAttempts && !this.analyser) {
                if (typeof synth !== 'undefined' && typeof synth.getAnalyser === 'function') {
                    if (this.debugMode) console.log(`[Visualizer LOG init] Poll attempt ${attempts + 1}: Synth found. synth.isReady = ${synth.isReady}`);
                    if (synth.isReady) {
                        this.analyser = synth.getAnalyser();
                        if (this.debugMode && this.analyser) console.log('[Visualizer LOG init] Analyser obtained from synth on attempt ' + (attempts + 1) + ':', this.analyser);
                    } else {
                        if (this.debugMode) console.warn(`[Visualizer LOG init] Poll attempt ${attempts + 1}: Synth is not ready yet.`);
                    }
                } else {
                     if (this.debugMode) console.warn(`[Visualizer LOG init] Poll attempt ${attempts + 1}: Synth or synth.getAnalyser is not available.`);
                }

                if (!this.analyser) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        if (this.debugMode) console.log(`[Visualizer LOG init] Waiting 200ms before next poll attempt...`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
        }

        if (this.analyser) {
            if (this.debugMode) console.log('[Visualizer LOG init] Analyser is available.');
            this.isReady = true;
        } else {
            if (this.debugMode) console.error('[Visualizer LOG init] Analyser node still not available after polling attempts!');
        }
        console.log(`[Visualizer LOG init] visualizer.isReady set to: ${this.isReady}`);

        this._padHintsToDraw = [];

        // Only proceed with parts that depend on canvas/ctx if they are valid
        if (this.ctx && this.canvas) {
            if (this.isReady) { // Only if analyser is also ready for things that might depend on it
                if (typeof padHintsRenderer !== 'undefined' && typeof padHintsRenderer.init === 'function') {
                    this.padHintsRendererInstance = Object.create(padHintsRenderer);
                    this.padHintsRendererInstance.init(this.ctx, this.canvas, this.themeColors, this);
                    if (this.debugMode) console.log('[Visualizer LOG init] PadHintsRenderer initialized.');
                } else {
                    if (this.debugMode) console.warn('[Visualizer LOG init] padHintsRenderer.js not found or invalid.');
                }
            } // end if this.isReady (for analyser dependent parts)

            this.resizeCanvas();
            this.resizeCanvasBound = this.resizeCanvas.bind(this);
            window.addEventListener('resize', this.resizeCanvasBound);
            if (this.debugMode) console.log('[Visualizer LOG init] Canvas setup and resize listener added.');
        } else {
             if (this.debugMode) console.error('[Visualizer LOG init] Canvas or context is null, skipping further UI setup in init.');
        }

        if (this.isReady) {
            if (this.debugMode) console.log('[Visualizer LOG init] Initialized successfully (isReady=true).');
        } else {
            if (this.debugMode) console.error('[Visualizer LOG init] Failed to initialize fully (isReady=false), likely due to missing analyser.');
        }
        // FPS Manager
        this.fpsManager = Object.create(fpsManager);
        this.fpsManager.init(this.draw.bind(this));
        this.fpsManager.setTargetFps(60);

        this._generateNoteColors();
    },

    /**
     * Generates a palette of 12 distinct HSL colors, typically used for note representation.
     * @private
     */
    _hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n =>
            l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        const toHex = x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    },

    _generateNoteColors() {
        this.noteColors = [];
        for (let i = 0; i < 12; i++) {
            const hue = (i * 30) % 360; // 360 / 12 = 30
            // Saturation: 90%, Lightness: 65% (same as before)
            this.noteColors.push(this._hslToHex(hue, 90, 65));
        }
        if (this.debugMode) console.log("[Visualizer] Generated note color palette (HEX):", this.noteColors);
    },

    /**
     * Registers a new visualizer renderer class.
     * @param {string} name - The unique name/ID for the renderer (e.g., 'nebulaRenderer').
     * @param {function} rendererClass - The constructor function of the renderer class.
     */
    registerRenderer(name, rendererClass) {
        if (typeof name === 'string' && typeof rendererClass === 'function') {
            this.renderersRegistry[name] = rendererClass;
            if (this.debugMode) console.log(`[Visualizer v4.0] Registered visualizer renderer: ${name}`);
        } else {
            if (this.debugMode) console.error(`[Visualizer v4.0] Failed to register visualizer renderer: Invalid name or class.`);
        }
    },

    /**
     * Registers a new touch effect renderer class.
     * @param {string} name - The unique name/ID for the touch effect renderer (e.g., 'glowEffect').
     * @param {function} effectClass - The constructor function of the touch effect renderer class.
     */
    registerTouchEffectRenderer(name, effectClass) {
        if (typeof name === 'string' && typeof effectClass === 'function') {
            this.touchEffectRenderersRegistry[name] = effectClass;
            if (this.debugMode) console.log(`[Visualizer v4.0] Registered touch effect renderer: ${name}`);
        } else {
            if (this.debugMode) console.error(`[Visualizer v4.0] Failed to register touch effect renderer: Invalid name or class.`);
        }
    },

    /**
     * Resizes the canvas to fit its parent container.
     * Also notifies the active main renderer and touch effect renderer about the resize.
     * This method is debounced using `requestAnimationFrame`.
     */
    resizeCanvas() {
        if (!this.canvas || !this.canvas.parentElement) return;
        requestAnimationFrame(() => {
            const parent = this.canvas.parentElement;
            const newWidth = parent.clientWidth;
            const newHeight = parent.clientHeight;

            if (newWidth > 0 && newHeight > 0) {
                if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
                    this.canvas.width = newWidth;
                    this.canvas.height = newHeight;
                    if (this.debugMode) console.log(`[Visualizer v4.0] Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
                    if (this.activeRenderer && typeof this.activeRenderer.onResize === 'function') {
                        this.activeRenderer.onResize(newWidth, newHeight);
                    }
                    if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onResize === 'function') {
                        this.activeTouchEffectRenderer.onResize(newWidth, newHeight);
                    }
                }
            }
        });
    },

    /**
     * Sets the active visualizer type.
     * Loads the specified visualizer module, initializes its renderer, and starts the animation loop.
     * Disposes of any previously active renderer.
     * @param {string} typeId - The ID of the visualizer type to activate (e.g., 'nebula', 'wavesRenderer').
     * @async
     * @returns {Promise<void>}
     */
    async setVisualizerType(typeId) {
        if (!typeId) {
            if (this.debugMode) console.warn('[Visualizer v4.0] setVisualizerType called with null/empty typeId. Retaining current.');
            return;
        }
        if (this.debugMode) console.log(`[Visualizer v4.0] Setting visualizer type to ${typeId}`);
        this.currentVizType = typeId;

        // Сначала останавливаем предыдущий цикл, если он был, и освобождаем ресурсы
        this.stop();
        if (this.activeRenderer && typeof this.activeRenderer.dispose === 'function') {
            this.activeRenderer.dispose();
        }
        this.activeRenderer = null;

        // >>> РЕКОМЕНДАЦИЯ: Добавить сброс контекста здесь <<<
        if (this.ctx) {
            this._resetCanvasContext();
        }
        // >>> КОНЕЦ РЕКОМЕНДАЦИИ <<<

        try {
            const vizModuleInfo = await moduleManager.getModule(typeId);
            if (this.debugMode) console.log(`[Visualizer v4.0 DEBUG] Loaded module info for ${typeId}:`, vizModuleInfo ? JSON.parse(JSON.stringify(vizModuleInfo)) : 'null');

            let coreData = null;
            if (vizModuleInfo && vizModuleInfo.data) {
                if (typeId === 'spirit_forest' &&
                    vizModuleInfo.data.data &&
                    vizModuleInfo.data.data.data &&
                    typeof vizModuleInfo.data.data.data.rendererScript === 'string') { // Check if deeper path is valid for spirit_forest

                    coreData = vizModuleInfo.data.data.data;
                    if (this.debugMode) console.warn(`[Visualizer DEBUG ${typeId}] Using explicit DEEPER coreData path for spirit_forest.`);

                } else if (vizModuleInfo.data.data && typeof vizModuleInfo.data.data.rendererScript === 'string') {
                    // Standard path, ensure rendererScript exists here
                    coreData = vizModuleInfo.data.data;
                    if (typeId === 'spirit_forest' && this.debugMode) {
                        // This case means the explicit deeper check for spirit_forest failed, and we're falling back.
                        // This might still be problematic if spirit_forest truly needs the deeper data.
                        console.warn(`[Visualizer DEBUG ${typeId}] spirit_forest using STANDARD coreData path as deeper path check failed. Potential issue if deeper data is required.`);
                    }
                } else if (vizModuleInfo.data.data && vizModuleInfo.data.data.data && typeId === 'spirit_forest') {
                    // Fallback for spirit_forest if no rendererScript found in either standard or deeper path, but deeper data exists
                     if (this.debugMode) {
                        console.warn(`[Visualizer DEBUG ${typeId}] spirit_forest falling back to DEEPER data path despite missing rendererScript there. This implies settings might be in deeper path but script name is missing/elsewhere.`);
                     }
                     coreData = vizModuleInfo.data.data.data;
                } else if (vizModuleInfo.data.data) { // General fallback if other conditions not met
                     coreData = vizModuleInfo.data.data;
                }
            }

            if (!coreData) {
                 if (this.debugMode) {
                    console.error(`[Visualizer v4.0] Core data block (coreData) could not be determined for visualizer: ${typeId}.`);
                    if (vizModuleInfo && vizModuleInfo.data) {
                         console.log(`[Visualizer DEBUG ${typeId}] vizModuleInfo.data content: `, JSON.stringify(vizModuleInfo.data, null, 2));
                    } else if (vizModuleInfo) {
                         console.log(`[Visualizer DEBUG ${typeId}] vizModuleInfo content: `, JSON.stringify(vizModuleInfo, null, 2));
                    } else {
                         console.log(`[Visualizer DEBUG ${typeId}] vizModuleInfo itself is null or undefined.`);
                    }
                }
                return;
            }

            // rendererScriptName should be derived from the chosen coreData, or handled if missing
            const rendererScriptName = coreData.rendererScript;
            this.vizModuleSettings = coreData.settings || {};

            if (this.debugMode) {
                console.log(`[Visualizer v4.0 DEBUG] Renderer script name for ${typeId}: ${rendererScriptName}`);
                console.log(`[Visualizer v4.0 DEBUG] Settings for ${typeId}:`, JSON.parse(JSON.stringify(this.vizModuleSettings)));
            }

            if (!rendererScriptName) {
                if (this.debugMode) console.error(`[Visualizer v4.0] rendererScript is missing in module data for ${typeId}`);
                return;
            }

            const RendererClass = this._getRendererClassFromRegistry(rendererScriptName, this.renderersRegistry);

            if (RendererClass) {
                if (!this.analyser) {
                    if (this.debugMode) console.warn(`[Visualizer] Analyser is null before initializing ${RendererClass.name}. Attempting to fetch again or wait...`);
                    if (typeof synth !== 'undefined' && typeof synth.getAnalyser === 'function') {
                        this.analyser = synth.getAnalyser();
                    }
                    if (!this.analyser) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        if (typeof synth !== 'undefined' && typeof synth.getAnalyser === 'function') {
                            this.analyser = synth.getAnalyser();
                        }
                    }
                }

                if (!this.analyser) {
                    if (this.debugMode) console.error(`[Visualizer] CRITICAL: Analyser STILL NULL for ${RendererClass.name}. Renderer might fail or not display audio data.`);
                } else {
                    if (this.debugMode) console.log(`[Visualizer] Analyser is available for ${RendererClass.name}. Type: ${this.analyser.type}`);
                }

                // Принудительно установим корректные размеры холста ПЕРЕД init
                if (this.canvas && this.canvas.parentElement) {
                    const parent = this.canvas.parentElement;
                    const newWidth = parent.clientWidth;
                    const newHeight = parent.clientHeight;
                    if (newWidth > 0 && newHeight > 0) {
                        if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
                            this.canvas.width = newWidth;
                            this.canvas.height = newHeight;
                            if (this.debugMode) console.log(`[Visualizer setVisualizerType] Canvas resized to ${newWidth}x${newHeight} before init.`);
                        }
                    }
                } else if (this.debugMode) {
                    console.warn("[Visualizer setVisualizerType] Canvas or its parent missing, cannot resize before init.");
                }

                // Дополнительная проверка после попытки изменения размера, если все еще 0
                if (this.canvas && (this.canvas.width === 0 || this.canvas.height === 0)) {
                     if (this.debugMode) console.error(`[Visualizer] Canvas dimensions STILL ZERO for ${RendererClass.name} after explicit resize attempt. Renderer WILL LIKELY FAIL.`);
                }

                this.activeRenderer = new RendererClass();
                this.activeRenderer.init(this.ctx, this.canvas, this.vizModuleSettings, this.themeColors, this, this.analyser);

                // Явный вызов onResize после init, чтобы рендерер адаптировался,
                // если его init не делает этого сам или если размеры могли измениться.
                if (this.canvas && typeof this.activeRenderer.onResize === 'function') {
                    this.activeRenderer.onResize(this.canvas.width, this.canvas.height);
                }

                if (typeof this.activeRenderer.onThemeChange === 'function') {
                    this.activeRenderer.onThemeChange(this.themeColors);
                }
                if (this.debugMode) console.log(`[Visualizer v4.0] Visualizer renderer '${typeId}' (class: ${RendererClass.name}) activated.`);
                this.start();
            } else {
                if (this.debugMode) console.error(`[Visualizer v4.0] Renderer class not found for ${rendererScriptName}. Make sure it's registered or named correctly.`);
            }
        } catch (error) {
            if (this.debugMode) console.error(`[Visualizer v4.0] Error setting visualizer type ${typeId}:`, error);
            this.activeRenderer = null;
        }
        this.configureAnalyser();
    },

    /**
     * Sets the active touch effect type.
     * Loads the specified touch effect module and initializes its renderer.
     * Disposes of any previously active touch effect renderer.
     * @param {string} typeId - The ID of the touch effect type to activate (e.g., 'glow', 'sparkEffect') or 'none'.
     * @async
     * @returns {Promise<void>}
     */
    async setTouchEffectType(typeId) {
        const targetEffectId = typeId || 'none';
        if (this.debugMode) console.log(`[Visualizer v4.0] Setting touch effect type to ${targetEffectId}`);
        this.currentTouchEffectType = targetEffectId;

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.dispose === 'function') {
            this.activeTouchEffectRenderer.dispose();
        }
        this.activeTouchEffectRenderer = null;

        if (targetEffectId === 'none') {
            if (this.debugMode) console.log(`[Visualizer v4.0] Touch effects disabled.`);
            return;
        }

        try {
            if (this.debugMode) console.log(`[Visualizer v4.0] Fetching module info for touch effect ${targetEffectId}...`);
            const effectModuleInfo = await moduleManager.getModule(targetEffectId);
            if (this.debugMode) console.log(`[Visualizer v4.0 DEBUG] Loaded module info for touch effect ${targetEffectId}:`, effectModuleInfo ? JSON.parse(JSON.stringify(effectModuleInfo)) : 'null');

            if (!effectModuleInfo || !effectModuleInfo.data || !effectModuleInfo.data.data) {
                if (this.debugMode) console.error(`[Visualizer v4.0] Module info or core data block (module.data.data) not found for touch effect: ${targetEffectId}`);
                return;
            }

            const coreData = effectModuleInfo.data.data;
            const rendererScriptName = coreData.rendererScript;
            this.touchEffectModuleSettings = coreData.settings || {};
            if (this.debugMode) {
                console.log(`[Visualizer v4.0 DEBUG] Renderer script name for ${targetEffectId}: ${rendererScriptName}`);
                console.log(`[Visualizer v4.0 DEBUG] Settings for ${targetEffectId}:`, JSON.parse(JSON.stringify(this.touchEffectModuleSettings)));
            }

            if (!rendererScriptName) {
                if (this.debugMode) console.warn(`[Visualizer v4.0] rendererScript is missing for touch effect module ${targetEffectId}. Assuming no visual effect.`);
                return;
            }

            if (this.debugMode) console.log(`[Visualizer v4.0] Looking for effect renderer class for ${rendererScriptName}...`);
            const EffectRendererClass = this._getRendererClassFromRegistry(rendererScriptName, this.touchEffectRenderersRegistry);

            if (EffectRendererClass) {
                if (this.debugMode) console.log(`[Visualizer v4.0] Creating new instance of ${EffectRendererClass.name}...`);
                this.activeTouchEffectRenderer = new EffectRendererClass();
                this.activeTouchEffectRenderer.init(this.ctx, this.canvas, this.touchEffectModuleSettings, this.themeColors, this);
                if (typeof this.activeTouchEffectRenderer.onThemeChange === 'function') {
                    this.activeTouchEffectRenderer.onThemeChange(this.themeColors);
                }
                if (this.debugMode) console.log(`[Visualizer v4.0] Touch effect renderer '${targetEffectId}' (class: ${EffectRendererClass.name}) activated.`);
                if (!this.animationFrameId && this.isReady) this.start();
            } else {
                if (this.debugMode) console.error(`[Visualizer v4.0] Touch Effect Renderer class not found for ${rendererScriptName}.`);
            }
        } catch (error) {
            if (this.debugMode) console.error(`[Visualizer v4.0] Error setting touch effect type ${targetEffectId}:`, error);
            this.activeTouchEffectRenderer = null;
        }
    },

    /**
     * Retrieves a renderer class from a given registry based on a script path or name.
     * Handles cases where scriptPath might include a full path or just the class name.
     * @param {string} scriptPath - The script path or class name (e.g., "visualizers/nebulaRenderer.js" or "nebulaRenderer").
     * @param {object} registry - The registry to search (e.g., `this.renderersRegistry`).
     * @returns {function|null} The renderer class constructor or null if not found.
     * @private
     */
    _getRendererClassFromRegistry(scriptPath, registry) {
        if (!scriptPath || typeof scriptPath !== 'string') {
            if (this.debugMode) console.error("[Visualizer v4.0 _getRendererClassFromRegistry] Invalid scriptPath provided:", scriptPath);
            return null;
        }
        const parts = scriptPath.split('/');
        const fileNameWithExtension = parts[parts.length - 1];

        let classNamePrefix = "";
        if (fileNameWithExtension.endsWith('Renderer.js')) {
            classNamePrefix = fileNameWithExtension.replace('Renderer.js', '');
        } else if (fileNameWithExtension.endsWith('Effect.js')) {
            classNamePrefix = fileNameWithExtension.replace('Effect.js', '');
        } else {
            if (this.debugMode) console.warn(`[Visualizer v4.0 _getRendererClassFromRegistry] Unknown script extension for ${scriptPath}. Trying to derive class name.`);
            const dotJsIndex = fileNameWithExtension.lastIndexOf('.js');
            if (dotJsIndex !== -1) {
                classNamePrefix = fileNameWithExtension.substring(0, dotJsIndex);
            } else {
                classNamePrefix = fileNameWithExtension;
            }
        }

        let expectedClassName = classNamePrefix.charAt(0).toUpperCase() + classNamePrefix.slice(1);
        if (scriptPath.includes('/visualizers/')) {
            expectedClassName += "Renderer";
        } else if (scriptPath.includes('/touchEffects/')) {
            expectedClassName += "Effect";
        }

        const RendererClass = registry[expectedClassName];
        if (RendererClass) {
            if (this.debugMode) console.log(`[Visualizer v4.0 _getRendererClassFromRegistry] Found ${expectedClassName} in registry for path ${scriptPath}.`);
            return RendererClass;
        }

        if (window[expectedClassName]) {
            if (this.debugMode) console.warn(`[Visualizer v4.0 _getRendererClassFromRegistry] Found ${expectedClassName} in window scope (fallback) for path ${scriptPath}. Consider registering it.`);
            return window[expectedClassName];
        }

        if (this.debugMode) console.error(`[Visualizer v4.0 _getRendererClassFromRegistry] Class ${expectedClassName} not found in registry or window scope for path ${scriptPath}.`);
        return null;
    },

    /**
     * Configures the analyser node with settings appropriate for the current visualizer type.
     * For example, sets FFT size, smoothing, and type (waveform/fft).
     */
    configureAnalyser() {
        if (this.analyser) {
            try {
                const fftBasedTypes = ['spectrum', 'circular_spectrum', 'reactive_grid']; // типы, требующие FFT
                let mainVizRequiresFFT = this.activeRenderer && this.vizModuleSettings?.analyserType === 'fft';
                if (!mainVizRequiresFFT && this.currentVizType) { // Проверяем по имени типа, если analyserType не задан в настройках
                    mainVizRequiresFFT = fftBasedTypes.includes(this.currentVizType);
                }

                let targetType = mainVizRequiresFFT ? 'fft' : 'waveform';

                // Если активен какой-то фоновый визуализатор, который требует FFT, переключаемся на FFT
                if (this.activeRenderer && this.vizModuleSettings?.backgroundVisualizer && fftBasedTypes.includes(this.vizModuleSettings.backgroundVisualizer) && targetType !== 'fft') {
                    if (this.debugMode) console.log(`[Visualizer v4.0] Background visualizer '${this.vizModuleSettings.backgroundVisualizer}' requires FFT. Overriding main analyser type.`);
                    targetType = 'fft';
                }

                const settingsToUse = this.vizModuleSettings || {};
                const targetSize = (targetType === 'fft') ? (settingsToUse.fftSize || 512) : 1024;
                const smoothing = settingsToUse.smoothingTimeConstant ?? settingsToUse.smoothing ?? 0.8;

                if (this.analyser.type !== targetType) this.analyser.type = targetType;
                if (this.analyser.size !== targetSize) this.analyser.size = targetSize;
                if (this.analyser.smoothing !== smoothing) this.analyser.smoothing = smoothing;

                if (this.debugMode) console.log(`[Visualizer v4.0 configureAnalyser] Analyser set to: type=${this.analyser.type}, size=${this.analyser.size}, smoothing=${this.analyser.smoothing}`);

            } catch (error) {
                if (this.debugMode) console.error(`[Visualizer v4.0 configureAnalyser] Error:`, error);
            }
        }
    },

    /**
     * Updates the theme colors used by the visualizer and notifies the active renderers.
     * Typically called when the application theme changes.
     */
    updateTheme() {
        if (!this.isReady) return;
        requestAnimationFrame(() => {
            try {
                const computedStyle = getComputedStyle(document.body);
                this.themeColors.primary = computedStyle.getPropertyValue('--color-primary').trim() || this.themeColors.primary;
                this.themeColors.accent = computedStyle.getPropertyValue('--color-accent').trim() || this.themeColors.accent;
                const bgRgb = computedStyle.getPropertyValue('--color-background-rgb').trim();
                this.themeColors.background = bgRgb ? `rgba(${bgRgb}, 0)` : this.themeColors.background;
                this.themeColors.text = computedStyle.getPropertyValue('--color-text-primary').trim() || this.themeColors.text;
                this.themeColors.border = computedStyle.getPropertyValue('--color-border').trim() || this.themeColors.border;

                if (this.activeRenderer && typeof this.activeRenderer.onThemeChange === 'function') {
                    this.activeRenderer.onThemeChange(this.themeColors);
                }
                if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onThemeChange === 'function') {
                    this.activeTouchEffectRenderer.onThemeChange(this.themeColors);
                }
                if (this.padHintsRendererInstance && typeof this.padHintsRendererInstance.onThemeChange === 'function') {
                    this.padHintsRendererInstance.onThemeChange(this.themeColors);
                }
            } catch (e) {
                if (this.debugMode) console.error("[Visualizer v4.0 updateTheme] Failed to read theme CSS variables:", e);
            }
        });
    },

    /**
     * Starts the main animation loop if it's not already running.
     * Uses the `fpsManager` to control the frame rate.
     */
    start() {
        if (!this.isReady || (this.fpsManager && this.fpsManager._isActive)) return;
        if (!this.activeRenderer && !this.activeTouchEffectRenderer) {
            if (this.debugMode) console.log('[Visualizer v4.0] No active renderers to start animation loop.');
            return;
        }
        if (this.fpsManager) {
            this.fpsManager.start();
        }
    },

    /**
     * Stops the main animation loop.
     */
    stop() {
        if (this.fpsManager && this.fpsManager._isActive) {
            this.fpsManager.stop();
        }
    },

    _updateGestureState() {
        // [Контекст -> Инициализация] Создаем объект gestureState, который будет передан в рендерер.
        const gestureState = {
            pinch: { isActive: false, scale: 1.0, velocity: 0, center: { x: 0, y: 0 } },
            rotate: { isActive: false, rotation: 0, center: { x: 0, y: 0 } },
            taps: [], // Для быстрых одиночных кликов
            swipes: [] // Для быстрых движений
        };

        const activeTouches = Array.from(this.activeTouchPointsMap.values());

        // [Контекст -> Логика] Распознавание жестов для двух пальцев (щипок и поворот).
        if (activeTouches.length === 2) {
            const t1 = activeTouches[0];
            const t2 = activeTouches[1];
            
            const dx = t1.x - t2.x;
            const dy = t1.y - t2.y;
            const currentDistance = Math.hypot(dx, dy);
            const currentAngle = Math.atan2(dy, dx);
            const centerX = (t1.x + t2.x) / 2;
            const centerY = (t1.y + t2.y) / 2;

            if (!this._gestureState.isPinching && !this._gestureState.isRotating) {
                // [Связь -> Начало жеста] Первый кадр, когда мы обнаружили два пальца.
                // Запоминаем начальные значения.
                this._gestureState.isPinching = true;
                this._gestureState.isRotating = true;
                this._gestureState.initialPinchDistance = currentDistance;
                this._gestureState.initialRotationAngle = currentAngle;
            }

            // [Связь -> Расчет жеста] Рассчитываем текущие значения для кадра.
            gestureState.pinch.isActive = true;
            gestureState.pinch.scale = this._gestureState.initialPinchDistance > 1 ? currentDistance / this._gestureState.initialPinchDistance : 1.0;
            gestureState.pinch.center = { x: centerX, y: centerY };

            gestureState.rotate.isActive = true;
            gestureState.rotate.rotation = currentAngle - this._gestureState.initialRotationAngle;
            gestureState.rotate.center = { x: centerX, y: centerY };
            
            // [Связь -> Обновление] Обновляем "предыдущий" угол для расчета в следующем кадре.
            this._gestureState.initialRotationAngle = currentAngle;

        } else {
            // [Связь -> Завершение жеста] Если количество пальцев не равно двум, сбрасываем состояние.
            this._gestureState.isPinching = false;
            this._gestureState.isRotating = false;
        }
        
        // [Контекст -> TODO] Здесь можно добавить логику распознавания тапов и свайпов,
        // анализируя время и расстояние между onTouchDown и onTouchUp.
        // Пока оставляем пустыми.

        return gestureState;
    },

    /**
     * The main drawing function, called on each animation frame by `fpsManager`.
     * Clears the canvas, then calls the `draw` methods of the active main visualizer renderer,
     * the active touch effect renderer, and the pad hints renderer.
     */
    draw() {
        if (!this.isReady || !this.ctx || !this.canvas) return;
    
        // [НОВОЕ] В самом начале кадра вызываем наш анализатор жестов.
        const gestureState = this._updateGestureState();
    
        const audioData = (this.analyser && this.isReady) ? this.analyser.getValue() : null;
        const activeTouchStates = (typeof pad !== 'undefined' && pad.getActiveTouchStates) ? pad.getActiveTouchStates() : [];
        const deviceTilt = (app && app.state && app.state.deviceTilt) ? app.state.deviceTilt : { pitch: 0, roll: 0 };
    
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
        let finalHapticRequest = null;
    
        // 1. Собираем запрос от основного визуализатора
        if (this.activeRenderer && typeof this.activeRenderer.draw === 'function') {
            try {
                const result = this.activeRenderer.draw(audioData, activeTouchStates, deviceTilt, gestureState);
                if (result && result.hapticRequest) {
                    finalHapticRequest = result.hapticRequest;
                }
            } catch(e) { console.error(`[Visualizer] Error in activeRenderer.draw for ${this.currentVizType}:`, e); }
        }
        
        // 2. Собираем запрос от эффекта касания (он может переопределить запрос от основного)
        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.drawActiveEffects === 'function') {
            try {
                // [ИЗМЕНЕНО] Передаем `gestureState` и сюда
                const result = this.activeTouchEffectRenderer.drawActiveEffects(gestureState);
                if (result && result.hapticRequest) {
                    finalHapticRequest = result.hapticRequest; // Эффект касания имеет приоритет
                }
            } catch(e) { if (this.debugMode) console.error(`[Visualizer v4.1] Error in activeTouchEffectRenderer.drawActiveEffects for ${this.currentTouchEffectType}:`, e); }
        }
    
        // 3. Передаем финальный запрос в сервис вибрации
        if (typeof VibrationService !== 'undefined' && VibrationService.processHapticRequest) {
            VibrationService.processHapticRequest(finalHapticRequest);
        }
        
        this.ctx.restore();
    },

    /**
     * Draws harmonic markers on the canvas based on active touch states and current musical context.
     * This method iterates through `_padHintsToDraw` which are set by `updatePadHints`,
     * and calls specific `_renderMarker_...` methods based on the `hint.markerType`.
     * @param {Map<number, object>} activeTouchStates - A map of active touch states from `pad.js`.
     * @private
     */
    _drawHarmonicMarkers(activeTouchStates) {
        if (!this.padHintsRendererInstance || !this._padHintsToDraw || this._padHintsToDraw.length === 0) {
            return;
        }
        // Группируем hints по zoneIndex
        const zoneHintsMap = {};
        this._padHintsToDraw.forEach(hint => {
            if (hint && typeof hint.zoneIndex !== 'undefined') { // Safety check
                if (!zoneHintsMap[hint.zoneIndex]) zoneHintsMap[hint.zoneIndex] = [];
                zoneHintsMap[hint.zoneIndex].push(hint);
            }
        });

        const rocketSettings = (typeof app !== 'undefined' && app.state && app.state.rocketModeSettings)
            ? app.state.rocketModeSettings
            : { highlightActiveNotes: true, showDirectionalMarkers: true, markerStyle: "GlowFromNote", showOnlyForValidChords: false, animateMarkerFadeOut: true, showChordName: true };
        Object.entries(zoneHintsMap).forEach(([zoneIdx, hints]) => {
            const zoneData = pad._currentDisplayedZones[zoneIdx];
            if (!zoneData) return;
            const zoneRect = {
                x: Math.round(zoneData.startX * this.canvas.width),
                y: 0, // y is typically 0
                width: Math.round((zoneData.endX - zoneData.startX) * this.canvas.width),
                height: this.canvas.height // height is typically an integer
            };
            // Для каждой подсказки рисуем с небольшим смещением/разным радиусом
            hints.forEach((hint, i) => {
                // Смещение для нескольких маркеров: радиус, угол, прозрачность
                const offset = i * 10;
                const fadeAlpha = 1 - i * 0.18;
                if (hint.type === 'active_note_highlight' && rocketSettings.highlightActiveNotes) {
                    this._drawActiveNoteHighlight(zoneRect, hint, fadeAlpha);
                } else if (hint.type === 'harmonic_suggestion' && rocketSettings.showDirectionalMarkers) {
                    const styleRendererMethodName = `_renderMarker_${hint.style}`;
                    if (typeof this[styleRendererMethodName] === 'function') {
                        this[styleRendererMethodName](zoneRect, {...hint, _offset: offset}, activeTouchStates, fadeAlpha);
                    } else {
                        this._renderMarker_GlowFromNote(zoneRect, {...hint, _offset: offset}, activeTouchStates, fadeAlpha);
                    }
                }
                // Подпись
                if (hint.label) {
                    this.ctx.save();
                    this.ctx.font = 'bold 16px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'top';
                    this.ctx.globalAlpha = 0.85;
                    this.ctx.fillStyle = hint.color || '#FFF';
                    this.ctx.strokeStyle = '#222';
                    this.ctx.lineWidth = 2;
                    const centerX = Math.round(zoneRect.x + zoneRect.width / 2);
                    const labelY = Math.round(zoneRect.y + zoneRect.height * 0.01 + i * 18);
                    this.ctx.strokeText(hint.label, centerX, labelY);
                    this.ctx.fillText(hint.label, centerX, labelY);
                    this.ctx.restore();
                }
            });
        });
    },

    /**
     * Renders an active note highlight effect for a pad hint.
     * @param {object} zoneRect - The bounding rectangle of the zone { x, y, width, height }.
     * @param {object} hint - The pad hint object.
     * @param {number} [fadeAlpha=1] - Alpha transparency for fading effects.
     * @private
     */
    _drawActiveNoteHighlight(zoneRect, hint, fadeAlpha = 1) {
        // Красивый glow с blur и плавным градиентом, усиливается при удержании
        if (!this.ctx) return;
        const glowColor = hint.color || "#FFFFFF";
        // Усиление свечения: максимум при 2 сек удержания
        const holdBoost = Math.min(1.0, (hint.holdTimeMs || 0) / 2000);
        const opacity = (0.7 + 0.7 * holdBoost) * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const baseRadius = Math.round(zoneRect.width * (0.6 + 0.4 * holdBoost) + (hint._offset || 0));
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = glowColor;
        // Optimization: Reduce shadowBlur
        this.ctx.shadowBlur = Math.round(16 + 16 * holdBoost + (hint._offset || 0)); // Halved from 32 + 32
        this.ctx.beginPath();
        this.ctx.arc(
            Math.round(zoneRect.x + zoneRect.width / 2),
            Math.round(zoneRect.y + zoneRect.height * 0.13 + (hint._offset || 0)),
            Math.round(baseRadius * 0.5),
            0, Math.PI * 2
        );
        this.ctx.fillStyle = this.getColorWithAlpha(glowColor, 0.5 + 0.3 * holdBoost);
        this.ctx.fill();
        this.ctx.restore();
    },

    /**
     * Renders a "GlowFromNote" style harmonic marker.
     * @param {object} zoneRect - The zone's rectangle.
     * @param {object} hint - The hint object for the marker.
     * @param {Map<number, object>} activeTouchStates - Current active touch states.
     * @param {number} [fadeAlpha=1] - Alpha for fading.
     * @private
     */
    _renderMarker_GlowFromNote(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Мягкое сияние с blur и цветным градиентом
        if (!this.ctx) return;
        const color = hint.color || this.themeColors.accent;
        const opacity = 0.6 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = Math.round(zoneRect.x + zoneRect.width / 2);
        const startY = Math.round(zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0));
        const endRadius = Math.round(zoneRect.height * 0.22 + (hint._offset || 0));
        const innerRadius = Math.round(zoneRect.width * 0.1);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        // Optimization: Reduce shadowBlur
        this.ctx.shadowBlur = Math.round(12 + (hint._offset || 0)); // Halved from 24
        const gradient = this.ctx.createRadialGradient(
            centerX, startY, innerRadius,
            centerX, startY, endRadius
        );
        gradient.addColorStop(0, this.getColorWithAlpha(color, 0.9));
        gradient.addColorStop(0.7, this.getColorWithAlpha(color, 0.2));
        gradient.addColorStop(1, this.getColorWithAlpha(color, 0));
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, startY, endRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    },

    _renderMarker_PulseRing(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Кольцо с glow и прозрачностью
        if (!this.ctx) return;
        const color = hint.color || '#8A2BE2';
        const opacity = 0.7 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = Math.round(zoneRect.x + zoneRect.width / 2);
        const startY = Math.round(zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0));
        const radius = Math.round(zoneRect.width * 0.28 + (hint._offset || 0));
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        // Optimization: Reduce shadowBlur
        this.ctx.shadowBlur = Math.round(9 + (hint._offset || 0)); // Halved from 18
        this.ctx.beginPath();
        this.ctx.arc(centerX, startY, radius, 0, Math.PI * 2);
        this.ctx.lineWidth = 6; // Consider if this can be reduced or if line drawing is necessary
        this.ctx.strokeStyle = this.getColorWithAlpha(color, 0.7);
        this.ctx.stroke();
        this.ctx.restore();
    },

    _renderMarker_WaveToNote(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Волна с плавным градиентом и blur
        if (!this.ctx) return;
        const color = hint.color || this.themeColors.primary;
        const opacity = 0.7 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        // const centerX = Math.round(zoneRect.x + zoneRect.width / 2); // Not directly used for wave path start
        const startDrawY = Math.round(zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0));
        const waveHeight = Math.round(zoneRect.height * 0.13 + (hint._offset || 0));
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        // Optimization: Reduce shadowBlur
        this.ctx.shadowBlur = Math.round(7 + (hint._offset || 0)); // Halved from 14
        this.ctx.lineWidth = 5; // Consider if this can be reduced
        this.ctx.beginPath();
        for (let i = 0; i <= 1; i += 0.04) { // Loop with 25 iterations
            const x = Math.round(zoneRect.x + i * zoneRect.width);
            const y = Math.round(startDrawY + Math.sin(i * Math.PI * 2) * waveHeight);
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.strokeStyle = this.getColorWithAlpha(color, 0.8);
        this.ctx.stroke();
        this.ctx.restore();
    },

    _renderMarker_SparkTrail(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Искры с blur и разными цветами
        if (!this.ctx) return;
        const color = hint.color || '#FFD700';
        const opacity = 0.8 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = Math.round(zoneRect.x + zoneRect.width / 2);
        const startY = Math.round(zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0));
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        for (let i = 0; i < 8; i++) { // Loop 8 times
            const angle = (Math.PI * 2 / 8) * i + (hint._offset || 0) * 0.1;
            const len = Math.round(18 + (hint._offset || 0) + Math.random() * 10);
            const x2 = Math.round(centerX + Math.cos(angle) * len);
            const y2 = Math.round(startY - Math.sin(angle) * len);
            this.ctx.strokeStyle = this.getColorWithAlpha(color, 0.7 + 0.3 * Math.random());
            this.ctx.shadowColor = color;
            // Optimization: Reduce shadowBlur
            this.ctx.shadowBlur = Math.round(5 + (hint._offset || 0)); // Halved from 10
            this.ctx.lineWidth = 2.2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, startY);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
        this.ctx.restore();
    },

    _renderMarker_ShadowDrop(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Мягкая тень с blur
        if (!this.ctx) return;
        const color = hint.color || '#333333';
        const opacity = 0.5 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = Math.round(zoneRect.x + zoneRect.width / 2);
        const startY = Math.round(zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0));
        const radius = Math.round(zoneRect.width * 0.22 + (hint._offset || 0));
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        // Optimization: Reduce shadowBlur
        this.ctx.shadowBlur = Math.round(11 + (hint._offset || 0)); // Halved from 22
        this.ctx.beginPath();
        this.ctx.arc(centerX, startY, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.getColorWithAlpha(color, 0.5);
        this.ctx.fill();
        this.ctx.restore();
    },

    /**
     * Notifies the visualizer about a 'pointerdown' event.
     * Stores the touch data and calls `onTouchDown` on the active touch effect renderer.
     * @param {object} touchData - Object containing touch details (pointerId, x, y, etc.).
     */
    notifyTouchDown(touchData) {
        if (this.canvas && touchData && typeof touchData.id !== 'undefined') { // Safety check for touchData
            this.activeTouchPointsMap.set(touchData.id, {
                id: touchData.id,
                x: touchData.x * this.canvas.width,
                y: (1 - touchData.y) * this.canvas.height, // Invert Y
                noteInfo: touchData.noteInfo ? { ...touchData.noteInfo } : null
            });
        }

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchDown === 'function') {
            try {
                this.activeTouchEffectRenderer.onTouchDown(touchData);
            } catch (e) {
                if (this.debugMode) console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchDown for ${this.currentTouchEffectType}:`, e);
            }
        }
    },

    /**
     * Notifies the visualizer about a 'pointermove' event.
     * Updates stored touch data and calls `onTouchMove` on the active touch effect renderer.
     * @param {object} touchData - Object containing updated touch details.
     */
    notifyTouchMove(touchData) {
        if (touchData && typeof touchData.id !== 'undefined') { // Safety check
            const point = this.activeTouchPointsMap.get(touchData.id);
            if (point && this.canvas) {
                point.x = touchData.x * this.canvas.width;
                point.y = (1 - touchData.y) * this.canvas.height; // Invert Y
                point.noteInfo = touchData.noteInfo ? { ...touchData.noteInfo } : null;
            }

            if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchMove === 'function') {
                try {
                    this.activeTouchEffectRenderer.onTouchMove(touchData);
                } catch (e) {
                    if (this.debugMode) console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchMove for ${this.currentTouchEffectType}:`, e);
                }
            }
        }
    },

    /**
     * Mixes two hex colors by a given factor.
     * @param {string} hex1 - The first hex color string (e.g., "#FF0000").
     * @param {string} hex2 - The second hex color string.
     * @param {number} factor - The mixing factor (0 for hex1, 1 for hex2).
     * @returns {string} The resulting hex color string.
     */
    mixColors(hex1, hex2, factor) {
        factor = Math.max(0, Math.min(1, factor)); // Clamp factor
        const c1 = this.hexToRgb(hex1);
        const c2 = this.hexToRgb(hex2);
        if (!c1 || !c2) return hex1; // fallback

        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);
        return `rgb(${r},${g},${b})`;
    },

    /**
     * Notifies the visualizer about a 'pointerup' or 'pointercancel' event.
     * Removes the touch data and calls `onTouchUp` on the active touch effect renderer.
     * @param {string|number} touchId - The ID of the touch that was released.
     */
    notifyTouchUp(touchId) {
        if (typeof touchId !== 'undefined') { // Safety check
            this.activeTouchPointsMap.delete(touchId);

            if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchUp === 'function') {
                try {
                    this.activeTouchEffectRenderer.onTouchUp(touchId);
                } catch (e) {
                    if (this.debugMode) console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchUp for ${this.currentTouchEffectType}:`, e);
                }
            }
        }
    },

    // This function seems to be duplicated. I will keep the one with more comprehensive JSDoc if it exists or this one.
    /**
     * Converts a color string (hex, rgb, rgba) to an rgba string with a specified alpha.
     * @param {string} colorString - The input color string.
     * @param {number} alpha - The desired alpha value (0 to 1).
     * @returns {string} The rgba color string (e.g., "rgba(255,0,0,0.5)").
     */
    getColorWithAlpha(colorString, alpha) {
        const clampedAlpha = Math.max(0, Math.min(1, parseFloat(alpha.toFixed(3))));
        const cacheKey = `${colorString}_${clampedAlpha}`;

        if (this._colorWithAlphaCache[cacheKey]) {
            return this._colorWithAlphaCache[cacheKey];
        }

        let effectiveColorString = colorString || this.themeColors.primary;
        let result;

        // Check if colorString is a theme color name
        if (this.themeColors[effectiveColorString] && (this.themeColors[effectiveColorString].startsWith('#') || this.themeColors[effectiveColorString].startsWith('rgb') || this.themeColors[effectiveColorString].startsWith('hsl'))) {
            effectiveColorString = this.themeColors[effectiveColorString];
        }

        if (typeof effectiveColorString === 'string') {
            if (effectiveColorString.startsWith('#')) {
                const rgb = this.hexToRgb(effectiveColorString); // hexToRgb uses its own cache
                result = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${clampedAlpha})` : `rgba(0,0,0,${clampedAlpha})`;
            } else if (effectiveColorString.startsWith('rgba')) {
                // Replace existing alpha
                result = effectiveColorString.replace(/[\d\.]+\)$/g, `${clampedAlpha})`);
            } else if (effectiveColorString.startsWith('rgb')) {
                // Add alpha
                result = effectiveColorString.replace('rgb', 'rgba').replace(')', `, ${clampedAlpha})`);
            } else if (effectiveColorString.startsWith('hsla')) {
                // Replace existing alpha
                result = effectiveColorString.replace(/[\d\.]+(?=\))/g, `${clampedAlpha}`);
            } else if (effectiveColorString.startsWith('hsl')) {
                // Add alpha
                result = effectiveColorString.replace('hsl', 'hsla').replace(')', `, ${clampedAlpha})`);
            }
        }

        if (!result) {
            if (this.debugMode) console.warn(`[Visualizer getColorWithAlpha] Unknown color format: ${colorString} (effective: ${effectiveColorString}). Using fallback.`);
            // Fallback to primary theme color if input is unrecognizable
            const fallbackRgb = this.hexToRgb(this.themeColors.primary); // Ensure this.themeColors.primary is a hex
            result = fallbackRgb ? `rgba(${fallbackRgb.r},${fallbackRgb.g},${fallbackRgb.b},${clampedAlpha})` : `rgba(0,0,255,${clampedAlpha})`; // Absolute fallback
        }

        this._colorWithAlphaCache[cacheKey] = result;
        return result;
    },

    /**
     * Converts a hex color string to an RGB object or array.
     * @param {string} hexInput - The hex color string (e.g., "#FF0000" or "FF0000").
     * @param {boolean} [asArray=false] - If true, returns [r, g, b], otherwise {r, g, b}.
     * @returns {{r: number, g: number, b: number} | [number, number, number] | null} RGB object/array or null if invalid hex.
     */
    hexToRgb(hexInput, asArray = false) {
        const cacheKey = `${hexInput}_${asArray}`;
        if (this._hexToRgbCache[cacheKey]) {
            return this._hexToRgbCache[cacheKey];
        }

        if (!hexInput || typeof hexInput !== 'string') {
            if (this.debugMode) console.warn(`[Visualizer hexToRgb] Invalid hex input: ${hexInput}`);
            return null;
        }

        let hex = (hexInput.startsWith('#')) ? hexInput : (this.themeColors[hexInput] || hexInput);

        if (!hex.startsWith('#')) {
             if (this.debugMode) console.warn(`[Visualizer hexToRgb] Processed hex string does not start with #: ${hex}`);
            return null; // Expect a hex string like #RGB or #RRGGBB
        }

        hex = hex.substring(1); // Remove #

        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }

        if (hex.length !== 6) {
            if (this.debugMode) console.warn(`[Visualizer hexToRgb] Hex string has invalid length after processing: ${hexInput} (processed to ${hex})`);
            return null;
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            if (this.debugMode) console.warn(`[Visualizer hexToRgb] Failed to parse hex components: ${hex}`);
            return null;
        }
        const result = asArray ? [r, g, b] : { r, g, b };
        this._hexToRgbCache[cacheKey] = result;
        return result;
    },

    /**
     * Updates the list of pad hints to be drawn by the visualizer.
     * These hints can include active note highlights, suggested notes, or other visual cues on the pad.
     * @param {Array<object>} newHintsArray - An array of hint objects.
     *                                        Each object should define properties like `zoneIndex`, `type`, `colorHint`, etc.
     */
    updatePadHints(newHintsArray) {
        if (this.debugMode) {
            console.log(`[Visualizer.updatePadHints] ----- RECEIVED newHintsArray (${newHintsArray ? newHintsArray.length : 'null/undefined'}) -----`);
            if (Array.isArray(newHintsArray)) {
                newHintsArray.forEach((h, i) => {
                    if (h) {
                         console.log(`  [Visualizer RCV] Hint ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
                    } else {
                        console.log(`  [Visualizer RCV] Hint ${i}: null or undefined`);
                    }
                });
            }
        }

        // Handle fading out of old hints only if animateMarkerFadeOut is enabled (assuming this setting exists or will be added)
        // For now, the existing logic is kept.
        // Consider adding a check for app.state.rocketModeSettings.animateMarkerFadeOut if applicable
        if (Array.isArray(this._padHintsToDraw) && this._padHintsToDraw.length > 0 && (!newHintsArray || newHintsArray.length === 0)) {
            const now = performance.now();
            this._fadingPadHints = this._padHintsToDraw
                .filter(hint => hint) // Ensure hints are valid
                .map(hint => ({
                    ...hint,
                    fadeOutStart: now,
                    fadeOutDuration: hint.fadeOutDuration || 600 // Allow individual hint fade duration or default
                }));
        }

        this._padHintsToDraw = Array.isArray(newHintsArray) ? newHintsArray.filter(h => h) : []; // Filter out null/undefined hints

        if (this.debugMode) {
            console.log(`[Visualizer.updatePadHints] _padHintsToDraw is NOW (${this._padHintsToDraw.length}):`);
            this._padHintsToDraw.forEach((h, i) => {
                 if (h) { // Check again after filtering
                    console.log(`  [Visualizer _padHintsToDraw] Item ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
                 }
            });
        }
    },

    /**
     * Returns a Set of active touch pointer IDs that the visualizer is currently tracking.
     * Used by the pad sanitizer to detect desynchronization.
     * @returns {Set<number>} A set of pointer IDs.
     */
    getActiveMarkers() {
        return new Set(this.activeTouchPointsMap.keys());
    },

    /**
     * Disposes of visualizer resources, stops the animation loop, and removes event listeners.
     * Should be called when the visualizer is no longer needed to prevent memory leaks.
     */
    dispose() {
        this.stop();
        if (this.activeRenderer && typeof this.activeRenderer.dispose === 'function') this.activeRenderer.dispose();
        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.dispose === 'function') this.activeTouchEffectRenderer.dispose();

        this.activeRenderer = null;
        this.activeTouchEffectRenderer = null;
        this._padHintsToDraw = [];
        this._fadingPadHints = []; // Clear fading hints as well

        // Don't nullify canvas and ctx if visualizer might be re-initialized later with the same canvas.
        // this.ctx = null;
        // this.canvas = null;
        this.analyser = null; // Analyser can be reset
        this.isReady = false;
        this.activeTouchPointsMap.clear();
        if (this.resizeCanvasBound) { // Ensure we remove the exact bound function
            window.removeEventListener('resize', this.resizeCanvasBound);
            this.resizeCanvasBound = null;
        }
        if (this.debugMode) console.log('[Visualizer v4.1] Disposed all renderers and state.');
    },
};