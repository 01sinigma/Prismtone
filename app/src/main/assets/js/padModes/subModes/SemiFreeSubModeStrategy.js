class SemiFreeSubModeStrategy {
    constructor(musicTheoryServiceRef, harmonicMarkerEngineRef, appRef, mainStrategyRef) {
        this.musicTheoryServiceRef = musicTheoryServiceRef;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineRef;
        this.appRef = appRef;
        this.mainStrategyRef = mainStrategyRef;
    }

    getName() {
        return 'semiFree';
    }

    getDisplayName() {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('submode_semiFree', 'Semi-Free')
            : 'Semi-Free';
    }

    init() {}

    isUsable() {
        return !!(this.musicTheoryServiceRef && this.musicTheoryServiceRef.isTonalJsLoaded);
    }

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        const suggestions = [];
        if (!this.isUsable() || !activeNotes || !hmeAnalysisResult) return suggestions;
        const settings = glideContext.appState.harmonicGlide.semiFree || {};
        const { scaleNotesPitchClasses, scaleTonicPc } = hmeAnalysisResult;
        const deviationLevel = typeof settings.deviationLevel === 'number' ? settings.deviationLevel : 0.4;
        const allowNonDiatonic = settings.allowNonDiatonicPassing === true;
        const highlightReturnToTonic = settings.highlightReturnToTonic === true;
        const currentActiveNote = activeNotes.length > 0 ? activeNotes[activeNotes.length - 1] : null;
        const currentOctave = currentActiveNote ? (Tonal.Note.octave(currentActiveNote.name) ?? 4) : 4;
        // Диапазон +/- n полутонов
        const semitoneRange = Math.max(1, Math.round(deviationLevel * 6));
        if (currentActiveNote) {
            for (let offset = -semitoneRange; offset <= semitoneRange; offset++) {
                if (offset === 0) continue;
                try {
                    const targetMidi = currentActiveNote.midiNote + offset;
                    const targetNoteName = this.musicTheoryServiceRef.midiToNoteName(targetMidi);
                    const details = this.musicTheoryServiceRef.getNoteDetails(targetNoteName);
                    if (!details) continue;
                    const isDiatonic = scaleNotesPitchClasses && scaleNotesPitchClasses.includes(details.pc);
                    if (!isDiatonic && !allowNonDiatonic) continue;
                    let colorSemantic = isDiatonic ? 'neutral' : 'unexpected';
                    if (highlightReturnToTonic && details.pc === scaleTonicPc) colorSemantic = 'calm';
                    suggestions.push({
                        suggestionId: `semi_${details.midi}_${offset}`,
                        targetType: 'note',
                        midiNote: details.midi,
                        noteName: details.name,
                        frequency: details.freq,
                        colorSemantic,
                        subBarLabel: `${offset > 0 ? '+' : ''}${offset}`
                    });
                } catch (e) { /* ignore */ }
            }
        }
        // Добавить возвращение к тонике
        if (highlightReturnToTonic && scaleTonicPc) {
            const tonicName = scaleTonicPc + currentOctave;
            const details = this.musicTheoryServiceRef.getNoteDetails(tonicName);
            if (details) {
                suggestions.push({
                    suggestionId: `semi_tonic_${details.midi}`,
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
        const tonicSugg = suggestions.find(s => s.subBarLabel === 'Tonic');
        if (tonicSugg) return `Return: <span class="function-T">${tonicSugg.noteName}</span>`;
        return suggestions.map(s => s.subBarLabel).join(' / ');
    }

    getModeSpecificControlsConfig(currentSubModeSettings) {
        return [
            { name: 'semiFree.deviationLevel', labelKey: 'setting_hg_semiFree_deviationLevel', type: 'knob', min: 0, max: 1, step: 0.01, default: currentSubModeSettings?.deviationLevel },
            { name: 'semiFree.allowNonDiatonicPassing', labelKey: 'setting_hg_semiFree_allowNonDiatonicPassing', type: 'toggle', default: currentSubModeSettings?.allowNonDiatonicPassing },
            { name: 'semiFree.highlightReturnToTonic', labelKey: 'setting_hg_semiFree_highlightReturnToTonic', type: 'toggle', default: currentSubModeSettings?.highlightReturnToTonic }
        ];
    }

    onSubModeSettingChanged(settingName, value, allGlideSettings) {}
}
window.SemiFreeSubModeStrategy = SemiFreeSubModeStrategy; 