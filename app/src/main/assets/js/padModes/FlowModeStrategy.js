// Файл: app/src/main/assets/js/padModes/FlowModeStrategy.js
// Стратегия для режима "Flow" (Поток) - Версия 3 (Более прямой подход к synth)

const FlowModeStrategy_v3 = {
    appRef: null,
    musicTheoryServiceRef: null,
    _isActive: false,
    // Map<pointerId, {
    //    midiNote, frequency, zone, initialY, currentX, currentY,
    //    baseVolume, baseFilterCutoff, voiceId
    // }>
    _activeNotes: new Map(),

    _settings: {
        glideSpeed: 0.15, // Medium (seconds for portamento)
        yAxisMapping: 'volume', // 'volume' or 'filterCutoff'
        sustainMode: false,
    },

    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance) {
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        // harmonicMarkerEngineRef is not used in this mode but kept for consistency

        if (this.appRef && this.appRef.state) {
            let loadedSettings = null;
            const settingsKey = 'flowModeSettings_v3'; // New settings key for v3
            if (this.appRef.state.settingsBroker && typeof this.appRef.state.settingsBroker.getModeSettings === 'function') {
                loadedSettings = this.appRef.state.settingsBroker.getModeSettings(this.getName(), settingsKey);
            } else if (this.appRef.state[settingsKey]) { // Fallback to direct state access
                loadedSettings = this.appRef.state[settingsKey];
            }
            if (loadedSettings) {
                this._settings = { ...this._settings, ...loadedSettings };
            }
        }
        console.log(`[FlowModeStrategy_v3] Initialized. Settings:`, JSON.parse(JSON.stringify(this._settings)));
    },

    getName: () => "flow_v3", // New internal name for this version

    getDisplayName: () => {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('pad_mode_flow', 'Flow') // Reuse existing translation key for "Flow"
            : 'Flow';
    },

    requiresTonic: () => true,
    requiresScale: () => true,
    requiresChord: () => false,

    async onModeActivated(appState, services, uiModules) {
        this._isActive = true;
        this._activeNotes.clear();
        if (this.appRef && this.appRef.state) { // appState is equivalent to this.appRef.state
            let loadedSettings = null;
            const settingsKey = 'flowModeSettings_v3'; // New settings key for v3
             if (this.appRef.state.settingsBroker && typeof this.appRef.state.settingsBroker.getModeSettings === 'function') {
                loadedSettings = this.appRef.state.settingsBroker.getModeSettings(this.getName(), settingsKey);
            } else if (appState.rocketModeSettings && appState.rocketModeSettings[settingsKey]) {
                loadedSettings = appState.rocketModeSettings[settingsKey];
            }
            if (loadedSettings) {
                this._settings = { ...this._settings, ...loadedSettings };
            }
        }
        console.log(`[FlowModeStrategy_v3] Activated. Settings:`, JSON.parse(JSON.stringify(this._settings)));
    },

    async onModeDeactivated(appState, services, uiModules) {
        this._isActive = false;
        this._activeNotes.forEach((noteData) => {
            if (noteData.voiceId !== null && typeof synth !== 'undefined' && typeof synth.stopNote === 'function') {
                synth.stopNote(noteData.voiceId);
            }
        });
        this._activeNotes.clear();
        console.log("[FlowModeStrategy_v3] Deactivated, all active notes stopped.");
    },

    getZoneLayoutOptions(appState) {
        if (!appState) {
            // console.error("[FlowModeStrategy_v3.getZoneLayoutOptions] appState is missing.");
            return null;
        }
        return {
            tonicNameWithOctave: appState.currentTonic,
            scaleId: appState.scale,
            octaveOffsetFromTonic: appState.octaveOffset,
        };
    },

    async generateZoneData(layoutContext, appState, services) {
        if (!layoutContext || !appState || !services?.musicTheoryService) {
            // console.error("[FlowModeStrategy_v3.generateZoneData] Invalid arguments.");
            return [];
        }
        const zoneGenContext = {
            modeId: this.getName(),
            appState: appState,
            services: services,
            modeSpecificContext: layoutContext
        };
        if (typeof generateClassicZones === 'function') {
            return await generateClassicZones(zoneGenContext);
        }
        console.error("[FlowModeStrategy_v3.generateZoneData] generateClassicZones function is not defined.");
        return [];
    },

    onPointerDown(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive || !currentZones || currentZones.length === 0 || typeof synth === 'undefined' || typeof synth.startNote !== 'function') {
            // console.warn("[FlowModeStrategy_v3.onPointerDown] Pre-conditions not met.");
            return null;
        }

        let foundZone = null;
        for (let i = 0; i < currentZones.length; i++) {
            if (x >= currentZones[i].startX && x < currentZones[i].endX) {
                foundZone = currentZones[i];
                break;
            }
        }
        if (!foundZone && x >= 1.0 && currentZones.length > 0) foundZone = currentZones[currentZones.length - 1];
        if (!foundZone && x < currentZones[0].startX && currentZones.length > 0) foundZone = currentZones[0]; // Snap to first if left of all zones


        if (foundZone) {
            const noteToPlay = { name: foundZone.noteName, midiNote: foundZone.midiNote, frequency: foundZone.frequency };
            let volume = 0.7;
            let filterFreq = null; // Will be passed as undefined if not set

            if (this._settings.yAxisMapping === 'volume') {
                volume = Math.max(0.01, Math.min(1.0, 1.0 - y));
            } else if (this._settings.yAxisMapping === 'filterCutoff') {
                const minFilterHz = 200; const maxFilterHz = 8000; // Consider making these configurable
                filterFreq = minFilterHz + (1.0 - y) * (maxFilterHz - minFilterHz);
            }

            // Stop any existing note for this pointerId before starting a new one (important for re-touch in sustain mode)
            const existingNote = this._activeNotes.get(pointerId);
            if (existingNote && existingNote.voiceId !== null && typeof synth.stopNote === 'function') {
                synth.stopNote(existingNote.voiceId);
            }

            const voiceId = synth.startNote(
                noteToPlay.frequency, volume, y, pointerId,
                {
                    portamento: this._settings.glideSpeed, // Crucial for glide: synth voice must use this
                    initialFilterCutoff: filterFreq // Pass filter if mapped
                }
            );

            if (voiceId !== null && voiceId !== undefined) { // Check voiceId is valid
                this._activeNotes.set(pointerId, {
                    midiNote: noteToPlay.midiNote, frequency: noteToPlay.frequency, zone: foundZone,
                    initialY: y, currentX: x, currentY: y, baseVolume: volume, baseFilterCutoff: filterFreq, voiceId: voiceId
                });
                // console.log(`[FlowMode_v3.onPointerDown] Note ON: ${noteToPlay.name} (Voice ${voiceId}), Vol: ${volume.toFixed(2)}`);
                // Return a simple object for pad.js or visualizer if needed, similar to ClassicMode
                return { type: 'note_on', note: noteToPlay, volume: volume, pointerId: pointerId };
            } else {
                // console.warn(`[FlowMode_v3.onPointerDown] synth.startNote did not return a valid voiceId for ${noteToPlay.name}.`);
            }
        }
        return null;
    },

    onPointerMove(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive || !this._activeNotes.has(pointerId) || typeof synth === 'undefined') return null;

        const activeNoteData = this._activeNotes.get(pointerId);
        if (!activeNoteData || activeNoteData.voiceId === null || activeNoteData.voiceId === undefined) {
            // console.warn(`[FlowMode_v3.onPointerMove] No valid active note data or voiceId for P${pointerId}`);
            return null;
        }

        activeNoteData.currentX = x;
        activeNoteData.currentY = y;

        // Attempt to get the synth voice instance from synth.js
        // This is a critical assumption: synth.js must expose active voices, e.g., via a Map
        const synthVoice = (synth.activeVoices instanceof Map) ? synth.activeVoices.get(activeNoteData.voiceId) : null;

        if (!synthVoice) {
            // console.warn(`[FlowMode_v3.onPointerMove] Synth voice ${activeNoteData.voiceId} not found in synth.activeVoices for P${pointerId}. Cleaning up.`);
            this._activeNotes.delete(pointerId);
             return { type: 'note_off', note: { midiNote: activeNoteData.midiNote }, pointerId: pointerId }; // Signal to stop
        }

        // Y-Axis Expression: Directly manipulate synth voice properties
        if (this._settings.yAxisMapping === 'volume') {
            const newVolume = Math.max(0.01, Math.min(1.0, 1.0 - y));
            if (synthVoice.outputGain?.gain?.value !== undefined) { // For raw Web Audio GainNode
                 synthVoice.outputGain.gain.setValueAtTime(newVolume, Tone.now());
            } else if (synthVoice.volume?.value !== undefined) { // For Tone.js Signal-based volume (like in a synth voice)
                 synthVoice.volume.value = Tone.gainToDb(newVolume);
            }
            activeNoteData.baseVolume = newVolume;
        } else if (this._settings.yAxisMapping === 'filterCutoff') {
            const minFilterHz = 200; const maxFilterHz = 8000;
            const newFilterFreq = minFilterHz + (1.0 - y) * (maxFilterHz - minFilterHz);
            if (synthVoice.filter?.frequency?.value !== undefined) { // For a filter node
                synthVoice.filter.frequency.value = newFilterFreq;
            } else if (synthVoice.frequency?.value !== undefined && synthVoice.detune?.value !== undefined && synthVoice.filterEnvelope) { // Tone.Synth structure
                 // This is more complex; typically filter is part of filterEnvelope.
                 // For direct filter control on a Tone.Synth, you'd usually set synthVoice.filterEnvelope.baseFrequency
                 if (synthVoice.filterEnvelope) synthVoice.filterEnvelope.baseFrequency = newFilterFreq;
            }
            activeNoteData.baseFilterCutoff = newFilterFreq;
        }

        // X-Axis Pitch Glide
        let newTargetZone = null;
        for (let i = 0; i < currentZones.length; i++) {
            if (x >= currentZones[i].startX && x < currentZones[i].endX) {
                newTargetZone = currentZones[i];
                break;
            }
        }
        if (!newTargetZone && x >= 1.0 && currentZones.length > 0) newTargetZone = currentZones[currentZones.length - 1];
        if (!newTargetZone && x < currentZones[0].startX && currentZones.length > 0) newTargetZone = currentZones[0];


        if (newTargetZone && newTargetZone.midiNote !== activeNoteData.midiNote) {
            const newFrequency = newTargetZone.frequency;
            const glideTime = this._settings.glideSpeed;

            // Direct pitch glide on the synth voice
            if (synthVoice.frequency && typeof synthVoice.frequency.rampTo === 'function') {
                synthVoice.frequency.rampTo(newFrequency, glideTime);
            } else if (typeof synthVoice.setNote === 'function' && synthVoice.portamento !== undefined) {
                // Assumes the voice's portamento is already set by startNote or can be updated
                synthVoice.portamento = glideTime; // Ensure portamento is set for this glide
                synthVoice.setNote(newFrequency);
            } else {
                // console.warn(`[FlowMode_v3.onPointerMove] Voice ${activeNoteData.voiceId} does not support frequency.rampTo or setNote with portamento.`);
            }

            activeNoteData.midiNote = newTargetZone.midiNote;
            activeNoteData.frequency = newFrequency;
            activeNoteData.zone = newTargetZone;

            return { type: 'note_change', oldNote: {midiNote: activeNoteData.midiNote} , newNote: {name: newTargetZone.noteName, midiNote: newTargetZone.midiNote, frequency: newFrequency}, pointerId: pointerId };
        }

        // If only Y changed, we've handled it directly. Could return a 'note_update' for visualizer if needed.
        // For now, let's return null if only Y changed and pitch didn't, to reduce event noise for pad.js
        // unless pad.js needs to propagate Y changes for other visual effects.
        // Let's assume pad.js might want to know about Y for visual effects.
        if (newTargetZone) { // If still in a zone (even if same MIDI note)
             return { type: 'note_update', note: { name: activeNoteData.zone.noteName, midiNote: activeNoteData.midiNote, frequency: activeNoteData.frequency, yPos: y }, pointerId: pointerId };
        }

        return null;
    },

    onPointerUp(pointerId, padContext) {
        if (!this._isActive || !this._activeNotes.has(pointerId) || typeof synth === 'undefined' || typeof synth.stopNote !== 'function') {
            return null;
        }

        const activeNoteData = this._activeNotes.get(pointerId);
        if (activeNoteData && activeNoteData.voiceId !== null && activeNoteData.voiceId !== undefined) {
            if (!this._settings.sustainMode) {
                synth.stopNote(activeNoteData.voiceId);
                // console.log(`[FlowMode_v3.onPointerUp] Note OFF: MIDI ${activeNoteData.midiNote}, VoiceID: ${activeNoteData.voiceId}`);
            } else {
                // console.log(`[FlowMode_v3.onPointerUp] Sustain ON: Note MIDI ${activeNoteData.midiNote} (Voice ${activeNoteData.voiceId}) continues.`);
            }
        }
        const noteDetailsForReturn = { midiNote: activeNoteData.midiNote };
        this._activeNotes.delete(pointerId);
        return { type: 'note_off', note: noteDetailsForReturn, pointerId: pointerId };
    },

    getModeSpecificControlsConfig() {
        const tr = (key, defaultText) => (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate(key, defaultText) : defaultText;
        // Adding more glide speed options as per previous refinement
        const glideSpeedOptions = [
            { id: 0.01, name: tr('flow_glide_very_fast', 'Very Fast')}, // Needs translation
            { id: 0.05, name: tr('flow_glide_fast', 'Fast') },
            { id: 0.15, name: tr('flow_glide_medium', 'Medium') },
            { id: 0.30, name: tr('flow_glide_slow', 'Slow') },
            { id: 0.50, name: tr('flow_glide_very_slow', 'Very Slow') } // Needs translation
        ];

        return [
            {
                type: 'select', name: 'glideSpeed',
                labelKey: 'flow_glide_speed', labelDefault: 'Glide Speed',
                options: glideSpeedOptions,
                default: this._settings.glideSpeed
            },
            {
                type: 'select', name: 'yAxisMapping',
                labelKey: 'flow_y_axis_mapping', labelDefault: 'Y-Axis Control',
                options: [
                    { id: 'volume', name: tr('flow_y_axis_volume', 'Volume') },
                    { id: 'filterCutoff', name: tr('flow_y_axis_filter', 'Filter') }
                ],
                default: this._settings.yAxisMapping
            },
            {
                type: 'toggle', name: 'sustainMode',
                labelKey: 'flow_sustain_mode', labelDefault: 'Sustain',
                default: this._settings.sustainMode
            }
        ];
    },

    onSpecificControlChanged(controlName, value) {
        if (this._settings.hasOwnProperty(controlName)) {
            if (controlName === 'glideSpeed') this._settings[controlName] = parseFloat(value);
            else if (controlName === 'sustainMode') this._settings[controlName] = (value === true || value === 'true');
            else this._settings[controlName] = value;

            if (this.appRef && this.appRef.state) {
                const settingsKey = 'flowModeSettings_v3'; // Use v3 key
                if (this.appRef.state.settingsBroker && typeof this.appRef.state.settingsBroker.setModeSetting === 'function') {
                    this.appRef.state.settingsBroker.setModeSetting(this.getName(), controlName, this._settings[controlName], settingsKey);
                } else if (typeof this.appRef.setModeSpecificSetting === 'function') { // Fallback
                    this.appRef.setModeSpecificSetting(this.getName(), controlName, this._settings[controlName], settingsKey);
                } else {
                    // console.warn("[FlowModeStrategy_v3] No method found to save mode specific settings.");
                }
            }
            // console.log(`[FlowModeStrategy_v3] Setting '${controlName}' updated to:`, this._settings[controlName]);

            // If glideSpeed changes, and synth voices have individual portamento settings,
            // this is where active voices' portamento could be updated.
            // However, this is complex if voices are managed entirely by synth.js.
            // Simpler: new glideSpeed applies to new glides.
        } else {
            // console.warn(`[FlowModeStrategy_v3] Attempted to change unknown setting: ${controlName}`);
        }
    },
    async onTonicChanged(newTonic, appState, services) { /* PadModeManager handles calling app.updateZoneLayout */ },
    async onScaleChanged(newScale, appState, services) { /* PadModeManager handles calling app.updateZoneLayout */ },
    getPadVisualHints: (currentZones, appState, services) => {
        // Could highlight the active note's zone if desired, or show glide path
        const hints = [];
        if (this._isActive && this._activeNotes.size > 0) {
            this._activeNotes.forEach(noteData => {
                if (noteData.zone) {
                    hints.push({
                        zoneIndex: noteData.zone.index,
                        type: 'active_flow_note',
                        style: 'GlowFromNote', // Or a new style
                        color: '#88FF88', // Example color
                        noteName: noteData.zone.noteName
                    });
                }
            });
        }
        return hints;
    }
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(FlowModeStrategy_v3);
} else {
    console.warn("[FlowModeStrategy_v3] PadModeManager not found for self-registration.");
}
