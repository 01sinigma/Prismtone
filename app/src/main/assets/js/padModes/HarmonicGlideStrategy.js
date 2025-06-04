// Файл: app/src/main/assets/js/padModes/HarmonicGlideStrategy.js
console.log("[HGS] HarmonicGlideStrategy.js loaded");

const HarmonicGlideStrategy = {
    appRef: null,
    musicTheoryServiceRef: null,
    harmonicMarkerEngineRef: null,
    padModeManagerRef: null, // Ссылка на PadModeManager для доступа к другим стратегиям, если нужно
    _isActive: false,
    _activeNotesMap: new Map(), // Map<pointerId, { midiNote, name, frequency, x, y, startTime }>
    _currentSubModeStrategy: null, // Будет инициализирован позже
    _currentSuggestions: [],       // Массив объектов SuggestionObject
    _previousActiveSuggestionsMap: new Map(),

    // --- Инициализация и Метаданные ---
    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance, padModeManagerReference) {
        console.log("[HGS.init] Initializing HarmonicGlideStrategy...");
        if (!appReference || !musicTheoryServiceInstance || !harmonicMarkerEngineInstance || !padModeManagerReference) {
            console.error("[HGS.init] CRITICAL: Missing core dependencies!");
            this._isActive = false;
            return false;
        }
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineInstance;
        this.padModeManagerRef = padModeManagerReference; // Сохраняем ссылку

        console.log(`[HGS.init] Initialized. App: ${!!this.appRef}, MTS: ${!!this.musicTheoryServiceRef}, HME: ${!!this.harmonicMarkerEngineRef}, PMM: ${!!this.padModeManagerRef}`);
        return true;
    },

    getName: () => "harmonicGlide",
    getDisplayName: () => {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('pad_mode_harmonic_glide', 'Harmonic Glide')
            : "Harmonic Glide";
    },

    requiresTonic: () => true,
    requiresScale: () => true,
    requiresChord: () => false, // Основной режим не требует аккорда, подрежимы могут его использовать

    // --- Управление Жизненным Циклом Режима ---
    async onModeActivated(appState, services, uiModules) {
        console.log("[HGS.onModeActivated] Harmonic Glide activated.");
        this._isActive = true;
        this._activeNotesMap.clear();
        this._currentSuggestions = [];

        // Убедимся, что холст чист при активации
        if (this.appRef?.updateZoneVisuals) {
            console.log("[HGS.onModeActivated] Clearing zone visuals for clean canvas.");
            await this.appRef.updateZoneVisuals([]);
        }

        // Инициализация/обновление подстратегии
        await this._updateSubModeStrategy();

        // Первичный анализ и отрисовка (вероятно, ничего не будет, т.к. нет активных нот)
        await this._analyzeAndUpdateMarkers(); // Это вызовет updateZoneVisuals([]) если нет нот

        if (this.appRef?.updateRocketStatusPanel) this.appRef.updateRocketStatusPanel();
        if (this.appRef?.updateMainDisplay) this.appRef.updateMainDisplay(null);
        if (this.appRef?.updateSubBar) this.appRef.updateSubBar(null);
    },

    async onModeDeactivated(appState, services, uiModules) {
        console.log("[HGS.onModeDeactivated] Harmonic Glide deactivated.");
        this._isActive = false;
        this._activeNotesMap.clear();
        this._currentSuggestions = [];
        if (this.appRef?.updateZoneVisuals) {
            console.log("[HGS.onModeDeactivated] Clearing zone visuals on deactivation.");
            await this.appRef.updateZoneVisuals([]);
        }
        if (this.appRef?.updateRocketStatusPanel) this.appRef.updateRocketStatusPanel();
        if (this.appRef?.updateMainDisplay) this.appRef.updateMainDisplay(null);
        if (this.appRef?.updateSubBar) this.appRef.updateSubBar(null);
    },

    // --- Конфигурация и Раскладка Зон (делегирование ClassicMode) ---
    async getZoneLayoutOptions(appState) {
        // Используем ClassicModeStrategy для получения стандартной раскладки зон,
        // которая будет использоваться для определения нот по координатам.
        // Визуально эти зоны могут быть скрыты.
        const classicStrategy = this.padModeManagerRef?.strategies?.classic;
        if (classicStrategy && typeof classicStrategy.getZoneLayoutOptions === 'function') {
            return classicStrategy.getZoneLayoutOptions(appState);
        }
        console.warn("[HGS.getZoneLayoutOptions] ClassicModeStrategy not found or invalid. Using fallback.");
        return {
            tonicNameWithOctave: appState.currentTonic,
            scaleId: appState.scale,
            octaveOffsetFromTonic: appState.octaveOffset
        };
    },

    async generateZoneData(layoutContext, appState, services) {
        const classicStrategy = this.padModeManagerRef?.strategies?.classic;
         // Передаем наш musicTheoryServiceRef в classicStrategy, если он его ожидает в services
        const classicServices = { musicTheoryService: this.musicTheoryServiceRef };
        if (classicStrategy && typeof classicStrategy.generateZoneData === 'function') {
            return classicStrategy.generateZoneData(layoutContext, appState, classicServices);
        }
        console.warn("[HGS.generateZoneData] ClassicModeStrategy not found or invalid. Returning empty zones.");
        return [];
    },

    // --- Обработка Касаний ---
    async onPointerDown(pointerId, x, y, currentDisplayZones, padContext) {
        if (!this._isActive) return null;
        console.log(`[HGS.onPointerDown] ID: ${pointerId}, X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`);

        const classicStrategy = this.padModeManagerRef?.strategies?.classic;
        if (!classicStrategy || typeof classicStrategy.onPointerDown !== 'function') {
             console.error("[HGS.onPointerDown] ClassicModeStrategy for note detection not available.");
             return null;
        }
        // Используем ClassicModeStrategy для определения базовой ноты
        const baseNoteAction = classicStrategy.onPointerDown(pointerId, x, y, currentDisplayZones, padContext);

        if (baseNoteAction && baseNoteAction.type === 'note_on' && baseNoteAction.note) {
            const noteDetails = {
                midiNote: baseNoteAction.note.midiNote,
                name: baseNoteAction.note.name,
                frequency: baseNoteAction.note.frequency,
                pointerId: pointerId,
                x: x, // Сохраняем нормализованные координаты
                y: y,
                startTime: performance.now()
            };
            this._activeNotesMap.set(pointerId, noteDetails);
            console.log("[HGS.onPointerDown] Active note added:", noteDetails);
            await this._analyzeAndUpdateMarkers();
            return { type: 'note_on', note: { ...baseNoteAction.note } }; // Возвращаем действие для synth.js
        }
        console.warn("[HGS.onPointerDown] No note detected by ClassicModeStrategy.");
        return null;
    },

    async onPointerMove(pointerId, x, y, currentDisplayZones, padContext) {
        if (!this._isActive || !this._activeNotesMap.has(pointerId)) return null;
        const activeTouchData = this._activeNotesMap.get(pointerId);
        activeTouchData.x = x;
        activeTouchData.y = y;

        const classicStrategy = this.padModeManagerRef?.strategies?.classic;
         if (!classicStrategy || typeof classicStrategy.onPointerMove !== 'function') {
             console.error("[HGS.onPointerMove] ClassicModeStrategy for note detection not available.");
             // Возвращаем просто обновление Y для текущей ноты, если была
             if (activeTouchData) return { type: 'note_update', note: { name: activeTouchData.name, midiNote: activeTouchData.midiNote, frequency: activeTouchData.frequency } };
             return null;
         }

        // Имитируем предыдущее состояние для onPointerMove классической стратегии
        // (ClassicModeStrategy хранит свое _activeNoteInfo, мы не можем напрямую на него влиять отсюда,
        // но для определения *новой* ноты это и не нужно, только координаты и зоны)
        const baseNoteAction = classicStrategy.onPointerMove(pointerId, x, y, currentDisplayZones, padContext);

        if (baseNoteAction) {
            if (baseNoteAction.type === 'note_change' && baseNoteAction.newNote) {
                activeTouchData.midiNote = baseNoteAction.newNote.midiNote;
                activeTouchData.name = baseNoteAction.newNote.name;
                activeTouchData.frequency = baseNoteAction.newNote.frequency;
                activeTouchData.startTime = performance.now(); // Считаем как новую ноту
                console.log("[HGS.onPointerMove] Note changed:", activeTouchData);
                await this._analyzeAndUpdateMarkers();
                return { type: 'note_change', oldNote: baseNoteAction.oldNote, newNote: baseNoteAction.newNote };
            } else if (baseNoteAction.type === 'note_update' && baseNoteAction.note) {
                // Нота не изменилась, но Y мог. Обновляем только Y в activeTouchData (уже сделано выше).
                // _analyzeAndUpdateMarkers не нужен, если только Y не влияет на предложения.
                // Но для единообразия можно вызвать, если логика подрежимов это учитывает.
                // await this._analyzeAndUpdateMarkers(); // Раскомментировать, если Y важен для предложений
                return { type: 'note_update', note: { ...baseNoteAction.note } };
            } else if (baseNoteAction.type === 'note_off') {
                this._activeNotesMap.delete(pointerId);
                console.log("[HGS.onPointerMove] Note off by strategy:", baseNoteAction.note);
                await this._analyzeAndUpdateMarkers();
                return baseNoteAction;
            }
        }
        return null;
    },

    async onPointerUp(pointerId, padContext) {
        if (!this._isActive) return null;
        const releasedNoteData = this._activeNotesMap.get(pointerId);
        if (releasedNoteData) {
            this._activeNotesMap.delete(pointerId);
            console.log("[HGS.onPointerUp] Note released:", releasedNoteData);
            await this._analyzeAndUpdateMarkers();
            // Возвращаем информацию об отпущенной ноте, чтобы synth.js мог ее остановить
            return { type: 'note_off', note: { name: releasedNoteData.name, midiNote: releasedNoteData.midiNote, frequency: releasedNoteData.frequency } };
        }
        return null;
    },

    // --- Логика Маркеров и Подрежимов (пока заглушки) ---
    _getDisplayColorForSemantic(semantic) {
        const hgColors = (this.appRef?.state?.harmonicGlide?.markerColors) || (typeof visualizer !== 'undefined' && visualizer.harmonicGlideMarkerColors) || {};
        switch (semantic) {
            case 'active': return hgColors.active;
            case 'powerful': return hgColors.powerful;
            case 'tense': return hgColors.tense;
            case 'calm': return hgColors.calm;
            case 'unexpected': return hgColors.unexpected;
            default: return hgColors.neutral || (this.appRef?.themeColors?.accent) || '#FFDC00';
        }
    },

    async _updateSubModeStrategy() {
        const subMode = this.appRef?.state?.harmonicGlide?.activeSubMode || 'tonalBinding';
        let StrategyClass = null;
        switch (subMode) {
            case 'tonalBinding':
                StrategyClass = window.TonalBindingSubModeStrategy; break;
            case 'adaptiveAnalysis':
                StrategyClass = window.AdaptiveAnalysisSubModeStrategy; break;
            case 'semiFree':
                StrategyClass = window.SemiFreeSubModeStrategy; break;
            case 'randomDirected':
                StrategyClass = window.RandomDirectedSubModeStrategy; break;
            default:
                StrategyClass = window.TonalBindingSubModeStrategy;
        }
        if (typeof StrategyClass === 'function') {
            this._currentSubModeStrategy = new StrategyClass(this.musicTheoryServiceRef, this.harmonicMarkerEngineRef, this.appRef, this);
            if (typeof this._currentSubModeStrategy.init === 'function') this._currentSubModeStrategy.init();
        } else {
            console.error('[HGS._updateSubModeStrategy] No valid submode strategy for', subMode);
            this._currentSubModeStrategy = null;
        }
    },

    async _analyzeAndUpdateMarkers() {
        if (!this._isActive || !this.appRef || !this.harmonicMarkerEngineRef) { // Убрал !this._currentSubModeStrategy из условия, т.к. маркеры могут быть и без субстратегии (напр. только активная нота)
            this._currentSuggestions = [];
            if(this.appRef?.updateZoneVisuals) {
                console.log("[HGS._analyzeAndUpdateMarkers] No active notes or suggestions, ensuring clean canvas.");
                await this.appRef.updateZoneVisuals([]);
            }
            if (this.appRef?.updateMainDisplay) this.appRef.updateMainDisplay(null);
            if (this.appRef?.updateSubBar) this.appRef.updateSubBar(null);
            return;
        }

        // Если субстратегия не определена, но режим активен, возможно, стоит отобразить хотя бы активные ноты без предложений
        if (!this._currentSubModeStrategy) {
            console.warn("[HGS._analyzeAndUpdateMarkers] Current sub-mode strategy is not available.");
            // Логика для отображения только активных нот, если необходимо (будет добавлена в Шаге 1.2)
            // Пока что, если нет субстратегии, предложения будут пустыми.
             this._currentSuggestions = [];
        }

        const activeNotesForAnalysis = Array.from(this._activeNotesMap.values());

        // Если нет активных нот, очищаем холст и выходим
        if (activeNotesForAnalysis.length === 0) {
            this._currentSuggestions = [];
            if(this.appRef?.updateZoneVisuals) {
                console.log("[HGS._analyzeAndUpdateMarkers] No active notes, ensuring clean canvas.");
                await this.appRef.updateZoneVisuals([]);
            }
            if (this.appRef?.updateMainDisplay) this.appRef.updateMainDisplay(null);
            if (this.appRef?.updateSubBar) this.appRef.updateSubBar(null);
            return;
        }

        const tonicMidi = this.musicTheoryServiceRef.getNoteDetails(this.appRef.state.currentTonic)?.midi;
        const hmeContext = {
            tonicMidi: tonicMidi,
            scaleId: this.appRef.state.scale,
            settings: this.appRef.state.rocketModeSettings,
            currentPhase: this.appRef.state.rocketModePhase,
        };
        const hmeAnalysisResult = this.harmonicMarkerEngineRef.analyzeContext(activeNotesForAnalysis, hmeContext);
        const subMode = this.appRef?.state?.harmonicGlide?.activeSubMode || 'tonalBinding';
        const glideContext = {
            appState: this.appRef.state,
            padZones: (typeof pad !== 'undefined' && pad._currentDisplayedZones) ? pad._currentDisplayedZones : [],
            subModeSettings: this.appRef.state.harmonicGlide?.[subMode] || {},
            // Добавляем активные ноты и результат HME в glideContext для удобства субстратегий
            activeNotes: activeNotesForAnalysis,
            analysisResult: hmeAnalysisResult 
        };

        let rawSuggestions = [];
        if (this._currentSubModeStrategy && typeof this._currentSubModeStrategy.analyzeAndSuggest === 'function') {
            rawSuggestions = await this._currentSubModeStrategy.analyzeAndSuggest(activeNotesForAnalysis, hmeAnalysisResult, glideContext);
        }
        // --- Обработка предложений ---
        const prevMap = this._previousActiveSuggestionsMap || new Map();
        const now = performance.now();
        const padZones = glideContext.padZones || [];
        // Присваиваем zoneIndex и фильтруем предложения без зоны
        let processed = (rawSuggestions || []).map(sugg => {
            let zoneIndex = -1;
            if (sugg.targetType === 'note' && sugg.midiNote !== undefined && padZones.length > 0) {
                zoneIndex = padZones.findIndex(z => z.midiNote === sugg.midiNote);
            } else if (sugg.targetType === 'chord' && sugg.midiNotes && sugg.midiNotes.length > 0 && padZones.length > 0) {
                zoneIndex = padZones.findIndex(z => z.midiNote === sugg.midiNotes[0]);
            }
            if (zoneIndex === -1) return null; // фильтруем "вне диапазона"
            const suggestionId = sugg.suggestionId || `${subMode}_${sugg.targetType}_${sugg.midiNote || (sugg.midiNotes ? sugg.midiNotes[0] : 'x')}`;
            const prev = prevMap.get(suggestionId);
            const isNew = !prev;
            const isStillValid = true;
            const creationTime = prev ? prev.creationTime : now;
            const lastActiveTime = now;
            return {
                ...sugg,
                suggestionId,
                zoneIndex,
                isNew,
                isStillValid,
                creationTime,
                lastActiveTime,
            };
        }).filter(Boolean);
        // Fade out для исчезающих маркеров
        prevMap.forEach((prev, id) => {
            if (!processed.find(s => s.suggestionId === id)) {
                processed.push({
                    ...prev,
                    isStillValid: false,
                    fadeOutStartTime: now,
                    fadeOutDurationMs: 600,
                });
            }
        });
        // Ограничиваем количество отображаемых маркеров
        const maxMarkers = this.appRef.state.harmonicGlide.maxMarkersToShow || 5;
        processed = processed.filter(s => s.isStillValid).slice(0, maxMarkers);
        // Обновить карту
        this._previousActiveSuggestionsMap = new Map();
        processed.forEach(s => {
            if (s.isStillValid) this._previousActiveSuggestionsMap.set(s.suggestionId, s);
        });
        this._currentSuggestions = processed;
        // UI обновления
        let mainDisplayText = null;
        if (hmeAnalysisResult.isPlayingChord && hmeAnalysisResult.detectedChordSymbol) {
            mainDisplayText = hmeAnalysisResult.detectedChordSymbol;
        } else if (activeNotesForAnalysis.length > 0) {
            const lastNote = activeNotesForAnalysis[activeNotesForAnalysis.length - 1];
            mainDisplayText = lastNote.name;
        } else if (activeNotesForAnalysis.length === 0 && !hmeAnalysisResult.isPlayingChord) {
            mainDisplayText = (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('main_display_unrecognized_chord', 'Complex Chord') : 'Complex Chord';
        }
        if (this.appRef?.updateMainDisplay) this.appRef.updateMainDisplay(mainDisplayText);
        const subBarHtml = this._currentSubModeStrategy.getSubBarInfo(activeNotesForAnalysis, hmeAnalysisResult, this._currentSuggestions, glideContext);
        if (this.appRef?.updateSubBar) this.appRef.updateSubBar(subBarHtml);
        if (this.appRef?.updateZoneVisuals) await this.appRef.updateZoneVisuals();
    },

    async getPadVisualHints(currentDisplayZones, appState, services) {
        if (!this._isActive) return [];
        const hints = [];
        // 1. Подсветка активных нот/аккорда (белым)
        if (appState.harmonicGlide.highlightActiveNotes) {
            this._activeNotesMap.forEach(activeNote => {
                const zoneIdx = currentDisplayZones.findIndex(z => z.midiNote === activeNote.midiNote);
                if (zoneIdx !== -1) {
                    hints.push({
                        suggestionId: `active_${activeNote.midiNote}_${activeNote.pointerId}`,
                        zoneIndex: zoneIdx,
                        type: 'active_note_highlight',
                        colorSemantic: 'active',
                        noteName: activeNote.name,
                        midiNote: activeNote.midiNote,
                        style: appState.harmonicGlide.activeNoteHighlightStyle,
                        isNew: true, isStillValid: true, creationTime: activeNote.startTime
                    });
                }
            });
        }
        // 2. Отображение предложенных гармонических маркеров
        (this._currentSuggestions || []).forEach(suggestion => {
            if (suggestion.zoneIndex !== undefined && suggestion.zoneIndex >= 0 && suggestion.zoneIndex < currentDisplayZones.length) {
                // Определяем displayColor по colorSemantic
                let displayColor = this._getDisplayColorForSemantic(suggestion.colorSemantic);
                hints.push({
                    ...suggestion,
                    type: 'harmonic_suggestion',
                    style: appState.harmonicGlide.markerStyle,
                    displayColor,
                    label: suggestion.subBarLabel || (suggestion.targetType === 'chord' ? suggestion.chordSymbol : suggestion.noteName),
                });
            }
        });
        return hints;
    },

    // --- Настройки Режима ---
    getModeSpecificControlsConfig() {
        // Общие настройки HG
        const common = [
            { name: 'harmonicGlide.markerStyle', labelKey: 'setting_hg_markerStyle', type: 'select', default: this.appRef?.state?.harmonicGlide?.markerStyle, options: ['Glow','Circle','Ripple'] },
            { name: 'harmonicGlide.highlightActiveNotes', labelKey: 'setting_hg_highlightActiveNotes', type: 'toggle', default: this.appRef?.state?.harmonicGlide?.highlightActiveNotes },
            { name: 'harmonicGlide.activeNoteHighlightStyle', labelKey: 'setting_hg_activeNoteHighlightStyle', type: 'select', default: this.appRef?.state?.harmonicGlide?.activeNoteHighlightStyle, options: ['WhiteGlow','PulseRing','WaveToNote','SparkTrail','ShadowDrop'] },
            { name: 'harmonicGlide.activeSubMode', labelKey: 'setting_hg_activeSubMode', type: 'select', default: this.appRef?.state?.harmonicGlide?.activeSubMode, options: ['tonalBinding','adaptiveAnalysis','semiFree','randomDirected'] },
        ];
        // Специфичные для подрежима
        let subModeCfg = [];
        const subMode = this.appRef?.state?.harmonicGlide?.activeSubMode || 'tonalBinding';
        if (this._currentSubModeStrategy && typeof this._currentSubModeStrategy.getModeSpecificControlsConfig === 'function') {
            subModeCfg = this._currentSubModeStrategy.getModeSpecificControlsConfig(this.appRef.state.harmonicGlide?.[subMode]);
        }
        return [...common, ...subModeCfg];
    },

    async onSpecificControlChanged(settingName, value, allGlideSettings) {
        console.log(`[HGS.onSpecificControlChanged] Setting '${settingName}' changed to: ${value}`);
        if (settingName === 'activeSubMode') {
            await this._updateSubModeStrategy();
            await this._analyzeAndUpdateMarkers();
            return;
        }
        // Если настройка относится к подрежиму
        const subMode = this.appRef?.state?.harmonicGlide?.activeSubMode || 'tonalBinding';
        if (settingName.startsWith(subMode + '.')) {
            if (this._currentSubModeStrategy && typeof this._currentSubModeStrategy.onSubModeSettingChanged === 'function') {
                this._currentSubModeStrategy.onSubModeSettingChanged(settingName, value, allGlideSettings);
            }
        }
        await this._analyzeAndUpdateMarkers();
    },

    // Обработка изменений тональности/лада (вызывается из PadModeManager)
    async onTonicChanged(newTonic, appState, services) {
        console.log(`[HGS.onTonicChanged] New tonic: ${newTonic}`);
        if (this._isActive) await this._analyzeAndUpdateMarkers();
    },
    async onScaleChanged(newScale, appState, services) {
        console.log(`[HGS.onScaleChanged] New scale: ${newScale}`);
        if (this._isActive) await this._analyzeAndUpdateMarkers();
    },
    async onChordChanged(newChord, appState, services) { /* Пока не используется напрямую в HarmonicGlide */ },

    getCommonControlsConfig() {
        const s = this.appRef.state.harmonicGlide;
        return [
            { name: 'intensity', labelKey: 'setting_hg_intensity', type: 'knob', min: 0.1, max: 1.0, step: 0.05, default: s.intensity },
            { name: 'markerStyle', labelKey: 'setting_hg_markerStyle', type: 'select', options: [
                {id:'Glow', name:'Glow'}, {id:'Circle', name:'Circle'}, {id:'Ripple', name:'Ripple'}
            ], default: s.markerStyle },
            { name: 'activeNoteHighlightStyle', labelKey: 'setting_hg_activeNoteHighlightStyle', type: 'select', options: [
                {id:'WhiteGlow', name:'White Glow'}, {id:'WhitePulse', name:'White Pulse'}
            ], default: s.activeNoteHighlightStyle },
            { name: 'highlightActiveNotes', labelKey: 'setting_hg_highlightActiveNotes', type: 'toggle', default: s.highlightActiveNotes },
            { name: 'fadeOutOldMarkers', labelKey: 'setting_hg_fadeOutOldMarkers', type: 'toggle', default: s.fadeOutOldMarkers },
            { name: 'markerFadeOutDurationMs', labelKey: 'setting_hg_markerFadeOutDurationMs', type: 'knob', min: 100, max: 2000, step: 50, default: s.markerFadeOutDurationMs, unit: 'ms', condition: () => s.fadeOutOldMarkers },
            { name: 'markerDisappearOnNewTouch', labelKey: 'setting_hg_markerDisappearOnNewTouch', type: 'toggle', default: s.markerDisappearOnNewTouch },
            { name: 'showSubBarInfo', labelKey: 'setting_hg_showSubBarInfo', type: 'toggle', default: s.showSubBarInfo },
            { name: 'maxMarkersToShow', labelKey: 'setting_hg_maxMarkersToShow', type: 'knob', min:1, max:8, step:1, default: s.maxMarkersToShow },
        ];
    },
};

// Саморегистрация стратегии
if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(HarmonicGlideStrategy);
} else {
    console.error("[HGS] PadModeManager not found for self-registration!");
} 