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
    renderersRegistry: {},
    touchEffectRenderersRegistry: {},
    _padHints: [], // Храним текущие активные сияния/индикаторы
    padHintsRendererInstance: null,
    _padHintsToDraw: [], // --- НОВОЕ СВОЙСТВО ДЛЯ ПОДСКАЗОК ПЭДА ---
    _prevPadHintsToDraw: null,
    _fadingPadHints: [],
     debugMode: false,
    fpsManager: null,

    async init(canvasElement, analyserInstance = null) {
        console.log('[Visualizer v4.1 Modular with PadHints] Initializing...');
        if (!canvasElement) {
            console.error('[Visualizer v4.1] Canvas element not provided!');
            this.isReady = false;
            return;
        }
        this.canvas = canvasElement;
        this.activeTouchPointsMap = new Map(); // Инициализируем здесь, если не было
        try {
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) throw new Error("Failed to get 2D context.");
        } catch (error) {
            console.error('[Visualizer v4.1] Failed to get canvas context:', error);
            this.isReady = false;
            return;
        }

        this.isReady = false; // Устанавливаем в false, пока не получим analyser
        this.analyser = analyserInstance;

        if (!this.analyser) {
            console.warn('[Visualizer v4.1 init] Analyser instance not provided directly.');
            if (typeof synth !== 'undefined' && typeof synth.getAnalyser === 'function' && synth.isReady) {
                this.analyser = synth.getAnalyser();
            }
        }

        if (this.analyser) {
            console.log('[Visualizer v4.1 init] Analyser obtained/provided.');
            this.isReady = true;
        } else {
            console.error('[Visualizer v4.1 init] Analyser node still not available!');
        }
        
        this._padHintsToDraw = []; // Инициализируем пустым массивом

        if (this.isReady) {
            if (typeof padHintsRenderer !== 'undefined' && typeof padHintsRenderer.init === 'function') {
                this.padHintsRendererInstance = Object.create(padHintsRenderer);
                this.padHintsRendererInstance.init(this.ctx, this.canvas, this.themeColors, this);
                console.log('[Visualizer v4.1] PadHintsRenderer initialized.');
            } else {
                console.warn('[Visualizer v4.1] padHintsRenderer.js not found or invalid.');
            }
            this.resizeCanvas();
            window.addEventListener('resize', this.resizeCanvas.bind(this));
            console.log('[Visualizer v4.1] Initialized successfully (isReady=true).');
        } else {
             console.error('[Visualizer v4.1] Failed to initialize fully due to missing analyser (isReady=false).');
        }

        // FPS Manager
        this.fpsManager = Object.create(fpsManager);
        this.fpsManager.init(this.draw.bind(this));
        this.fpsManager.setTargetFps(60);
    },

    registerRenderer(name, rendererClass) {
        if (typeof name === 'string' && typeof rendererClass === 'function') {
            this.renderersRegistry[name] = rendererClass;
            console.log(`[Visualizer v4.0] Registered visualizer renderer: ${name}`);
        } else {
            console.error(`[Visualizer v4.0] Failed to register visualizer renderer: Invalid name or class.`);
        }
    },

    registerTouchEffectRenderer(name, effectClass) {
        if (typeof name === 'string' && typeof effectClass === 'function') {
            this.touchEffectRenderersRegistry[name] = effectClass;
            console.log(`[Visualizer v4.0] Registered touch effect renderer: ${name}`);
        } else {
            console.error(`[Visualizer v4.0] Failed to register touch effect renderer: Invalid name or class.`);
        }
    },

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
                    console.log(`[Visualizer v4.0] Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
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

    async setVisualizerType(typeId) {
        if (!typeId) {
            console.warn('[Visualizer v4.0] setVisualizerType called with null/empty typeId. Retaining current.');
            return;
        }
        console.log(`[Visualizer v4.0] Setting visualizer type to ${typeId}`);
        this.currentVizType = typeId;

        // Сначала останавливаем предыдущий цикл, если он был, и освобождаем ресурсы
        this.stop();
        if (this.activeRenderer && typeof this.activeRenderer.dispose === 'function') {
            this.activeRenderer.dispose();
        }
        this.activeRenderer = null;

        try {
            const vizModuleInfo = await moduleManager.getModule(typeId);
            console.log(`[Visualizer v4.0 DEBUG] Loaded module info for ${typeId}:`, vizModuleInfo ? JSON.parse(JSON.stringify(vizModuleInfo)) : 'null');

            if (!vizModuleInfo || !vizModuleInfo.data || !vizModuleInfo.data.data) {
                console.error(`[Visualizer v4.0] Module info or core data block (module.data.data) not found for visualizer: ${typeId}`);
                return;
            }

            const coreData = vizModuleInfo.data.data;
            const rendererScriptName = coreData.rendererScript;
            this.vizModuleSettings = coreData.settings || {};

            console.log(`[Visualizer v4.0 DEBUG] Renderer script name for ${typeId}: ${rendererScriptName}`);
            console.log(`[Visualizer v4.0 DEBUG] Settings for ${typeId}:`, JSON.parse(JSON.stringify(this.vizModuleSettings)));

            if (!rendererScriptName) {
                console.error(`[Visualizer v4.0] rendererScript is missing in module data for ${typeId}`);
                return;
            }

            const RendererClass = this._getRendererClassFromRegistry(rendererScriptName, this.renderersRegistry);

            if (RendererClass) {
                // Merge global graphicsQuality setting for the renderer to use.
                if (!this.analyser) {
                    console.warn(`[Visualizer] Analyser is null before initializing ${RendererClass.name}. Attempting to fetch again or wait...`);
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
                    console.error(`[Visualizer] CRITICAL: Analyser STILL NULL for ${RendererClass.name}. Renderer might fail or not display audio data.`);
                } else {
                    console.log(`[Visualizer] Analyser is available for ${RendererClass.name}. Type: ${this.analyser.type}`);
                }

                if (this.canvas.width === 0 || this.canvas.height === 0) {
                    console.warn(`[Visualizer] Canvas dimensions are zero before initializing ${RendererClass.name}. Attempting resize.`);
                    this.resizeCanvas();
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                if (this.canvas.width === 0 || this.canvas.height === 0) {
                     console.error(`[Visualizer] Canvas dimensions STILL ZERO for ${RendererClass.name}. Renderer WILL LIKELY FAIL.`);
                }

                this.activeRenderer = new RendererClass();
                const finalVizSettings = {
                    ...this.vizModuleSettings,
                    graphicsQuality: (typeof app !== 'undefined' && app.state && app.state.graphicsQuality) ? app.state.graphicsQuality : 'high'
                };
                this.activeRenderer.init(this.ctx, this.canvas, finalVizSettings, this.themeColors, this, this.analyser);
                if (typeof this.activeRenderer.onThemeChange === 'function') {
                    this.activeRenderer.onThemeChange(this.themeColors);
                }
                console.log(`[Visualizer v4.0] Visualizer renderer '${typeId}' (class: ${RendererClass.name}) activated.`);
                this.start();
            } else {
                console.error(`[Visualizer v4.0] Renderer class not found for ${rendererScriptName}. Make sure it's registered or named correctly.`);
            }
        } catch (error) {
            console.error(`[Visualizer v4.0] Error setting visualizer type ${typeId}:`, error);
            this.activeRenderer = null;
        }
        this.configureAnalyser();
    },

    async setTouchEffectType(typeId) {
        const targetEffectId = typeId || 'none';
        console.log(`[Visualizer v4.0] Setting touch effect type to ${targetEffectId}`);
        this.currentTouchEffectType = targetEffectId;

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.dispose === 'function') {
            this.activeTouchEffectRenderer.dispose();
        }
        this.activeTouchEffectRenderer = null;

        if (targetEffectId === 'none') {
            console.log(`[Visualizer v4.0] Touch effects disabled.`);
            return;
        }

        try {
            console.log(`[Visualizer v4.0] Fetching module info for touch effect ${targetEffectId}...`);
            const effectModuleInfo = await moduleManager.getModule(targetEffectId);
            console.log(`[Visualizer v4.0 DEBUG] Loaded module info for touch effect ${targetEffectId}:`, effectModuleInfo ? JSON.parse(JSON.stringify(effectModuleInfo)) : 'null');

            if (!effectModuleInfo || !effectModuleInfo.data || !effectModuleInfo.data.data) {
                console.error(`[Visualizer v4.0] Module info or core data block (module.data.data) not found for touch effect: ${targetEffectId}`);
                return;
            }

            const coreData = effectModuleInfo.data.data;
            const rendererScriptName = coreData.rendererScript;
            this.touchEffectModuleSettings = coreData.settings || {};

            console.log(`[Visualizer v4.0 DEBUG] Renderer script name for ${targetEffectId}: ${rendererScriptName}`);
            console.log(`[Visualizer v4.0 DEBUG] Settings for ${targetEffectId}:`, JSON.parse(JSON.stringify(this.touchEffectModuleSettings)));

            if (!rendererScriptName) {
                console.warn(`[Visualizer v4.0] rendererScript is missing for touch effect module ${targetEffectId}. Assuming no visual effect.`);
                return;
            }

            console.log(`[Visualizer v4.0] Looking for effect renderer class for ${rendererScriptName}...`);
            const EffectRendererClass = this._getRendererClassFromRegistry(rendererScriptName, this.touchEffectRenderersRegistry);

            if (EffectRendererClass) {
                console.log(`[Visualizer v4.0] Creating new instance of ${EffectRendererClass.name}...`);
                this.activeTouchEffectRenderer = new EffectRendererClass();
                const finalTouchEffectSettings = {
                    ...this.touchEffectModuleSettings,
                    graphicsQuality: (typeof app !== 'undefined' && app.state && app.state.graphicsQuality) ? app.state.graphicsQuality : 'high'
                };
                this.activeTouchEffectRenderer.init(this.ctx, this.canvas, finalTouchEffectSettings, this.themeColors, this);
                if (typeof this.activeTouchEffectRenderer.onThemeChange === 'function') {
                    this.activeTouchEffectRenderer.onThemeChange(this.themeColors);
                }
                console.log(`[Visualizer v4.0] Touch effect renderer '${targetEffectId}' (class: ${EffectRendererClass.name}) activated.`);
                if (!this.animationFrameId && this.isReady) this.start();
            } else {
                console.error(`[Visualizer v4.0] Touch Effect Renderer class not found for ${rendererScriptName}.`);
            }
        } catch (error) {
            console.error(`[Visualizer v4.0] Error setting touch effect type ${targetEffectId}:`, error);
            this.activeTouchEffectRenderer = null;
        }
    },

    _getRendererClassFromRegistry(scriptPath, registry) {
        if (!scriptPath || typeof scriptPath !== 'string') {
            console.error("[Visualizer v4.0 _getRendererClassFromRegistry] Invalid scriptPath provided:", scriptPath);
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
            console.warn(`[Visualizer v4.0 _getRendererClassFromRegistry] Unknown script extension for ${scriptPath}. Trying to derive class name.`);
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
            console.log(`[Visualizer v4.0 _getRendererClassFromRegistry] Found ${expectedClassName} in registry for path ${scriptPath}.`);
            return RendererClass;
        }

        if (window[expectedClassName]) {
            console.warn(`[Visualizer v4.0 _getRendererClassFromRegistry] Found ${expectedClassName} in window scope (fallback) for path ${scriptPath}. Consider registering it.`);
            return window[expectedClassName];
        }

        console.error(`[Visualizer v4.0 _getRendererClassFromRegistry] Class ${expectedClassName} not found in registry or window scope for path ${scriptPath}.`);
        return null;
    },

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
                    console.log(`[Visualizer v4.0] Background visualizer '${this.vizModuleSettings.backgroundVisualizer}' requires FFT. Overriding main analyser type.`);
                    targetType = 'fft';
                }

                const settingsToUse = this.vizModuleSettings || {};
                const targetSize = (targetType === 'fft') ? (settingsToUse.fftSize || 512) : 1024;
                const smoothing = settingsToUse.smoothingTimeConstant ?? settingsToUse.smoothing ?? 0.8;

                if (this.analyser.type !== targetType) this.analyser.type = targetType;
                if (this.analyser.size !== targetSize) this.analyser.size = targetSize;
                if (this.analyser.smoothing !== smoothing) this.analyser.smoothing = smoothing;

                console.log(`[Visualizer v4.0 configureAnalyser] Analyser set to: type=${this.analyser.type}, size=${this.analyser.size}, smoothing=${this.analyser.smoothing}`);

            } catch (error) {
                console.error(`[Visualizer v4.0 configureAnalyser] Error:`, error);
            }
        }
    },

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
                console.error("[Visualizer v4.0 updateTheme] Failed to read theme CSS variables:", e);
            }
        });
    },

    start() {
        if (!this.isReady || (this.fpsManager && this.fpsManager._isActive)) return;
        if (!this.activeRenderer && !this.activeTouchEffectRenderer) {
            console.log('[Visualizer v4.0] No active renderers to start animation loop.');
            return;
        }
        if (this.fpsManager) {
            this.fpsManager.start();
        }
    },

    stop() {
        if (this.fpsManager && this.fpsManager._isActive) {
            this.fpsManager.stop();
        }
    },

    draw() {
        if (this.debugMode && this._padHintsToDraw.length > 0) {
            console.log(`[Visualizer.draw DBG] _padHintsToDraw (${this._padHintsToDraw.length}) items:`);
            this._padHintsToDraw.forEach((h, i) => {
                console.log(`  [Visualizer DBG] Hint ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
            });
        }
        if (!this.isReady || !this.ctx || !this.canvas || this.canvas.width === 0 || this.canvas.height === 0) return;

        const audioData = (this.analyser && (this.activeRenderer || this.analyser.type === 'fft')) ? this.analyser.getValue() : null;
        const activeTouchStates = (typeof pad !== 'undefined' && pad.getActiveTouchStates) ? pad.getActiveTouchStates() : [];

        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Основной визуализатор
        if (this.activeRenderer && typeof this.activeRenderer.draw === 'function') {
            try {
                this.activeRenderer.draw(audioData, activeTouchStates);
            } catch (e) {
                console.error(`[Visualizer v4.1] Error in activeRenderer.draw for ${this.currentVizType}:`, e);
            }
        }
        // 1. Рисуем fading-маркеры (fade-out)
        if (Array.isArray(this._fadingPadHints) && this._fadingPadHints.length > 0) {
            const now = performance.now();
            this._fadingPadHints = this._fadingPadHints.filter(hint => {
                const elapsed = now - (hint.fadeOutStart || now);
                const duration = hint.fadeOutDuration || 600; // мс, можно сделать настройкой
                const fadeAlpha = 1 - Math.min(1, elapsed / duration);
                if (fadeAlpha <= 0.01) return false;
                // Рисуем faded hint с уменьшенной альфой
                const zoneData = pad._currentDisplayedZones[hint.zoneIndex];
                if (zoneData) {
                    const zoneRect = {
                        x: zoneData.startX * this.canvas.width,
                        y: 0,
                        width: (zoneData.endX - zoneData.startX) * this.canvas.width,
                        height: this.canvas.height
                    };
                    const styleRendererMethodName = `_renderMarker_${hint.style}`;
                    if (typeof this[styleRendererMethodName] === 'function') {
                        this[styleRendererMethodName](zoneRect, hint, [], fadeAlpha * 0.7);
                    } else {
                        this._renderMarker_GlowFromNote(zoneRect, hint, [], fadeAlpha * 0.7);
                    }
                }
                return true;
            });
        }
        // 2. RocketMode: гармонические маркеры и подсветка
        //console.log(`[Visualizer.draw] Frame. ActiveRenderer: ${this.activeRenderer ? this.currentVizType : 'none'}, TouchEffect: ${this.activeTouchEffectRenderer ? this.currentTouchEffectType : 'none'}, HintsToDraw: ${this._padHintsToDraw.length}`);
        const originalCompositeOp = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = 'lighter';
        try {
            this._drawHarmonicMarkers(activeTouchStates);
        } catch (e) {
            console.error(`[Visualizer.draw] Error in _drawHarmonicMarkers:`, e);
        }
        this.ctx.globalCompositeOperation = originalCompositeOp;
        // 3. Эффекты касания
        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.drawActiveEffects === 'function') {
            try {
                this.activeTouchEffectRenderer.drawActiveEffects();
            } catch (e) {
                console.error(`[Visualizer v4.1] Error in activeTouchEffectRenderer.drawActiveEffects for ${this.currentTouchEffectType}:`, e);
            }
        }
        this.ctx.restore();
    },

    _drawHarmonicMarkers(activeTouchStates) {
        // Группируем hints по zoneIndex
        const zoneHintsMap = {};
        this._padHintsToDraw.forEach(hint => {
            if (!zoneHintsMap[hint.zoneIndex]) zoneHintsMap[hint.zoneIndex] = [];
            zoneHintsMap[hint.zoneIndex].push(hint);
        });
        if (!this.isReady || !this.ctx || !this.canvas || !pad?._currentDisplayedZones || this._padHintsToDraw.length === 0) {
            return;
        }
        const rocketSettings = (typeof app !== 'undefined' && app.state && app.state.rocketModeSettings)
            ? app.state.rocketModeSettings
            : { highlightActiveNotes: true, showDirectionalMarkers: true, markerStyle: "GlowFromNote", showOnlyForValidChords: false, animateMarkerFadeOut: true, showChordName: true };
        Object.entries(zoneHintsMap).forEach(([zoneIdx, hints]) => {
            const zoneData = pad._currentDisplayedZones[zoneIdx];
            if (!zoneData) return;
            const zoneRect = {
                x: zoneData.startX * this.canvas.width,
                y: 0,
                width: (zoneData.endX - zoneData.startX) * this.canvas.width,
                height: this.canvas.height
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
                    const centerX = zoneRect.x + zoneRect.width / 2;
                    const labelY = zoneRect.y + zoneRect.height * 0.01 + i * 18;
                    this.ctx.strokeText(hint.label, centerX, labelY);
                    this.ctx.fillText(hint.label, centerX, labelY);
                    this.ctx.restore();
                }
            });
        });
    },

    _drawActiveNoteHighlight(zoneRect, hint, fadeAlpha = 1) {
        // Красивый glow с blur и плавным градиентом, усиливается при удержании
        if (!this.ctx) return;
        const glowColor = hint.color || "#FFFFFF";
        // Усиление свечения: максимум при 2 сек удержания
        const holdBoost = Math.min(1.0, (hint.holdTimeMs || 0) / 2000);
        const opacity = (0.7 + 0.7 * holdBoost) * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const baseRadius = zoneRect.width * (0.6 + 0.4 * holdBoost) + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = 32 + 32 * holdBoost + (hint._offset || 0);
        this.ctx.beginPath();
        this.ctx.arc(zoneRect.x + zoneRect.width / 2, zoneRect.y + zoneRect.height * 0.13 + (hint._offset || 0), baseRadius * 0.5, 0, Math.PI * 2);
        this.ctx.fillStyle = this.getColorWithAlpha(glowColor, 0.5 + 0.3 * holdBoost);
        this.ctx.fill();
        this.ctx.restore();
    },

    _renderMarker_GlowFromNote(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Мягкое сияние с blur и цветным градиентом
        if (!this.ctx) return;
        const color = hint.color || this.themeColors.accent;
        const opacity = 0.6 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = zoneRect.x + zoneRect.width / 2;
        const startY = zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0);
        const endRadius = zoneRect.height * 0.22 + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 24 + (hint._offset || 0);
        const gradient = this.ctx.createRadialGradient(
            centerX, startY, zoneRect.width * 0.1,
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
        const centerX = zoneRect.x + zoneRect.width / 2;
        const startY = zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0);
        const radius = zoneRect.width * 0.28 + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 18 + (hint._offset || 0);
        this.ctx.beginPath();
        this.ctx.arc(centerX, startY, radius, 0, Math.PI * 2);
        this.ctx.lineWidth = 6;
        this.ctx.strokeStyle = this.getColorWithAlpha(color, 0.7);
        this.ctx.stroke();
        this.ctx.restore();
    },

    _renderMarker_WaveToNote(zoneRect, hint, activeTouchStates, fadeAlpha = 1) {
        // Волна с плавным градиентом и blur
        if (!this.ctx) return;
        const color = hint.color || this.themeColors.primary;
        const opacity = 0.7 * (hint._fadeAlpha !== undefined ? hint._fadeAlpha : fadeAlpha);
        const centerX = zoneRect.x + zoneRect.width / 2;
        const startY = zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0);
        const waveHeight = zoneRect.height * 0.13 + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 14 + (hint._offset || 0);
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        for (let i = 0; i <= 1; i += 0.04) {
            const x = zoneRect.x + i * zoneRect.width;
            const y = startY + Math.sin(i * Math.PI * 2) * waveHeight;
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
        const centerX = zoneRect.x + zoneRect.width / 2;
        const startY = zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + (hint._offset || 0) * 0.1;
            const len = 18 + (hint._offset || 0) + Math.random() * 10;
            const x2 = centerX + Math.cos(angle) * len;
            const y2 = startY - Math.sin(angle) * len;
            this.ctx.strokeStyle = this.getColorWithAlpha(color, 0.7 + 0.3 * Math.random());
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 10 + (hint._offset || 0);
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
        const centerX = zoneRect.x + zoneRect.width / 2;
        const startY = zoneRect.y + zoneRect.height * 0.08 + (hint._offset || 0);
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 22 + (hint._offset || 0);
        this.ctx.beginPath();
        this.ctx.arc(centerX, startY, zoneRect.width * 0.22 + (hint._offset || 0), 0, Math.PI * 2);
        this.ctx.fillStyle = this.getColorWithAlpha(color, 0.5);
        this.ctx.fill();
        this.ctx.restore();
    },

    notifyTouchDown(touchData) {
        if (this.canvas) {
            this.activeTouchPointsMap.set(touchData.id, {
                id: touchData.id,
                x: touchData.x * this.canvas.width,
                y: (1 - touchData.y) * this.canvas.height,
                noteInfo: touchData.noteInfo ? { ...touchData.noteInfo } : null
            });
        }

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchDown === 'function') {
            try {
                this.activeTouchEffectRenderer.onTouchDown(touchData);
            } catch (e) {
                console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchDown for ${this.currentTouchEffectType}:`, e);
            }
        }
    },

    notifyTouchMove(touchData) {
        const point = this.activeTouchPointsMap.get(touchData.id);
        if (point && this.canvas) {
            point.x = touchData.x * this.canvas.width;
            point.y = (1 - touchData.y) * this.canvas.height;
            point.noteInfo = touchData.noteInfo ? { ...touchData.noteInfo } : null;
        }

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchMove === 'function') {
            try {
                this.activeTouchEffectRenderer.onTouchMove(touchData);
            } catch (e) {
                console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchMove for ${this.currentTouchEffectType}:`, e);
            }
        }
    },

    mixColors(hex1, hex2, factor) {
        factor = Math.max(0, Math.min(1, factor));
        const c1 = this.hexToRgb(hex1);
        const c2 = this.hexToRgb(hex2);
        if (!c1 || !c2) return hex1; // fallback

        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);
        return `rgb(${r},${g},${b})`;
    },

    notifyTouchUp(touchId) {
        this.activeTouchPointsMap.delete(touchId);

        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.onTouchUp === 'function') {
            try {
                this.activeTouchEffectRenderer.onTouchUp(touchId);
            } catch (e) {
                console.error(`[Visualizer v4.0] Error in activeTouchEffectRenderer.onTouchUp for ${this.currentTouchEffectType}:`, e);
            }
        }
    },

    getColorWithAlpha(colorString, alpha) {
        const clampedAlpha = Math.max(0, Math.min(1, parseFloat(alpha.toFixed(3))));
        if (!colorString) colorString = this.themeColors.primary;

        const themeColorValue = this.themeColors[colorString];
        if (themeColorValue && (themeColorValue.startsWith('#') || themeColorValue.startsWith('rgb') || themeColorValue.startsWith('hsl'))) {
            colorString = themeColorValue;
        }

        if (typeof colorString === 'string' && colorString.startsWith('#')) {
            const rgb = this.hexToRgb(colorString);
            return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${clampedAlpha})` : `rgba(0,0,0,${clampedAlpha})`;
        } else if (typeof colorString === 'string' && colorString.startsWith('rgba')) {
            return colorString.replace(/[\d\.]+\)$/g, `${clampedAlpha})`);
        } else if (typeof colorString === 'string' && colorString.startsWith('rgb')) {
            return colorString.replace('rgb', 'rgba').replace(')', `, ${clampedAlpha})`);
        } else if (typeof colorString === 'string' && colorString.startsWith('hsla')) {
            return colorString.replace(/[\d\.]+\)$/g, `${clampedAlpha})`);
        } else if (typeof colorString === 'string' && colorString.startsWith('hsl')) {
            return colorString.replace('hsl', 'hsla').replace(')', `, ${clampedAlpha})`);
        }

        console.warn(`[Visualizer getColorWithAlpha] Unknown color format: ${colorString}. Using fallback.`);
        const fallbackRgb = this.hexToRgb(this.themeColors.primary);
        return fallbackRgb ? `rgba(${fallbackRgb.r},${fallbackRgb.g},${fallbackRgb.b},${clampedAlpha})` : `rgba(0,0,255,${clampedAlpha})`;
    },

    hexToRgb(hexInput) {
        if (!hexInput || typeof hexInput !== 'string') return null;
        const hex = this.themeColors[hexInput] || hexInput;

        let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const expandedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expandedHex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    updatePadHints(newHintsArray) {
        console.log(`[Visualizer.updatePadHints] ----- RECEIVED newHintsArray (${newHintsArray ? newHintsArray.length : 'null/undefined'}) -----`);
        if (Array.isArray(newHintsArray)) {
            newHintsArray.forEach((h, i) => {
                console.log(`  [Visualizer RCV] Hint ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
            });
        }
        // Если были старые hints, и они исчезли — переносим их в fading
        if (Array.isArray(this._padHintsToDraw) && this._padHintsToDraw.length > 0 && Array.isArray(newHintsArray) && newHintsArray.length === 0) {
            const now = performance.now();
            this._fadingPadHints = this._padHintsToDraw.map(hint => ({
                ...hint,
                fadeOutStart: now,
                fadeOutDuration: 600 // мс, можно сделать настройкой
            }));
        }
        this._padHintsToDraw = Array.isArray(newHintsArray) ? newHintsArray : [];
        console.log(`[Visualizer.updatePadHints] _padHintsToDraw is NOW (${this._padHintsToDraw.length}):`);
        this._padHintsToDraw.forEach((h, i) => {
            console.log(`  [Visualizer _padHintsToDraw] Item ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
        });
    },

    dispose() {
        this.stop();
        if (this.activeRenderer && typeof this.activeRenderer.dispose === 'function') this.activeRenderer.dispose();
        if (this.activeTouchEffectRenderer && typeof this.activeTouchEffectRenderer.dispose === 'function') this.activeTouchEffectRenderer.dispose();
        // Не нужно вызывать dispose для _padHintsToDraw, так как это просто массив данных
        
        this.activeRenderer = null;
        this.activeTouchEffectRenderer = null;
        this._padHintsToDraw = []; // Очищаем массив
        
        this.ctx = null; // Обнуляем контекст и канвас
        this.canvas = null;
        this.analyser = null;
        this.isReady = false;
        this.activeTouchPointsMap.clear();
        window.removeEventListener('resize', this.resizeCanvas.bind(this)); // Удаляем обработчик
        console.log('[Visualizer v4.1] Disposed all renderers and state.');
    },
};