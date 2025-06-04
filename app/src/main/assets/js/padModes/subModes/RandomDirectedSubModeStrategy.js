class RandomDirectedSubModeStrategy {
    constructor(musicTheoryServiceRef, harmonicMarkerEngineRef, appRef, mainStrategyRef) {
        this.musicTheoryServiceRef = musicTheoryServiceRef;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineRef;
        this.appRef = appRef;
        this.mainStrategyRef = mainStrategyRef;
    }

    getName() {
        return 'randomDirected';
    }

    getDisplayName() {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('submode_randomDirected', 'Random Directed')
            : 'Random Directed';
    }

    init() {}

    isUsable() {
        return !!(this.musicTheoryServiceRef && this.musicTheoryServiceRef.isTonalJsLoaded);
    }

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        const suggestions = [];
        if (!this.isUsable() || !hmeAnalysisResult) return suggestions;
        const settings = glideContext.appState.harmonicGlide.randomDirected || {};
        const { scaleNotesPitchClasses, scaleTonicPc } = hmeAnalysisResult;
        const chaosLevel = typeof settings.chaosLevel === 'number' ? settings.chaosLevel : 0.6;
        const tonalFilterStrength = typeof settings.tonalFilterStrength === 'number' ? settings.tonalFilterStrength : 0.5;
        const currentOctave = 4;
        // Случайные предложения
        const numSuggestions = Math.max(2, Math.round(chaosLevel * 6));
        for (let i = 0; i < numSuggestions; i++) {
            const randomMidi = 48 + Math.floor(Math.random() * 36); // C3-B5
            const details = this.musicTheoryServiceRef.getNoteDetails(this.musicTheoryServiceRef.midiToNoteName(randomMidi));
            if (!details) continue;
            const isDiatonic = scaleNotesPitchClasses && scaleNotesPitchClasses.includes(details.pc);
            const isTonic = scaleTonicPc && details.pc === scaleTonicPc;
            let colorSemantic = isTonic ? 'calm' : (isDiatonic ? 'neutral' : 'unexpected');
            // Фильтр по tonalFilterStrength
            if (!isDiatonic && Math.random() < tonalFilterStrength) continue;
            suggestions.push({
                suggestionId: `rnd_${details.midi}_${i}`,
                targetType: 'note',
                midiNote: details.midi,
                noteName: details.name,
                frequency: details.freq,
                colorSemantic,
                subBarLabel: details.pc
            });
        }
        // Всегда добавляем тонику
        if (scaleTonicPc) {
            const tonicName = scaleTonicPc + currentOctave;
            const details = this.musicTheoryServiceRef.getNoteDetails(tonicName);
            if (details) {
                suggestions.push({
                    suggestionId: `rnd_tonic_${details.midi}`,
                    targetType: 'note',
                    midiNote: details.midi,
                    noteName: details.name,
                    frequency: details.freq,
                    colorSemantic: 'calm',
                    subBarLabel: 'Tonic'
                });
            }
        }
        return suggestions.slice(0, glideContext.appState.harmonicGlide.maxMarkersToShow || 4);
    }

    getSubBarInfo(activeNotes, hmeAnalysisResult, suggestions, glideContext) {
        if (!suggestions || suggestions.length === 0) return null;
        return suggestions.map(s => s.subBarLabel).join(' | ');
    }

    getModeSpecificControlsConfig(currentSubModeSettings) {
        return [
            { name: 'randomDirected.chaosLevel', labelKey: 'setting_hg_randomDirected_chaosLevel', type: 'knob', min: 0, max: 1, step: 0.01, default: currentSubModeSettings?.chaosLevel },
            { name: 'randomDirected.tonalFilterStrength', labelKey: 'setting_hg_randomDirected_tonalFilterStrength', type: 'knob', min: 0, max: 1, step: 0.01, default: currentSubModeSettings?.tonalFilterStrength }
        ];
    }

    onSubModeSettingChanged(settingName, value, allGlideSettings) {}
}
window.RandomDirectedSubModeStrategy = RandomDirectedSubModeStrategy; 