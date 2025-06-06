// Файл: app/src/main/assets/js/padModes/subStrategies/SemiFreeSubModeStrategy.js
console.log("[SubStrategy] SemiFreeSubModeStrategy.js loaded");

const SemiFreeSubModeStrategy = {
    mts: null,
    hme: null,
    appRef: null,
    _debug: true,

    init(musicTheoryService, harmonicMarkerEngine, appReference) {
        this.mts = musicTheoryService;
        this.hme = harmonicMarkerEngine;
        this.appRef = appReference;
        if (this._debug) console.log(`[SemiFree.init] Initialized. MTS: ${!!this.mts}, HME: ${!!this.hme}, AppRef: ${!!this.appRef}`);
    },
    getName: () => "semiFree",
    getDisplayName: () => (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('submode_semiFree', 'Semi-Free') : 'Semi-Free',
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
        const settings = glideContext.appState.harmonicGlide?.semiFree || {};
        const padZones = glideContext.padZones || [];
        const appState = glideContext.appState;

        if (this._debug) {
            console.log(`[SemiFree.analyze] START. ActiveNotes: ${activeNotes.length}, HME Chord: ${hmeAnalysisResult?.detectedChordSymbol}, PreferredIntervals: ${settings.preferredIntervals}`);
        }
        
        const suggestions = [];

        if (padZones.length > 0 && activeNotes.length > 0) {
            const firstActiveNote = activeNotes[0];
            // const baseZoneIndex = padZones.findIndex(z => z.midiNote === firstActiveNote.midiNote); // Not strictly needed if suggesting by interval directly
            
            const colors = ['unexpected', 'calm', 'tense', 'powerful'];
            let colorIndex = 0;
            let suggestedCount = 0;
            const maxSuggestionsToGenerate = settings.maxSuggestions || 2;
            const intervalsToSuggest = settings.preferredIntervals || [2, 4, 5, 7, 9]; // Default intervals in semitones

            for (const interval of intervalsToSuggest) {
                if (suggestedCount >= maxSuggestionsToGenerate) break;

                const targetMidi = firstActiveNote.midiNote + interval;
                const targetZone = padZones.find(z => z.midiNote === targetMidi);

                if (targetZone) {
                    // Avoid suggesting the same note as the active one, or other active notes
                    if (activeNotes.some(an => an.midiNote === targetZone.midiNote)) {
                        continue;
                    }

                    suggestions.push({
                        suggestionId: `semiFree_${targetZone.midiNote}_${suggestedCount}`,
                        targetType: 'note',
                        midiNote: targetZone.midiNote,
                        noteName: targetZone.noteName,
                        colorSemantic: colors[colorIndex % colors.length],
                        subBarLabel: `${i18n.translate('subbar_interval', 'Interval')}: +${interval}st`
                    });
                    colorIndex++;
                    suggestedCount++;
                }
            }
        } else {
            if (this._debug && activeNotes.length === 0) console.log("[SemiFree.analyze] No active notes, cannot suggest based on intervals from active note.");
            if (this._debug && padZones.length === 0) console.log("[SemiFree.analyze] No pad zones available.");
        }

        if (this._debug) console.log(`[SemiFree.analyze] END. Generated ${suggestions.length} stub suggestions:`, JSON.parse(JSON.stringify(suggestions)));
        return suggestions;
    },

    getModeSpecificControlsConfig(currentSubModeSettings = {}) {
        return [
            { name: 'semiFree.maxSuggestions', labelKey: 'setting_hg_semiFree_maxSuggestions', type: 'knob', default: currentSubModeSettings.maxSuggestions ?? 2, min:1, max:5, step:1 },
            { name: 'semiFree.allowNonScaleNotes', labelKey: 'setting_hg_semiFree_allowNonScaleNotes', type: 'toggle', default: currentSubModeSettings.allowNonScaleNotes ?? false },
        ];
    },

    onSubModeSettingChanged(settingName, value, subModeSettings) {
        if (this._debug) console.log(`[SemiFree.onSettingChanged] SubMode Setting '${settingName}' = ${value}`, subModeSettings);
    },

    getSubBarInfo(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return null;
        if (!glideContext?.appState?.harmonicGlide) {
            if (this._debug) console.warn(`[${this.getName()}.getSubBarInfo] glideContext.appState.harmonicGlide is not available.`);
            return null;
        }
        // const settings = glideContext.appState.harmonicGlide.semiFree || {}; // Not used in current stub
        
        if (activeNotes && activeNotes.length > 0 && activeNotes[0].name) {
            const translatedText = (typeof i18n !== 'undefined' && i18n.translate) 
                ? i18n.translate('subbar_info_semiFree_active', 'Active: ${note}', {note: activeNotes[0].name}) 
                : `Active: ${activeNotes[0].name}`;
            return { text: translatedText, colorKey: 'calm' };
        }
        const defaultText = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate('submode_semiFree', 'Semi-Free') 
            : 'Semi-Free';
        return { text: defaultText, colorKey: 'neutral' };
    },

    // Новый метод для генерации разметки для инфобара
    getSubmodeInfobarMarkup(activeNotes, hmeAnalysisResult, currentSuggestions, glideContext) {
        if (!this.isUsable()) return '';
        // glideContext?.appState?.harmonicGlide проверка не обязательна здесь, т.к. метод вызывается из HGS, где это уже проверено
        
        let infoText = (typeof i18n !== 'undefined' && i18n.translate) 
            ? i18n.translate('submode_semiFree', 'Semi-Free') 
            : 'Semi-Free';

        if (activeNotes && activeNotes.length > 0 && activeNotes[0].name) {
            const activeNoteName = activeNotes[activeNotes.length - 1].name; // Берем последнюю активную ноту
            infoText = `${i18n.translate('semiFree_active_note_label', 'Active')}: ${activeNoteName}`;
        } else if (currentSuggestions && currentSuggestions.length > 0) {
            infoText = `${i18n.translate('semiFree_suggestions_label', 'Suggesting')}: ${currentSuggestions.length}`;
        }
        // Для Semi-Free, возможно, не так много динамической информации для инфобара без глубокой логики.
        // Можно добавить отображение ключевых настроек, если они появятся.
        return `<span>${infoText}</span>`;
    }
};
window.SemiFreeSubModeStrategy = SemiFreeSubModeStrategy; 