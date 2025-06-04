// Файл: assets/js/padModes/RocketModeStrategy.js
const RocketModeStrategy = {
    appRef: null,
    musicTheoryServiceRef: null,
    harmonicMarkerEngineRef: null,
    _isActive: false,
    _currentSuggestions: [],      // Кэш текущих предложений для getPadVisualHints
    _activeNotesMap: new Map(),   // { pointerId: { midiNote, name, frequency, x, y, startTime } }
    __localSettings: {
        intensity: 0.5, visualTheme: 'Glow', autoPhases: true,
        phaseTransitionMode: 'activity', phaseDurations: { ignition: 30, liftOff: 60, burst: 90 },
        harmonicKey: 'C major', markerLogicMode: 'tonalBinding',
        displayMarkers: { active: true, functional: true, inKeyOnly: true },
        markerStyle: 'GlowFromNote', markerColorScheme: 'Classic',
        highlightActiveNotes: true, markersDisappearOnNewTouch: true,
        displayFunctionNames: 'T', useFadeOutEffects: true, chordHistoryDepth: 2,
        rocketSubMode: 'tonal', tonalTonic: 'C',
        showDirectionalMarkers: true, animateMarkerFadeOut: true, showChordName: true
    },
    _activityPointsPerEvent: 1, // Базовое количество "очков активности" за событие

    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance) {
        console.log(`[RocketModeStrategy.init] Initializing...`);
        if (!appReference || !musicTheoryServiceInstance || !harmonicMarkerEngineInstance) {
            console.error("[RocketModeStrategy.init] Missing one or more core dependencies (app, MTS, HME). Strategy will not function correctly.");
            this._isActive = false;
            return false;
        }
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineInstance;
        if (this.appRef && this.appRef.state && this.appRef.state.rocketModeSettings) {
            this._settings = { ...this._settings, ...this.appRef.state.rocketModeSettings };
        }
        console.log("[RocketModeStrategy.init] Initialized successfully. Current settings:", JSON.parse(JSON.stringify(this._settings)));
        return true;
    },
    get _settings() {
        if (this.appRef && this.appRef.state && this.appRef.state.rocketModeSettings) {
            if (JSON.stringify(this.__localSettings) !== JSON.stringify(this.appRef.state.rocketModeSettings)) {
                this.__localSettings = { ...this.appRef.state.rocketModeSettings };
            }
            return this.appRef.state.rocketModeSettings;
        }
        return this.__localSettings;
    },
    set _settings(val) {
        this.__localSettings = val;
    },

    getName: () => "rocket",
    getDisplayName: () => {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('pad_mode_rocket', 'Rocket')
            : 'Rocket';
    },
    requiresTonic: () => true,
    requiresScale: () => true,
    requiresChord: () => false,

    async getZoneLayoutOptions(appState) {
        if (typeof ClassicModeStrategy !== 'undefined' && ClassicModeStrategy.getZoneLayoutOptions) {
            return ClassicModeStrategy.getZoneLayoutOptions(appState);
        }
        console.warn("[RocketModeStrategy] ClassicModeStrategy not found for getZoneLayoutOptions delegation.");
        return { tonicNameWithOctave: appState.currentTonic, scaleId: appState.scale, octaveOffsetFromTonic: appState.octaveOffset };
    },
    async generateZoneData(layoutContext, appState, services) {
        if (typeof ClassicModeStrategy !== 'undefined' && ClassicModeStrategy.generateZoneData) {
            return ClassicModeStrategy.generateZoneData(layoutContext, appState, services);
        }
        console.warn("[RocketModeStrategy] ClassicModeStrategy not found for generateZoneData delegation.");
        return [];
    },

    async onPointerDown(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive) return null;
        console.log(`[RocketModeStrategy.onPointerDown] PointerID: ${pointerId}, X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`);
        let foundZone = null;
        if (currentZones && currentZones.length > 0) {
            for (let i = 0; i < currentZones.length; i++) {
                const zone = currentZones[i];
                if (x >= zone.startX && x < zone.endX) {
                    foundZone = zone;
                    break;
                }
            }
            if (!foundZone && x >= 1.0) foundZone = currentZones[currentZones.length - 1];
        }
        if (foundZone) {
            const noteData = {
                midiNote: foundZone.midiNote,
                name: foundZone.noteName,
                frequency: foundZone.frequency,
                pointerId: pointerId,
                x: x,
                y: y,
                startTime: performance.now()
            };
            this._activeNotesMap.set(pointerId, noteData);
            console.log(`[RocketModeStrategy] Note ON: ${noteData.name} (MIDI: ${noteData.midiNote}). Active notes: ${this._activeNotesMap.size}`);
            await this._analyzeAndUpdateMarkers();
            this._updateEnergyAndPhase({ type: 'pointerdown', x, y, event: 'onPointerDown' });
            return { type: 'note_on', note: { frequency: foundZone.frequency, name: foundZone.noteName, midiNote: foundZone.midiNote } };
        }
        return null;
    },
    async onPointerMove(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive) return null;
        const activeTouch = this._activeNotesMap.get(pointerId);
        if (!activeTouch) return null;
        activeTouch.x = x;
        activeTouch.y = y;
        let newFoundZone = null;
        if (currentZones && currentZones.length > 0) {
            for (let i = 0; i < currentZones.length; i++) {
                const zone = currentZones[i];
                if (x >= zone.startX && x < zone.endX) {
                    newFoundZone = zone;
                    break;
                }
            }
            if (!newFoundZone && x >= 1.0) newFoundZone = currentZones[currentZones.length - 1];
        }
        if (newFoundZone) {
            if (newFoundZone.midiNote !== activeTouch.midiNote) {
                const oldNoteDetails = { name: activeTouch.name, midiNote: activeTouch.midiNote, frequency: activeTouch.frequency };
                activeTouch.name = newFoundZone.noteName;
                activeTouch.midiNote = newFoundZone.midiNote;
                activeTouch.frequency = newFoundZone.frequency;
                console.log(`[RocketModeStrategy] Note CHANGE: ${oldNoteDetails.name} -> ${activeTouch.name}. Active notes: ${this._activeNotesMap.size}`);
                await this._analyzeAndUpdateMarkers();
                this._updateEnergyAndPhase({ type: 'pointermove', x, y, event: 'onPointerMove' });
                return {
                    type: 'note_change',
                    oldNote: oldNoteDetails,
                    newNote: { name: activeTouch.name, midiNote: activeTouch.midiNote, frequency: activeTouch.frequency }
                };
            } else {
                return { type: 'note_update', note: { name: activeTouch.name, midiNote: activeTouch.midiNote, frequency: activeTouch.frequency } };
            }
        } else {
            const releasedNoteDetails = { name: activeTouch.name, midiNote: activeTouch.midiNote, frequency: activeTouch.frequency };
            this._activeNotesMap.delete(pointerId);
            console.log(`[RocketModeStrategy] Note OFF (move out): ${releasedNoteDetails.name}. Active notes: ${this._activeNotesMap.size}`);
            await this._analyzeAndUpdateMarkers();
            this._updateEnergyAndPhase({ type: 'pointermove', x, y, event: 'onPointerMove' });
            return { type: 'note_off', note: releasedNoteDetails };
        }
    },
    async onPointerUp(pointerId, padContext) {
        if (!this._isActive) return null;
        const releasedNote = this._activeNotesMap.get(pointerId);
        if (releasedNote) {
            this._activeNotesMap.delete(pointerId);
            console.log(`[RocketModeStrategy] Note OFF (pointer up): ${releasedNote.name}. Active notes: ${this._activeNotesMap.size}`);
            await this._analyzeAndUpdateMarkers();
            return { type: 'note_off', note: { name: releasedNote.name, midiNote: releasedNote.midiNote, frequency: releasedNote.frequency } };
        }
        return null;
    },

    async _analyzeAndUpdateMarkers() {
        if (!this._isActive || !this.harmonicMarkerEngineRef || !this.appRef || typeof this.appRef.updateZoneVisuals !== 'function') {
            console.warn("[RocketModeStrategy._analyzeAndUpdateMarkers] Aborted: not active or dependencies missing.");
            this._currentSuggestions = [];
            if (this.appRef && typeof this.appRef.updateZoneVisuals === 'function') {
                await this.appRef.updateZoneVisuals();
            }
            return;
        }
        const activeNotesForAnalysis = Array.from(this._activeNotesMap.values());
        const hmeContext = {
            tonic: this._settings.markerLogicMode === 'tonalBinding' && this._settings.tonalTonic ? this._settings.tonalTonic : this.appRef.state.currentTonic,
            scaleId: this.appRef.state.scale,
            previousChordSymbol: this.appRef.state.currentChordName,
            currentPhase: this.appRef.state.rocketModePhase,
            selectedMarkerStyle: this._settings.markerStyle,
            subMode: this._settings.markerLogicMode,
            displaySettings: {
                active: this._settings.displayMarkers?.active,
                functional: this._settings.displayMarkers?.functional,
                inKeyOnly: this._settings.displayMarkers?.inKeyOnly,
                displayFunctionNames: this._settings.displayFunctionNames
            }
        };
        try {
            this._currentSuggestions = await this.harmonicMarkerEngineRef.analyzeAndSuggest(activeNotesForAnalysis, hmeContext);
            if (this._settings.showChordName && this.harmonicMarkerEngineRef._lastDetectedChordSymbol) {
                if (this.appRef.state.currentChordName !== this.harmonicMarkerEngineRef._lastDetectedChordSymbol) {
                    this.appRef.setCurrentChord(this.harmonicMarkerEngineRef._lastDetectedChordSymbol);
                }
            } else if (this._settings.showChordName && activeNotesForAnalysis.length === 0 && this.appRef.state.currentChordName !== null) {
                this.appRef.setCurrentChord(null);
            }
        } catch (error) {
            console.error("[RocketModeStrategy._analyzeAndUpdateMarkers] Error calling HME:", error);
            this._currentSuggestions = [];
        }
        await this.appRef.updateZoneVisuals();
    },

    async getPadVisualHints(currentZones, appState, services) {
        if (!this._isActive || !currentZones || currentZones.length === 0) return [];
        const hints = [];
        const now = performance.now();
        const rocketSettings = this._settings;
        if (rocketSettings.highlightActiveNotes && this._activeNotesMap.size > 0) {
            this._activeNotesMap.forEach(activeNote => {
                const zoneIdx = currentZones.findIndex(z => z.midiNote === activeNote.midiNote);
                if (zoneIdx !== -1) {
                    hints.push({
                        zoneIndex: zoneIdx,
                        type: 'active_note_highlight',
                        style: 'GlowFromNote',
                        color: rocketSettings.activeNoteHighlightColor || '#FFFFFF',
                        noteName: activeNote.name,
                        midiNote: activeNote.midiNote,
                        fadeOutDuration: rocketSettings.animateMarkerFadeOut ? 600 : 0,
                        holdTimeMs: now - activeNote.startTime
                    });
                }
            });
        }
        if (rocketSettings.showDirectionalMarkers && this._currentSuggestions && this._currentSuggestions.length > 0) {
            this._currentSuggestions.forEach(suggestion => {
                let targetNoteForZoneSearch = null;
                if (suggestion.isChord && suggestion.notes && suggestion.notes.length > 0) {
                    targetNoteForZoneSearch = suggestion.notes[0];
                } else if (!suggestion.isChord && suggestion.midiNote !== undefined) {
                    targetNoteForZoneSearch = { midiNote: suggestion.midiNote, name: suggestion.noteName };
                }
                if (targetNoteForZoneSearch) {
                    const zoneIdx = currentZones.findIndex(z => z.midiNote === targetNoteForZoneSearch.midiNote);
                    if (zoneIdx !== -1) {
                        hints.push({
                            zoneIndex: zoneIdx,
                            type: 'harmonic_suggestion',
                            style: suggestion.style || rocketSettings.markerStyle,
                            color: suggestion.color || '#FFD700',
                            label: (rocketSettings.displayFunctionNames !== 'None' && suggestion.functionLabel) ? suggestion.functionLabel : null,
                            noteName: targetNoteForZoneSearch.name,
                            notes: suggestion.notes,
                            midiNote: targetNoteForZoneSearch.midiNote,
                            targetChordSymbol: suggestion.targetChordSymbol,
                            fadeOutDuration: rocketSettings.animateMarkerFadeOut ? 600 : 0
                        });
                    }
                }
            });
        }
        console.log(`[RocketModeStrategy.getPadVisualHints] Generated ${hints.length} hints.`);
        return hints;
    },

    onModeActivated: async function(appState, services, uiModules) {
        this._isActive = true;
        if (appState && appState.rocketModeSettings) {
            this._settings = { ...this._settings, ...appState.rocketModeSettings };
        }
        this._activeNotesMap.clear();
        this._currentSuggestions = [];
        await this._analyzeAndUpdateMarkers();
        console.log("[RocketModeStrategy] Activated. Current settings:", JSON.parse(JSON.stringify(this._settings)));
    },
    onModeDeactivated: async function(appState, services, uiModules) {
        this._isActive = false;
        this._activeNotesMap.clear();
        this._currentSuggestions = [];
        if (this.appRef && typeof this.appRef.updateZoneVisuals === 'function') {
            await this.appRef.updateZoneVisuals();
        }
        console.log("[RocketModeStrategy] Deactivated.");
    },
    async onTonicChanged(newTonic, appState, services) {
        await this._analyzeAndUpdateMarkers();
        console.log(`[RocketModeStrategy] Notified of tonic change: ${newTonic}.`);
    },
    async onScaleChanged(newScale, appState, services) {
        await this._analyzeAndUpdateMarkers();
        console.log(`[RocketModeStrategy] Notified of scale change: ${newScale}.`);
    },
    async onChordChanged(newChord, appState, services) {
        // Пока не требуется, но можно реализовать при необходимости
        console.log(`[RocketModeStrategy] Notified of chord change: ${newChord}.`);
    },
    async _updateEnergyAndPhase(eventContext) {
        if (!this._isActive || !this.appRef || !this.appRef.state) return;
        const appState = this.appRef.state;
        const rocketSettings = this._settings;
        // 1. Обновление Энергии
        let energyIncrement = 0.01 * (0.5 + rocketSettings.intensity);
        if (eventContext && eventContext.type === 'pointerdown') {
            energyIncrement *= 2;
        }
        appState.rocketModeEnergy = Math.min(1, appState.rocketModeEnergy + energyIncrement);
        // 2. Логика Автоматического Перехода Фаз
        if (!rocketSettings.autoPhases) return;
        const currentPhase = appState.rocketModePhase;
        const nextPhaseMap = { ignition: 'lift-off', 'lift-off': 'burst', burst: 'burst' };
        const nextPhase = nextPhaseMap[currentPhase];
        if (currentPhase === 'burst') return;
        let thresholdReached = false;
        if (rocketSettings.phaseTransitionMode === 'activity') {
            appState.rocketModeCurrentPhaseActivityCounter += this._activityPointsPerEvent * (0.5 + rocketSettings.intensity);
            if (appState.rocketModeCurrentPhaseActivityCounter >= rocketSettings.phaseDurations[currentPhase]) {
                thresholdReached = true;
            }
        } else if (rocketSettings.phaseTransitionMode === 'time') {
            const elapsedPhaseTime = performance.now() - appState.rocketModeCurrentPhaseStartTime;
            if (elapsedPhaseTime >= rocketSettings.phaseDurations[currentPhase] * 1000) {
                thresholdReached = true;
            }
        }
        if (thresholdReached) {
            this.appRef.setRocketPhase(nextPhase);
            await this._analyzeAndUpdateMarkers();
        }
    },
    async onPhaseChanged(newPhase) {
        console.log(`[RocketModeStrategy] Phase changed to: ${newPhase}`);
        // Можно адаптировать поведение, например, изменить параметры анализа
        await this._analyzeAndUpdateMarkers();
    },
    getModeSpecificControlsConfig() {
        console.log("[RocketModeStrategy] getModeSpecificControlsConfig called. Current _settings:", JSON.parse(JSON.stringify(this._settings)));
        return [
            {
                name: 'harmonicKeyDisplay',
                labelKey: 'rocket_harmonic_key', labelDefault: 'Harmonic Key', type: 'display',
                getValue: () => `${this.appRef.state.currentTonic} ${this.appRef.state.scale}`
            },
            {
                name: 'markerLogicMode', labelKey: 'rocket_marker_logic', labelDefault: 'Marker Logic', type: 'select',
                options: [
                    { id: 'tonalBinding', name: i18n.translate('marker_logic_tonal', 'Tonal Binding') },
                    { id: 'adaptiveAnalysis', name: i18n.translate('marker_logic_adaptive', 'Adaptive Analysis') },
                    { id: 'semiFree', name: i18n.translate('marker_logic_semi_free', 'Semi-Free') },
                    { id: 'randomDirected', name: i18n.translate('marker_logic_random', 'Random Directed') }
                ],
                default: this._settings.markerLogicMode
            },
            {
                name: 'markerStyle', labelKey: 'rocket_marker_style', labelDefault: 'Marker Style', type: 'select',
                options: [
                    { id: 'GlowFromNote', name: i18n.translate('style_GlowFromNote', 'Glow From Note') },
                    { id: 'WaveToNote', name: i18n.translate('style_WaveToNote', 'Wave To Note') },
                    { id: 'PulseRing', name: i18n.translate('style_PulseRing', 'Pulse Ring') },
                    { id: 'SparkTrail', name: i18n.translate('style_SparkTrail', 'Spark Trail') },
                    { id: 'ShadowDrop', name: i18n.translate('style_ShadowDrop', 'Shadow Drop') }
                ],
                default: this._settings.markerStyle
            },
            { name: 'highlightActiveNotes', labelKey: 'rocket_highlight_active', labelDefault: 'Highlight Active Notes', type: 'toggle', default: this._settings.highlightActiveNotes },
            { name: 'showDirectionalMarkers', labelKey: 'rocket_show_markers', labelDefault: 'Show Directional Markers', type: 'toggle', default: this._settings.showDirectionalMarkers },
            { name: 'animateMarkerFadeOut', labelKey: 'rocket_animate_fade', labelDefault: 'Animate Marker Fade-Out', type: 'toggle', default: this._settings.animateMarkerFadeOut },
            { name: 'showChordName', labelKey: 'rocket_show_chord_name', labelDefault: 'Show Recognized Chord Name', type: 'toggle', default: this._settings.showChordName },
            { name: 'intensity', labelKey: 'rocket_intensity', labelDefault: 'Sensitivity', type: 'knob', min: 0.1, max: 1.0, step: 0.05, default: this._settings.intensity },
            { name: 'autoPhases', labelKey: 'rocket_auto_phases', labelDefault: 'Auto-Phases', type: 'toggle', default: this._settings.autoPhases },
            {
                name: 'phaseTransitionMode', labelKey: 'rocket_phase_transition', labelDefault: 'Phase Transition', type: 'select',
                options: [
                    { id: 'activity', name: i18n.translate('phase_mode_activity', 'By Activity') },
                    { id: 'time', name: i18n.translate('phase_mode_time', 'By Time') },
                    { id: 'manual', name: i18n.translate('phase_mode_manual', 'Manual') }
                ],
                default: this._settings.phaseTransitionMode
            },
        ];
    },
    onSpecificControlChanged(controlName, value) {
        console.log(`[RocketModeStrategy] Control '${controlName}' changed TO:`, value, "(type:", typeof value, ")");
        if (this._settings.hasOwnProperty(controlName) || (controlName.startsWith("displayMarkers.") && this._settings.displayMarkers)) {
            let changed = false;
            if (controlName.startsWith("displayMarkers.")) {
                const subKey = controlName.split('.')[1];
                if (this._settings.displayMarkers[subKey] !== value) {
                    this._settings.displayMarkers[subKey] = value;
                    changed = true;
                }
            } else {
                if (this._settings[controlName] !== value) {
                    this._settings[controlName] = value;
                    changed = true;
                }
            }
            if (changed) {
                if (this.appRef && typeof this.appRef.setModeSpecificSetting === 'function') {
                    this.appRef.setModeSpecificSetting('rocket', controlName, value);
                }
                const visualControls = ['markerStyle', 'highlightActiveNotes', 'showDirectionalMarkers', 'displayMarkers.active', 'displayMarkers.functional', 'displayMarkers.inKeyOnly', 'displayFunctionNames', 'animateMarkerFadeOut'];
                if (visualControls.includes(controlName) && this._isActive && this.appRef && typeof this.appRef.updateZoneVisuals === 'function') {
                    console.log(`[RocketModeStrategy] Visual control '${controlName}' changed, triggering visual update.`);
                    this._analyzeAndUpdateMarkers();
                }
                if (controlName === 'markerLogicMode' && this._isActive && this.appRef && typeof this.appRef.updateZoneVisuals === 'function') {
                     console.log(`[RocketModeStrategy] Marker Logic Mode changed, triggering re-analysis.`);
                     this._analyzeAndUpdateMarkers();
                }
            }
        } else {
            console.warn(`[RocketModeStrategy] Attempted to change unknown setting: ${controlName}`);
        }
    },
    updateInternalSetting(settingName, value) {
         if (this._settings.hasOwnProperty(settingName)) {
             this._settings[settingName] = value;
         } else if (settingName.startsWith("displayMarkers.") && this._settings.displayMarkers) {
             const subKey = settingName.split('.')[1];
             this._settings.displayMarkers[subKey] = value;
         }
         console.log(`[RocketModeStrategy] Internal setting '${settingName}' synchronized to:`, value);
    }
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(RocketModeStrategy);
} else {
    console.warn("[RocketModeStrategy] PadModeManager not found for self-registration.");
} 