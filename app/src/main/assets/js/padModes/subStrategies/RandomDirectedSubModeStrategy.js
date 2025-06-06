// Файл: app/src/main/assets/js/padModes/subStrategies/RandomDirectedSubModeStrategy.js
console.log("[SubStrategy] RandomDirectedSubModeStrategy.js loaded");

const RandomDirectedSubModeStrategy = {
    mts: null,
    hme: null,
    appRef: null,
    _debug: true,

    init(musicTheoryService, harmonicMarkerEngine, appReference) {
        this.mts = musicTheoryService;
        this.hme = harmonicMarkerEngine;
        this.appRef = appReference;
        if (this._debug) console.log(`[RandomDirected.init] Initialized. MTS: ${!!this.mts}, HME: ${!!this.hme}, AppRef: ${!!this.appRef}`);
    },
    getName: () => "randomDirected",
    getDisplayName: () => (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('submode_randomDirected', 'Random Directed') : 'Random Directed',
    isUsable: function() { 
        if (this._debug) console.log(`[${this.getName()}.isUsable] Checking dependencies...`);
        if (!this.mts) { if (this._debug) console.warn(`[${this.getName()}.isUsable] MusicTheoryService (mts) is null.`); return false; }
        // RandomDirected might also not strictly need tonal.js if it's purely random within padZones, but for consistency and potential future use:
        if (!this.mts.isTonalJsLoaded) { if (this._debug) console.warn(`[${this.getName()}.isUsable] mts.isTonalJsLoaded is false.`); return false; }
        if (!this.hme) { if (this._debug) console.warn(`[${this.getName()}.isUsable] HarmonicMarkerEngine (hme) is null.`); return false; }
        if (!this.hme.isInitialized) { if (this._debug) console.warn(`[${this.getName()}.isUsable] hme.isInitialized is false.`); return false; }
        if (!this.appRef) { if (this._debug) console.warn(`[${this.getName()}.isUsable] AppRef is null.`); return false; }
        if (this._debug) console.log(`[${this.getName()}.isUsable] All checks passed.`);
        return true;
    },

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        if (!this.isUsable()) return [];
        if (this._debug) console.log(`[RandomDirected.analyze] ActiveNotes: ${activeNotes.length}, HME Chord: ${hmeAnalysisResult.detectedChordSymbol}`);
        
        const suggestions = [];
        const settings = glideContext.appState.harmonicGlide?.randomDirected || {};
        const padZones = glideContext.padZones;

        // ЗАГЛУШКА ЛОГИКИ: Предложим несколько случайных зон, но можем учесть 'direction' (например, вверх/вниз по MIDI)
        if (padZones.length > 0) {
            const colors = ['tense', 'unexpected', 'calm', 'powerful'];
            let colorIndex = 0;
            let lastSuggestedMidi = activeNotes.length > 0 ? activeNotes[0].midiNote : (padZones[Math.floor(padZones.length / 2)]?.midiNote || 60);

            for (let i = 0; i < Math.min(settings.numberOfSuggestions || 3, padZones.length); i++) {
                let availableZones = padZones;
                if (settings.direction === 'up') {
                    availableZones = padZones.filter(z => z.midiNote > lastSuggestedMidi);
                } else if (settings.direction === 'down') {
                    availableZones = padZones.filter(z => z.midiNote < lastSuggestedMidi);
                }
                if (availableZones.length === 0) availableZones = padZones; // Fallback if no directional zones
                
                const randomIndex = Math.floor(Math.random() * availableZones.length);
                const targetZone = availableZones[randomIndex];

                if (targetZone) {
                    suggestions.push({
                        suggestionId: `random_${targetZone.midiNote}_${i}`,
                        targetType: 'note',
                        midiNote: targetZone.midiNote,
                        noteName: targetZone.noteName,
                        colorSemantic: colors[colorIndex++ % colors.length],
                        subBarLabel: `Try: ${targetZone.noteName}`
                    });
                    lastSuggestedMidi = targetZone.midiNote;
                }
            }
        }
        if (this._debug) console.log(`[RandomDirected.analyze] Generated ${suggestions.length} stub suggestions.`);
        return suggestions;
    },

    getModeSpecificControlsConfig(currentSubModeSettings = {}) {
        return [
            { name: 'randomDirected.numberOfSuggestions', labelKey: 'setting_hg_random_numberOfSuggestions', type: 'knob', default: currentSubModeSettings.numberOfSuggestions ?? 3, min:1, max:5, step:1 },
            { 
                name: 'randomDirected.direction', 
                labelKey: 'setting_hg_random_direction', 
                type: 'dropdown', 
                default: currentSubModeSettings.direction ?? 'any', 
                options: [
                    { id: 'any', name: (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('direction_any', 'Any') : 'Any' }, 
                    { id: 'up', name: (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('direction_up', 'Upwards') : 'Upwards' }, 
                    { id: 'down', name: (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('direction_down', 'Downwards') : 'Downwards' }
                ]
            }
        ];
    },

    onSubModeSettingChanged(settingName, value, subModeSettings) {
        if (this._debug) console.log(`[RandomDirected.onSettingChanged] SubMode Setting '${settingName}' = ${value}`, subModeSettings);
    },

    getSubBarInfo(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return null;
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubBarInfo] glideContext.appState.harmonicGlide is not available.`);
            return null;
        }
        const settings = glideContext.appState.harmonicGlide.randomDirected || {};
        const direction = settings.direction || 'any';
        const subModeName = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate('submode_randomDirected', 'Random Directed') 
            : 'Random Directed';
        const directionText = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate(`direction_${direction}`, direction) 
            : direction;
        
        return { text: `${subModeName}: ${directionText}`, colorKey: 'unexpected' };
    },

    // Новый метод для генерации разметки для инфобара
    getSubmodeInfobarMarkup(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return '';
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubmodeInfobarMarkup] glideContext.appState.harmonicGlide is not available.`);
            return '';
        }
        const settings = glideContext.appState.harmonicGlide.randomDirected || {};
        const direction = settings.direction || 'any';
        const subModeName = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate('submode_randomDirected', 'Random Directed') 
            : 'Random Directed';
        const directionText = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate(`direction_${direction}`, direction) 
            : direction;
        
        // Пока просто текст. Позже здесь могут быть контролы для настроек RandomDirected.
        return `<span>${subModeName}: ${directionText}</span>`;
    }
};
window.RandomDirectedSubModeStrategy = RandomDirectedSubModeStrategy; 