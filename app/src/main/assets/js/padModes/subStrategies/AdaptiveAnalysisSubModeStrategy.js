// Файл: app/src/main/assets/js/padModes/subStrategies/AdaptiveAnalysisSubModeStrategy.js
console.log("[SubStrategy] AdaptiveAnalysisSubModeStrategy.js loaded");

const AdaptiveAnalysisSubModeStrategy = {
    mts: null,
    hme: null,
    appRef: null,
    _debug: true,
    _currentAdaptiveKey: { // Для хранения локально определенной тональности
        tonicPc: null,
        scaleName: null,
        displayName: '-'
    },

    init(musicTheoryService, harmonicMarkerEngine, appReference) {
        this.mts = musicTheoryService;
        this.hme = harmonicMarkerEngine;
        this.appRef = appReference;
        if (this._debug) console.log(`[AdaptiveAnalysis.init] Initialized. MTS: ${!!this.mts}, HME: ${!!this.hme}, AppRef: ${!!this.appRef}`);
    },
    getName: () => "adaptiveAnalysis",
    getDisplayName: () => (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('submode_adaptiveAnalysis', 'Adaptive Analysis') : 'Adaptive Analysis',
    isUsable: function() { 
        if (this._debug) console.log(`[${this.getName()}.isUsable] Checking dependencies...`);
        if (!this.mts) { if (this._debug) console.warn(`[${this.getName()}.isUsable] MusicTheoryService (mts) is null.`); return false; }
        if (!this.mts.isTonalJsLoaded) { if (this._debug) console.warn(`[${this.getName()}.isUsable] mts.isTonalJsLoaded is false.`); return false; }
        if (!this.hme) { if (this._debug) console.warn(`[${this.getName()}.isUsable] HarmonicMarkerEngine (hme) is null.`); return false; }
        if (!this.hme.isInitialized) { if (this._debug) console.warn(`[${this.getName()}.isUsable] hme.isInitialized is false.`); return false; }
        if (!this.appRef) { if (this._debug) console.warn(`[${this.getName()}.isUsable] AppRef is null.`); return false; }
        if (this._debug) console.log(`[${this.getName()}.isUsable] All checks passed.`);
        return true;
    },

    async analyzeAndSuggest(activeNotes, hmeAnalysisResult, glideContext) {
        if (!this.isUsable()) return [];
        const settings = glideContext.appState.harmonicGlide?.adaptiveAnalysis || {};
        const padZones = glideContext.padZones || [];
        const appState = glideContext.appState;
        let localAnalysisContext = { tonicPc: null, scaleName: null, scalePCs: [] };

        if (this._debug) {
            console.log(`[AdaptiveAnalysis.analyze] START. ActiveNotes: ${activeNotes.length}, HME Chord: ${hmeAnalysisResult?.detectedChordSymbol}`);
        }

        const activeNotePCs = activeNotes.map(n => this.mts.getNoteDetails(n.midiNote)?.pc).filter(pc => pc !== undefined);

        // 1. Попытка определить локальную тональность
        if (activeNotePCs.length > 0) {
            let notesForScaleDetection = activeNotePCs;
            if (hmeAnalysisResult?.isPlayingChord && hmeAnalysisResult.detectedChordDetails?.notes) {
                // Если есть аккорд, используем его ноты + активные ноты для большей точности
                const chordNotePCs = hmeAnalysisResult.detectedChordDetails.notes.map(n => this.mts._TonalNote.pc(n)).filter(pc => pc);
                notesForScaleDetection = [...new Set([...activeNotePCs, ...chordNotePCs])];
            }

            if (notesForScaleDetection.length >= 2) { // Нужно хотя бы 2 ноты для Tonal.Scale.detect
                const possibleScales = this.mts._TonalScale.detect(notesForScaleDetection);
                if (this._debug) console.log(`[AdaptiveAnalysis.analyze] Tonal.Scale.detect results for [${notesForScaleDetection.join(',')}]:`, possibleScales);
                
                if (possibleScales && possibleScales.length > 0) {
                    // Выбираем первый (часто наиболее вероятный) или более сложная логика выбора
                    const bestGuessScale = possibleScales[0]; 
                    const [tonicFromName, ...scaleParts] = bestGuessScale.split(' ');
                    localAnalysisContext.tonicPc = this.mts._TonalNote.pc(tonicFromName); // Убедимся, что это PC
                    localAnalysisContext.scaleName = scaleParts.join(' ');

                    if (localAnalysisContext.tonicPc && localAnalysisContext.scaleName) {
                        try {
                            const scaleNotes = this.mts.getScaleNotes(localAnalysisContext.tonicPc, localAnalysisContext.scaleName);
                            localAnalysisContext.scalePCs = scaleNotes.map(noteName => this.mts.getNoteDetails(noteName)?.pc).filter(pc => pc !== undefined);
                            this._currentAdaptiveKey.tonicPc = localAnalysisContext.tonicPc;
                            this._currentAdaptiveKey.scaleName = localAnalysisContext.scaleName;
                            this._currentAdaptiveKey.displayName = `${localAnalysisContext.tonicPc} ${localAnalysisContext.scaleName}`;
                            if (this._debug) console.log(`[AdaptiveAnalysis.analyze] Locally detected key: ${this._currentAdaptiveKey.displayName}, PCs:`, localAnalysisContext.scalePCs);
                        } catch (e) {
                            console.error("[AdaptiveAnalysis.analyze] Error getting scale notes for locally detected key:", e);
                            localAnalysisContext = { tonicPc: null, scaleName: null, scalePCs: [] }; // Сброс при ошибке
                        }
                    }
                }
            }
        }

        // 2. Если локальную тональность не удалось определить, используем глобальную или из HME
        if (!localAnalysisContext.tonicPc || !localAnalysisContext.scaleName) {
            this._currentAdaptiveKey.displayName = i18n.translate('adaptive_analysis_using_global_key', 'Using global key');
            if (hmeAnalysisResult?.scaleTonicPc && hmeAnalysisResult?.scaleId && hmeAnalysisResult?.scaleNotesPitchClasses) {
                localAnalysisContext.tonicPc = hmeAnalysisResult.scaleTonicPc;
                localAnalysisContext.scaleName = hmeAnalysisResult.scaleId;
                localAnalysisContext.scalePCs = hmeAnalysisResult.scaleNotesPitchClasses;
                this._currentAdaptiveKey.tonicPc = hmeAnalysisResult.scaleTonicPc;
                this._currentAdaptiveKey.scaleName = hmeAnalysisResult.scaleId;
                this._currentAdaptiveKey.displayName = `${hmeAnalysisResult.scaleTonicPc} ${i18n.translate(hmeAnalysisResult.scaleId, hmeAnalysisResult.scaleId)} (global)`;
                if (this._debug) console.log(`[AdaptiveAnalysis.analyze] Using HME/Global key: ${this._currentAdaptiveKey.displayName}`);
            } else if (appState.currentTonic && appState.scale) {
                try {
                    const scaleNotes = this.mts.getScaleNotes(appState.currentTonic, appState.scale);
                    localAnalysisContext.scalePCs = scaleNotes.map(noteName => this.mts.getNoteDetails(noteName)?.pc).filter(pc => pc !== undefined);
                    localAnalysisContext.tonicPc = this.mts.getNoteDetails(appState.currentTonic)?.pc;
                    localAnalysisContext.scaleName = appState.scale;
                    this._currentAdaptiveKey.tonicPc = localAnalysisContext.tonicPc;
                    this._currentAdaptiveKey.scaleName = localAnalysisContext.scaleName;
                    this._currentAdaptiveKey.displayName = `${localAnalysisContext.tonicPc} ${i18n.translate(localAnalysisContext.scaleName, localAnalysisContext.scaleName)} (global fallback)`;
                    if (this._debug) console.log(`[AdaptiveAnalysis.analyze] Using Global key (fallback): ${this._currentAdaptiveKey.displayName}`);
                } catch (e) { /* ignore */ }
            } else {
                if (this._debug) console.warn("[AdaptiveAnalysis.analyze] No key context available. Cannot generate suggestions.");
                this._currentAdaptiveKey = { tonicPc: null, scaleName: null, displayName: '-' };
                return [];
            }
        }

        const suggestions = [];
        if (padZones.length > 0 && localAnalysisContext.scalePCs.length > 0) {
            const colors = ['calm', 'tense', 'powerful', 'unexpected'];
            let colorIndex = 0;
            let suggestedCount = 0;
            const maxSuggestionsToGenerate = settings.maxSuggestions || 3;

            for (const zone of padZones) {
                if (suggestedCount >= maxSuggestionsToGenerate) break;
                const zoneNoteDetails = this.mts.getNoteDetails(zone.midiNote);
                if (zoneNoteDetails) {
                    const targetPC = zoneNoteDetails.pc;
                    if (activeNotePCs.includes(targetPC)) continue; // Skip active notes
                    if (localAnalysisContext.scalePCs.includes(targetPC)) { // Suggest notes in the determined (local or global) scale
                        suggestions.push({
                            suggestionId: `adaptive_${zone.midiNote}_${suggestedCount}`,
                            targetType: 'note',
                            midiNote: zone.midiNote,
                            noteName: zone.noteName,
                            colorSemantic: colors[colorIndex % colors.length],
                            subBarLabel: `Explore (${localAnalysisContext.tonicPc} ${localAnalysisContext.scaleName}): ${zone.noteName}`
                        });
                        colorIndex++;
                        suggestedCount++;
                    }
                }
            }
        }
        
        if (this._debug) console.log(`[AdaptiveAnalysis.analyze] END. Generated ${suggestions.length} suggestions using key ${this._currentAdaptiveKey.displayName}:`, JSON.parse(JSON.stringify(suggestions)));
        return suggestions;
    },

    getModeSpecificControlsConfig(currentSubModeSettings = {}) {
        return [
            { name: 'adaptiveAnalysis.analysisDepth', labelKey: 'setting_hg_adaptive_analysisDepth', type: 'knob', default: currentSubModeSettings.analysisDepth ?? 3, min:1, max:5, step:1 },
            { name: 'adaptiveAnalysis.preferNovelty', labelKey: 'setting_hg_adaptive_preferNovelty', type: 'toggle', default: currentSubModeSettings.preferNovelty ?? true },
        ];
    },

    onSubModeSettingChanged(settingName, value, subModeSettings) {
        if (this._debug) console.log(`[AdaptiveAnalysis.onSettingChanged] SubMode Setting '${settingName}' = ${value}`, subModeSettings);
    },

    getSubBarInfo(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return null;
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubBarInfo] glideContext.appState.harmonicGlide is not available.`);
            return null;
        }
        const settings = glideContext.appState.harmonicGlide.adaptiveAnalysis || {};
        
        if (settings.showAnalysisSummary && hmeAnalysisResult?.analysisSummary) {
             return { text: hmeAnalysisResult.analysisSummary, colorKey: "calm" };
        }
        if (currentSuggestions && currentSuggestions.length > 0) {
            const translatedText = (typeof i18n !== 'undefined' && i18n.translate) 
                ? i18n.translate('subbar_info_adaptive_suggestions', 'Suggestions: ${count}', {count: currentSuggestions.length}) 
                : `Suggestions: ${currentSuggestions.length}`;
            return { text: translatedText, colorKey: 'calm' };
        }
        return null;
    },

    // Новый метод для генерации разметки для инфобара
    getSubmodeInfobarMarkup(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return '';
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubmodeInfobarMarkup] glideContext.appState.harmonicGlide is not available.`);
            return '';
        }
        const settings = glideContext.appState.harmonicGlide.adaptiveAnalysis || {};
        
        // В будущем здесь будет авто-определенная тональность
        let autoKeyDisplay = i18n.translate('adaptive_analysis_determining_key', 'Determining key...');
        if (hmeAnalysisResult?.scaleTonicPc && hmeAnalysisResult?.scaleNotesPitchClasses) {
            // Пример: если HME вернул что-то похожее на тональность
            // Это очень упрощенно, реальная логика определения будет сложнее
            const detectedScaleName = MusicTheoryService.findScaleName(hmeAnalysisResult.scaleNotesPitchClasses.map(pc => this.musicTheoryServiceRef.getNoteNameFromPitchClass(pc, hmeAnalysisResult.scaleTonicPc, 4))) || analysisContext.scaleId || 'unknown scale';
            autoKeyDisplay = `${i18n.translate('auto_key_label', 'Auto-Key')}: ${hmeAnalysisResult.scaleTonicPc} ${i18n.translate(detectedScaleName, detectedScaleName)}`;
        }

        if (settings.showAnalysisSummary && hmeAnalysisResult?.analysisSummary) {
             return `<span>${autoKeyDisplay}</span> | <span>${hmeAnalysisResult.analysisSummary}</span>`;
        }
        if (currentSuggestions && currentSuggestions.length > 0) {
            const translatedText = (typeof i18n !== 'undefined' && i18n.translate) 
                ? i18n.translate('subbar_info_adaptive_suggestions', 'Suggestions: ${count}', {count: currentSuggestions.length}) 
                : `Suggestions: ${currentSuggestions.length}`;
            return `<span>${autoKeyDisplay}</span> | <span>${translatedText}</span>`;
        }
        return `<span>${autoKeyDisplay}</span>`;
    }
};
window.AdaptiveAnalysisSubModeStrategy = AdaptiveAnalysisSubModeStrategy; 