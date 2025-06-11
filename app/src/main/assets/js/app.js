// Файл: app/src/main/assets/js/app.js

const app = {
    state: {
        theme: 'aurora',
        language: 'en',
        soundPreset: 'default_piano', // Вы можете выбрать другой стартовый пресет
        fxChain: null,
        visualizer: 'nebula',
        touchEffect: 'ballLightningLink',
        scale: 'major',
        octaveOffset: 0,
        zoneCount: 12,
        isAudioReady: false,
        isBridgeReady: false,
        isInitialized: false,
        hasUserInteracted: false,
        showNoteNames: true,
        showLines: true,
        masterVolumeCeiling: 1.0,
        enablePolyphonyVolumeScaling: true,
        currentTonic: "C4",
        highlightSharpsFlats: true, // Включено по умолчанию
        yAxisControls: {
            volume: { minOutput: 0.0, maxOutput: 1.0, yThreshold: 0.0, curveType: 'linear', curveFactor: 1.0, outputType: 'gain' },
            effects: { minOutput: -60, maxOutput: 0, yThreshold: 0.1, curveType: 'exponential', curveFactor: 2.0, outputType: 'db' }
        },
        presetYAxisEffectsConfig: null,
        padMode: "classic",
        currentChordName: null,
        rocketModeSettings: {
            highlightActiveNotes: true,
            showDirectionalMarkers: true,
            markerStyle: "GlowFromNote",
            showOnlyForValidChords: false,
            animateMarkerFadeOut: true,
            showChordName: true,
            intensity: 0.5,
            autoPhases: true,
            phaseTransitionMode: 'activity',
            phaseDurations: { ignition: 30, liftOff: 60, burst: 90 },
            chordBehavior: 'analyze',
            nextSuggestionType: 'chords',
            phaseHintMode: 'phaseAware',
            energyAffectsHints: true,
            keyBehavior: 'auto'
        },
        rocketModePhase: 'ignition',
        rocketModeCurrentPhaseStartTime: 0,
        rocketModeCurrentPhaseActivityCounter: 0,
        rocketModeEnergy: 0,
        yAxisDefinedByPreset: false,
        isChordPanelCollapsed: false,
        chordPanelWidth: 320,
        transportBpm: 120,
        isApplyingChange: false,
        vibrationEnabled: true,
        vibrationIntensity: 'weak',
    },
    elements: {
        loadingOverlay: null,
        loadingText: null,
        loadingTitle: null,
        loadingPrompt: null,
        body: document.body,
        appContainer: null,
        rocketStatusPanel: null,
        statusCurrentChord: null,
        statusCurrentKey: null,
        statusNextSuggestions: null,
        statusEnergyLevel: null,
        statusCurrentPhase: null,
    },
    loadingAudio: null,
    starsAnimation: null,
    prismEffect: null,
    loadingTimeoutId: null,
    isStartingApp: false,
    isRestartingAudio: false,

    // Добавляем в начало файла, где определяются свойства
    _chordPanelResizeTimeout: null,

    async init() {
        console.log('[App.init v2.5.1 PadModeManager] Starting application initialization...');
        this.elements.body = document.body;
        this.elements.appContainer = document.getElementById('app-container');

        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingText = this.elements.loadingOverlay?.querySelector('.loading-text');
        this.elements.loadingTitle = document.getElementById('loading-title');
        this.elements.loadingPrompt = document.querySelector('.loading-prompt');

        if (!this.elements.loadingOverlay || !this.elements.loadingText || !this.elements.loadingTitle || !this.elements.loadingPrompt) {
            console.error("[App.init v6] Critical error: Loading overlay elements not found!");
            if (this.elements.loadingText) this.elements.loadingText.textContent = "Initialization Error: UI elements missing.";
            return;
        }

        if (typeof i18n !== 'undefined') {
            i18n.init(this.state.language);
            this.updateLoadingText('initializing', 'Initializing...');
        } else { console.warn("[App.init v6] i18n module not found."); }

        let audioInitPromise = Promise.resolve(false);
        try {
            if (typeof loadingAudio !== 'undefined') {
                this.loadingAudio = loadingAudio;
                const audioBaseUrl = "https://appassets.androidplatform.net/assets/";
                const audioUrls = {
                    stars_warp: audioBaseUrl + 'audio/loading/stars_warp.mp3',
                    logo_reveal: audioBaseUrl + 'audio/loading/logo_reveal.mp3',
                    transition_burst: audioBaseUrl + 'audio/loading/transition_burst.mp3',
                    idle_loop: audioBaseUrl + 'audio/loading/idle_loop.mp3'
                };
                audioInitPromise = this.loadingAudio.init(audioUrls);
            } else { console.warn("[App.init v6] loadingAudio module not found."); }

            if (typeof starsAnimation !== 'undefined') {
                this.starsAnimation = starsAnimation;
                if (!this.starsAnimation.init('loading-stars-canvas')) { console.error("App.init v6: Failed to initialize stars animation."); }
                else { this.starsAnimation.start(); }
            } else { console.warn("[App.init v6] starsAnimation module not found."); }

            if (typeof prismEffect !== 'undefined') {
                this.prismEffect = prismEffect;
                if (!this.prismEffect.init('loading-prism-canvas')) { console.error("App.init v6: Failed to initialize prism effect."); }
            } else { console.warn("[App.init v6] prismEffect module not found."); }

        } catch (loadingModulesError) {
             console.error("App.init v6: Error initializing loading animation/audio modules:", loadingModulesError);
        }

        audioInitPromise.then(audioInitialized => {
            if (audioInitialized) { setTimeout(() => { this.loadingAudio?.playSFX('stars_warp'); }, 150); }
        });

        try {
            console.log('[App.init v6] Waiting for DOM Ready...');
            if (document.readyState === 'loading') { await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve)); }
            console.log('[App.init v6] DOM Ready.');

            console.log('[App.init v6] Waiting for bridge...');
            this.updateLoadingText('loading_bridge', 'Connecting...');
            await this.waitForBridge();
            console.log('[App.init v6] Bridge Ready.');

            console.log('[App.init v6] Starting main initialization sequence...');
            this.updateLoadingText('loading_settings', 'Loading settings...');
            await this.loadInitialSettings();
            console.log("[App.init v6] Initial currentTonic:", this.state.currentTonic);

            console.log('[App.init v6] Initializing i18n with loaded language...');
            await i18n.loadLanguage(this.state.language);

            this.updateLoadingText('loading_modules', 'Loading modules...');
            if (typeof moduleManager === 'undefined') throw new Error("moduleManager.js is not loaded!");
            await moduleManager.init();

            // MusicTheoryService
            if (typeof MusicTheoryService === 'undefined') throw new Error("MusicTheoryService is not loaded!");
            await MusicTheoryService.init(moduleManager);
            console.log("[App.init v2.5.1] MusicTheoryService initialized. isTonalJsLoaded:", MusicTheoryService.isTonalJsLoaded, "Scale defs count:", Object.keys(MusicTheoryService.scaleDefinitions).length);

            // Pad.js - ИНИЦИАЛИЗИРУЕМ ДО PadModeManager, чтобы pad.isReady было true
            if (typeof pad === 'undefined') throw new Error("pad.js is not loaded!");
            pad.init(document.getElementById('xy-pad-container'));
            console.log("[App.init v2.5.1] Pad initialized. pad.isReady:", pad.isReady);

            // PadModeManager
            console.log('[App.init] Before PadModeManager.init, this (app) is:', this);
            console.log('[App.init PadModes] Initializing PadModeManager...');
            if (typeof PadModeManager === 'undefined') throw new Error("PadModeManager.js is not loaded!");
            if (typeof harmonicMarkerEngine === 'undefined') throw new Error("harmonicMarkerEngine.js is not loaded!");
            harmonicMarkerEngine.init(MusicTheoryService);
            console.log("[App.init] HarmonicMarkerEngine initialized.");
            PadModeManager.init(this, MusicTheoryService, harmonicMarkerEngine);
            console.log("[App.init] PadModeManager initialized.");

            this.state.isInitialized = true; // Перемещаем сюда, если sidePanel зависит от isInitialized
            console.log('[App.init PadModes] Core services initialized (isInitialized = true).');
            
            // Инициализация UI Panels (включая sidePanel)
            if (typeof sidePanel === 'undefined') throw new Error("sidepanel.js is not loaded!");
            sidePanel.init(); // populateStaticSelects и populatePadModeSelectDisplay вызовутся здесь
            
            // Установка активного режима пэда (это вызовет app.updateZones() И sidePanel.displayModeSpecificControls())
            await this.setPadMode(this.state.padMode, true); // true для initialLoad

            // После того как режим установлен и стратегия активна:
            if (typeof sidePanel !== 'undefined' && sidePanel.displayModeSpecificControls) {
                sidePanel.displayModeSpecificControls(this.state.padMode); // <--- ДОБАВЛЕН ВЫЗОВ
            }

            // Synth
            if (typeof synth === 'undefined') throw new Error("synth.js is not loaded!");
            synth.init();
            if(synth.isReady) synth.applyMasterVolumeSettings();

            // === ДОБАВЛЕНО: Инициализация Tone.Transport BPM ===
            if (typeof Tone !== 'undefined' && Tone.Transport) {
                Tone.Transport.bpm.value = this.state.transportBpm;
                console.log(`[App.init] Tone.Transport initialized with BPM: ${this.state.transportBpm}`);
            }

            // Visualizer
            let analyserNode = (synth?.isReady) ? synth.getAnalyser() : null;
            if (typeof visualizer === 'undefined') throw new Error("visualizer.js is not loaded!");
            await visualizer.init(document.getElementById('xy-visualizer'), analyserNode);
            if (visualizer.isReady) {
                await visualizer.setVisualizerType(this.state.visualizer);
                await visualizer.setTouchEffectType(this.state.touchEffect);
            }

            // UI Panels
            this.updateLoadingText('loading_ui', 'Initializing UI...');
            if (typeof sidePanel === 'undefined') throw new Error("sidepanel.js is not loaded!");
            sidePanel.init(); // populateStaticSelects вызовется здесь
            // populatePadModeSelect уже вызван выше
            console.log('[App.init v2.5.1] UI modules initialized.');

            if (typeof topbar === 'undefined') throw new Error("topbar.js is not loaded!");
            topbar.init();
            if (typeof soundPresets === 'undefined') throw new Error("soundpresets.js is not loaded!");
            soundPresets.init();
            if (typeof fxChains === 'undefined') throw new Error("fxchains.js is not loaded!");
            fxChains.init();

            // Применение начального UI состояния
            this.updateLoadingText('loading_presets', 'Applying settings...');
            this.applyTheme(this.state.theme);
            await this.applySoundPreset(this.state.soundPreset); // Этот вызов уже содержит _determineEffectiveYAxisControls и обновление UI
            await this.applyFxChain(this.state.fxChain); // Этот вызов также должен содержать _determineEffectiveYAxisControls и обновление UI
            console.log('[App.init v2.5.1] Initial UI state applied.');

            this._updateSidePanelSettingsUI(); // Обновляем все настройки UI
            sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            if (fxChains.updateMasterOutputControlsUI) fxChains.updateMasterOutputControlsUI(this.state.masterVolumeCeiling);
            if (fxChains.updateYAxisControlsUI && this.state.fxChain === null) {
                fxChains.updateYAxisControlsUI(this.state.yAxisControls);
            }
            // app.updateZones() уже был вызван из PadModeManager.setActiveMode()

            this.elements.body.classList.add('landscape-mode');
            console.log('-----------------------------------------');
            console.log('[App.init v2.5.1] Core Initialization Complete.');
            console.log('Waiting for user interaction or timeout...');
            console.log('-----------------------------------------');

            const audioInitializedDone = await audioInitPromise;
            this.elements.loadingText?.classList.add('fade-out');
            if (audioInitializedDone) {
                 this.loadingAudio?.playSFX('logo_reveal');
                 this.loadingAudio?.startMusicLoop();
            }
            this.elements.loadingTitle?.classList.add('show');
            this.elements.loadingPrompt?.classList.add('show');
            if (typeof i18n !== 'undefined') i18n.updateUI();

            this.loadingTimeoutId = setTimeout(() => { this.triggerAppStart(); }, 14500);
            this.elements.loadingOverlay.addEventListener('click', this.handleOverlayClick, { once: true });

            this.elements.rocketStatusPanel = document.getElementById('rocket-status-panel');
            if (this.elements.rocketStatusPanel) {
                this.elements.statusCurrentChord = document.getElementById('status-current-chord');
                this.elements.statusCurrentKey = document.getElementById('status-current-key');
                this.elements.statusNextSuggestions = document.getElementById('status-next-suggestions');
                this.elements.statusEnergyLevel = document.getElementById('status-energy-level');
                this.elements.statusCurrentPhase = document.getElementById('status-current-phase');
            }

            // ... после инициализации i18n и moduleManager ...
            if (typeof VibrationService !== 'undefined') {
                VibrationService.init(this);
                console.log('[App.init] VibrationService initialized.');
                // >>> НАЧАЛО НОВОГО КОДА <<<
                // Явно конфигурируем сервис на основе загруженного или дефолтного состояния
                VibrationService.setEnabled(this.state.vibrationEnabled);
                VibrationService.setIntensity(this.state.vibrationIntensity);
                console.log(`[App.init] VibrationService configured with state: enabled=${this.state.vibrationEnabled}, intensity=${this.state.vibrationIntensity}`);
                // >>> КОНЕЦ НОВОГО КОДА <<<
            } else {
                console.error('[App.init] VibrationService not found!');
            }

        } catch (error) {
            console.error('[App.init v2.5.1] Initialization sequence failed:', error, error.stack);
            this.state.isInitialized = false;
            this.updateLoadingText('error_init_failed_details', `Initialization Error: ${error.message}. Check console.`, true);
            this.starsAnimation?.stop();
            this.loadingAudio?.stopMusicLoop();
            this.loadingAudio?.dispose();
            this.starsAnimation?.cleanup();
            this.prismEffect?.cleanup();
            if (this.loadingTimeoutId) clearTimeout(this.loadingTimeoutId);
        }
    },

    updateLoadingText(key, fallback, isError = false) {
        if (this.elements.loadingText) {
            const message = (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate(key, fallback) : fallback;
            this.elements.loadingText.textContent = message;
            this.elements.loadingText.style.color = isError ? 'var(--color-accent, #ff4081)' : 'var(--color-text-on-dark, #e0e0e0)';
            this.elements.loadingText.classList.remove('fade-out');
        }
    },

    handleOverlayClick() {
        console.log("[App v6] Loading overlay clicked by user.");
        if (app.loadingTimeoutId) { clearTimeout(app.loadingTimeoutId); app.loadingTimeoutId = null; }
        app.triggerAppStart();
    },

    triggerAppStart() {
        if (app.isStartingApp || !app.state.isInitialized) { return; }
        console.log("[App v6] Triggering app start sequence...");
        app.isStartingApp = true;
        app.loadingAudio?.stopMusicLoop(0.3);
        app.starsAnimation?.stop();
        app.loadingAudio?.playSFX('transition_burst');
        app.elements.loadingTitle?.classList.remove('show');
        app.elements.loadingPrompt?.classList.remove('show');
        if (app.prismEffect) { app.prismEffect.play(() => { app.startAudioAndShowApp(); }); }
        else { app.startAudioAndShowApp(); }
    },

    async startAudioAndShowApp() {
        console.log("[App v6] Starting audio and hiding overlay...");
        try {
            if (Tone.context.state !== 'running') { await Tone.start(); }
            if (Tone.context.state === 'running') {
                app.state.isAudioReady = true;
                // === Экспериментальные настройки Tone.js context ===
                try {
                    Tone.context.lookAhead = 0.15; // По умолчанию ~0.1
                    Tone.context.updateInterval = 0.04; // По умолчанию ~0.03
                    console.log(`[App] Tone.context.lookAhead set to ${Tone.context.lookAhead}, updateInterval set to ${Tone.context.updateInterval}`);
                } catch (e) { console.warn('[App] Could not set Tone.context lookAhead/updateInterval:', e); }
                Tone.context.on('statechange', (e) => {
                    app.state.isAudioReady = Tone.context.state === 'running';
                    if (!app.state.isAudioReady) console.warn("[App v6] Audio context suspended after start!");
                });
                app.hideLoading();
                setTimeout(() => {
                    app.loadingAudio?.dispose(); app.starsAnimation?.cleanup(); app.prismEffect?.cleanup();
                }, 600);
            } else { throw new Error(`Audio context failed to start. State: ${Tone.context.state}`); }
        } catch (error) {
            console.error("[App v6] Failed to start/resume Tone.js:", error);
            app.elements.loadingOverlay?.classList.remove('hiding', 'hidden');
            app.updateLoadingText('error_audio_failed_retry', 'Error starting audio. Please tap again.', true);
            app.elements.loadingTitle?.classList.remove('show');
            app.elements.loadingPrompt?.classList.remove('show');
            app.elements.loadingText?.classList.add('fade-out');
            app.isStartingApp = false; app.state.isAudioReady = false; app.prismEffect?.stop();
            if (this.elements.loadingOverlay) { this.elements.loadingOverlay.removeEventListener('click', this.handleOverlayClick); this.elements.loadingOverlay.addEventListener('click', this.handleOverlayClick, { once: true }); }
        }
    },

    hideLoading() {
        if (this.elements.loadingOverlay && !this.elements.loadingOverlay.classList.contains('hidden')) {
            this.elements.loadingOverlay.classList.add('hiding');
            this.elements.loadingOverlay.addEventListener('transitionend', (event) => {
                 if (event.propertyName === 'opacity' || event.propertyName === 'transform') {
                     if (this.elements.loadingOverlay) { this.elements.loadingOverlay.classList.add('hidden'); this.elements.loadingOverlay.classList.remove('hiding'); }
                 }
            }, { once: true });
        }
    },

    waitForBridge() {
        const timeoutMs = 10000; const checkInterval = 100;
        return new Promise((resolve, reject) => {
            if (window.PrismtoneBridge?.getModules) { this.state.isBridgeReady = true; resolve(); }
            else { let attempts = 0; const maxAttempts = timeoutMs / checkInterval;
                const interval = setInterval(() => { attempts++;
                    if (window.PrismtoneBridge?.getModules) { clearInterval(interval); this.state.isBridgeReady = true; resolve(); }
                    else if (attempts > maxAttempts) { clearInterval(interval); reject(new Error("Bridge connection timed out")); }
                }, checkInterval);
            }
        });
    },

    async loadInitialSettings() {
        console.log("[App.loadInitialSettings] Loading settings...");
        // Пример загрузки из localStorage, замените на реальный вызов Bridge, если нужно
        const savedState = {
            theme: localStorage.getItem('theme') || 'day',
            language: localStorage.getItem('language') || 'en',
            soundPreset: localStorage.getItem('soundPreset') || '_test_single_preset', // Дефолт
            visualizer: localStorage.getItem('visualizer') || 'waves', // Дефолт
            touchEffect: localStorage.getItem('touchEffect') || 'glow', // Дефолт
            scale: localStorage.getItem('scale') || 'major', // Дефолт
            octaveOffset: parseInt(localStorage.getItem('octaveOffset') || '0', 10), // Дефолт 0
            zoneCount: parseInt(localStorage.getItem('zoneCount') || '12', 10), // Дефолт 12
            showNoteNames: localStorage.getItem('showNoteNames') === 'true',
            showLines: localStorage.getItem('showLines') === 'true',
            masterVolumeCeiling: parseFloat(localStorage.getItem('masterVolumeCeiling') || '1.0'),
            enablePolyphonyVolumeScaling: localStorage.getItem('enablePolyphonyVolumeScaling') === 'true',
            // === ЗАГРУЗКА ТОНИКИ ===
            currentTonic: localStorage.getItem('currentTonic') || "C4", // Загружаем или используем дефолт
            // === ЗАГРУЗКА highlightSharpsFlats ===
            highlightSharpsFlats: localStorage.getItem('highlightSharpsFlats') === 'true', // Загружаем или используем дефолт false
            // === ЗАГРУЗКА СОСТОЯНИЙ ПАНЕЛИ АККОРДОВ ===
            isChordPanelCollapsed: localStorage.getItem('isChordPanelCollapsed') === 'true',
            chordPanelWidth: parseInt(localStorage.getItem('chordPanelWidth'), 10) || 320,
            // === ЗАГРУЗКА rocketModeSettings ===
            rocketModeSettings: {
                highlightActiveNotes: localStorage.getItem('rocketModeSettings.highlightActiveNotes') === 'true',
                showDirectionalMarkers: localStorage.getItem('rocketModeSettings.showDirectionalMarkers') === 'true',
                markerStyle: localStorage.getItem('rocketModeSettings.markerStyle') || "GlowFromNote",
                showOnlyForValidChords: localStorage.getItem('rocketModeSettings.showOnlyForValidChords') === 'true',
                animateMarkerFadeOut: localStorage.getItem('rocketModeSettings.animateMarkerFadeOut') === 'true',
                showChordName: localStorage.getItem('rocketModeSettings.showChordName') === 'true',
                // Новые поля:
                chordBehavior: localStorage.getItem('rocketModeSettings.chordBehavior') || 'analyze',
                nextSuggestionType: localStorage.getItem('rocketModeSettings.nextSuggestionType') || 'chords',
                phaseHintMode: localStorage.getItem('rocketModeSettings.phaseHintMode') || 'phaseAware',
                energyAffectsHints: localStorage.getItem('rocketModeSettings.energyAffectsHints') !== 'false',
                keyBehavior: localStorage.getItem('rocketModeSettings.keyBehavior') || 'auto'
            },
            // =======================
        };

        if (!this.state.isBridgeReady) {
             console.warn('[App.loadInitialSettings v6] Bridge not ready. Using defaults.');
             // Применяем дефолтные или загруженные из localStorage, если Bridge недоступен сразу
             this.state = { ...this.state, ...savedState };
             console.log('[App.loadInitialSettings] Initial state updated from localStorage (Bridge not ready):', this.state);
             return; // Выходим, если Bridge не готов
        }
        try {
            const settingsJson = await Promise.race([
                bridgeFix.callBridge('getCurrentSettings'),
                new Promise((_, reject) => setTimeout(() => reject(new Error("getCurrentSettings timeout")), 5000))
            ]);

            if (settingsJson) {
                const settings = JSON.parse(settingsJson);
                console.log('[App.loadInitialSettings v6] Received settings:', settings);
                this.state.theme = settings.theme || this.state.theme;
                this.state.language = settings.language || this.state.language;
                this.state.soundPreset = settings.soundPreset || this.state.soundPreset;
                this.state.fxChain = settings.fxChain ?? this.state.fxChain;
                this.state.visualizer = settings.visualizer || this.state.visualizer;
                this.state.touchEffect = settings.touchEffect || this.state.touchEffect;
                this.state.scale = settings.scale || this.state.scale;
                this.state.octaveOffset = settings.octaveOffset ?? this.state.octaveOffset;
                this.state.zoneCount = settings.zoneCount || this.state.zoneCount;
                this.state.showNoteNames = settings.showNoteNames ?? this.state.showNoteNames;
                this.state.showLines = settings.showLines ?? this.state.showLines; // Было showGrid

                this.state.masterVolumeCeiling = settings.masterVolumeCeiling ?? this.state.masterVolumeCeiling;
                this.state.enablePolyphonyVolumeScaling = settings.enablePolyphonyVolumeScaling ?? this.state.enablePolyphonyVolumeScaling;

                // === ЗАГРУЗКА highlightSharpsFlats из Bridge ===
                this.state.highlightSharpsFlats = settings.highlightSharpsFlats ?? this.state.highlightSharpsFlats; // Загружаем из bridge
                // ===============================================

                // === ОБНОВЛЕНИЕ ЗАГРУЗКИ yAxisControls для Части 2 ===
                const defaultVolY = this.state.yAxisControls.volume;
                const defaultFxY = this.state.yAxisControls.effects;

                if (settings.yAxisControls && typeof settings.yAxisControls === 'object') {
                    const receivedY = settings.yAxisControls;
                    if (receivedY.volume && typeof receivedY.volume === 'object') {
                        this.state.yAxisControls.volume.minOutput = receivedY.volume.minOutput ?? defaultVolY.minOutput;
                        this.state.yAxisControls.volume.maxOutput = receivedY.volume.maxOutput ?? defaultVolY.maxOutput;
                        this.state.yAxisControls.volume.yThreshold = receivedY.volume.yThreshold ?? defaultVolY.yThreshold;
                        this.state.yAxisControls.volume.curveType = receivedY.volume.curveType || defaultVolY.curveType;
                        this.state.yAxisControls.volume.curveFactor = receivedY.volume.curveFactor ?? defaultVolY.curveFactor;
                        this.state.yAxisControls.volume.outputType = receivedY.volume.outputType || defaultVolY.outputType;
                    }
                    if (receivedY.effects && typeof receivedY.effects === 'object') {
                        this.state.yAxisControls.effects.minOutput = receivedY.effects.minOutput ?? defaultFxY.minOutput;
                        this.state.yAxisControls.effects.maxOutput = receivedY.effects.maxOutput ?? defaultFxY.maxOutput;
                        this.state.yAxisControls.effects.yThreshold = receivedY.effects.yThreshold ?? defaultFxY.yThreshold;
                        this.state.yAxisControls.effects.curveType = receivedY.effects.curveType || defaultFxY.curveType;
                        this.state.yAxisControls.effects.curveFactor = receivedY.effects.curveFactor ?? defaultFxY.curveFactor;
                        this.state.yAxisControls.effects.outputType = receivedY.effects.outputType || defaultFxY.outputType;
                    }
                }
                // =====================================================

                // === НОВОЕ: Загрузка currentTonic и highlightSharpsFlats ===
                if (settings.currentTonic !== undefined) this.state.currentTonic = settings.currentTonic;
                if (settings.highlightSharpsFlats !== undefined) this.state.highlightSharpsFlats = settings.highlightSharpsFlats;
                // =======================================================

                // === ЗАГРУЗКА rocketModeSettings ===
                let rocketDefaults = {
                    highlightActiveNotes: true,
                    showDirectionalMarkers: true,
                    markerStyle: "GlowFromNote",
                    showOnlyForValidChords: false,
                    animateMarkerFadeOut: true,
                    showChordName: true,
                    intensity: 0.5,
                    autoPhases: true,
                    phaseTransitionMode: 'activity',
                    phaseDurations: { ignition: 30, liftOff: 60, burst: 90 },
                    // === Новые поля для Rocket Status Panel ===
                    chordBehavior: 'analyze', // 'analyze' | 'ignore' | 'fixed'
                    nextSuggestionType: 'chords', // 'chords' | 'notes' | 'cadences' | 'improv'
                    phaseHintMode: 'phaseAware', // 'phaseAware' | 'ignorePhase' | 'burstOnly'
                    energyAffectsHints: true, // true | false
                    keyBehavior: 'auto' // 'auto' | 'fixed' | 'ignore'
                };
                let loadedRocket = {};
                try {
                    loadedRocket = JSON.parse(localStorage.getItem('rocketModeSettings') || '{}');
                } catch(e) { loadedRocket = {}; }
                this.state.rocketModeSettings = { ...rocketDefaults, ...loadedRocket };
                // ... если есть settings.rocketModeSettings из Bridge, применить его ...
                if (settings && settings.rocketModeSettings) {
                    try {
                        const parsed = typeof settings.rocketModeSettings === 'string' ? JSON.parse(settings.rocketModeSettings) : settings.rocketModeSettings;
                        this.state.rocketModeSettings = { ...rocketDefaults, ...parsed };
                    } catch(e) { console.warn('[App] Failed to parse rocketModeSettings from bridge:', e); }
                }
                // =======================================================

                console.log('[App.loadInitialSettings v6] Final rocketModeSettings:', this.state.rocketModeSettings);
                console.log('[App.loadInitialSettings v6] Initial state updated:', this.state);
            } else {
                 console.warn('[App.loadInitialSettings v6] Received null or empty settings from bridge. Using defaults.');
            }
        } catch (error) {
            console.error('[App.loadInitialSettings v6] Error loading initial settings:', error);
        }
        // После загрузки настроек Rocket Mode из localStorage/Bridge
        const defaultRocketSettings = /* импортировать или получить из defaultAppSettings.json */ window.defaultRocketSettings || {};
        const loadedRocketSettings = this.state.rocketModeSettings || {};
        this.state.rocketModeSettings = {
            ...defaultRocketSettings,
            ...loadedRocketSettings,
            displayMarkers: { ...defaultRocketSettings.displayMarkers, ...(loadedRocketSettings.displayMarkers || {}) },
            phaseDurations: { ...defaultRocketSettings.phaseDurations, ...(loadedRocketSettings.phaseDurations || {}) }
        };
        if (this.state.padMode === 'rocket' && this.state.isInitialized && PadModeManager.getCurrentStrategy()?.getName() === 'rocket') {
            PadModeManager.getCurrentStrategy().updateInternalSetting('all', this.state.rocketModeSettings);
            this.updateZoneLayout();
            this.updateRocketStatusPanel();
        }

        // === Глубокое объединение rocketModeSettings ===
        const baseRocketDefaults = JSON.parse(JSON.stringify(this.state.rocketModeSettings));
        let finalRocketSettings = baseRocketDefaults;
        try {
            const savedJsSettingsJson = localStorage.getItem('prismtoneAppSettings_js');
            if (savedJsSettingsJson) {
                const savedJsSettings = JSON.parse(savedJsSettingsJson);
                if (savedJsSettings.rocketModeSettings) {
                    finalRocketSettings = {
                        ...baseRocketDefaults,
                        ...savedJsSettings.rocketModeSettings,
                        displayMarkers: {
                            ...(baseRocketDefaults.displayMarkers || {}),
                            ...(savedJsSettings.rocketModeSettings.displayMarkers || {})
                        },
                        phaseDurations: {
                            ...(baseRocketDefaults.phaseDurations || {}),
                            ...(savedJsSettings.rocketModeSettings.phaseDurations || {})
                        }
                    };
                    console.log('[App.loadInitialSettings] Loaded and merged rocketModeSettings from localStorage.');
                }
            }
        } catch (e) {
            console.error('[App.loadInitialSettings] Error loading/merging JS-specific settings from localStorage:', e);
        }
        this.state.rocketModeSettings = finalRocketSettings;
        console.log('[App.loadInitialSettings] Final initial rocketModeSettings:', JSON.parse(JSON.stringify(this.state.rocketModeSettings)));
        // ... остальной код ...

        // --- Загрузка presetYAxisEffectsConfig из начального звукового пресета ---
        if (this.state.soundPreset && typeof moduleManager !== 'undefined' && moduleManager) { // Добавлена проверка moduleManager
            const initialPresetModule = await moduleManager.getModule(this.state.soundPreset);
            if (initialPresetModule?.data?.data?.yAxisEffectsSendConfig) {
                this.state.presetYAxisEffectsConfig = JSON.parse(JSON.stringify(initialPresetModule.data.data.yAxisEffectsSendConfig));
                console.log("[App.loadInitialSettings] Initial presetYAxisEffectsConfig set from:", this.state.soundPreset, this.state.presetYAxisEffectsConfig);
            } else {
                this.state.presetYAxisEffectsConfig = null;
                console.log("[App.loadInitialSettings] No yAxisEffectsSendConfig in initial preset:", this.state.soundPreset);
            }
        } else {
            this.state.presetYAxisEffectsConfig = null; // На случай, если soundPreset не определен или moduleManager еще нет
            console.warn("[App.loadInitialSettings] Could not load initial presetYAxisEffectsConfig (soundPreset or moduleManager missing).");
        }
        // --- Конец загрузки presetYAxisEffectsConfig ---

        await this._determineEffectiveYAxisControls(); // Определяем и применяем финальные Y-axis controls

        console.log('[App.loadInitialSettings] Final initial state updated:', JSON.parse(JSON.stringify(this.state))); // Логируем всё состояние
        this.state.yAxisDefinedByPreset = false; // потому что мы еще не знаем, откуда пришли загруженные yAxisControls

        // Загрузка состояния панели аккордов
        this.state.isChordPanelCollapsed = localStorage.getItem('isChordPanelCollapsed') === 'true';
        this.state.chordPanelWidth = parseInt(localStorage.getItem('chordPanelWidth'), 10) || 320;
    },

    resumeAudio() {
        if (this.state.isInitialized && Tone.context && Tone.context.state !== 'running') {
             console.log(`[App.resumeAudio] Attempting to resume audio. Current state: ${Tone.context.state}, isAudioReady: ${this.state.isAudioReady}`);
            Tone.context.resume().then(() => {
                this.state.isAudioReady = Tone.context.state === 'running';
                console.log(`[App.resumeAudio] Audio resumed. New state: ${Tone.context.state}, isAudioReady: ${this.state.isAudioReady}`);
            }).catch(err => {
                this.state.isAudioReady = false;
                console.error("[App.resumeAudio] Error resuming audio:", err);
            });
        } else if (Tone.context) {
            this.state.isAudioReady = Tone.context.state === 'running';
        } else {
            console.warn("[App.resumeAudio] Tone.context not available.");
            this.state.isAudioReady = false;
        }
    },

    suspendAudio() {
        console.log("[App.suspendAudio] Suspending audio.");
        if (synth?.stopAllNotes) {
            synth.stopAllNotes();
        }
    },

    applyTheme(themeId) {
        if (!themeId) return;
        try {
            const currentClasses = Array.from(this.elements.body.classList);
            const themeClasses = currentClasses.filter(cls => cls.startsWith('theme-'));
            this.elements.body.classList.remove(...themeClasses);
            this.elements.body.classList.add(`theme-${themeId}`);
            this.state.theme = themeId;
            if (visualizer?.updateTheme) visualizer.updateTheme();
            this._updateSidePanelSettingsUI(); // Вынесли в отдельный метод
        } catch (error) { console.error(`[App] Error applying theme ${themeId}:`, error); }
    },

    async applyLanguage(languageId) {
         if (!languageId) return;
         const previousLanguageId = this.state.language; // Для отката

        try {
            if (i18n?.loadLanguage) {
                await i18n.loadLanguage(languageId);
                this.state.language = languageId;
                
                // Обновление текста на экране загрузки, если он виден
                if (this.elements.loadingOverlay && !this.elements.loadingOverlay.classList.contains('hidden')) {
                     const currentTextKey = this.elements.loadingText?.dataset.i18nKey || 'loading';
                     // Предполагается, что updateLoadingText может использовать i18n для перевода ключа
                     this.updateLoadingText(currentTextKey, currentTextKey);
                }

                // Сохраняем в bridge ПОСЛЕ успешной загрузки языка
                if (this.state.isBridgeReady) { // Добавляем проверку isBridgeReady
                    await bridgeFix.callBridge('setLanguage', languageId);
                }

                 this._updateSidePanelSettingsUI();
            } else { 
                console.error('[App.applyLanguage] i18n module or loadLanguage function is not available.');
                throw new Error('i18n module not available'); // Выбрасываем ошибку, чтобы попасть в catch
            }
        } catch (error) { 
            console.error(`[App.applyLanguage] Error applying language ${languageId}:`, error, error.stack);
            // Логика отката
            this.state.language = previousLanguageId;
            if (i18n?.loadLanguage) {
                // Пытаемся откатить язык в i18n
                await i18n.loadLanguage(previousLanguageId).catch(e => console.error("[App.applyLanguage] Rollback i18n.loadLanguage failed:", e));
            }
            if (this.state.isBridgeReady) {
                await bridgeFix.callBridge('setLanguage', previousLanguageId).catch(e => console.error("[App.applyLanguage] Rollback bridge call failed:", e));
            }
            // Обновить UI после отката
            if (this.elements.loadingOverlay && !this.elements.loadingOverlay.classList.contains('hidden')) {
                 const currentTextKey = this.elements.loadingText?.dataset.i18nKey || 'loading';
                 this.updateLoadingText(currentTextKey, currentTextKey);
            }
            this._updateSidePanelSettingsUI();
        }
    },

    async applyVisualizer(visualizerId) {
        if (!visualizerId) return; // Проверка на пустой visualizerId
        // Флаг isApplyingChange здесь не используется, согласно примеру пользователя
        
        const previousVisualizerId = this.state.visualizer; // Для возможного отката

        try {
            this.state.visualizer = visualizerId;
            if (visualizer?.setVisualizerType) {
                await visualizer.setVisualizerType(visualizerId);
                // Используем await и новый метод моста согласно примеру
                if (this.state.isBridgeReady) { // Добавляем проверку isBridgeReady для безопасности
                    await bridgeFix.callBridge('setVisualizer', visualizerId); 
                }
            }
            this._updateSidePanelSettingsUI();
        } catch (error) {
            console.error(`[App] Error applying visualizer ${visualizerId}:`, error, error.stack);
            // Логика отката
            this.state.visualizer = previousVisualizerId;
            if (visualizer?.setVisualizerType) {
                await visualizer.setVisualizerType(previousVisualizerId).catch(e => console.error("[App.applyVisualizer] Rollback setVisualizerType failed:", e));
            }
            if (this.state.isBridgeReady) {
                 await bridgeFix.callBridge('setVisualizer', previousVisualizerId).catch(e => console.error("[App.applyVisualizer] Rollback bridge call failed:", e));
            }
            this._updateSidePanelSettingsUI(); 
        }
    },

    async applyTouchEffect(effectId) {
        // Значение по умолчанию 'none' применяется, если effectId это null или undefined
        const targetEffectId = effectId ?? 'none'; 
        // Флаг isApplyingChange здесь не используется, согласно примеру пользователя

        const previousTouchEffectId = this.state.touchEffect; // Для возможного отката

        try {
            this.state.touchEffect = targetEffectId;
            if (visualizer?.setTouchEffectType) {
                await visualizer.setTouchEffectType(targetEffectId);
                // Используем await и новый метод моста
                if (this.state.isBridgeReady) { // Добавляем проверку isBridgeReady для безопасности
                    await bridgeFix.callBridge('setTouchEffect', targetEffectId);
                }
            }
            this._updateSidePanelSettingsUI();
        } catch (error) {
            console.error(`[App] Error applying touch effect ${targetEffectId}:`, error, error.stack);
            // Логика отката
            this.state.touchEffect = previousTouchEffectId;
            if (visualizer?.setTouchEffectType) {
                await visualizer.setTouchEffectType(previousTouchEffectId).catch(e => console.error("[App.applyTouchEffect] Rollback setTouchEffectType failed:", e));
            }
            if (this.state.isBridgeReady) {
                await bridgeFix.callBridge('setTouchEffect', previousTouchEffectId).catch(e => console.error("[App.applyTouchEffect] Rollback bridge call failed:", e));
            }
            this._updateSidePanelSettingsUI();
        }
    },

    _applyAndSyncYAxisState() {
        console.log(`[App._applyAndSyncYAxisState v8] Syncing Y-Axis state from app.state:`, JSON.parse(JSON.stringify(this.state.yAxisControls)));
        if (synth) {
            if (synth.updateAllActiveVoiceMainLevels) synth.updateAllActiveVoiceMainLevels();
            if (synth.updateAllActiveVoiceSendLevels) synth.updateAllActiveVoiceSendLevels();
        }
        if (fxChains?.updateYAxisControlsUI) {
            fxChains.updateYAxisControlsUI(this.state.yAxisControls);
        }
        if (this.state.isInitialized && this.state.isBridgeReady) {
            bridgeFix.callBridge('setYAxisControlGroup', 'volume', JSON.stringify(this.state.yAxisControls.volume))
                .catch(err => console.error("[App._applyAndSyncYAxisState v8] Bridge setYAxis volume failed:", err));
            bridgeFix.callBridge('setYAxisControlGroup', 'effects', JSON.stringify(this.state.yAxisControls.effects))
                .catch(err => console.error("[App._applyAndSyncYAxisState v8] Bridge setYAxis effects failed:", err));
        }
    },

    async applySoundPreset(presetId) {
        // Используем более гибкий вариант определения targetPresetId из предыдущей версии
        const targetPresetId = presetId || (this.config.defaultPreset ? this.config.defaultPreset.id : 'default_piano');
        console.log(`[App.applySoundPreset] Applying preset: ${targetPresetId}`);

        if (this.state.isApplyingChange) {
            console.warn("[App.applySoundPreset] Action ignored: another change is already in progress.");
            return;
        }
        this.state.isApplyingChange = true;
        // this.showLoadingIndicator(true);

        const previousPresetId = this.state.soundPreset; 

        try {
            const presetModule = await moduleManager.getModule(targetPresetId);
            // Используем synth.config.defaultPreset как более подходящий фоллбэк для данных синтезатора
            const presetData = presetModule?.data?.data || synth.config.defaultPreset; 

            if (!presetData) {
                // Сообщение об ошибке немного изменено для ясности
                throw new Error(`Preset data for '${targetPresetId}' not found and synth default is also unavailable.`);
            }

            // Порядок согласно последнему примеру:
            // 1. synth.applyPreset
            if (synth?.applyPreset) {
                synth.applyPreset(presetData);
            } else {
                throw new Error("Synth not ready for preset application");
            }
            
            // 2. this.state.soundPreset
            this.state.soundPreset = targetPresetId;

            // 3. soundPresets.updateActivePresetCube
            if (soundPresets?.updateActivePresetCube) {
                soundPresets.updateActivePresetCube(targetPresetId);
            }
            
            // 4. bridgeFix.callBridge
            if (this.state.isBridgeReady) { // Проверка isBridgeReady добавлена для безопасности
                await bridgeFix.callBridge('setSoundPreset', targetPresetId);
            }

            // 5. _resolveAndApplyYAxisControls
            if (typeof this._resolveAndApplyYAxisControls === 'function') {
                await this._resolveAndApplyYAxisControls(true); 
            } else {
                 console.warn("[App.applySoundPreset] _resolveAndApplyYAxisControls is not a function.");
            }

        } catch (error) {
            console.error(`[App.applySoundPreset] Error applying sound preset ${targetPresetId}:`, error, error.stack);
            this.state.soundPreset = previousPresetId;
            if (synth?.applyPreset) {
                let previousPresetModule = null;
                if (previousPresetId) {
                    try {
                        previousPresetModule = await moduleManager.getModule(previousPresetId);
                    } catch (e) {
                         console.warn(`[App.applySoundPreset] Failed to get previous preset module for rollback: ${previousPresetId}`, e);
                    }
                }
                const previousPresetData = previousPresetModule?.data?.data || synth.config.defaultPreset;
                synth.applyPreset(previousPresetData);
            }
            if (soundPresets?.updateActivePresetCube) {
                soundPresets.updateActivePresetCube(previousPresetId);
            }
        } finally {
            this.state.isApplyingChange = false;
            // this.hideLoadingIndicator();
        }
    },

    async applyFxChain(chainId) {
        const targetChainId = chainId ?? null;
        console.log(`[App.applyFxChain] Applying FX Chain ID: ${targetChainId}.`);

        // Используем флаг блокировки, чтобы предотвратить состояния гонки
        if (this.state.isApplyingChange) {
            console.warn("[App.applyFxChain] Cannot apply FX chain while another change is in progress.");
            return;
        }
        this.state.isApplyingChange = true;
        // Показать индикатор загрузки
        // this.showLoadingIndicator(true);

        const previousChainId = this.state.fxChain; // Для отката

        try {
            let chainModule = null;
            if (targetChainId) {
                chainModule = await moduleManager.getModule(targetChainId);
            }
            const fxChainFullDataForSynth = chainModule?.data?.data || null;

            // 1. Применяем к аудио движку
            if (!synth?.applyFxChain) {
                 console.error("[App.applyFxChain] synth.applyFxChain is not a function!");
                 throw new Error("Synth not ready or applyFxChain not available");
            }
            // Примечание: synth.applyFxChain сама по себе не async, но мы ждем ее выполнения
            // в контексте этой async функции, чтобы сохранить порядок операций.
            // Если бы она возвращала Promise, мы бы его await-или.
            synth.applyFxChain(fxChainFullDataForSynth);

            // 2. Обновляем состояние приложения
            this.state.fxChain = targetChainId;

            // 3. АСИНХРОННО сохраняем состояние в bridge
            if (this.state.isBridgeReady) {
                await bridgeFix.callBridge('setFxChain', targetChainId);
            }

            // 4. Обновляем UI ПОСЛЕ успешного применения
            if (fxChains?.updateActiveChain) {
                fxChains.updateActiveChain(targetChainId);
            }
            
            // 5. Разрешаем и применяем настройки Y-оси
            // Убедимся, что _resolveAndApplyYAxisControls существует и является функцией
            if (typeof this._resolveAndApplyYAxisControls === 'function') {
                await this._resolveAndApplyYAxisControls(true); // forceUpdate=true
            } else {
                console.warn("[App.applyFxChain] _resolveAndApplyYAxisControls is not a function.");
            }

        } catch (error) {
            console.error(`[App.applyFxChain] Error applying FX chain ${targetChainId}:`, error, error.stack);
            // Логика отката
            this.state.fxChain = previousChainId;
            if (synth?.applyFxChain) {
                let previousChainModule = null;
                if (previousChainId) {
                    try {
                         previousChainModule = await moduleManager.getModule(previousChainId);
                    } catch (e) {
                        console.warn(`[App.applyFxChain] Failed to get previous chain module for rollback: ${previousChainId}`, e);
                    }
                }
                const previousFxData = previousChainModule?.data?.data || null;
                synth.applyFxChain(previousFxData); // Откатываем synth
            }
            if (fxChains?.updateActiveChain) {
                fxChains.updateActiveChain(previousChainId); // Откатываем UI
            }
            // Можно добавить уведомление пользователя об ошибке
        } finally {
            this.state.isApplyingChange = false;
            // this.hideLoadingIndicator();
        }
    },

    async setScale(scaleId) {
        if (!scaleId || this.state.scale === scaleId) return;
        console.log(`[App] Setting scale to: ${scaleId}`);
        const previousScale = this.state.scale;

        try {
            this.state.scale = scaleId;

            // >>> НАЧАЛО ИСПРАВЛЕНИЯ <<<
            // Прямой вызов правильной функции. Делегирование в PadModeManager больше не нужно.
            await this.updateZoneLayout();
            console.log(`[App.setScale] Zone layout update triggered for new scale: ${scaleId}`);
            // >>> КОНЕЦ ИСПРАВЛЕНИЯ <<<

            // Обновляем UI панели тональности
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }

            // Сохраняем в bridge ПОСЛЕ всех успешных операций
            if (this.state.isBridgeReady) {
                 await bridgeFix.callBridge('setSetting', 'scale', this.state.scale);
            }

        } catch (error) {
            console.error(`[App.setScale] Failed to set scale to ${scaleId}:`, error, error.stack);
            this.state.scale = previousScale; // Откат
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
        }
    },
    async setOctaveOffset(offset) {
        const newOffset = Math.max(-7, Math.min(7, parseInt(offset, 10)));
        if (newOffset === this.state.octaveOffset || isNaN(newOffset)) return;
        console.log(`[App] Setting octave offset to: ${newOffset}`);
        const previousOffset = this.state.octaveOffset;

        try {
        this.state.octaveOffset = newOffset;

            // Важно ДОЖДАТЬСЯ обновления раскладки перед другими действиями
            if (typeof this.updateZoneLayout === 'function') {
        await this.updateZoneLayout();
            }

            // Обновляем UI панели тональности
        if (sidePanel?.updateTonalityControls) {
            sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
        }

            // Сохраняем в bridge ПОСЛЕ всех успешных операций
            if (this.state.isBridgeReady) {
                await bridgeFix.callBridge('setOctaveOffset', this.state.octaveOffset);
            }

        } catch (error) {
            console.error(`[App.setOctaveOffset] Failed to set octave offset to ${newOffset}:`, error, error.stack);
            this.state.octaveOffset = previousOffset; // Откат
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
        }
    },

    async setZoneCount(count) {
        const newCount = parseInt(count, 10);
        if (isNaN(newCount) || newCount < 8 || newCount > 36 || newCount % 2 !== 0) {
            console.warn(`[App.setZoneCount] Invalid zone count: ${count}. Must be an even number between 8 and 36.`);
            // Важно вернуть UI к актуальному состоянию, если ввод неверный
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
            return;
        }
        if (newCount === this.state.zoneCount) return;
        console.log(`[App] Setting zone count to: ${newCount}`);
        const previousCount = this.state.zoneCount;

        try {
        this.state.zoneCount = newCount;

            // Важно ДОЖДАТЬСЯ обновления раскладки перед другими действиями
            if (typeof this.updateZoneLayout === 'function') {
        await this.updateZoneLayout();
            }

            // Обновляем UI панели тональности
        if (sidePanel?.updateTonalityControls) {
            sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
        }

            // Сохраняем в bridge ПОСЛЕ всех успешных операций
            if (this.state.isBridgeReady) {
                await bridgeFix.callBridge('setSetting', 'zoneCount', this.state.zoneCount.toString());
            }

        } catch (error) {
            console.error(`[App.setZoneCount] Failed to set zone count to ${newCount}:`, error, error.stack);
            this.state.zoneCount = previousCount; // Откат
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
        }
    },

    async updateZoneLayout() {
        // Полный цикл: layout + визуальные подсказки
        if (!this.state.isInitialized || !PadModeManager || !PadModeManager.getCurrentStrategy() || !pad?.isReady) {
            console.warn(`[App.updateZoneLayout] Aborting: Not ready, no strategy, or pad not ready.`);
            return;
        }
        try {
            const currentStrategy = PadModeManager.getCurrentStrategy();
            const layoutContext = await currentStrategy.getZoneLayoutOptions(this.state);
            if (!layoutContext) {
                pad.drawZones([], this.state.currentTonic);
                await this.updateZoneVisuals([]); // Обновляем визуализацию с пустыми зонами
                return;
            }
            const servicesForStrategy = PadModeManager._getServicesBundle();
            const zonesData = await currentStrategy.generateZoneData(layoutContext, this.state, servicesForStrategy);
            pad.drawZones(zonesData, this.state.currentTonic);
            await this.updateZoneVisuals(zonesData); // ГАРАНТИРОВАННО обновляем hints для актуальных зон
        } catch (error) {
            console.error('[App.updateZoneLayout] Error:', error, error.stack);
            if (pad?.isReady) pad.drawZones([], this.state.currentTonic);
            await this.updateZoneVisuals([]);
        }
    },

    async updateZoneVisuals(currentZonesData = pad._currentDisplayedZones) {
        if (!this.state.isInitialized || !PadModeManager?.getCurrentStrategy() || !pad?.isReady) return;
        try {
            const currentStrategy = PadModeManager.getCurrentStrategy();
            if (typeof currentStrategy.getPadVisualHints === 'function') {
                const services = PadModeManager._getServicesBundle();
                console.log(`[App.updateZoneVisuals] Getting hints for mode: ${PadModeManager.getCurrentModeId()}`);
                const hints = await currentStrategy.getPadVisualHints(currentZonesData, this.state, services);
                console.log(`[App.updateZoneVisuals] ----- HINTS RECEIVED FROM STRATEGY (${hints ? hints.length : 'null/undefined'}) -----`);
                if (Array.isArray(hints)) {
                    hints.forEach((h, i) => {
                        console.log(`  [App] Hint ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
                    });
                    let hintsForVisualizer = [];
                    try {
                        hintsForVisualizer = JSON.parse(JSON.stringify(hints));
                    } catch (e) {
                        console.error("[App.updateZoneVisuals] Error deep copying hints:", e);
                        hintsForVisualizer = hints;
                    }
                    console.log(`[App.updateZoneVisuals] Hints BEING SENT to Visualizer (${hintsForVisualizer ? hintsForVisualizer.length : 'null/undefined'}):`);
                    if (Array.isArray(hintsForVisualizer)) {
                        hintsForVisualizer.forEach((h, i) => {
                            console.log(`  [App] Hint (For Visualizer) ${i}: zoneIndex=${h.zoneIndex}, type='${h.type}', style='${h.style}', color='${h.color}', note='${h.noteName || (h.notes ? h.notes.join(',') : 'N/A')}'`);
                        });
                    }
                    visualizer.updatePadHints(hintsForVisualizer);
                } else {
                    console.warn("[App.updateZoneVisuals] Hints from strategy is not an array:", hints);
                    visualizer.updatePadHints([]);
                }
            } else {
                pad.applyVisualHints([]);
            }
        } catch (error) {
            console.error('[App.updateZoneVisuals] Error:', error);
        }
    },

    toggleNoteNames(show) {
        if (this.state.isApplyingChange) {
            console.log('[App.toggleNoteNames] Change blocked because a major change is in progress.');
            if (pad?.toggleLabels) pad.toggleLabels(this.state.showNoteNames);
            return;
        }
        if (typeof show !== 'boolean') return;
        this.state.showNoteNames = show;
        if (pad?.toggleLabels) pad.toggleLabels(show);
        bridgeFix.callBridge('setSetting', 'showNoteNames', show.toString()).catch(err => console.error("[App] Bridge setSetting showNoteNames failed:", err));
        this._updateSidePanelSettingsUI();
    },

    toggleLines(show) {
        if (this.state.isApplyingChange) {
            console.log('[App.toggleLines] Change blocked because a major change is in progress.');
            if (pad?.toggleLines) pad.toggleLines(this.state.showLines);
            return;
        }
        if (typeof show !== 'boolean') return;
        this.state.showLines = show;
        if (pad?.toggleLines) pad.toggleLines(show);
        bridgeFix.callBridge('setSetting', 'showLines', show.toString()).catch(err => console.error("[App] Bridge setSetting showLines failed:", err));
        this._updateSidePanelSettingsUI();
    },

    setMasterVolumeCeiling(value) {
        if (this.state.isApplyingChange) {
            console.log('[App.setMasterVolumeCeiling] Change blocked because a major change is in progress.');
            if (fxChains && typeof fxChains.updateMasterOutputControlsUI === 'function') {
                fxChains.updateMasterOutputControlsUI(this.state.masterVolumeCeiling);
            }
            return;
        }
        const processedValue = parseFloat(value);
        if (isNaN(processedValue) || processedValue < 0 || processedValue > 1) {
            console.warn('[App] Invalid value:', value);
            return;
        }
        if (this.state.masterVolumeCeiling === processedValue) return;
        this.state.masterVolumeCeiling = processedValue;
        console.log('[App] Master Volume Ceiling set to:', this.state.masterVolumeCeiling);
        if (synth && synth.isReady) {
            synth.applyMasterVolumeSettings();
        }
        bridgeFix.callBridge('setSetting', 'masterVolumeCeiling', this.state.masterVolumeCeiling.toString())
           .catch(err => console.error("[App] Bridge setSetting masterVolumeCeiling failed:", err));
        if (fxChains && typeof fxChains.updateMasterOutputControlsUI === 'function') {
            fxChains.updateMasterOutputControlsUI(this.state.masterVolumeCeiling);
        }
    },

    setEnablePolyphonyVolumeScaling(isEnabled) {
        const enabled = typeof isEnabled === 'boolean' ? isEnabled : !!isEnabled; // Ensure boolean
        if (this.state.enablePolyphonyVolumeScaling === enabled) return;
        this.state.enablePolyphonyVolumeScaling = enabled;
        console.log('[App] Enable Polyphony Volume Scaling toggled to:', this.state.enablePolyphonyVolumeScaling);
        if (synth && synth.isReady) {
            synth.applyMasterVolumeSettings(); // Re-apply settings as this affects volume calculation
        }
        bridgeFix.callBridge('setSetting', 'enablePolyphonyVolumeScaling', this.state.enablePolyphonyVolumeScaling.toString())
           .catch(err => console.error("[App] Bridge setSetting enablePolyphonyVolumeScaling failed:", err));
        this._updateSidePanelSettingsUI();
    },

    // === ОБНОВЛЕННАЯ ФУНКЦИЯ setYAxisControl для Части 2 ===
    setYAxisControl(group, controlName, value) {
        if (this.state.isApplyingChange) {
            console.log(`[App.setYAxisControl] Change for ${group}.${controlName} blocked because a major change is in progress.`);
            if (fxChains?.updateYAxisControlsUI) {
                fxChains.updateYAxisControlsUI(this.state.yAxisControls);
            }
            return;
        }
        if (!this.state.yAxisControls[group] || !this.state.yAxisControls[group].hasOwnProperty(controlName)) {
            console.warn(`[App.setYAxisControl] Attempted to set unknown Y-Axis control: ${group}.${controlName}`);
            return;
        }

        let processedValue = value;
        const config = this.state.yAxisControls[group];

        // Валидация и преобразование значения
        if (['minOutput', 'maxOutput', 'yThreshold', 'curveFactor'].includes(controlName)) {
            processedValue = parseFloat(value);
            if (isNaN(processedValue)) {
                console.warn(`[App.setYAxisControl] Invalid number value for ${group}.${controlName}:`, value);
                return;
            }
            // Дополнительные ограничения для конкретных параметров
            if (controlName === 'yThreshold') processedValue = Math.max(0, Math.min(1, processedValue));
            if (group === 'volume' && (controlName === 'minOutput' || controlName === 'maxOutput')) {
                processedValue = Math.max(0, Math.min(1, processedValue));
            }
            if (group === 'effects' && (controlName === 'minOutput' || controlName === 'maxOutput')) {
                processedValue = Math.max(-100, Math.min(0, processedValue)); // Для dB
            }
            if (controlName === 'curveFactor' && config.curveType !== 'sCurve') { // Степень должна быть > 0
                 processedValue = Math.max(0.1, processedValue);
            }
        } else if (controlName === 'curveType') {
            const allowedCurves = ['linear', 'exponential', 'logarithmic', 'sCurve'];
            if (!allowedCurves.includes(value)) {
                console.warn(`[App.setYAxisControl] Invalid curve value '${value}' for ${group}.${controlName}. Ignoring.`);
                if (fxChains?.updateYAxisControlsUI) fxChains.updateYAxisControlsUI(this.state.yAxisControls); // Сбросить UI
                return;
            }
        }
        // outputType не управляется из UI напрямую

        this.state.yAxisControls[group][controlName] = processedValue;

        if (group === 'effects') {
            if (synth?.updateAllActiveVoiceSendLevels) synth.updateAllActiveVoiceSendLevels();
        } else if (group === 'volume') {
            // Если нужно немедленное обновление громкости активных нот,
            // можно добавить synth.updateAllActiveVoiceMainLevels()
            if (synth?.updateAllActiveVoiceMainLevels) synth.updateAllActiveVoiceMainLevels();
        }
        // Сохранение в нативном хранилище (пока не реализовано для новой структуры)
        // TODO: Реализовать сохранение yAxisControls как единого объекта или по группам
        // bridgeFix.callBridge('setSetting', `yAxis_${group}_${controlName}`, processedValue.toString());
        console.log(`[App.setYAxisControl] ${group}.${controlName} set to ${processedValue}`);

        // === КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ===
        this.state.yAxisDefinedByPreset = false; // Ручное изменение отменяет приоритет пресета/цепочки
        this._applyYAxisChangesToUIAndSynth();
        // ==========================
        console.log(`[App.setYAxisControl] ${group}.${controlName} set to ${value}. yAxisDefinedByPreset is now false.`);
    },
    // =======================================================

    async restartAudioEngine() {
        console.warn("[App] Инициирую перезапуск аудио-движка v8 (обернуто в try/catch/finally)...");
        if (this.isRestartingAudio) {
            console.warn("[App.restartAudioEngine] Перезапуск аудио уже в процессе.");
            return;
        }
        this.isRestartingAudio = true;
        this.state.isAudioReady = false;

        const restartButton = (typeof topbar !== 'undefined' && topbar.buttons) ? topbar.buttons.restartAudio : null;
        const icon = restartButton ? restartButton.querySelector('.restart-icon') : null;

        if (restartButton) {
            restartButton.disabled = true;
            restartButton.classList.add('restarting');
            if (icon && icon.style.animation !== 'spinRestart 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards') {
                 icon.style.animation = 'spinRestart 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards';
            }
        }

        try {
            // 1. Остановка всего играющего и очистка
        if (typeof synth !== 'undefined' && typeof synth.stopAllNotes === 'function') {
            synth.stopAllNotes();
        }
        if (typeof pad !== 'undefined' && typeof pad.emergencyCleanup === 'function') {
            pad.emergencyCleanup();
        }

            // 2. Освобождение ресурсов synth
        console.log("[App.restartAudioEngine] Освобождаю ресурсы synth...");
        if (typeof synth !== 'undefined') {
            if (synth.voices && Array.isArray(synth.voices)) {
                synth.voices.forEach((voiceData, index) => {
                    if (voiceData && voiceData.components) {
                        voiceBuilder.disposeComponents(voiceData.components);
                    }
                    if (voiceData && voiceData.fxSend) {
                        try { voiceData.fxSend.disconnect(); voiceData.fxSend.dispose(); } catch(e) { console.warn(`Ошибка dispose fxSend ${index}:`, e.message); }
                    }
                });
            }
            synth.voices = [];
            synth.voiceState = [];
            if (synth.fxBus) { try { synth.fxBus.disconnect(); synth.fxBus.dispose(); } catch (e) { console.warn("Ошибка dispose fxBus:", e.message); } }
            Object.values(synth.effects || {}).forEach((effect, i) => {
                const effectName = Object.keys(synth.effects)[i] || 'unknown_effect';
                if (effect) {
                    if (typeof effect.disconnect === 'function') { try { effect.disconnect(); } catch (e) {} }
                    if (typeof effect.dispose === 'function') { try { effect.dispose(); } catch (e) { console.warn(`Ошибка dispose эффекта ${effectName}:`, e.message); } }
                }
            });
            synth.effects = {};
            if (synth.masterVolume) { try { synth.masterVolume.disconnect(); synth.masterVolume.dispose(); } catch (e) { console.warn("Ошибка dispose masterVolume:", e.message); } }
            if (synth.limiter) { try { synth.limiter.disconnect(); synth.limiter.dispose(); } catch (e) { console.warn("Ошибка dispose limiter:", e.message); } }
            if (synth.analyser) { try { synth.analyser.disconnect(); synth.analyser.dispose(); } catch (e) { console.warn("Ошибка dispose analyser:", e.message); } }
            synth.isReady = false;
            console.log("[App.restartAudioEngine] Ресурсы synth освобождены.");
        }

            // 3. Работа с Tone.context и Tone.start()
        console.log("[App.restartAudioEngine] Попытка запустить/возобновить аудиоконтекст Tone.js...");
            if (Tone && Tone.context && Tone.context.state === 'closed') {
                console.warn("[App.restartAudioEngine] Контекст Tone.js был 'closed'. Устанавливаю новый.");
                Tone.setContext(new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 48000 }));
                console.log("[App.restartAudioEngine] Новый контекст установлен. Его состояние:", Tone.context.state);
            }

            await Tone.start(); // ВАЖНО: await

            if (Tone.context.state === 'running') {
                this.state.isAudioReady = true;
                console.log("[App.restartAudioEngine] Аудиоконтекст успешно ЗАПУЩЕН/ВОЗОБНОВЛЕН. Состояние:", Tone.context.state);
            } else {
                console.warn(`[App.restartAudioEngine] Контекст после Tone.start() в состоянии: ${Tone.context.state}. Попытка дополнительного resume...`);
                if (Tone.context && typeof Tone.context.resume === 'function') {
                    await Tone.context.resume(); // ВАЖНО: await
                }
                if (Tone.context.state === 'running') {
                    this.state.isAudioReady = true;
                    console.log("[App.restartAudioEngine] Аудиоконтекст успешно ВОЗОБНОВЛЕН после явного resume. Состояние:", Tone.context.state);
                } else {
                    throw new Error(`Аудиоконтекст не в состоянии 'running' (${Tone.context.state}) после всех попыток.`);
                }
            }
        
            // 4. Переинициализация synth и visualizer
        console.log("[App.restartAudioEngine] Переинициализирую synth и visualizer...");
            if (typeof synth !== 'undefined' && typeof synth.init === 'function') {
                synth.init(); // Предполагается, что synth.init() синхронный или внутренне управляет своей готовностью
                if(synth.isReady) synth.applyMasterVolumeSettings();
            }
            if (typeof visualizer !== 'undefined' && typeof visualizer.init === 'function') {
                // visualizer.init может быть асинхронным, если загружает что-то
                await visualizer.init(document.getElementById('xy-visualizer'));
        }

            // 5. Повторное применение настроек
        console.log("[App.restartAudioEngine] Повторно применяю настройки...");
            await this.applySoundPreset(this.state.soundPreset); // ВАЖНО: await
            await this.applyFxChain(this.state.fxChain);         // ВАЖНО: await
            await this.applyVisualizer(this.state.visualizer);   // ВАЖНО: await
            await this.applyTouchEffect(this.state.touchEffect); // ВАЖНО: await

            if (typeof fxChains !== 'undefined') {
                if (typeof fxChains.updateMasterOutputControlsUI === 'function') {
                    fxChains.updateMasterOutputControlsUI(this.state.masterVolumeCeiling);
                }
                // Дополнительные UI обновления, если есть
                if (fxChains.updateMacroKnobsFromChain) {
                    fxChains.updateMacroKnobsFromChain(this.state.fxChain ? (await moduleManager.getModule(this.state.fxChain))?.data?.data : null);
                }
                 if (fxChains.updateFxListUI) fxChains.updateFxListUI(this.state.fxChain ? (await moduleManager.getModule(this.state.fxChain))?.data?.data?.effects : null);

            }
            if (typeof soundPresets !== 'undefined' && soundPresets.updateActivePresetCube) {
                soundPresets.updateActivePresetCube(this.state.soundPreset);
            }
            if (sidePanel?.updateTonalityControls) {
                 sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
            if (typeof this.updateZoneLayout === 'function') {
                 await this.updateZoneLayout(); // ВАЖНО: await
            }
            if (typeof i18n !== 'undefined' && i18n.loadLanguage) {
                 await i18n.loadLanguage(this.state.language); // ВАЖНО: await
            }
             // === ДОБАВЛЕНО: Остановка Tone.Transport ===
            if (typeof Tone !== 'undefined' && Tone.Transport && Tone.Transport.state === 'started') {
                Tone.Transport.stop();
                Tone.Transport.cancel(0); // Отменить все запланированные события
            }

        } catch (error) {
            console.error("[App.restartAudioEngine] КРИТИЧЕСКАЯ ОШИБКА перезапуска аудио:", error, error.stack);
            if (i18n) alert(i18n.translate('error_audio_fatal_restart', 'Fatal audio error. Please restart the app.'));
            // Не сбрасываем this.isRestartingAudio здесь, это сделает finally
            // UI кнопки также будет обработан в finally
        } finally {
            // Задержка для анимации кнопки, если она была запущена
        const animationDuration = (restartButton && icon) ? 2000 : 50;
        setTimeout(() => {
            if (restartButton) {
                restartButton.disabled = false;
                restartButton.classList.remove('restarting');
                if (icon) icon.style.animation = 'none';
            }
            this.isRestartingAudio = false;
                console.log("[App.restartAudioEngine] Перезапуск аудио-движка (попытка) завершен. isAudioReady:", this.state.isAudioReady, "isRestartingAudio:", this.isRestartingAudio);
        }, animationDuration);
        }
    },
    async triggerFullReload() {
        console.warn("[App] Запрос на ПОЛНУЮ ПЕРЕЗАГРУЗКУ приложения v2 (с try/catch/finally)...");

        if (this.isReloadingApp) {
            console.warn("[App.triggerFullReload] Полная перезагрузка уже в процессе.");
            return;
        }
        this.isReloadingApp = true;

        const reloadButton = (typeof topbar !== 'undefined' && topbar.buttons) ? topbar.buttons.reloadApp : null;
        const icon = reloadButton ? reloadButton.querySelector('.restart-icon') : null;

        if (reloadButton) {
            reloadButton.disabled = true;
            reloadButton.classList.add('reloading');
            if (icon && icon.style.animation !== 'spinReload 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards') {
                 icon.style.animation = 'spinReload 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards';
            }
        }

        try {
            console.log("[App.triggerFullReload] Попытка перезагрузки через bridgeFix.triggerFullReload...");
            if (bridgeFix && typeof bridgeFix.triggerFullReload === 'function') {
                await bridgeFix.triggerFullReload('JS_REQUESTED_RELOAD');
                // Если вызов успешен, выполнение здесь должно прекратиться из-за перезагрузки WebView.
                // Код ниже в try-блоке выполнится только если bridgeFix.triggerFullReload не вызвал немедленную перезагрузку или вернул управление.
                console.warn("[App.triggerFullReload] bridgeFix.triggerFullReload был вызван, но выполнение продолжается. Возможно, перезагрузка отложена или не удалась без ошибки.");
            } else {
                console.warn("[App.triggerFullReload] bridgeFix.triggerFullReload не доступен. Попытка window.location.reload.");
                window.location.reload(true);
            }
        } catch (error) {
            console.error("[App.triggerFullReload] Ошибка при основной попытке перезагрузки:", error, error.stack);
            console.warn("[App.triggerFullReload] Попытка аварийной перезагрузки через window.location.reload...");
            try {
                window.location.reload(true);
            } catch (e2) {
                console.error("[App.triggerFullReload] window.location.reload также НЕ УДАЛСЯ:", e2, e2.stack);
                if (i18n) alert(i18n.translate('error_fatal_reload', 'Fatal error during reload. Please close and restart the app.'));
                // Кнопка и флаг будут сброшены в finally
            }
        } finally {
            // Этот блок может не выполниться, если перезагрузка произошла мгновенно.
            // Но он важен, если перезагрузка не удалась и управление вернулось.
            const animationDuration = (reloadButton && icon) ? 2000 : 50; // Даем время на анимацию
            setTimeout(() => {
            if (reloadButton) {
                reloadButton.disabled = false;
                reloadButton.classList.remove('reloading');
                if (icon) icon.style.animation = 'none';
            }
                this.isReloadingApp = false;
                console.log("[App.triggerFullReload] Процесс перезагрузки (попытка) завершен. isReloadingApp:", this.isReloadingApp);
            }, animationDuration);
        }
    },
    /**
     * Устанавливает текущую тонику приложения.
     * @param {string} noteName - Название ноты (например, "C4", "G#5").
     */
    async setTonic(noteName) {
        if (!this.state.isInitialized || !noteName || this.state.currentTonic === noteName) {
            // Если тоника та же, но PadModeManager есть и updateZones (или updateZoneLayout) доступен,
            // можно принудительно обновить зоны, если это необходимо для текущего режима.
            // Однако, оригинальная логика возвращала без действий, если тоника не менялась.
            // Для консистентности с предоставленным кодом, просто выходим, если нет изменений.
            // Если предыдущий код с `await this.updateZones()` был важен при неизменной тонике, его нужно вернуть.
            return;
        }
    
        console.log(`[App] Setting tonic to: ${noteName}`);
        const previousTonic = this.state.currentTonic; // Сохраняем для возможного отката
    
        try {
        this.state.currentTonic = noteName;

            // Сначала обновляем состояние, потом вызываем асинхронные операции
            // Важно ДОЖДАТЬСЯ, пока PadModeManager отреагирует и перерисует пэд
            if (PadModeManager && typeof PadModeManager.onTonicChanged === 'function') {
                await PadModeManager.onTonicChanged(this.state.currentTonic); 
        } else {
                // Если PadModeManager вдруг нет, или у него нет onTonicChanged,
                // вызываем перерисовку зон напрямую (если он есть).
                // Предполагается, что onTonicChanged внутри себя вызовет updateZoneLayout или аналогичный метод.
                // Если нет, или PadModeManager отсутствует, то this.updateZoneLayout() должен быть вызван.
                // Так как PadModeManager.onTonicChanged уже вызывает app.updateZones(), который вызывает updateZoneLayout,
                // дополнительный вызов updateZoneLayout здесь может быть избыточным, если PadModeManager есть.
                // Однако, для безопасности, если PadModeManager нет, делаем прямой вызов.
                console.warn("[App.setTonic] PadModeManager not available or onTonicChanged is not a function, calling updateZoneLayout directly if available.");
                if (typeof this.updateZoneLayout === 'function') {
                    await this.updateZoneLayout();
                }
            }
    
            // Обновляем UI панели тональности
            if (sidePanel?.updateTonalityControls) {
                sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
            
            // Сохраняем в bridge ПОСЛЕ всех успешных операций
            if (this.state.isBridgeReady) {
                 await bridgeFix.callBridge('setSetting', 'currentTonic', this.state.currentTonic);
            }

            // Обновление подсветки тоники на пэде, если пэд существует и функция доступна
        if (pad && typeof pad.highlightTonic === "function") {
                pad.highlightTonic(this.state.currentTonic);
            }
    
        } catch (error) {
            console.error(`[App.setTonic] Failed to set tonic to ${noteName}:`, error, error.stack);
            // Откатываем состояние при ошибке
            this.state.currentTonic = previousTonic;
            // Можно также попытаться обновить UI обратно
            if (sidePanel?.updateTonalityControls) {
            sidePanel.updateTonalityControls(this.state.octaveOffset, this.state.scale, this.state.zoneCount);
            }
            // Возможно, стоит уведомить пользователя
            // uiService.showError(`Failed to set tonic: ${error.message}`);
        }
    },

    // Добавьте или найдите существующий метод для переключения highlightSharpsFlats
    async toggleHighlightSharpsFlats(enabled) {
        try {
        if (typeof enabled !== 'boolean') {
            console.warn('[App] setHighlightSharpsFlats: invalid type for enabled -', typeof enabled);
            return;
        }
        if (this.state.highlightSharpsFlats === enabled) {
            console.log('[App] setHighlightSharpsFlats: no change, already', enabled);
            return;
        }
        this.state.highlightSharpsFlats = enabled;
        console.log('[App] highlightSharpsFlats state updated to:', this.state.highlightSharpsFlats);
        await this.updateZoneLayout();
        this._updateSidePanelSettingsUI();
        } catch (error) {
            console.error('[App.toggleHighlightSharpsFlats] Error:', error, error.stack);
        }
    },

    // === НОВЫЙ МЕТОД для Установки Аккорда ===
    async setCurrentChord(chordName) {
        try {
            const newChord = chordName || null;
        if (this.state.currentChordName === newChord) {
            if (PadModeManager && typeof this.updateZones === 'function') {
                 console.log(`[App.setCurrentChord] Chord ${newChord} already active/null, but forcing zone update for current mode.`);
                 await this.updateZones();
            }
            return;
        }
        console.log(`[App] Current chord will be set to: ${newChord}`);
        this.state.currentChordName = newChord;
        if (PadModeManager) {
            await PadModeManager.onChordChanged(this.state.currentChordName);
        } else {
            console.warn("[App.setCurrentChord] PadModeManager not available, calling updateZones directly.");
            await this.updateZones();
        }
            bridgeFix.callBridge('setSetting', 'currentChord', this.state.currentChordName)
             .catch(err => console.error("[App.setCurrentChord] Bridge setSetting currentChord failed:", err));
        } catch (error) {
            console.error('[App.setCurrentChord] Error:', error, error.stack);
        }
    },
    // ======================================

    async setPadMode(modeId, initialLoad = false) {
        if (!PadModeManager) {
            console.error("[App.setPadMode] PadModeManager is not available.");
            return;
        }

        const currentStrategy = PadModeManager.getCurrentStrategy();
        if (currentStrategy && typeof currentStrategy.getName === 'function' && currentStrategy.getName() === modeId && !initialLoad) {
            console.log(`[App.setPadMode] Mode ${modeId} is already active.`);
            return;
        }

        // Обновленное условие для флага isApplyingChange
        if (this.state.isApplyingChange && !initialLoad) { 
            console.warn("[App.setPadMode] Action ignored: another change is in progress and this is not an initial load.");
            return;
        }
        
        console.log(`[App.setPadMode] Attempting to set pad mode to: ${modeId}`);
        this.state.isApplyingChange = true;
        const previousModeId = this.state.padMode;

        try {
        const success = await PadModeManager.setActiveMode(modeId);

        if (success) {
            this.state.padMode = modeId;
                if (this.state.isBridgeReady) { // Сохраняем безопасную проверку
                    await bridgeFix.callBridge('setSetting', 'padMode', modeId);
                }
            
                // Существующая логика обновления UI (панели Chord/Rocket и т.д.) сохраняется
            const chordPanel = document.getElementById('chord-mode-panel');
            const expandBtn = document.getElementById('chord-panel-expand-btn');
            if (modeId === 'chord') {
                    if (sidePanel?.hideAllPanels) sidePanel.hideAllPanels();
                if (chordPanel) chordPanel.classList.add('show');
                    if (typeof this.toggleChordPanel === 'function') {
                this.toggleChordPanel(this.state.isChordPanelCollapsed);
                    }
                const strategy = PadModeManager.getCurrentStrategy();
                    if (strategy && typeof strategy.getSelectedChordId === 'function' && !strategy.getSelectedChordId() && 
                        typeof strategy.getAvailableChords === 'function' && strategy.getAvailableChords().length > 0) {
                        if (typeof strategy.selectChord === 'function') {
                    await strategy.selectChord(strategy.getAvailableChords()[0].id);
                } else {
                            console.warn("[App.setPadMode] Chord strategy's selectChord method is not a function.");
                        }
                    } else {
                        if (typeof this.notifyProgressionChanged === 'function') {
                    this.notifyProgressionChanged();
                }
                    }
            } else {
                if (chordPanel) chordPanel.classList.remove('show', 'collapsed');
                if (expandBtn) expandBtn.classList.remove('visible');
            }
                if (sidePanel?.populatePadModeSelectDisplay) sidePanel.populatePadModeSelectDisplay();
                if (sidePanel?.displayModeSpecificControls) sidePanel.displayModeSpecificControls(modeId);
        if (typeof topbar !== 'undefined') {
            if (modeId === 'chord') {
                        if (topbar.showProgressionDisplay) topbar.showProgressionDisplay();
                         if (typeof this.notifyProgressionChanged === 'function') this.notifyProgressionChanged();
            } else {
                        if (topbar.hideProgressionDisplay) topbar.hideProgressionDisplay();
                    }
                }
                console.log(`[App.setPadMode] Successfully set pad mode to ${modeId}`);
            } else {
                // Явное выбрасывание ошибки, если setActiveMode не удалось
                throw new Error(`PadModeManager.setActiveMode for ${modeId} returned false.`); 
            }
        } catch (error) {
            console.error(`[App.setPadMode] Error setting pad mode to ${modeId}:`, error, error.stack);
            // Существующая логика отката сохраняется
            this.state.padMode = previousModeId; 
            if (PadModeManager) await PadModeManager.setActiveMode(previousModeId).catch(e => console.error("[App.setPadMode] Error during rollback setActiveMode:", e));
            if (this.state.isBridgeReady) await bridgeFix.callBridge('setSetting', 'padMode', previousModeId).catch(e => console.error("[App.setPadMode] Error during rollback bridge call:", e));
            if (sidePanel?.populatePadModeSelectDisplay) sidePanel.populatePadModeSelectDisplay();
            if (sidePanel?.displayModeSpecificControls) sidePanel.displayModeSpecificControls(previousModeId);
        } finally {
            this.state.isApplyingChange = false;
        }
    },
    
    toggleChordPanel(shouldBeCollapsed) {
        if (typeof shouldBeCollapsed !== 'boolean') {
            shouldBeCollapsed = !this.state.isChordPanelCollapsed;
        }
        this.state.isChordPanelCollapsed = shouldBeCollapsed;
        console.log(`[App] Chord panel collapsed state set to: ${shouldBeCollapsed}`);

        const panel = document.getElementById('chord-mode-panel');
        const expandBtn = document.getElementById('chord-panel-expand-btn');
        if (!panel || !expandBtn) return;

        // +++ ИЗМЕНЕНИЕ: Логика теперь проще и надежнее +++
        // Эта функция вызывается только когда мы уже в режиме 'chord',
        // поэтому она только переключает классы.
        panel.classList.toggle('collapsed', shouldBeCollapsed);
        expandBtn.classList.toggle('visible', shouldBeCollapsed);
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        localStorage.setItem('isChordPanelCollapsed', shouldBeCollapsed);
    },

    _updateSidePanelSettingsUI() {
        if (sidePanel && typeof sidePanel.updateSettingsControls === 'function') {
            sidePanel.updateSettingsControls(
                this.state.language,
                this.state.theme,
                this.state.visualizer,
                this.state.touchEffect,
                this.state.showNoteNames,
                this.state.showLines,
                this.state.enablePolyphonyVolumeScaling,
                this.state.highlightSharpsFlats,
                this.state.padMode,
                this.state.rocketModeSettings,
                this.state.vibrationEnabled,      // Убедитесь, что этот аргумент передается
                this.state.vibrationIntensity   // И этот тоже
            );
            if (sidePanel.populatePadModeSelectDisplay) {
                sidePanel.populatePadModeSelectDisplay();
            }
        }
    },

    setModeSpecificSetting(modeId, settingName, value) {
        if (modeId === 'rocket' && this.state.rocketModeSettings) {
            let changed = false;
            let actualSettingObject = this.state.rocketModeSettings;
            let actualKey = settingName;
            if (settingName.startsWith("displayMarkers.")) {
                actualKey = settingName.split('.')[1];
                if (!this.state.rocketModeSettings.displayMarkers) {
                    this.state.rocketModeSettings.displayMarkers = {};
                }
                actualSettingObject = this.state.rocketModeSettings.displayMarkers;
            }
            // Аналогично можно добавить для phaseDurations, если потребуется
            if (actualSettingObject.hasOwnProperty(actualKey)) {
                if (actualSettingObject[actualKey] !== value) {
                    actualSettingObject[actualKey] = value;
                    changed = true;
                }
            } else {
                actualSettingObject[actualKey] = value;
                changed = true;
            }
            if (changed) {
                console.log(`[App] Rocket Mode setting '${settingName}' (maps to '${actualKey}') updated to:`, value);
                console.log(`[App] app.state.rocketModeSettings NOW:`, JSON.parse(JSON.stringify(this.state.rocketModeSettings)));
                const currentStrategy = PadModeManager.getCurrentStrategy();
                if (currentStrategy && currentStrategy.getName() === 'rocket' && typeof currentStrategy.updateInternalSetting === 'function') {
                    currentStrategy.updateInternalSetting(settingName, value);
                }
                const visualControls = ['markerStyle', 'highlightActiveNotes', 'showDirectionalMarkers', 'displayMarkers.active', 'displayMarkers.functional', 'displayMarkers.inKeyOnly', 'displayFunctionNames', 'animateMarkerFadeOut', 'visualTheme'];
                const logicControls = ['markerLogicMode', 'rocketSubMode', 'tonalTonic', 'harmonicKey', 'intensity', 'autoPhases', 'phaseTransitionMode', 'chordHistoryDepth', 'phaseDurations.ignition', 'phaseDurations.liftOff', 'phaseDurations.burst'];
                if (this.state.padMode === 'rocket') {
                    if (logicControls.includes(settingName) || settingName.startsWith('phaseDurations.')) {
                        if (currentStrategy && typeof currentStrategy._analyzeAndUpdateMarkers === 'function') {
                            console.log(`[App.setModeSpecificSetting] Logic control '${settingName}' changed, triggering _analyzeAndUpdateMarkers.`);
                            currentStrategy._analyzeAndUpdateMarkers();
                        }
                    } else if (visualControls.includes(settingName) || settingName.startsWith('displayMarkers.')) {
                        console.log(`[App.setModeSpecificSetting] Visual control '${settingName}' changed, triggering updateZoneVisuals.`);
                        this.updateZoneVisuals();
                    }
                }
                this.saveAppSettingsDebounced();
            }
        } else {
            console.warn(`[App] Unknown mode or setting for setModeSpecificSetting: ${modeId}.${settingName}`);
        }
    },

    saveAppSettingsDebounced: (() => {
        let timeout = null;
        return function() {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                try {
                    localStorage.setItem('rocketModeSettings', JSON.stringify(this.state.rocketModeSettings));
                    // bridgeFix.callBridge('setSetting', 'rocketModeSettings', JSON.stringify(this.state.rocketModeSettings));
                    console.log('[App] Saved rocketModeSettings:', this.state.rocketModeSettings);
                } catch(e) { console.error('[App] Failed to save rocketModeSettings:', e); }
            }, 300);
        };
    })(),

    setRocketPhase(newPhase) {
        const validPhases = ['ignition', 'lift-off', 'burst'];
        if (this.state.rocketModePhase === newPhase || !validPhases.includes(newPhase)) return;
        console.log(`[App.setRocketPhase] Transitioning to phase: ${newPhase}`);
        this.state.rocketModePhase = newPhase;
        this.state.rocketModeCurrentPhaseStartTime = performance.now();
        this.state.rocketModeCurrentPhaseActivityCounter = 0;
        // Можно сбросить/установить энергию по фазе
        // this.state.rocketModeEnergy = newPhase === 'burst' ? 1 : 0;
        if (typeof synth !== 'undefined' && typeof synth.setRocketModePhase === 'function') {
            synth.setRocketModePhase(newPhase);
        }
        const currentStrategy = PadModeManager.getCurrentStrategy && PadModeManager.getCurrentStrategy();
        if (currentStrategy && currentStrategy.getName && currentStrategy.getName() === 'rocket' && typeof currentStrategy.onPhaseChanged === 'function') {
            currentStrategy.onPhaseChanged(newPhase);
        }
        // Можно обновить UI, если есть
        this.updateRocketStatusPanel();
    },
    manualSetRocketPhase(phaseName) {
        if (this.state.padMode !== 'rocket') return;
        if (this.state.rocketModeSettings.autoPhases && this.state.rocketModeSettings.phaseTransitionMode !== 'manual') {
            console.warn("[App.manualSetRocketPhase] Auto-phases enabled, manual transition might be overridden.");
        }
        this.setRocketPhase(phaseName);
    },
    updateRocketStatusPanel() {
        if (!this.elements.rocketStatusPanel || !this.state.isInitialized) return;
        const isRocketActive = this.state.padMode === 'rocket';
        this.elements.rocketStatusPanel.classList.toggle('rocket-status-panel-hidden', !isRocketActive);
        if (!isRocketActive) return;
        try {
            if (this.elements.statusCurrentChord) {
                // Удаляем select для chordBehavior, если был
                const oldSelect = this.elements.rocketStatusPanel.querySelector('#rocket-chord-behavior-select');
                if (oldSelect) oldSelect.remove();
                this.elements.statusCurrentChord.textContent = this.state.currentChordName || (typeof i18n !== 'undefined' ? i18n.translate('status_na', 'N/A') : 'N/A');
            }
            if (this.elements.statusCurrentKey) {
                // Удаляем select для keyBehavior, если был
                const oldSelect = this.elements.rocketStatusPanel.querySelector('#rocket-key-behavior-select');
                if (oldSelect) oldSelect.remove();
                const tonicNoteDetails = MusicTheoryService.getNoteDetails(this.state.currentTonic);
                const tonicDisplay = tonicNoteDetails ? (tonicNoteDetails.pc + tonicNoteDetails.oct) : this.state.currentTonic;
                const scaleDisplay = (typeof i18n !== 'undefined') ? i18n.translate(this.state.scale, this.state.scale) : this.state.scale;
                this.elements.statusCurrentKey.textContent = `${tonicDisplay} ${scaleDisplay}`;
            }
            if (this.elements.statusNextSuggestions) {
                // Удаляем select для nextSuggestionType, если был
                const oldSelect = this.elements.rocketStatusPanel.querySelector('#rocket-next-type-select');
                if (oldSelect) oldSelect.remove();
                const strategy = PadModeManager.getCurrentStrategy && PadModeManager.getCurrentStrategy();
                if (strategy && strategy.getName && strategy.getName() === 'rocket' && strategy._currentSuggestions && strategy._currentSuggestions.length > 0) {
                    const suggestionsText = strategy._currentSuggestions.slice(0, 2).map(sugg => {
                        if (sugg.isChord && sugg.targetChordSymbol) return sugg.targetChordSymbol;
                        if (!sugg.isChord && sugg.noteName) return (typeof Tonal !== 'undefined' ? Tonal.Note.pitchClass(sugg.noteName) : sugg.noteName);
                        return '?';
                    }).join(' / ');
                    this.elements.statusNextSuggestions.textContent = suggestionsText || '-';
                } else {
                    this.elements.statusNextSuggestions.textContent = '-';
                }
            }
            if (this.elements.statusEnergyLevel) {
                // Удаляем toggle для energyAffectsHints, если был
                const oldToggle = this.elements.rocketStatusPanel.querySelector('#rocket-energy-affects-toggle');
                if (oldToggle) {
                    const label = oldToggle.nextSibling;
                    if (label && label.tagName === 'LABEL') label.remove();
                    oldToggle.remove();
                }
                const energyClamped = Math.max(0, Math.min(1, this.state.rocketModeEnergy || 0));
                const barsFilled = Math.floor(energyClamped * 5);
                const barsEmpty = 5 - barsFilled;
                this.elements.statusEnergyLevel.textContent = '▰'.repeat(barsFilled) + '▱'.repeat(barsEmpty);
            }
            if (this.elements.statusCurrentPhase) {
                // Удаляем select для phaseHintMode, если был
                const oldSelect = this.elements.rocketStatusPanel.querySelector('#rocket-phase-hint-select');
                if (oldSelect) oldSelect.remove();
                this.elements.statusCurrentPhase.textContent = (typeof i18n !== 'undefined') ? i18n.translate(`phase_${this.state.rocketModePhase}`, this.state.rocketModePhase) : this.state.rocketModePhase;
            }
        } catch (e) {
            console.error("[App] Error updating status panel:", e);
        }
    },
    async applyRocketPreset(presetId) {
        // ... (загрузка presetModule) ...
        if (presetModule && presetModule.data && presetModule.data.data) {
            const newSettings = presetModule.data.data;
            const baseRocketDefaults = JSON.parse(JSON.stringify(app.state.rocketModeSettings));
            this.state.rocketModeSettings = {
                ...baseRocketDefaults,
                ...newSettings,
                displayMarkers: {
                    ...(baseRocketDefaults.displayMarkers || {}),
                    ...(newSettings.displayMarkers || {})
                },
                phaseDurations: {
                    ...(baseRocketDefaults.phaseDurations || {}),
                    ...(newSettings.phaseDurations || {})
                }
            };
            const currentStrategy = PadModeManager.getCurrentStrategy();
            if (currentStrategy && currentStrategy.getName() === 'rocket' && typeof currentStrategy.updateInternalSetting === 'function') {
                currentStrategy.updateInternalSetting('all', this.state.rocketModeSettings);
            }
            if (sidePanel && typeof sidePanel.displayModeSpecificControls === 'function' && this.state.padMode === 'rocket') {
                sidePanel.displayModeSpecificControls('rocket');
            }
            if (currentStrategy && typeof currentStrategy._analyzeAndUpdateMarkers === 'function' && this.state.padMode === 'rocket') {
                await currentStrategy._analyzeAndUpdateMarkers();
            }
            this.saveAppSettingsDebounced();
            this.updateRocketStatusPanel();
            console.log("[App] Rocket Mode preset applied. New settings:", JSON.parse(JSON.stringify(this.state.rocketModeSettings)));
        }
    },

    _determineEffectiveYAxisControls: async function() {
        console.log("[App._determineYAxis] Determining effective Y-Axis controls...");
        const t0 = performance.now();

        let defaultYVolumeSettings, defaultYEffectsSettings;
        try {
            defaultYVolumeSettings = JSON.parse(JSON.stringify(window.defaultAppSettings.yAxisControls.volume));
            defaultYEffectsSettings = JSON.parse(JSON.stringify(window.defaultAppSettings.yAxisControls.effects));
        } catch (e) {
            console.error("[App._determineYAxis] CRITICAL: Failed to load/parse defaultAppSettings.yAxisControls. Using hardcoded fallbacks.", e);
            defaultYVolumeSettings = { minOutput: 0.0, maxOutput: 1.0, yThreshold: 0.0, curveType: 'linear', curveFactor: 1.0, outputType: 'gain' };
            defaultYEffectsSettings = { minOutput: -60, maxOutput: 0, yThreshold: 0.1, curveType: 'exponential', curveFactor: 2.0, outputType: 'db' };
        }

        let finalYVolume = { ...defaultYVolumeSettings };
        let finalYEffects = { ...defaultYEffectsSettings };
        let sourceOfEffectsSettings = "defaultAppSettings (initial fallback)";
        let sourceOfVolumeSettings = "defaultAppSettings (initial fallback)";

        const currentFxChainId = this.state.fxChain;
        let fxChainData = null;

        if (currentFxChainId && moduleManager) {
            const fxChainModule = await moduleManager.getModule(currentFxChainId);
            if (fxChainModule?.data?.data) {
                fxChainData = fxChainModule.data.data;
                console.log(`[App._determineYAxis] Loaded FX Chain data for '${currentFxChainId}'`);
            } else {
                console.log(`[App._determineYAxis] No data found for FX Chain ID '${currentFxChainId}'`);
            }
        }

        // --- Логика для yAxisControls.volume ---
        if (fxChainData?.yAxisControls?.volume) {
            finalYVolume = { ...defaultYVolumeSettings, ...fxChainData.yAxisControls.volume };
            sourceOfVolumeSettings = `FX Chain (${currentFxChainId})`;
        } else {
            sourceOfVolumeSettings = "defaultAppSettings (for volume)";
        }
        console.log(`[App._determineYAxis] Volume settings source: ${sourceOfVolumeSettings}`);

        // --- Логика для yAxisControls.effects (реализация приоритетов) ---
        console.log(`[App._determineYAxis] === Evaluating Y-Axis Effects ===`);
        console.log(`[App._determineYAxis] 1. FX Chain ID: '${currentFxChainId}'`);
        if (fxChainData?.yAxisControls?.effects) {
            finalYEffects = { ...defaultYEffectsSettings, ...fxChainData.yAxisControls.effects };
            sourceOfEffectsSettings = `FX Chain ('${currentFxChainId}')`;
            console.log(`[App._determineYAxis]   -> USING FX CHAIN. Data:`, JSON.parse(JSON.stringify(fxChainData.yAxisControls.effects)));
        } else {
            console.log(`[App._determineYAxis]   -> No 'effects' config in FX Chain '${currentFxChainId || 'None'}'.`);
            console.log(`[App._determineYAxis] 2. Sound Preset ID: '${this.state.soundPreset}'. Has presetYAxisEffectsConfig:`, this.state.presetYAxisEffectsConfig ? 'YES' : 'NO');
            if (this.state.presetYAxisEffectsConfig && Object.keys(this.state.presetYAxisEffectsConfig).length > 0) {
                const effectsFromPreset = { ...this.state.presetYAxisEffectsConfig };
                if (!effectsFromPreset.outputType && defaultYEffectsSettings.outputType) {
                    effectsFromPreset.outputType = defaultYEffectsSettings.outputType;
                }
                finalYEffects = { ...defaultYEffectsSettings, ...effectsFromPreset };
                sourceOfEffectsSettings = `Sound Preset ('${this.state.soundPreset}')`;
                console.log(`[App._determineYAxis]   -> USING PRESET. Data:`, JSON.parse(JSON.stringify(this.state.presetYAxisEffectsConfig)));
            } else {
                console.log(`[App._determineYAxis]   -> No valid presetYAxisEffectsConfig found.`);
                sourceOfEffectsSettings = "defaultAppSettings (for effects)";
                console.log(`[App._determineYAxis]   -> USING DEFAULT APP SETTINGS (effects).`);
            }
        }
        console.log(`[App._determineYAxis] === Final Y-Axis Effects (Source: ${sourceOfEffectsSettings}) ===:`, JSON.parse(JSON.stringify(finalYEffects)));

        let volumeChanged = false;
        if (JSON.stringify(this.state.yAxisControls.volume) !== JSON.stringify(finalYVolume)) {
            this.state.yAxisControls.volume = { ...finalYVolume };
            volumeChanged = true;
        }

        let effectsChanged = false;
        if (JSON.stringify(this.state.yAxisControls.effects) !== JSON.stringify(finalYEffects)) {
            this.state.yAxisControls.effects = { ...finalYEffects };
            effectsChanged = true;
        }

        if (volumeChanged) {
            console.log('[App._determineYAxis] Volume settings updated in app.state:', JSON.parse(JSON.stringify(this.state.yAxisControls.volume)));
            if (synth?.updateAllActiveVoiceMainLevels) synth.updateAllActiveVoiceMainLevels();
            if (this.state.isInitialized && this.state.isBridgeReady) {
                bridgeFix.callBridge('setYAxisControlGroup', 'volume', JSON.stringify(this.state.yAxisControls.volume))
                    .catch(err => console.error("[App._determineYAxis] Bridge setYAxisControlGroup 'volume' failed:", err));
            }
        }

        if (effectsChanged) {
            console.log('[App._determineYAxis] Effects settings updated in app.state:', JSON.parse(JSON.stringify(this.state.yAxisControls.effects)));
            if (synth?.updateAllActiveVoiceSendLevels) synth.updateAllActiveVoiceSendLevels();
            if (this.state.isInitialized && this.state.isBridgeReady) {
                bridgeFix.callBridge('setYAxisControlGroup', 'effects', JSON.stringify(this.state.yAxisControls.effects))
                    .catch(err => console.error("[App._determineYAxis] Bridge setYAxisControlGroup 'effects' failed:", err));
            }
        }

        if (fxChains?.updateYAxisControlsUI) {
            fxChains.updateYAxisControlsUI(this.state.yAxisControls);
            console.log('[App._determineYAxis] FX Chains UI updated with determined Y-Axis settings.');
        }
        const t1 = performance.now();
        console.log(`[App._determineYAxis] Duration: ${(t1-t0).toFixed(2)}ms`);
    },

    _resolveAndApplyYAxisControls(forceUpdate) {
        console.log("[App._resolveYAxis] Resolving final Y-Axis controls...");
        const defaultYSettings = JSON.parse(JSON.stringify(window.defaultAppSettings?.yAxisControls || {
            volume: { minOutput: 0.0, maxOutput: 1.0, yThreshold: 0.0, curveType: 'linear', curveFactor: 1.0, outputType: 'gain' },
            effects: { minOutput: -60, maxOutput: 0, yThreshold: 0.1, curveType: 'exponential', curveFactor: 2.0, outputType: 'db' }
        }));

        let finalVolumeY = { ...defaultYSettings.volume };
        let finalEffectsY = { ...defaultYSettings.effects };
        let sourceLog = "Defaults";

        // 1. Пресет
        const currentPresetId = this.state.soundPreset;
        const presetModule = currentPresetId ? moduleManager.moduleDataCache[currentPresetId] : null;
        const presetYControls = presetModule?.data?.data?.yAxisControls;

        if (presetYControls && typeof presetYControls === 'object') {
            if (presetYControls.volume && typeof presetYControls.volume === 'object') {
                finalVolumeY = { ...defaultYSettings.volume, ...presetYControls.volume };
                sourceLog = `Preset '${currentPresetId}' (volume)`;
            }
            if (presetYControls.effects && typeof presetYControls.effects === 'object') {
                finalEffectsY = { ...defaultYSettings.effects, ...presetYControls.effects };
                sourceLog = sourceLog === "Defaults" ? `Preset '${currentPresetId}' (effects)` : `${sourceLog} & (effects)`;
            }
            this.state.yAxisDefinedByPreset = !!(presetYControls.volume || presetYControls.effects);
            console.log(`[App._resolveYAxis] Applied from Sound Preset '${currentPresetId}'. yAxisDefinedByPreset: ${this.state.yAxisDefinedByPreset}`);
        } else {
            this.state.yAxisDefinedByPreset = false;
            console.log(`[App._resolveYAxis] No yAxisControls in Sound Preset '${currentPresetId}'. yAxisDefinedByPreset: false.`);
        }

        // 2. FX-цепочка
        if (!this.state.yAxisDefinedByPreset || (presetYControls && (!presetYControls.volume || !presetYControls.effects))) {
            const currentFxChainId = this.state.fxChain;
            const fxChainModule = currentFxChainId ? moduleManager.moduleDataCache[currentFxChainId] : null;
            const fxChainYControls = fxChainModule?.data?.data?.yAxisControls;

            if (fxChainYControls && typeof fxChainYControls === 'object') {
                if (!presetYControls?.volume && fxChainYControls.volume && typeof fxChainYControls.volume === 'object') {
                    finalVolumeY = { ...defaultYSettings.volume, ...fxChainYControls.volume };
                    sourceLog = sourceLog === "Defaults" ? `FX Chain '${currentFxChainId}' (volume)` : `${sourceLog} + FX Chain (volume)`;
                    console.log(`[App._resolveYAxis] Volume Y-Axis from FX Chain '${currentFxChainId}'.`);
                }
                if (!presetYControls?.effects && fxChainYControls.effects && typeof fxChainYControls.effects === 'object') {
                    finalEffectsY = { ...defaultYSettings.effects, ...fxChainYControls.effects };
                    sourceLog = sourceLog === "Defaults" || sourceLog.includes("Preset") && !sourceLog.includes("effects") ? `FX Chain '${currentFxChainId}' (effects)` : `${sourceLog} + FX Chain (effects)`;
                    console.log(`[App._resolveYAxis] Effects Y-Axis from FX Chain '${currentFxChainId}'.`);
                }
            } else if (currentFxChainId) {
                console.log(`[App._resolveYAxis] No yAxisControls in FX Chain '${currentFxChainId}'.`);
            }
        }
        // Применяем финальные значения к app.state
        const volumeChanged = JSON.stringify(this.state.yAxisControls.volume) !== JSON.stringify(finalVolumeY);
        const effectsChanged = JSON.stringify(this.state.yAxisControls.effects) !== JSON.stringify(finalEffectsY);

        if (volumeChanged) this.state.yAxisControls.volume = finalVolumeY;
        if (effectsChanged) this.state.yAxisControls.effects = finalEffectsY;

        console.log(`[App._resolveYAxis] Final Y-Axis source: ${sourceLog}`);
        console.log('[App._resolveYAxis] Final Y-Axis state:', JSON.parse(JSON.stringify(this.state.yAxisControls)));

        // Вызываем обновление UI и Synth, если были изменения или для гарантии
        if (volumeChanged || effectsChanged || forceUpdate === true) {
            this._applyYAxisChangesToUIAndSynth();
        }
    },

    _applyYAxisChangesToUIAndSynth() {
        if (!this.state.isInitialized) return;
        console.log('[App._applyYAxisChangesToUIAndSynth] Updating UI and Synth with final Y-Axis settings.');
        if (fxChains?.updateYAxisControlsUI) {
            fxChains.updateYAxisControlsUI(this.state.yAxisControls);
        }
        if (synth?.isReady) {
            if (synth.updateAllActiveVoiceMainLevels) synth.updateAllActiveVoiceMainLevels();
            if (synth.updateAllActiveVoiceSendLevels) synth.updateAllActiveVoiceSendLevels();
        }
        if (this.state.isBridgeReady) {
            bridgeFix.callBridge('setYAxisControlGroup', 'volume', JSON.stringify(this.state.yAxisControls.volume))
                .catch(err => console.error("[App] Bridge setYAxis (volume) failed:", err));
            bridgeFix.callBridge('setYAxisControlGroup', 'effects', JSON.stringify(this.state.yAxisControls.effects))
                .catch(err => console.error("[App] Bridge setYAxis (effects) failed:", err));
        }
    },

    /**
     * Сворачивает или разворачивает панель аккордов.
     * @param {boolean} shouldBeCollapsed - Новое состояние панели.
     */
    toggleChordPanel(shouldBeCollapsed) {
        if (typeof shouldBeCollapsed !== 'boolean') {
            shouldBeCollapsed = !this.state.isChordPanelCollapsed;
        }
        this.state.isChordPanelCollapsed = shouldBeCollapsed;
        console.log(`[App] Chord panel collapsed state set to: ${shouldBeCollapsed}`);

        const panel = document.getElementById('chord-mode-panel');
        const expandBtn = document.getElementById('chord-panel-expand-btn');
        if (!panel || !expandBtn) return;

        panel.classList.toggle('collapsed', shouldBeCollapsed);
        expandBtn.classList.toggle('visible', shouldBeCollapsed);

        localStorage.setItem('isChordPanelCollapsed', shouldBeCollapsed);
    },

    /**
     * Устанавливает и сохраняет новую ширину панели аккордов.
     * @param {number} newWidth - Новая ширина в пикселях.
     */
    setChordPanelWidth(newWidth) {
        const minWidth = 200;
        const maxWidth = 600;
        const currentWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        this.state.chordPanelWidth = currentWidth;
        const chordPanelElement = document.getElementById('chord-mode-panel');
        if (chordPanelElement) {
            chordPanelElement.style.width = `${currentWidth}px`;
            chordPanelElement.style.flexBasis = `${currentWidth}px`; // Для flex-контейнера
        }

        // Сохраняем ширину с задержкой, чтобы не перегружать bridge
        clearTimeout(this._chordPanelResizeTimeout);
        this._chordPanelResizeTimeout = setTimeout(() => {
            bridge.saveSetting('chordPanelWidth', currentWidth);
        }, 500);
    },

    // Добавляем новые функции для работы с прогрессией аккордов
    selectNextChord() {
        if (this.state.padMode !== 'chord') {
            console.log('[App.selectNextChord] Not in chord mode.');
            return;
        }
        const strategy = PadModeManager.getCurrentStrategy();
        // Убеждаемся, что у стратегии есть нужный метод
        if (strategy && typeof strategy.selectNextChord === 'function') {
            strategy.selectNextChord();
        } else {
            console.warn('[App.selectNextChord] Current strategy does not have selectNextChord method or strategy not found.');
        }
    },

    selectPreviousChord() {
        if (this.state.padMode !== 'chord') {
            console.log('[App.selectPreviousChord] Not in chord mode.');
            return;
        }
        const strategy = PadModeManager.getCurrentStrategy();
        // Убеждаемся, что у стратегии есть нужный метод
        if (strategy && typeof strategy.selectPreviousChord === 'function') {
            strategy.selectPreviousChord();
        } else {
            console.warn('[App.selectPreviousChord] Current strategy does not have selectPreviousChord method or strategy not found.');
        }
    },

    notifyProgressionChanged() {
        const t0 = performance.now();
        if (this.state.padMode !== 'chord') return;
        const strategy = PadModeManager.getCurrentStrategy();
        if (strategy && typeof strategy.getAvailableChords === 'function') {
            const chords = strategy.getAvailableChords();
            const currentId = strategy.getSelectedChordId();
            if (!chords || chords.length === 0) {
                topbar.updateProgressionDisplay({ prev: null, current: null, next: null });
                return;
            }

            const currentIndex = Math.max(0, chords.findIndex(c => c.id === currentId));
            
            const prevChord = chords.length > 1 ? chords[(currentIndex - 1 + chords.length) % chords.length] : null;
            const currentChord = chords[currentIndex];
            const nextChord = chords.length > 1 ? chords[(currentIndex + 1) % chords.length] : null;

            const displayData = {
                prev: prevChord ? { id: prevChord.id, name: prevChord.displayName } : null,
                current: currentChord ? { id: currentChord.id, name: currentChord.displayName } : null,
                next: nextChord ? { id: nextChord.id, name: nextChord.displayName } : null
            };

            if (typeof topbar !== 'undefined' && typeof topbar.updateProgressionDisplay === 'function') {
                topbar.updateProgressionDisplay(displayData);
            }
            const t1 = performance.now();
            console.log(`[App.notifyProgressionChanged] Duration: ${(t1 - t0).toFixed(2)}ms`);
        }
    },

    setBpm: function(newBpm) {
        const bpm = Math.max(20, Math.min(300, newBpm)); // Ограничиваем BPM
        this.state.transportBpm = bpm;
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.bpm.value = bpm;
        }
        console.log(`[App] Global BPM set to: ${bpm}`);
        // TODO: Сохранить в localStorage или через Bridge, если нужно
    },

    setVibrationEnabled(enabled) {
        if (typeof enabled !== 'boolean') return;
        this.state.vibrationEnabled = enabled;
        VibrationService.setEnabled(enabled);
        this._updateSidePanelSettingsUI();
        bridgeFix.callBridge('setSetting', 'vibrationEnabled', enabled.toString()).catch(err => console.error("[App] Bridge setSetting vibrationEnabled failed:", err));
    },

    setVibrationIntensity(level) {
        if (!['weak', 'medium', 'strong'].includes(level)) return;
        this.state.vibrationIntensity = level;
        VibrationService.setIntensity(level);
        this._updateSidePanelSettingsUI();
        bridgeFix.callBridge('setSetting', 'vibrationIntensity', level).catch(err => console.error("[App] Bridge setSetting vibrationIntensity failed:", err));
    },
};

document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(error => {
        console.error("[App v6 Global Catch] Unhandled error during app initialization:", error);
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            const loadingTextElement = loadingOverlay.querySelector('.loading-text');
            if (loadingTextElement) {
                const errorKey = 'error_fatal_init'; const fallbackErrorMsg = 'Fatal Initialization Error.';
                const translatedError = (typeof i18n !== 'undefined' && typeof i18n.translate === 'function') ? i18n.translate(errorKey, fallbackErrorMsg) : fallbackErrorMsg;
                loadingTextElement.textContent = translatedError + ` (${error.message || 'Unknown error'})`;
                loadingTextElement.style.color = '#ff4081'; loadingTextElement.classList.remove('fade-out');
            }
            loadingOverlay.classList.remove('hidden', 'hiding'); loadingOverlay.style.opacity = '1'; loadingOverlay.style.visibility = 'visible';
            const spinner = loadingOverlay.querySelector('.loading-spinner'); if (spinner) spinner.style.display = 'none';
            const title = document.getElementById('loading-title'); const prompt = document.querySelector('.loading-prompt');
            if (title) title.classList.remove('show'); if (prompt) prompt.classList.remove('show');
        }
    });

    // === Rocket Status Panel Show/Hide ===
    const rocketStatusPanel = document.getElementById('rocket-status-panel');
    const rocketStatusHideBtn = document.getElementById('rocket-status-hide-btn');
    const rocketStatusShowBtn = document.getElementById('rocket-status-show-btn');
    if (rocketStatusHideBtn && rocketStatusPanel && rocketStatusShowBtn) {
        rocketStatusHideBtn.addEventListener('click', () => {
            rocketStatusPanel.classList.add('rocket-status-panel-hidden');
            rocketStatusShowBtn.style.display = 'block';
        });
        rocketStatusShowBtn.addEventListener('click', () => {
            rocketStatusPanel.classList.remove('rocket-status-panel-hidden');
            rocketStatusShowBtn.style.display = 'none';
        });
    }
    // === Rocket Status Panel Interactivity ===
    const statusChord = document.getElementById('status-current-chord');
    const statusKey = document.getElementById('status-current-key');
    const statusPhase = document.getElementById('status-current-phase');
    if (statusChord) {
        statusChord.addEventListener('click', () => {
            if (typeof showCustomSelectorPopover === 'function') {
                // Предполагаем, что список аккордов доступен через MusicTheoryService
                const chords = MusicTheoryService.getAvailableChordNames ? MusicTheoryService.getAvailableChordNames() : [];
                showCustomSelectorPopover({
                    type: 'chord',
                    title: i18n.translate('select_chord', 'Select Chord'),
                    itemsArray: chords.map(name => ({ id: name, name })),
                    currentValue: app.state.currentChordName,
                    onSelect: (selectedChord) => {
                        app.setCurrentChord(selectedChord);
                    }
                });
            }
        });
    }
    if (statusKey) {
        statusKey.addEventListener('click', () => {
            if (typeof showCustomSelectorPopover === 'function') {
                const tonics = MusicTheoryService.getAvailableTonicNames ? MusicTheoryService.getAvailableTonicNames() : [];
                const scales = MusicTheoryService.getAvailableScaleIds ? MusicTheoryService.getAvailableScaleIds() : [];
                showCustomSelectorPopover({
                    type: 'key',
                    title: i18n.translate('select_key', 'Select Key'),
                    itemsArray: tonics.flatMap(tonic => scales.map(scale => ({ id: tonic + ' ' + scale, name: tonic + ' ' + i18n.translate(scale, scale) }))),
                    currentValue: app.state.currentTonic + ' ' + app.state.scale,
                    onSelect: (selectedKey) => {
                        const [tonic, ...scaleArr] = selectedKey.split(' ');
                        const scale = scaleArr.join(' ');
                        app.setTonic(tonic);
                        app.setScale(scale);
                    }
                });
            }
        });
    }
    if (statusPhase) {
        statusPhase.addEventListener('click', () => {
            if (typeof showCustomSelectorPopover === 'function') {
                const phases = [
                    { id: 'ignition', name: i18n.translate('rocket_phase_ignition', 'Ignition') },
                    { id: 'lift-off', name: i18n.translate('rocket_phase_lift_off', 'Lift-off') },
                    { id: 'burst', name: i18n.translate('rocket_phase_burst', 'Burst') }
                ];
                showCustomSelectorPopover({
                    type: 'rocket_phase',
                    title: i18n.translate('select_phase', 'Select Phase'),
                    itemsArray: phases,
                    currentValue: app.state.rocketModePhase,
                    onSelect: (selectedPhase) => {
                        app.manualSetRocketPhase(selectedPhase);
                    }
                });
            }
        });
    }
});

window.app = app;
