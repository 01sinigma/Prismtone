class TonalBindingSubModeStrategy {
    constructor(musicTheoryServiceRef, harmonicMarkerEngineRef, appRef, mainStrategyRef) {
        this.musicTheoryServiceRef = musicTheoryServiceRef;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineRef;
        this.appRef = appRef;
        this.mainStrategyRef = mainStrategyRef;
    }

    getName() {
        return 'tonalBinding';
    }

    getDisplayName() {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('submode_tonalBinding', 'Tonal Binding')
            : 'Tonal Binding';
    }

    init() {}

    isUsable() {
        return !!(this.musicTheoryServiceRef && this.musicTheoryServiceRef.isTonalJsLoaded);
    }

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        const suggestions = [];
        if (!this.isUsable() || !activeNotes || !hmeAnalysisResult) return suggestions;
        const subModeSettings = glideContext.appState.harmonicGlide.tonalBinding || {};
        const { scaleNotesPitchClasses, scaleTonicPc, currentHarmonicFunction } = hmeAnalysisResult;
        if (!scaleNotesPitchClasses || !scaleTonicPc) {
            console.warn("[TonalBinding] Cannot generate suggestions: missing scale info from HME.");
            return suggestions;
        }
        const currentActiveNote = activeNotes.length > 0 ? activeNotes[activeNotes.length - 1] : null;
        const currentOctave = currentActiveNote ? (Tonal.Note.octave(currentActiveNote.name) ?? 4) : 4;
        const preferredIntervals = subModeSettings.preferredIntervals || ["P5", "P4", "M3", "m3", "M6", "m6"];
        // --- Предложения нот ---
        if (currentActiveNote) {
            for (const interval of preferredIntervals) {
                try {
                    const targetNoteName = this.musicTheoryServiceRef._TonalTransposeFn(currentActiveNote.name, interval);
                    const details = this.musicTheoryServiceRef.getNoteDetails(targetNoteName);
                    if (details && (!subModeSettings.diatonicOnly || scaleNotesPitchClasses.includes(details.pc))) {
                        let colorSemantic = 'neutral';
                        if (interval === "P5" || interval === "P4") colorSemantic = 'calm';
                        else if (interval.startsWith("M") || interval.startsWith("m")) colorSemantic = 'tense';
                        suggestions.push({
                            suggestionId: `tonal_note_${details.midi}_${interval}`,
                            targetType: 'note',
                            midiNote: details.midi,
                            noteName: details.name,
                            frequency: details.freq,
                            colorSemantic,
                            subBarLabel: `${interval} to ${details.pc}`
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        // --- Предложения аккордов ---
        const baseForChordSuggestions = hmeAnalysisResult.isPlayingChord ? hmeAnalysisResult.detectedChordDetails?.tonic : (currentActiveNote ? currentActiveNote.name : scaleTonicPc + currentOctave);
        if (this.musicTheoryServiceRef._TonalChord && this.musicTheoryServiceRef._TonalScale) {
            const scaleChords = this.musicTheoryServiceRef._TonalScale.chords(glideContext.appState.scale, scaleTonicPc) || [];
            const romanNumerals = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
            for (let i = 0; i < Math.min(scaleChords.length, romanNumerals.length); i++) {
                const chordSymbol = scaleChords[i];
                const chordDetails = this.musicTheoryServiceRef._TonalChord.get(chordSymbol);
                if (chordDetails && chordDetails.tonic && chordDetails.notes) {
                    const firstPc = chordDetails.notes[0];
                    const approxMidiRoot = this.musicTheoryServiceRef.getNoteDetails(firstPc + currentOctave)?.midi;
                    if (approxMidiRoot === undefined) continue;
                    const midiNotes = chordDetails.notes.map(pc => this.musicTheoryServiceRef.getNoteDetails(pc + currentOctave)?.midi).filter(m => m !== undefined);
                    if (midiNotes.length < 2) continue;
                    let colorSemantic = 'neutral';
                    if (["I", "vi", "iii"].includes(romanNumerals[i])) colorSemantic = 'calm';
                    if (["V", "vii°"].includes(romanNumerals[i])) colorSemantic = 'powerful';
                    if (["IV", "ii"].includes(romanNumerals[i])) colorSemantic = 'tense';
                    suggestions.push({
                        suggestionId: `tonal_chord_${chordSymbol}`,
                        targetType: 'chord',
                        midiNotes,
                        chordSymbol,
                        chordRootPc: Tonal.Note.pc(chordDetails.tonic),
                        chordQuality: chordDetails.type,
                        colorSemantic,
                        subBarLabel: `${romanNumerals[i]}: ${chordSymbol}`
                    });
                }
            }
        }
        return suggestions.slice(0, glideContext.appState.harmonicGlide.maxMarkersToShow || 4);
    }

    getSubBarInfo(activeNotes, hmeAnalysisResult, suggestions, glideContext) {
        const settings = glideContext.appState.harmonicGlide.tonalBinding || {};
        if (!settings.showChordFunctions || !suggestions || suggestions.length === 0) return null;
        const firstChord = suggestions.find(s => s.targetType === 'chord');
        if (!firstChord) return null;
        // Цветная разметка для функции
        const roman = firstChord.subBarLabel?.split(':')[0] || '';
        return `Next: <span class="function-${roman}">${firstChord.chordSymbol}</span>`;
    }

    getModeSpecificControlsConfig(currentSubModeSettings) {
        return [
            { name: 'tonalBinding.diatonicOnly', labelKey: 'setting_hg_tonalBinding_diatonicOnly', type: 'toggle', default: currentSubModeSettings?.diatonicOnly },
            { name: 'tonalBinding.showChordFunctions', labelKey: 'setting_hg_tonalBinding_showChordFunctions', type: 'toggle', default: currentSubModeSettings?.showChordFunctions },
            { name: 'tonalBinding.preferredIntervals', labelKey: 'setting_hg_tonalBinding_preferredIntervals', type: 'select', options: ["P5","P4","M3","m3","M6","m6"], default: currentSubModeSettings?.preferredIntervals },
            { name: 'tonalBinding.showRomanNumerals', labelKey: 'setting_hg_tonalBinding_showRomanNumerals', type: 'toggle', default: currentSubModeSettings?.showRomanNumerals }
        ];
    }

    onSubModeSettingChanged(settingName, value, allGlideSettings) {
        // Можно реализовать реакцию на изменение настроек
    }
}
window.TonalBindingSubModeStrategy = TonalBindingSubModeStrategy; 