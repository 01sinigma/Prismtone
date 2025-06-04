// File: assets/js/harmonicMarkerEngine.js
// Harmonic Marker Engine - Core for musical context analysis.
// Версия для Фазы 1

console.log("[HME v1.0] harmonicMarkerEngine.js loaded");

const harmonicMarkerEngine = {
    musicTheoryServiceRef: null,
    isInitialized: false,
    _debug: true, // Флаг для подробного логирования внутри движка

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
        console.log(`[HME.init] Initialized. MusicTheoryService Ready: ${this.musicTheoryServiceRef.isTonalJsLoaded}`);
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
            // Возвращаем дефолтный результат, если не удалось получить детали ни для одной ноты
            return result;
        }

        result.activeNotePitchClasses = activeNoteDetails.map(detail => detail.pc).sort();
        if (this._debug) console.log("[HME.analyzeContext] Active Pitch Classes:", result.activeNotePitchClasses);

        // 2. Определяем аккорд, если нот достаточно
        if (result.activeNotePitchClasses.length >= 2) { // Минимум 2 ноты для попытки определения аккорда
            if (this.musicTheoryServiceRef._TonalChord && typeof this.musicTheoryServiceRef._TonalChord.detect === 'function') {
                const possibleChords = this.musicTheoryServiceRef._TonalChord.detect(result.activeNotePitchClasses);
                if (this._debug) console.log("[HME.analyzeContext] Tonal.Chord.detect found:", possibleChords);

                if (possibleChords && possibleChords.length > 0) {
                    // Выбираем "лучший" аккорд (самый простой или первый из списка)
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
            result.isPlayingChord = false; // Одна нота - не аккорд
            if (this._debug) console.log("[HME.analyzeContext] Single active note. Not a chord.");
        }

        // 3. Анализ в контексте тональности и лада
        const tonicNoteDetails = this.musicTheoryServiceRef.getNoteDetails(analysisContext.tonicMidi);
        if (tonicNoteDetails) {
            result.scaleTonicPc = tonicNoteDetails.pc;
            if (result.scaleTonicPc && analysisContext.scaleId) {
                try {
                    // Используем MusicTheoryService для получения нот лада ОТНОСИТЕЛЬНО ТОНИКИ ЛАДА
                    // scaleId здесь - это тип лада, например, "major", "blues"
                    // tonicNoteDetails.name - это полная нота тоники с октавой, например "C4"
                    const scaleNotesDetails = await this.musicTheoryServiceRef.getNotesForScale(
                        tonicNoteDetails.name, // Передаем имя тоники с октавой
                        analysisContext.scaleId,
                        0, // octavesToScanBefore - достаточно 0 для получения базового набора pc
                        0  // octavesToScanAfter - достаточно 0 для получения базового набора pc
                    );
                    if (scaleNotesDetails && scaleNotesDetails.length > 0) {
                        result.scaleNotesPitchClasses = scaleNotesDetails.map(n => n.pc);
                        if (this._debug) console.log(`[HME.analyzeContext] Scale Notes PCs from MTS for ${tonicNoteDetails.name} ${analysisContext.scaleId}:`, result.scaleNotesPitchClasses);
                        // Теперь логика isDiatonic и currentHarmonicFunction должна работать с этим
                        if (result.activeNotePitchClasses.length > 0) {
                            result.isDiatonic = result.activeNotePitchClasses.every(pc => result.scaleNotesPitchClasses.includes(pc));
                        } else {
                            result.isDiatonic = true;
                        }
                        if (result.isPlayingChord && result.detectedChordDetails?.tonic) {
                            result.currentHarmonicFunction = this._getChordHarmonicFunction(result.detectedChordDetails, result.scaleTonicPc, result.scaleNotesPitchClasses, analysisContext);
                        } else if (result.activeNotePitchClasses.length === 1) {
                            result.currentHarmonicFunction = this._getNoteHarmonicFunction(result.activeNotePitchClasses[0], result.scaleTonicPc, result.scaleNotesPitchClasses);
                        }
                        if (this._debug) console.log("[HME.analyzeContext] Current Harmonic Function (after fix):", result.currentHarmonicFunction);
                    } else {
                        console.warn(`[HME.analyzeContext] Could not get scale notes from MTS for ${tonicNoteDetails.name} ${analysisContext.scaleId}. Analysis will be limited.`);
                        result.scaleNotesPitchClasses = null; // Явно указываем, что ноты лада неизвестны
                        result.isDiatonic = false;
                        result.currentHarmonicFunction = null;
                    }
                } catch (e) {
                    console.warn(`[HME.analyzeContext] Error in getNotesForScale:`, e);
                    result.scaleNotesPitchClasses = null;
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
     * (Копипаста из вашего плана Фазы 1, с небольшими адаптациями и проверками)
     */
    _getChordHarmonicFunction(chordDetails, scaleTonicPc, scaleNotesPc, analysisContext) {
        if (!this.isInitialized || !chordDetails || !chordDetails.tonic || !scaleTonicPc || !scaleNotesPc ||
            !this.musicTheoryServiceRef._TonalNote || !this.musicTheoryServiceRef._TonalInterval || !this.musicTheoryServiceRef._TonalRomanNumeral) {
            if (this._debug) console.warn("[HME._getChordHarmonicFunction] Missing dependencies or invalid args.");
            return null;
        }

        try {
            const chordRootPc = this.musicTheoryServiceRef._TonalNote.simplify(chordDetails.tonic);
            // Интервал от тоники лада до корня аккорда
            const intervalFromScaleTonic = this.musicTheoryServiceRef._TonalInterval.between(scaleTonicPc, chordRootPc);

            if (!intervalFromScaleTonic) {
                // Попытка найти первую диатоническую ноту в аккорде, если корень не в ладу
                const firstDiatonicNoteInChord = chordDetails.notes.find(notePc =>
                    scaleNotesPc.includes(this.musicTheoryServiceRef._TonalNote.simplify(notePc))
                );
                if (firstDiatonicNoteInChord) {
                    const degreeIndex = scaleNotesPc.indexOf(this.musicTheoryServiceRef._TonalNote.simplify(firstDiatonicNoteInChord));
                    return `Variant (contains ${this._degreeToRoman(degreeIndex + 1)})`;
                }
                return "Non-Diatonic";
            }

            // Пытаемся получить римскую цифру
            // Tonal.RomanNumeral.get() ожидает интервал ИЛИ имя ступени (1, 2, #2, b3...)
            // Мы будем использовать имя ступени, полученное из интервала
            const stepName = this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic) + (this.musicTheoryServiceRef._TonalInterval.alt(intervalFromScaleTonic) || '');

            let chordTypeForRoman = ""; // Tonal.RomanNumeral.get не всегда хорошо работает с полным типом
            const type = chordDetails.type.toLowerCase();
                 if (type.includes("maj7")) chordTypeForRoman = "M7"; // M7 для major seventh
            else if (type.includes("m7")) chordTypeForRoman = "m7";   // m7 для minor seventh
            else if (type.includes("7")) chordTypeForRoman = "7";     // 7 для dominant seventh
            else if (type.includes("m")) chordTypeForRoman = "m";
            else if (type.includes("dim")) chordTypeForRoman = "dim"; // или °
            else if (type.includes("aug")) chordTypeForRoman = "aug"; // или +

            // Tonal.RomanNumeral.get (в Tonal.js > 4.x) может не иметь .get()
            // Вместо этого, Tonal.Degree.romanNumeral(degree, isMajor)
            // Или Tonal.Chord.romanNumeral(chordSymbol, keySignature, isMajor)
            // Пока оставим упрощенный вариант, который может потребовать доработки
            // в зависимости от точной версии Tonal.js и ее API.
            // Попробуем через Tonal.Chord.romanNumeral, если доступно
            let romanNumeralString = null;
            if(this.musicTheoryServiceRef._TonalChord && typeof this.musicTheoryServiceRef._TonalChord.romanNumeral === 'function') {
                try {
                    // Пытаемся определить, мажорный ли лад
                    const isMajorScale = analysisContext.scaleId.toLowerCase().includes("major") || analysisContext.scaleId.toLowerCase().includes("lydian") || analysisContext.scaleId.toLowerCase().includes("mixolydian");
                    romanNumeralString = this.musicTheoryServiceRef._TonalChord.romanNumeral(chordDetails.symbol, scaleTonicPc, isMajorScale).name;
                } catch(e) { /* ignore, try fallback */ }
            }

            if (!romanNumeralString) { // Fallback, если Tonal.Chord.romanNumeral не сработал или недоступен
                romanNumeralString = this._degreeToRoman(this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic)) + chordTypeForRoman;
            }

            // Преобразование римской цифры в основную функцию (T, S, D)
            const degreeNum = this.musicTheoryServiceRef._TonalInterval.num(intervalFromScaleTonic);
            switch (degreeNum) {
                case 1: return `T (${romanNumeralString})`;
                case 4: return `S (${romanNumeralString})`;
                case 5: return `D (${romanNumeralString})`;
                case 2: return `Sp (${romanNumeralString})`; // Subdominant Parallel / Supertonic
                case 6: return `Tp (${romanNumeralString})`; // Tonic Parallel / Submediant
                case 3: return `Tx (${romanNumeralString})`; // Mediant (может быть T или D в зависимости от контекста)
                case 7: return `L (${romanNumeralString})`;  // Leading Tone (часть D)
                default: return romanNumeralString || "Unknown";
            }

        } catch (e) {
            console.error("[HME._getChordHarmonicFunction] Error:", e);
            // Фоллбэк на простую ступень, если что-то пошло не так
            const degreeIndex = scaleNotesPc.indexOf(this.musicTheoryServiceRef._TonalNote.simplify(chordDetails.tonic));
            if (degreeIndex !== -1) return this._degreeToFunction(degreeIndex + 1, chordDetails.type || "chord");
            return "Unknown Chord Function";
        }
    },

    /**
     * Определяет гармоническую функцию одиночной ноты в контексте лада.
     */
    _getNoteHarmonicFunction(notePc, scaleTonicPc, scaleNotesPc) {
        if (!this.isInitialized || !notePc || !scaleTonicPc || !scaleNotesPc ||
            !this.musicTheoryServiceRef._TonalNote) {
            if (this._debug) console.warn("[HME._getNoteHarmonicFunction] Missing dependencies or invalid args.");
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
        // Определение качества аккорда (мажор, минор, и т.д.)
        if (chordTypeOrNote !== "note" && typeof chordTypeOrNote === 'string') {
            const type = chordTypeOrNote.toLowerCase();
                 if (type.includes("major") || type.match(/^M/) || type === "") quality = "";  // Пусто для мажора
            else if (type.includes("minor") || type.match(/^m[^a]/)) quality = "m";
            else if (type.includes("dim")) quality = "°";
            else if (type.includes("aug")) quality = "+";
            // Добавление септаккордов
                 if (type.includes("maj7")) quality = "maj7"; // Major 7th
            else if (type.includes("m7") && !type.includes("maj7")) quality = "m7"; // Minor 7th
            else if (type.includes("7") && !type.includes("maj7") && !type.includes("m7")) quality = "7"; // Dominant 7th
            // Другие типы септаккордов можно добавить по аналогии (m7b5, dim7, etc.)
        }

        // Определение основной функции по ступени
        switch (degree) {
            case 1: return `T (${roman}${quality})`;  // Тоника
            case 4: return `S (${roman}${quality})`;  // Субдоминанта
            case 5: return `D (${roman}${quality})`;  // Доминанта
            case 2: return `Sp (${roman}${quality})`; // Субдоминантовая параллель / Супертоника
            case 6: return `Tp (${roman}${quality})`; // Тоническая параллель / Субмедианта
            case 3: return `Tx (${roman}${quality})`; // Медианта (может быть T или D функцией)
            case 7: return `L (${roman}${quality})`;  // Вводный тон (часть D)
            default: return `Degree ${degree}`; // Если ступень вне 1-7
        }
    }
};

// Для доступа из других модулей, если app.js еще не инициализировал все ссылки
// window.harmonicMarkerEngine = harmonicMarkerEngine;