// Файл: app/src/main/assets/js/MusicTheoryService.js
// ВЕРСИЯ 2.5: Адаптация к Tonal.js без Tonal.Distance

console.log('[Pre-MTS v2.5] typeof Tonal:', typeof Tonal);
if (typeof Tonal !== 'undefined') {
    console.log('[Pre-MTS v2.5] Tonal object keys:', Object.keys(Tonal));
    console.log('[Pre-MTS v2.5] typeof Tonal.Note:', typeof Tonal.Note);
    console.log('[Pre-MTS v2.5] typeof Tonal.Scale:', typeof Tonal.Scale);
    console.log('[Pre-MTS v2.5] typeof Tonal.Interval:', typeof Tonal.Interval);
    console.log('[Pre-MTS v2.5] typeof Tonal.Distance:', typeof Tonal.Distance); // Ожидаем undefined
    console.log('[Pre-MTS v2.5] typeof Tonal.transpose:', typeof Tonal.transpose); // <--- НОВЫЙ ЛОГ
    if (Tonal.Note) {
        console.log('[Pre-MTS v2.5] typeof Tonal.Note.transpose:', typeof Tonal.Note.transpose); // <--- НОВЫЙ ЛОГ
    }
}

const MusicTheoryService = {
    isTonalJsLoaded: false,
    moduleManagerRef: null,
    scaleDefinitions: {},

    _TonalNote: null,
    _TonalScale: null,
    _TonalInterval: null,
    _TonalTransposeFn: null, // <--- НОВОЕ: для функции транспонирования

    async init(moduleManagerInstance) {
        this.moduleManagerRef = moduleManagerInstance;
        if (!this.moduleManagerRef) {
            console.error("[MusicTheoryService.init] moduleManager instance not provided!");
            this.isTonalJsLoaded = false; return;
        }

        if (typeof Tonal === 'object' && Tonal !== null) {
            this._TonalNote = Tonal.Note;
            this._TonalScale = Tonal.Scale;
            this._TonalInterval = Tonal.Interval;

            // Ищем функцию транспонирования
            if (typeof Tonal.transpose === 'function') {
                this._TonalTransposeFn = Tonal.transpose;
                console.log("[MTS.init] Using Tonal.transpose");
            } else if (this._TonalNote && typeof this._TonalNote.transpose === 'function') {
                this._TonalTransposeFn = this._TonalNote.transpose;
                console.log("[MTS.init] Using Tonal.Note.transpose");
            } else if (Tonal.Distance && typeof Tonal.Distance.transpose === 'function') { // Оставим на всякий случай
                this._TonalTransposeFn = Tonal.Distance.transpose;
                console.log("[MTS.init] Using Tonal.Distance.transpose");
            }

            this.isTonalJsLoaded =
                typeof this._TonalNote === 'object' && this._TonalNote !== null && typeof this._TonalNote.get === 'function' &&
                typeof this._TonalScale === 'object' && this._TonalScale !== null && typeof this._TonalScale.get === 'function' &&
                typeof this._TonalInterval === 'object' && this._TonalInterval !== null && typeof this._TonalInterval.semitones === 'function' &&
                typeof this._TonalTransposeFn === 'function'; // <--- ИЗМЕНЕНО: Проверяем _TonalTransposeFn

        } else {
            this.isTonalJsLoaded = false;
        }

        if (!this.isTonalJsLoaded) {
            console.error("[MusicTheoryService.init v2.5] Tonal.js or its required sub-modules/transpose function are NOT correctly loaded/structured!");
            console.error(`[MTS Debug] Tonal: ${typeof Tonal}, Note: ${typeof Tonal?.Note}, Scale: ${typeof Tonal?.Scale}, Interval: ${typeof Tonal?.Interval}, TransposeFn: ${typeof this._TonalTransposeFn}`);
        } else {
            const tonalVersion = Tonal.VERSION || "unknown (VERSION prop missing)";
            console.log(`[MusicTheoryService v2.5] Initialized. Tonal.js version: ${tonalVersion}. isTonalJsLoaded: ${this.isTonalJsLoaded}`);
        }
        await this.loadScaleDefinitions();
    },

    async loadScaleDefinitions() {
        if (!this.moduleManagerRef) {
            console.error("[MusicTheoryService.loadScaleDefinitions] moduleManagerRef is not set.");
            return;
        }
        console.log("[MusicTheoryService] Loading scale definitions...");
        this.scaleDefinitions = {};
        try {
            const scaleModules = await this.moduleManagerRef.getModules('scale', true);
            console.log("[MTS.loadScaleDefinitions] Received scaleModules:", scaleModules ? JSON.stringify(scaleModules.map(m => m.id)) : 'null');
            if (Array.isArray(scaleModules)) {
                scaleModules.forEach(mod => {
                    if (mod?.id && mod.data?.data?.intervals && Array.isArray(mod.data.data.intervals)) {
                        const intervalsAreNumbers = mod.data.data.intervals.every(i => typeof i === 'number');
                        if (intervalsAreNumbers) {
                            this.scaleDefinitions[mod.id] = mod.data.data.intervals;
                        } else {
                            console.warn(`[MTS] Scale module '${mod.id}' has non-numeric intervals.`);
                        }
                    }
                });
                console.log(`[MusicTheoryService] Loaded ${Object.keys(this.scaleDefinitions).length} scale definitions:`, JSON.parse(JSON.stringify(this.scaleDefinitions)));
            }
        } catch (error) { console.error("[MusicTheoryService] Error loading scale definitions:", error); }
    },

    getNoteDetails(noteNameOrMidi) {
        if (!this.isTonalJsLoaded || !this._TonalNote) return null;
        try {
            const note = this._TonalNote.get(noteNameOrMidi);
            if (note && note.name && typeof note.midi === 'number' && typeof note.freq === 'number') {
                note.isSharpFlat = note.acc !== "";
                return note;
            }
            return null;
        } catch (e) { return null; }
    },

    async getNotesForScale(tonicNameWithOctave, scaleId, octavesToScanBefore = 2, octavesToScanAfter = 2) {
        if (!this.isTonalJsLoaded) { // Теперь проверяет и _TonalTransposeFn
            console.error("[MTS.getNotesForScale v2.5] Tonal.js or its required modules not loaded.");
            return null;
        }
        console.log(`[MTS.getNotesForScale v2.5] Input: tonic=${tonicNameWithOctave}, scaleId=${scaleId}`);

        const intervals = this.scaleDefinitions[scaleId];
        if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
            // ... (фоллбэк на Tonal.Scale.get(scaleId).intervals как раньше, используя this._TonalInterval.semitones) ...
            console.warn(`[MTS.getNotesForScale v2.5] Intervals for scale ID '${scaleId}' not found in definitions.`);
            if (this._TonalScale && typeof this._TonalScale.get === 'function' && this._TonalInterval && typeof this._TonalInterval.semitones === 'function') {
                const scaleTypeData = this._TonalScale.get(scaleId);
                if (scaleTypeData && !scaleTypeData.empty && Array.isArray(scaleTypeData.intervals)) {
                    console.log(`[MTS.getNotesForScale v2.5] Using intervals from Tonal.Scale.get("${scaleId}"):`, scaleTypeData.intervals);
                    try {
                        const semitoneIntervals = scaleTypeData.intervals.map(ivl => this._TonalInterval.semitones(ivl)).filter(s => typeof s === 'number');
                        if (semitoneIntervals.length > 0) {
                            this.scaleDefinitions[scaleId] = semitoneIntervals; // Кэшируем
                            return this._generateNotesFromIntervals(tonicNameWithOctave, semitoneIntervals, octavesToScanBefore, octavesToScanAfter);
                        }
                    } catch (e) { console.error(`[MTS.getNotesForScale v2.5] Error converting Tonal intervals:`, e); }
                }
            }
            console.error(`[MTS.getNotesForScale v2.5] Cannot proceed without intervals for ${scaleId}.`);
            return null;
        }
        return this._generateNotesFromIntervals(tonicNameWithOctave, intervals, octavesToScanBefore, octavesToScanAfter);
    },

    _generateNotesFromIntervals(tonicNameWithOctave, intervalsInSemitones, octavesToScanBefore, octavesToScanAfter) {
        const tonicDetails = this.getNoteDetails(tonicNameWithOctave);
        if (!tonicDetails || !this._TonalInterval || !this._TonalTransposeFn) { // Проверяем _TonalTransposeFn
            console.error(`[MTS._generateNotesFromIntervals] Invalid tonic or missing Tonal modules: ${tonicNameWithOctave}`);
            return null;
        }

        const allNotes = [];
        const rootMidi = tonicDetails.midi;
        const startOctaveForLoop = tonicDetails.oct - octavesToScanBefore;
        const endOctaveForLoop = tonicDetails.oct + octavesToScanAfter;

        console.log(`[MTS._generateNotesFromIntervals v2.5] Tonic: ${tonicNameWithOctave} (MIDI: ${rootMidi}), Intervals: [${intervalsInSemitones.join(',')}]`);
        console.log(`[MTS._generateNotesFromIntervals v2.5] Generating octaves from ${startOctaveForLoop} to ${endOctaveForLoop}`);

        for (let oct = startOctaveForLoop; oct <= endOctaveForLoop; oct++) {
            intervalsInSemitones.forEach(semitoneOffsetFromRoot => {
                const intervalInSemitones = (oct - tonicDetails.oct) * 12 + semitoneOffsetFromRoot;
                const intervalName = this._TonalInterval.fromSemitones(intervalInSemitones);
                
                let noteName;
                try {
                    // Используем сохраненную функцию транспонирования
                    noteName = this._TonalTransposeFn(tonicNameWithOctave, intervalName);
                } catch (e) {
                    console.warn(`[MTS] Transpose failed for ${tonicNameWithOctave} by ${intervalName}, using MIDI fallback. Error:`, e);
                    const targetMidi = rootMidi + intervalInSemitones;
                    noteName = this._TonalNote.fromMidiSharps(targetMidi);
                }

                const details = this.getNoteDetails(noteName);
                if (details) {
                    allNotes.push(details);
                }
            });
        }

        const uniqueNotes = Array.from(new Map(allNotes.map(note => [note.midi, note])).values());
        uniqueNotes.sort((a, b) => a.midi - b.midi);

        console.log(`[MTS._generateNotesFromIntervals v2.5] Generated ${uniqueNotes.length} unique notes. First: ${uniqueNotes[0]?.name}, Last: ${uniqueNotes[uniqueNotes.length-1]?.name}`);
        return uniqueNotes;
    },

    isSharpOrFlat(noteName) {
        if (!this.isTonalJsLoaded || !this._TonalNote) return false;
        const details = this._TonalNote.get(noteName);
        return details && details.acc !== "";
    },
    midiToFrequency(midiNote) {
        if (!this.isTonalJsLoaded || !this._TonalNote || typeof midiNote !== 'number') return 0;
        return this._TonalNote.freq(midiNote);
    },
    midiToNoteName(midiNote) {
        if (!this.isTonalJsLoaded || !this._TonalNote || typeof midiNote !== 'number') return "?";
        return this._TonalNote.fromMidiSharps(midiNote);
    },
    getAvailableScaleIds() {
        return Object.keys(this.scaleDefinitions);
    },

    /**
     * Возвращает MIDI ноты, которые гармонически сочетаются с данной нотой в указанном строе.
     * @param {number} baseNoteMidi - MIDI значение базовой ноты.
     * @param {string} scaleId - ID строя.
     * @param {number} [count=3] - Максимальное количество предложений.
     * @param {Array<string>} [preferredIntervals=['P5', 'M3', 'P4', 'M6']] - Предпочтительные интервалы (Tonal.js формат).
     * @returns {Promise<Array<number>>} - Массив MIDI нот.
     */
    async getHarmonicSuggestions(baseNoteMidi, scaleId, count = 3, preferredIntervals = ['P5', 'M3', 'P4', 'M6']) {
        console.log(`[MTS.getHarmonicSuggestions] BaseMIDI: ${baseNoteMidi}, ScaleID: ${scaleId}, Count: ${count}, PrefIntervals:`, preferredIntervals);
        if (!this.isTonalJsLoaded || typeof baseNoteMidi !== 'number' || !scaleId) {
            console.log(`[MTS.getHarmonicSuggestions] Early return: TonalLoaded=${this.isTonalJsLoaded}, BaseMIDI type=${typeof baseNoteMidi}, ScaleID=${scaleId}`);
            return [];
        }

        const baseNoteName = Tonal.Note.fromMidi(baseNoteMidi);
        if (!baseNoteName) {
            console.log(`[MTS.getHarmonicSuggestions] Could not get note name from MIDI ${baseNoteMidi}`);
            return [];
        }
        console.log(`[MTS.getHarmonicSuggestions] Base note name: ${baseNoteName}`);

        const scaleNotes = await this.getNotesForScale(baseNoteName, scaleId, 0, 1); // Получаем ноты строя в текущей и следующей октаве
        if (!scaleNotes || scaleNotes.length === 0) {
            console.log(`[MTS.getHarmonicSuggestions] No scale notes found for ${baseNoteName} ${scaleId}`);
            return [];
        }
        console.log(`[MTS.getHarmonicSuggestions] Scale notes (${scaleNotes.length}):`, scaleNotes.map(n => `${n.name}(${n.midi})`));

        const suggestions = new Set(); // Используем Set для уникальности MIDI

        for (const intervalString of preferredIntervals) {
            if (suggestions.size >= count) break;
            try {
                const targetNoteName = Tonal.transpose(baseNoteName, intervalString); // Используем _TonalTransposeFn если есть
                console.log(`[MTS.getHarmonicSuggestions] Transposing ${baseNoteName} by ${intervalString} -> ${targetNoteName}`);
                const targetNoteDetails = this.getNoteDetails(targetNoteName);
                if (targetNoteDetails) {
                    // Проверяем, есть ли эта нота (или ее энгармонический эквивалент) в нашем строе (scaleNotes)
                    const isInScale = scaleNotes.some(scaleNote => scaleNote.midi === targetNoteDetails.midi);
                    console.log(`[MTS.getHarmonicSuggestions] Target ${targetNoteName}(${targetNoteDetails.midi}) in scale: ${isInScale}`);
                    if (isInScale) {
                        suggestions.add(targetNoteDetails.midi);
                        console.log(`[MTS.getHarmonicSuggestions] Added ${targetNoteDetails.midi} to suggestions`);
                    } else {
                        // Если точного совпадения нет, ищем ближайшую ноту строя к предложенной
                        let closestInScaleMidi = null;
                        let minDiff = Infinity;
                        scaleNotes.forEach(scaleNote => {
                            const diff = Math.abs(scaleNote.midi - targetNoteDetails.midi);
                            const isSamePc = (scaleNote.midi % 12) === (targetNoteDetails.midi % 12);
                            const effectiveDiff = isSamePc ? diff / 120 : diff;
                            if (effectiveDiff < minDiff) {
                                minDiff = effectiveDiff;
                                closestInScaleMidi = scaleNote.midi;
                            }
                        });
                        if (closestInScaleMidi !== null && minDiff <= 2) {
                            suggestions.add(closestInScaleMidi);
                            console.log(`[MTS.getHarmonicSuggestions] Added closest ${closestInScaleMidi} (diff: ${minDiff}) to suggestions`);
                        }
                    }
                }
            } catch (e) {
                console.warn(`[MTS.getHarmonicSuggestions] Error transposing by ${intervalString} from ${baseNoteName}:`, e.message);
            }
        }
        // Если не набрали достаточно, можно добавить просто следующие ноты строя
        if (suggestions.size < count) {
            const baseNoteIndexInScale = scaleNotes.findIndex(n => n.midi === baseNoteMidi);
            console.log(`[MTS.getHarmonicSuggestions] Base note index in scale: ${baseNoteIndexInScale}`);
            if (baseNoteIndexInScale !== -1) {
                for (let i = 1; i <= count - suggestions.size; i++) {
                    const nextNoteIndex = (baseNoteIndexInScale + i) % scaleNotes.length;
                    if (scaleNotes[nextNoteIndex]) {
                        suggestions.add(scaleNotes[nextNoteIndex].midi);
                        console.log(`[MTS.getHarmonicSuggestions] Added next scale note ${scaleNotes[nextNoteIndex].midi} to suggestions`);
                    }
                }
            }
        }
        const result = Array.from(suggestions).slice(0, count);
        console.log(`[MTS.getHarmonicSuggestions] Returning suggestions (MIDI):`, result);
        return result;
    },

    /**
     * Возвращает MIDI ноты, классифицированные по гармоническим функциям T/S/D.
     * @param {number} baseNoteMidi - MIDI значение текущей активной ноты.
     * @param {string} scaleId - ID текущего строя (например, "major", "minor").
     * @param {object} [options={}] - Опции.
     * @param {number} [options.countPerFunction=1] - Сколько нот для каждой функции пытаться найти.
     * @param {boolean} [options.includeBaseAsTonic=true] - Включать ли саму baseNoteMidi в тонические предложения.
     * @returns {Promise<Array<{midi: number, name: string, function: 'T' | 'S' | 'D'}>>}
     */
    async getFunctionalHarmonySuggestions(baseNoteMidi, scaleId, options = {}) {
        if (!this.isTonalJsLoaded || typeof baseNoteMidi !== 'number' || !scaleId) {
            console.warn("[MTS.getFunctionalHarmonySuggestions] Invalid input or Tonal.js not loaded.");
            return [];
        }

        const settings = {
            countPerFunction: 1,
            includeBaseAsTonic: true,
            ...options
        };

        const baseNoteName = Tonal.Note.fromMidi(baseNoteMidi);
        if (!baseNoteName) return [];

        const tonicName = Tonal.Note.pitchClass(app.state.currentTonic || "C4");
        const scaleInfo = Tonal.Scale.get(`${tonicName} ${scaleId}`);
        if (scaleInfo.empty) {
            console.warn(`[MTS.getFunctionalHarmonySuggestions] Scale info not found for ${tonicName} ${scaleId}`);
            return [];
        }
        const scalePCs = scaleInfo.notes;

        const suggestions = [];
        const addedMidi = new Set();
        const addSuggestion = (midi, name, func) => {
            if (midi !== null && !addedMidi.has(midi) && suggestions.filter(s => s.function === func).length < settings.countPerFunction) {
                suggestions.push({ midi, name, function: func });
                addedMidi.add(midi);
            }
        };

        // 1. ТОНИЧЕСКИЕ (T)
        if (settings.includeBaseAsTonic) {
            const baseNoteDetails = this.getNoteDetails(baseNoteMidi);
            if (baseNoteDetails && scalePCs.includes(Tonal.Note.pitchClass(baseNoteDetails.name))) {
                addSuggestion(baseNoteMidi, baseNoteName, 'T');
            }
        }
        const globalTonicDetails = this.getNoteDetails(app.state.currentTonic);
        if (globalTonicDetails && globalTonicDetails.midi !== baseNoteMidi) addSuggestion(globalTonicDetails.midi, globalTonicDetails.name, 'T');
        try {
            const tonicFifthName = Tonal.transpose(globalTonicDetails.name, "P5");
            const tonicFifthDetails = this.getNoteDetails(tonicFifthName);
            if (tonicFifthDetails && tonicFifthDetails.midi !== baseNoteMidi && scalePCs.includes(Tonal.Note.pitchClass(tonicFifthDetails.name))) {
                addSuggestion(tonicFifthDetails.midi, tonicFifthDetails.name, 'T');
            }
        } catch(e) { /* ignore transpose error */ }

        // 2. ДОМИНАНТОВЫЕ (D)
        try {
            const dominantRootName = Tonal.transpose(tonicName, "P5");
            const dominantChordNotes = Tonal.Chord.get(`${dominantRootName}maj7`).notes;
            dominantChordNotes.forEach(pc => {
                const octave = Tonal.Note.octave(baseNoteName);
                let targetNoteNameNearBase = pc + octave;
                if (!Tonal.Note.midi(targetNoteNameNearBase)) {
                    targetNoteNameNearBase = pc + (octave + 1);
                }
                const details = this.getNoteDetails(targetNoteNameNearBase);
                if (details && scalePCs.includes(Tonal.Note.pitchClass(details.name))) {
                    addSuggestion(details.midi, details.name, 'D');
                }
            });
        } catch(e) { console.warn("[MTS] Error getting Dominant suggestions", e); }

        // 3. СУБДОМИНАНТОВЫЕ (S)
        try {
            const subdominantRootName = Tonal.transpose(tonicName, "P4");
            const subdominantChordNotes = Tonal.Chord.get(`${subdominantRootName}maj7`).notes;
            subdominantChordNotes.forEach(pc => {
                const octave = Tonal.Note.octave(baseNoteName);
                let targetNoteNameNearBase = pc + octave;
                if (!Tonal.Note.midi(targetNoteNameNearBase)) {
                    targetNoteNameNearBase = pc + (octave + 1);
                }
                const details = this.getNoteDetails(targetNoteNameNearBase);
                if (details && scalePCs.includes(Tonal.Note.pitchClass(details.name))) {
                    addSuggestion(details.midi, details.name, 'S');
                }
            });
        } catch(e) { console.warn("[MTS] Error getting Subdominant suggestions", e); }

        console.log(`[MTS.getFunctionalHarmonySuggestions] For base MIDI ${baseNoteMidi} (${baseNoteName}) in ${tonicName} ${scaleId}, found:`, JSON.parse(JSON.stringify(suggestions)));
        return suggestions;
    },

    /**
     * Получает детали нот для указанного аккорда.
     * @param {string} chordSymbolWithOctave - Символ аккорда, включающий тонику с октавой и тип (например, "C4maj7", "G#3m", "Bb5aug").
     * @returns {Promise<Array<object>|null>} Массив объектов NoteDetails или null.
     * NoteDetails: { name, midi, freq, oct, step, alt, chr, pc, isSharpFlat }
     */
    async getChordNotes(chordSymbolWithOctave) {
        if (!this.isTonalJsLoaded || !Tonal.Chord || !Tonal.Note || !Tonal.Interval || !this._TonalTransposeFn) {
            console.error("[MusicTheoryService.getChordNotes] Tonal.js or its submodules (Chord, Note, Interval, transpose) are not available.");
            return null;
        }
        if (!chordSymbolWithOctave || typeof chordSymbolWithOctave !== 'string') {
            console.warn("[MusicTheoryService.getChordNotes] Invalid chordSymbolWithOctave provided:", chordSymbolWithOctave);
            return null;
        }

        try {
            let rootNoteNameWithOctave;
            let chordTypeToken;

            const tokens = Tonal.Chord.tokenize(chordSymbolWithOctave);
            
            if (tokens && tokens.length === 2 && tokens[0] !== "") {
                const tonicCandidate = Tonal.Note.get(tokens[0]);
                if (tonicCandidate && tonicCandidate.name) {
                    rootNoteNameWithOctave = tonicCandidate.name; 
                    chordTypeToken = tokens[1];
                } else {
                     console.warn(`[MTS.getChordNotes] Tokenize gave invalid tonic: ${tokens[0]} from ${chordSymbolWithOctave}`);
                }
            }
            
            if (!rootNoteNameWithOctave) {
                const match = chordSymbolWithOctave.match(/([A-Ga-g#b]+[#b]?\d*)(.*)/);
                if (match && match[1]) {
                    const tonicCandidate = Tonal.Note.get(match[1]);
                    if (tonicCandidate && tonicCandidate.name) {
                        rootNoteNameWithOctave = tonicCandidate.name;
                        chordTypeToken = match[2] || ""; 
                    } else {
                         console.warn(`[MTS.getChordNotes] Regex fallback failed to get valid tonic from: ${match[1]}`);
                    }
                }
            }

            if (!rootNoteNameWithOctave) {
                 console.warn(`[MTS.getChordNotes] Could not determine root note with octave from: ${chordSymbolWithOctave}`);
                 return null;
            }

            let queryChordType = chordTypeToken;
            if (chordTypeToken === "" || chordTypeToken.toUpperCase() === "M") { 
                queryChordType = rootNoteNameWithOctave.replace(/\d/g, ''); 
            } else if (!Tonal.Chord.get(chordTypeToken).empty && Tonal.Chord.get(chordTypeToken).tonic === null) {
                queryChordType = chordTypeToken;
            } else {
                 queryChordType = rootNoteNameWithOctave.replace(/\d/g, '') + chordTypeToken;
                 if (Tonal.Chord.get(queryChordType).empty && !Tonal.Chord.get(chordTypeToken).empty) {
                    queryChordType = chordTypeToken; 
                 }
            }
             if(queryChordType === "") queryChordType = rootNoteNameWithOctave.replace(/\d/g, '');

            const chordInfo = Tonal.Chord.get(queryChordType);

            if (!chordInfo || chordInfo.empty || !chordInfo.intervals || chordInfo.intervals.length === 0) {
                console.warn(`[MTS.getChordNotes] Could not get intervals for chord type: '${queryChordType}' (derived from '${chordSymbolWithOctave}')`);
                return null;
            }

            const noteDetailsArray = [];
            for (const interval of chordInfo.intervals) {
                const absoluteNoteName = this._TonalTransposeFn(rootNoteNameWithOctave, interval);
                const details = this.getNoteDetails(absoluteNoteName);
                if (details) {
                    noteDetailsArray.push(details);
                } else {
                    console.warn(`[MTS.getChordNotes] Could not get details for note: ${absoluteNoteName} (transposed from ${rootNoteNameWithOctave} with interval ${interval})`);
                }
            }
            
            if (noteDetailsArray.length === 0) {
                 console.warn(`[MTS.getChordNotes] No valid note details generated for chord: ${chordSymbolWithOctave}`);
                 return null;
            }
            
            noteDetailsArray.sort((a, b) => a.midi - b.midi);
            return noteDetailsArray;

        } catch (error) {
            console.error(`[MusicTheoryService.getChordNotes] Error processing chordSymbol "${chordSymbolWithOctave}":`, error, error.stack);
            return null;
        }
    }
};

// === Заглушки для Rocket Mode: стандартные аккорды и тоники ===
if (!MusicTheoryService.getAvailableChordNames) {
    MusicTheoryService.getAvailableChordNames = function() {
        return [
            "C", "Cm", "C7", "Cm7", "Cmaj7",
            "D", "Dm", "D7", "Dm7", "Dmaj7",
            "E", "Em", "E7", "Em7", "Emaj7",
            "F", "Fm", "F7", "Fm7", "Fmaj7",
            "G", "Gm", "G7", "Gm7", "Gmaj7",
            "A", "Am", "A7", "Am7", "Amaj7",
            "B", "Bm", "B7", "Bm7", "Bmaj7"
        ];
    };
}
if (!MusicTheoryService.getAvailableTonicNames) {
    MusicTheoryService.getAvailableTonicNames = function() {
        return [
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
        ];
    };
}

// MusicTheoryService.init() теперь будет вызываться из app.js с передачей moduleManager
