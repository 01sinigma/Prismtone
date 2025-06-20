// File: assets/js/harmonicMarkerEngine.js
// Harmonic Marker Engine - Core for musical context analysis.
// Версия для Фазы 1

console.log("[HME v1.0] harmonicMarkerEngine.js loaded");

const harmonicMarkerEngine = {
    musicTheoryServiceRef: null,
    isInitialized: false,
    _debug: true, // Флаг для подробного логирования внутри движка
    _scaleCache: new Map(), // Кэш для результатов getNotesForScale (pitch classes)

    /**
     * Initializes the Harmonic Marker Engine.
     * @param {object} musicTheoryServiceInstance - Instance of MusicTheoryService.
     */
    init(musicTheoryServiceInstance) {
        if (!musicTheoryServiceInstance || typeof musicTheoryServiceInstance.getNoteDetails !== 'function') {
            console.error("[HME.init] Invalid MusicTheoryService instance provided.");
            this.isInitialized = false;
            return;
        }
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.isInitialized = true;
        this._scaleCache.clear(); // Очищаем кэш при инициализации
        console.log(`[HME.init] Initialized. MusicTheoryService Ready: ${this.musicTheoryServiceRef.isTonalJsLoaded}. Scale cache cleared.`);
    },

    /**
     * Internal method to get scale notes (pitch classes) with caching.
     * @param {string} tonicName - Name of the tonic (e.g., "C4").
     * @param {string} scaleId - ID of the scale (e.g., "major").
     * @returns {Promise<Array<string>|null>} Array of pitch classes or null if error.
     */
    async _getCachedScaleNotes(tonicName, scaleId) {
        if (!this.isInitialized || !this.musicTheoryServiceRef) {
            console.warn("[HME._getCachedScaleNotes] Not initialized or no musicTheoryServiceRef.");
            return null;
        }
        const cacheKey = `${tonicName}_${scaleId}`;
        if (this._scaleCache.has(cacheKey)) {
            if (this._debug) console.log(`[HME._getCachedScaleNotes] Cache HIT for ${cacheKey}`);
            return this._scaleCache.get(cacheKey);
        }

        if (this._debug) console.log(`[HME._getCachedScaleNotes] Cache MISS for ${cacheKey}. Fetching from service.`);
        try {
            const scaleNotesDetails = await this.musicTheoryServiceRef.getNotesForScale(
                tonicName,
                scaleId,
                0, // octavesToScanBefore
                0  // octavesToScanAfter
            );
            if (scaleNotesDetails && scaleNotesDetails.length > 0) {
                const pitchClasses = scaleNotesDetails.map(n => n.pc);
                this._scaleCache.set(cacheKey, pitchClasses);
                return pitchClasses;
            } else {
                console.warn(`[HME._getCachedScaleNotes] No scale notes returned from service for ${tonicName} ${scaleId}.`);
                this._scaleCache.set(cacheKey, null); // Cache null to prevent repeated failed calls for same key
                return null;
            }
        } catch (error) {
            console.error(`[HME._getCachedScaleNotes] Error fetching scale notes for ${tonicName} ${scaleId}:`, error);
            this._scaleCache.set(cacheKey, null); // Cache null on error
            return null;
        }
    },

    /**
     * Analyzes the current musical context based on active notes and rocket mode settings.
     * @param {Array<{midiNote: number, name?: string}>} activeNotes - Array of active notes.
     *        Each note object MUST have `midiNote`. `name` is optional but preferred.
     * @param {object} analysisContext - Context from RocketModeStrategy.
     *        - tonicMidi: MIDI number of the current scale's tonic.
     *        - scaleId: ID of the current scale (e.g., "major").
     *        - settings: app.state.rocketModeSettings (для доступа к настройкам, если понадобятся).
     *        - currentPhase: текущая фаза Rocket Mode.
     * @returns {object} - Object with analysis results:
     *      {
     *          isPlayingChord: boolean,
     *          detectedChordSymbol: string | null,
     *          detectedChordDetails: object | null, // Tonal.Chord.get() object
     *          currentHarmonicFunction: string | null, // e.g., "T (I)", "D (V)"
     *          activeNotePitchClasses: Array<string>, // e.g., ["C", "E", "G"]
     *          scaleNotesPitchClasses: Array<string> | null, // e.g., ["C", "D", "E", "F", "G", "A", "B"] for C Major
     *          scaleTonicPc: string | null, // e.g., "C"
     *          isDiatonic: boolean // True if all active notes belong to the current scale
     *      }
     */
    async analyzeContext(activeNotes, analysisContext) {
        if (!this.isInitialized) {
            console.warn("[HME.analyzeContext] Not initialized. Call init() first.");
            return this._getDefaultAnalysisResult();
        }
        if (!activeNotes || !Array.isArray(activeNotes) || !analysisContext ||
            analysisContext.tonicMidi === undefined || !analysisContext.scaleId) {
            console.warn("[HME.analyzeContext] Invalid arguments. activeNotes:", activeNotes, "analysisContext:", analysisContext);
            return this._getDefaultAnalysisResult();
        }

        if (this._debug) {
            console.log(`[HME.analyzeContext] INPUT - Active Notes (count: ${activeNotes.length}):`, JSON.parse(JSON.stringify(activeNotes.map(n => n.midiNote))));
            console.log(`[HME.analyzeContext] INPUT - Context: Tonic MIDI=${analysisContext.tonicMidi}, Scale=${analysisContext.scaleId}`);
        }

        const result = this._getDefaultAnalysisResult();

        // 1. Получаем детали активных нот и их pitch classes
        const activeNoteDetails = activeNotes
            .map(note => {
                // Если имя не передано, получаем его из MIDI
                const name = note.name || this.musicTheoryServiceRef.midiToNoteName(note.midiNote);
                return this.musicTheoryServiceRef.getNoteDetails(name); // getNoteDetails может принять и MIDI
            })
            .filter(Boolean); // Убираем null, если getNoteDetails не смог определить ноту

        if (activeNoteDetails.length === 0 && activeNotes.length > 0) {
            console.warn("[HME.analyzeContext] No valid note details could be derived from activeNotes.");
            return result;
        }

        result.activeNotePitchClasses = activeNoteDetails.map(detail => detail.pc).sort();
        if (this._debug) console.log("[HME.analyzeContext] Active Pitch Classes:", result.activeNotePitchClasses);

        // 2. Определяем аккорд, если нот достаточно
        if (result.activeNotePitchClasses.length >= 2) {
            if (this.musicTheoryServiceRef._TonalChord && typeof this.musicTheoryServiceRef._TonalChord.detect === 'function') {
                const possibleChords = this.musicTheoryServiceRef._TonalChord.detect(result.activeNotePitchClasses);
                if (this._debug) console.log("[HME.analyzeContext] Tonal.Chord.detect found:", possibleChords);

                if (possibleChords && possibleChords.length > 0) {
                    result.detectedChordSymbol = possibleChords.sort((a, b) => a.length - b.length)[0];
                    if (result.detectedChordSymbol) {
                        try {
                            result.detectedChordDetails = this.musicTheoryServiceRef._TonalChord.get(result.detectedChordSymbol);
                            result.isPlayingChord = !result.detectedChordDetails.empty;
                            if (this._debug) console.log(`[HME.analyzeContext] Detected Chord: ${result.detectedChordSymbol}, Is Playing Chord: ${result.isPlayingChord}, Details:`, result.detectedChordDetails);
                        } catch (e) {
                            console.warn(`[HME.analyzeContext] Error getting chord details for ${result.detectedChordSymbol}:`, e);
                            result.detectedChordSymbol = null;
                            result.detectedChordDetails = null;
                            result.isPlayingChord = false;
                        }
                    }
                }
            } else {
                console.warn("[HME.analyzeContext] Tonal.Chord or Tonal.Chord.detect is not available.");
            }
        } else if (result.activeNotePitchClasses.length === 1) {
            result.isPlayingChord = false;
            if (this._debug) console.log("[HME.analyzeContext] Single active note. Not a chord.");
        }

        // 3. Анализ в контексте тональности и лада
        const tonicNoteDetails = this.musicTheoryServiceRef.getNoteDetails(analysisContext.tonicMidi);
        if (tonicNoteDetails) {
            result.scaleTonicPc = tonicNoteDetails.pc;
            if (result.scaleTonicPc && analysisContext.scaleId) {
                // Используем кэширующий метод для получения pitch classes нот лада
                result.scaleNotesPitchClasses = await this._getCachedScaleNotes(tonicNoteDetails.name, analysisContext.scaleId);

                if (result.scaleNotesPitchClasses && result.scaleNotesPitchClasses.length > 0) {
                    if (this._debug) console.log(`[HME.analyzeContext] Scale Notes PCs from _getCachedScaleNotes for ${tonicNoteDetails.name} ${analysisContext.scaleId}:`, result.scaleNotesPitchClasses);

                    if (result.activeNotePitchClasses.length > 0) {
                        result.isDiatonic = result.activeNotePitchClasses.every(pc => result.scaleNotesPitchClasses.includes(pc));
                    } else {
                        result.isDiatonic = true; // No active notes are considered diatonic by default
                    }

                    if (result.isPlayingChord && result.detectedChordDetails?.tonic) {
                        result.currentHarmonicFunction = this._getChordHarmonicFunction(result.detectedChordDetails, result.scaleTonicPc, result.scaleNotesPitchClasses, analysisContext);
                    } else if (result.activeNotePitchClasses.length === 1) {
                        result.currentHarmonicFunction = this._getNoteHarmonicFunction(result.activeNotePitchClasses[0], result.scaleTonicPc, result.scaleNotesPitchClasses);
                    }
                    if (this._debug) console.log("[HME.analyzeContext] Current Harmonic Function:", result.currentHarmonicFunction);
                } else {
                    console.warn(`[HME.analyzeContext] Could not get scale notes (cached or fetched) for ${tonicNoteDetails.name} ${analysisContext.scaleId}. Analysis will be limited.`);
                    // result.scaleNotesPitchClasses is already null from _getCachedScaleNotes in this case
                    result.isDiatonic = false;
                    result.currentHarmonicFunction = null;
                }
            } else {
                console.warn(`[HME.analyzeContext] Tonic details or scaleId missing. scaleTonicPc: ${result.scaleTonicPc}, scaleId: ${analysisContext.scaleId}`);
            }
        } else {
            console.warn(`[HME.analyzeContext] Could not get details for tonic MIDI: ${analysisContext.tonicMidi}`);
        }
        if (this._debug) console.log("[HME.analyzeContext] OUTPUT - Analysis Result:", JSON.parse(JSON.stringify(result)));
        return result;
    },

    /**
     * Возвращает объект с дефолтными значениями для результата анализа.
     */
    _getDefaultAnalysisResult() {
        return {
            isPlayingChord: false,
            detectedChordSymbol: null,
            detectedChordDetails: null,
            currentHarmonicFunction: null,
            activeNotePitchClasses: [],
            scaleNotesPitchClasses: null,
            scaleTonicPc: null,
            isDiatonic: false
        };
    },

    /**
     * Определяет гармоническую функцию аккорда в контексте лада.
     */
    _getChordHarmonicFunction(chordDetails, scaleTonicPc, scaleNotesPc, analysisContext) {
        if (!this.isInitialized || !chordDetails || !chordDetails.tonic || !scaleTonicPc ||
            !scaleNotesPc || // Ensure scaleNotesPc is provided and valid
            !this.musicTheoryServiceRef._TonalNote || !this.musicTheoryServiceRef._TonalInterval || !this.musicTheoryServiceRef._TonalRomanNumeral) {
            if (this._debug) console.warn("[HME._getChordHarmonicFunction] Missing dependencies or invalid args (scaleNotesPc might be null).", { chordDetails, scaleTonicPc, scaleNotesPcProvided: !!scaleNotesPc });
            return null;
        }
         if (scaleNotesPc.length === 0) { // Explicit check for empty scale notes array
            if (this._debug) console.warn("[HME._getChordHarmonicFunction] scaleNotesPc is empty. Cannot determine function.");
            return null;
        }


        try {
            const chordRootPc = this.musicTheoryServiceRef._TonalNote.simplify(chordDetails.tonic);
            const intervalFromScaleTonic = this.musicTheoryServiceRef._TonalInterval.between(scaleTonicPc, chordRootPc);

            if (!intervalFromScaleTonic) {
                const firstDiatonicNoteInChord = chordDetails.notes.find(notePc =>
                    scaleNotesPc.includes(this.musicTheoryServiceRef._TonalNote.simplify(notePc))
                );
                if (firstDiatonicNoteInChord) {
                    const degreeIndex = scaleNotesPc.indexOf(this.musicTheoryServiceRef._TonalNote.simplify(firstDiatonicNoteInChord));
                    return `Variant (contains ${this._degreeToRoman(degreeIndex + 1)})`;
                }
                return "Non-Diatonic";
            }

            const stepName = this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic) + (this.musicTheoryServiceRef._TonalInterval.alt(intervalFromScaleTonic) || '');
            let chordTypeForRoman = "";
            const type = chordDetails.type.toLowerCase();
                 if (type.includes("maj7")) chordTypeForRoman = "M7";
            else if (type.includes("m7")) chordTypeForRoman = "m7";
            else if (type.includes("7")) chordTypeForRoman = "7";
            else if (type.includes("m")) chordTypeForRoman = "m";
            else if (type.includes("dim")) chordTypeForRoman = "dim";
            else if (type.includes("aug")) chordTypeForRoman = "aug";

            let romanNumeralString = null;
            if(this.musicTheoryServiceRef._TonalChord && typeof this.musicTheoryServiceRef._TonalChord.romanNumeral === 'function') {
                try {
                    const isMajorScale = analysisContext.scaleId.toLowerCase().includes("major") || analysisContext.scaleId.toLowerCase().includes("lydian") || analysisContext.scaleId.toLowerCase().includes("mixolydian");
                    romanNumeralString = this.musicTheoryServiceRef._TonalChord.romanNumeral(chordDetails.symbol, scaleTonicPc, isMajorScale).name;
                } catch(e) { /* ignore, try fallback */ }
            }

            if (!romanNumeralString) {
                romanNumeralString = this._degreeToRoman(this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic)) + chordTypeForRoman;
            }

            const degreeNum = this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic);
            switch (degreeNum) {
                case 1: return `T (${romanNumeralString})`;
                case 4: return `S (${romanNumeralString})`;
                case 5: return `D (${romanNumeralString})`;
                case 2: return `Sp (${romanNumeralString})`;
                case 6: return `Tp (${romanNumeralString})`;
                case 3: return `Tx (${romanNumeralString})`;
                case 7: return `L (${romanNumeralString})`;
                default: return romanNumeralString || "Unknown";
            }

        } catch (e) {
            console.error("[HME._getChordHarmonicFunction] Error:", e);
            const degreeIndex = scaleNotesPc.indexOf(this.musicTheoryServiceRef._TonalNote.simplify(chordDetails.tonic));
            if (degreeIndex !== -1) return this._degreeToFunction(degreeIndex + 1, chordDetails.type || "chord");
            return "Unknown Chord Function";
        }
    },

    /**
     * Определяет гармоническую функцию одиночной ноты в контексте лада.
     */
    _getNoteHarmonicFunction(notePc, scaleTonicPc, scaleNotesPc) {
        if (!this.isInitialized || !notePc || !scaleTonicPc ||
            !scaleNotesPc || // Ensure scaleNotesPc is provided and valid
            !this.musicTheoryServiceRef._TonalNote) {
            if (this._debug) console.warn("[HME._getNoteHarmonicFunction] Missing dependencies or invalid args (scaleNotesPc might be null).");
            return null;
        }
        if (scaleNotesPc.length === 0) { // Explicit check for empty scale notes array
             if (this._debug) console.warn("[HME._getNoteHarmonicFunction] scaleNotesPc is empty. Cannot determine function.");
            return null;
        }

        const simplifiedNotePc = this.musicTheoryServiceRef._TonalNote.simplify(notePc);
        const degreeIndex = scaleNotesPc.indexOf(simplifiedNotePc);
        if (degreeIndex !== -1) {
            return this._degreeToFunction(degreeIndex + 1, "note");
        }
        return "Chromatic Note";
    },

    /**
     * Преобразует номер ступени (1-7) в римскую цифру.
     */
    _degreeToRoman(degree) {
        const numerals = ["I", "II", "III", "IV", "V", "VI", "VII"];
        return numerals[degree - 1] || degree.toString();
    },

    /**
     * Преобразует номер ступени и тип аккорда/ноты в метку гармонической функции.
     */
    _degreeToFunction(degree, chordTypeOrNote = "note") {
        const roman = this._degreeToRoman(degree);
        let quality = "";
        if (chordTypeOrNote !== "note" && typeof chordTypeOrNote === 'string') {
            const type = chordTypeOrNote.toLowerCase();
                 if (type.includes("major") || type.match(/^M/) || type === "") quality = "";
            else if (type.includes("minor") || type.match(/^m[^a]/)) quality = "m";
            else if (type.includes("dim")) quality = "°";
            else if (type.includes("aug")) quality = "+";
                 if (type.includes("maj7")) quality = "maj7";
            else if (type.includes("m7") && !type.includes("maj7")) quality = "m7";
            else if (type.includes("7") && !type.includes("maj7") && !type.includes("m7")) quality = "7";
        }

        switch (degree) {
            case 1: return `T (${roman}${quality})`;
            case 4: return `S (${roman}${quality})`;
            case 5: return `D (${roman}${quality})`;
            case 2: return `Sp (${roman}${quality})`;
            case 6: return `Tp (${roman}${quality})`;
            case 3: return `Tx (${roman}${quality})`;
            case 7: return `L (${roman}${quality})`;
            default: return `Degree ${degree}`;
        }
    }
};

// Для доступа из других модулей, если app.js еще не инициализировал все ссылки
// window.harmonicMarkerEngine = harmonicMarkerEngine;