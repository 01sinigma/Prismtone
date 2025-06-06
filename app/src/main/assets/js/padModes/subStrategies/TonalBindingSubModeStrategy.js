// Файл: app/src/main/assets/js/padModes/subStrategies/TonalBindingSubModeStrategy.js
console.log("[SubStrategy] TonalBindingSubModeStrategy.js loaded");

const TonalBindingSubModeStrategy = {
    mts: null, // MusicTheoryService
    hme: null, // HarmonicMarkerEngine
    appRef: null,
    _debug: true,

    init(musicTheoryService, harmonicMarkerEngine, appReference) {
        this.mts = musicTheoryService;
        this.hme = harmonicMarkerEngine;
        this.appRef = appReference;
        if (this._debug) console.log(`[TonalBinding.init] Initialized. MTS: ${!!this.mts}, HME: ${!!this.hme}, AppRef: ${!!this.appRef}`);
    },
    getName: () => "tonalBinding",
    getDisplayName: () => (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('submode_tonalBinding', 'Tonal Binding') : 'Tonal Binding',
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
        const settings = glideContext.appState.harmonicGlide?.tonalBinding || {};
        const padZones = glideContext.padZones || [];
        const appState = glideContext.appState;

        if (this._debug) {
            console.log(`[TonalBinding.analyze] START. ActiveNotes: ${activeNotes.length}, HME Chord: ${hmeAnalysisResult?.detectedChordSymbol}, Tonic: ${appState?.currentTonic}, Scale: ${appState?.scale}`);
            // console.log(`[TonalBinding.analyze] HME Analysis Result:`, JSON.stringify(hmeAnalysisResult));
            // console.log(`[TonalBinding.analyze] GlideContext PadZones (${padZones.length}):`, JSON.stringify(padZones.map(z => z.noteName)));
        }
        
        const suggestions = [];
        let scalePCs = [];

        // Get scale notes more robustly
        if (this.mts && appState.currentTonic && appState.scale) {
            try {
                const scaleNotes = this.mts.getScaleNotes(appState.currentTonic, appState.scale);
                scalePCs = scaleNotes.map(noteName => this.mts.getNoteDetails(noteName)?.pc).filter(pc => pc !== undefined);
                if (this._debug) console.log(`[TonalBinding.analyze] Explicitly fetched scale PCs for ${appState.currentTonic} ${appState.scale}:`, scalePCs);
            } catch (e) {
                console.error("[TonalBinding.analyze] Error fetching scale notes from MTS:", e);
            }
        }
        // Fallback or augment with HME results if necessary, though explicit fetch is preferred for Tonal Binding
        if (scalePCs.length === 0 && hmeAnalysisResult?.scaleNotesPitchClasses?.length > 0) {
            scalePCs = hmeAnalysisResult.scaleNotesPitchClasses;
            if (this._debug) console.log(`[TonalBinding.analyze] Using HME scale PCs as fallback:`, scalePCs);
        }

        if (scalePCs.length === 0) {
            if (this._debug) console.warn("[TonalBinding.analyze] No scale pitch classes available. Cannot generate suggestions.");
            return [];
        }

        if (padZones.length > 0) {
            const colors = ['calm', 'powerful', 'tense', 'unexpected']; // Ensure correct semantic colors
            let colorIndex = 0;

            // Example: Suggest up to 4 notes from the scale that are on the pads
            let suggestedCount = 0;
            const maxSuggestionsToGenerate = settings.maxSuggestions ?? 4;

            for (const zone of padZones) {
                if (suggestedCount >= maxSuggestionsToGenerate) break;

                const zoneNoteDetails = this.mts.getNoteDetails(zone.midiNote);
                if (zoneNoteDetails && scalePCs.includes(zoneNoteDetails.pc)) {
                    // Avoid suggesting currently active notes if any
                    if (activeNotes.some(an => an.midiNote === zone.midiNote)) {
                        continue;
                    }
                    
                    suggestions.push({
                        suggestionId: `tonal_${zone.midiNote}_${suggestedCount}`,
                        targetType: 'note',
                        midiNote: zone.midiNote,
                        noteName: zone.noteName,
                        colorSemantic: colors[colorIndex % colors.length],
                        subBarLabel: `${i18n.translate('subbar_note', 'Note')}: ${zone.noteName}` 
                    });
                    colorIndex++;
                    suggestedCount++;
                }
            }
        }
        if (this._debug) console.log(`[TonalBinding.analyze] END. Generated ${suggestions.length} suggestions:`, JSON.parse(JSON.stringify(suggestions)));
        return suggestions;
    },

    getModeSpecificControlsConfig(currentSubModeSettings = {}) { // Provide default for currentSubModeSettings
        return [
            { name: 'tonalBinding.showChordFunctions', labelKey: 'setting_hg_tonalBinding_showChordFunctions', type: 'toggle', default: currentSubModeSettings.showChordFunctions ?? true },
            { name: 'tonalBinding.diatonicOnly', labelKey: 'setting_hg_tonalBinding_diatonicOnly', type: 'toggle', default: currentSubModeSettings.diatonicOnly ?? true },
            { name: 'tonalBinding.showRomanNumerals', labelKey: 'setting_hg_tonalBinding_showRomanNumerals', type: 'toggle', default: currentSubModeSettings.showRomanNumerals ?? false },
            {
                name: 'tonalBinding.userTonic', 
                labelKey: 'setting_hg_tonalBinding_userTonic', 
                type: 'dropdown',
                default: currentSubModeSettings.userTonic ?? (this.appRef?.state?.currentTonic ?? 'C4'),
                optionsProvider: () => {
                    const availableTonics = this.mts?.getAvailableTonicNames ? this.mts.getAvailableTonicNames() : ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
                    return availableTonics.map(n => ({id:n, name:n}));
                }
            },
            {
                name: 'tonalBinding.userScale',
                labelKey: 'setting_hg_tonalBinding_userScale',
                type: 'dropdown',
                default: currentSubModeSettings.userScale ?? (this.appRef?.state?.scale ?? 'major'),
                optionsProvider: () => {
                    const availableScales = this.mts?.getAvailableScaleIds ? this.mts.getAvailableScaleIds() : ['major', 'minor', 'dorian'];
                    return availableScales.map(s => ({id:s, name: (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate(s,s) : s}));
                }
            }
        ];
    },

    onSubModeSettingChanged(settingName, value, subModeSettings) { // Changed 'allGlideSettings' to 'subModeSettings'
        if (this._debug) console.log(`[TonalBinding.onSettingChanged] SubMode Setting '${settingName}' = ${value}`, subModeSettings);
        // Здесь можно обновить внутреннее состояние подстратегии, если оно зависит от настроек
    },

    getSubBarInfo(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return null;
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubBarInfo] glideContext.appState.harmonicGlide is not available.`);
            return null;
        }
        const settings = glideContext.appState.harmonicGlide.tonalBinding || {};
        
        if (settings.showChordFunctions && hmeAnalysisResult?.currentHarmonicFunction) {
            const funcText = hmeAnalysisResult.currentHarmonicFunction;
            const translatedText = (typeof i18n !== 'undefined' && i18n.translate) 
                ? i18n.translate('subbar_info_tonal_function', 'Function: ${func}', {func: funcText}) 
                : `Function: ${funcText}`;
            return { text: translatedText, colorKey: 'calm' }; // Added colorKey for consistency
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
        const settings = glideContext.appState.harmonicGlide.tonalBinding || {};
        
        const currentKeyText = `${glideContext.appState.currentTonic || 'C4'} ${glideContext.appState.scale || 'major'}`;
        const keyDisplayHtml = `<span class="clickable-key hg-infobar-key-display" onclick="app.handleHgTonalBindingKeySettings()" title="${i18n.translate('tonal_binding_key_select_title', 'Select Key')}">${i18n.translate('key_label','Key')}: ${currentKeyText}</span>`;

        if (settings.showChordFunctions && hmeAnalysisResult?.currentHarmonicFunction) {
            const funcText = hmeAnalysisResult.currentHarmonicFunction;
            const translatedFuncText = (typeof i18n !== 'undefined' && i18n.translate) 
                ? i18n.translate('subbar_info_tonal_function', 'Function: ${func}', {func: funcText}) 
                : `Function: ${funcText}`;
            return `${keyDisplayHtml} | <span class="hg-infobar-function">${translatedFuncText}</span>`;
        }
        return keyDisplayHtml;
    }
};
window.TonalBindingSubModeStrategy = TonalBindingSubModeStrategy; // Делаем доступным глобально 