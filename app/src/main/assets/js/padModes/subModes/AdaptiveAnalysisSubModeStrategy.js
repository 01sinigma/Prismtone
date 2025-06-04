class AdaptiveAnalysisSubModeStrategy {
    constructor(musicTheoryServiceRef, harmonicMarkerEngineRef, appRef, mainStrategyRef) {
        this.musicTheoryServiceRef = musicTheoryServiceRef;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineRef;
        this.appRef = appRef;
        this.mainStrategyRef = mainStrategyRef;
    }

    getName() {
        return 'adaptiveAnalysis';
    }

    getDisplayName() {
        return (typeof i18n !== 'undefined' && i18n.translate)
            ? i18n.translate('submode_adaptiveAnalysis', 'Adaptive Analysis')
            : 'Adaptive Analysis';
    }

    init() {}

    isUsable() {
        return !!(this.musicTheoryServiceRef && this.musicTheoryServiceRef.isTonalJsLoaded);
    }

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        const suggestions = [];
        if (!this.isUsable() || !activeNotes || !hmeAnalysisResult) return suggestions;
        const settings = glideContext.appState.harmonicGlide.adaptiveAnalysis || {};
        const allowChromatic = settings.allowChromaticSuggestions === true;
        const stabilityPriority = typeof settings.stabilityPriority === 'number' ? settings.stabilityPriority : 0.5;
        // --- Определение локальной тональности ---
        let localTonic = null;
        if (activeNotes.length > 0 && this.musicTheoryServiceRef._TonalKey) {
            const pcs = activeNotes.map(n => Tonal.Note.pc(n.name));
            const keyAnalysis = this.musicTheoryServiceRef._TonalKey.majorKey(pcs.join(' '));
            if (keyAnalysis && keyAnalysis.tonic) localTonic = keyAnalysis.tonic;
        }
        // --- Генерация предложений ---
        if (localTonic) {
            // Стабильные предложения (внутри локальной тональности)
            const stableIntervals = ["P5", "P4", "M3", "m3"];
            for (const interval of stableIntervals) {
                try {
                    const targetNoteName = this.musicTheoryServiceRef._TonalTransposeFn(localTonic + '4', interval);
                    const details = this.musicTheoryServiceRef.getNoteDetails(targetNoteName);
                    if (details) {
                        suggestions.push({
                            suggestionId: `adaptive_stable_${details.midi}_${interval}`,
                            targetType: 'note',
                            midiNote: details.midi,
                            noteName: details.name,
                            frequency: details.freq,
                            colorSemantic: 'calm',
                            subBarLabel: `Stable: ${details.pc}`
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        // Модуляционные/хроматические предложения
        if (allowChromatic) {
            const chromaticIntervals = ["A4", "d5", "m2", "M2"];
            for (const interval of chromaticIntervals) {
                try {
                    const tonic = localTonic || (hmeAnalysisResult.scaleTonicPc + '4');
                    const targetNoteName = this.musicTheoryServiceRef._TonalTransposeFn(tonic, interval);
                    const details = this.musicTheoryServiceRef.getNoteDetails(targetNoteName);
                    if (details) {
                        suggestions.push({
                            suggestionId: `adaptive_chromatic_${details.midi}_${interval}`,
                            targetType: 'note',
                            midiNote: details.midi,
                            noteName: details.name,
                            frequency: details.freq,
                            colorSemantic: 'unexpected',
                            subBarLabel: `Chromatic: ${details.pc}`
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        return suggestions.slice(0, glideContext.appState.harmonicGlide.maxMarkersToShow || 4);
    }

    getSubBarInfo(activeNotes, hmeAnalysisResult, suggestions, glideContext) {
        const settings = glideContext.appState.harmonicGlide.adaptiveAnalysis || {};
        if (!settings.showInterpretation) return null;
        let localTonic = null;
        if (activeNotes.length > 0 && this.musicTheoryServiceRef._TonalKey) {
            const pcs = activeNotes.map(n => Tonal.Note.pc(n.name));
            const keyAnalysis = this.musicTheoryServiceRef._TonalKey.majorKey(pcs.join(' '));
            if (keyAnalysis && keyAnalysis.tonic) localTonic = keyAnalysis.tonic;
        }
        if (localTonic) return `Local: <span class="function-T">${localTonic}</span>`;
        return "Suggesting modulation";
    }

    getModeSpecificControlsConfig(currentSubModeSettings) {
        return [
            { name: 'adaptiveAnalysis.allowChromaticSuggestions', labelKey: 'setting_hg_adaptiveAnalysis_allowChromaticSuggestions', type: 'toggle', default: currentSubModeSettings?.allowChromaticSuggestions },
            { name: 'adaptiveAnalysis.changeSensitivity', labelKey: 'setting_hg_adaptiveAnalysis_changeSensitivity', type: 'knob', min: 0, max: 1, step: 0.01, default: currentSubModeSettings?.changeSensitivity },
            { name: 'adaptiveAnalysis.stabilityPriority', labelKey: 'setting_hg_adaptiveAnalysis_stabilityPriority', type: 'knob', min: 0, max: 1, step: 0.01, default: currentSubModeSettings?.stabilityPriority },
            { name: 'adaptiveAnalysis.showInterpretation', labelKey: 'setting_hg_adaptiveAnalysis_showInterpretation', type: 'toggle', default: currentSubModeSettings?.showInterpretation }
        ];
    }

    onSubModeSettingChanged(settingName, value, allGlideSettings) {}
}
window.AdaptiveAnalysisSubModeStrategy = AdaptiveAnalysisSubModeStrategy; 