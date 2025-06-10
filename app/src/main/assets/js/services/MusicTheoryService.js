// Файл: app/src/main/assets/js/services/MusicTheoryService.js
// ВЕРСИЯ 2.2: Исправление getNotesForScale с Tonal.Scale.get().notes и транспонированием

console.log('[Pre-MTS v2.2] typeof Tonal:', typeof Tonal);
if (typeof Tonal !== 'undefined') {
    console.log('[Pre-MTS v2.2] Tonal object:', Tonal);
}

const MusicTheoryService = {
    isTonalJsLoaded: false,
    moduleManagerRef: null,
    scaleDefinitions: {}, // { scaleId: [intervals], ... } - Кэш интервалов строя

    async init(moduleManagerInstance) {
        this.moduleManagerRef = moduleManagerInstance;
        if (!this.moduleManagerRef) {
            console.error("[MusicTheoryService.init] moduleManager instance not provided!");
            this.isTonalJsLoaded = false;
            return;
        }

        this.isTonalJsLoaded = typeof Tonal !== 'undefined' && Tonal &&
                               typeof Tonal.Note !== 'undefined' &&
                               typeof Tonal.Scale !== 'undefined' && 
                               typeof Tonal.Chord !== 'undefined' && 
                               (typeof Tonal.Scale.chords === 'function' || (Tonal.Scale.get && typeof Tonal.Scale.get('major').chords !== 'undefined')) && // Проверка на Tonal.Scale.chords
                               typeof Tonal.Interval !== 'undefined';

        if (!this.isTonalJsLoaded) {
            console.error("[MusicTheoryService.init] Tonal.js library is NOT LOADED or Tonal.Note/Scale/Interval is missing!");
        } else {
            const coreModule = Tonal.Core || Tonal;
            const tonalVersion = coreModule.VERSION || (typeof coreModule.version === 'string' ? coreModule.version : undefined) || "Tonal object exists but version not found";
            console.log("[MusicTheoryService v2.2] Initialized. Tonal.js version:", tonalVersion);
        }
        await this.loadScaleDefinitions(); // Загружаем определения строев (интервалы)
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
                        this.scaleDefinitions[mod.id] = mod.data.data.intervals;
                    } else {
                        console.warn(`[MusicTheoryService] Invalid scale module data for ID: ${mod?.id}`, mod);
                    }
                });
                console.log(`[MusicTheoryService] Loaded ${Object.keys(this.scaleDefinitions).length} scale definitions:`, JSON.parse(JSON.stringify(this.scaleDefinitions)));
            }
        } catch (error) { console.error("[MusicTheoryService] Error loading scale definitions:", error); }
    },

    getNoteDetails(noteNameOrMidi) {
        if (!this.isTonalJsLoaded) return null;
        try {
            const note = Tonal.Note.get(noteNameOrMidi);
            if (note && note.name && typeof note.midi === 'number' && typeof note.freq === 'number') {
                note.isSharpFlat = note.acc !== "";
                return note;
            }
            return null;
        } catch (e) { return null; }
    },

    /**
     * Возвращает массив объектов нот для указанной тоники и строя.
     * @param {string} tonicNameWithOctave - Тоника с октавой, например "C4".
     * @param {string} scaleId - ID строя (например, "major", "blues").
     * @param {number} [octavesToScanBefore=2]
     * @param {number} [octavesToScanAfter=2]
     * @returns {Promise<Array<object> | null>}
     */
    async getNotesForScale(tonicNameWithOctave, scaleId, octavesToScanBefore = 2, octavesToScanAfter = 2) {
        if (!this.isTonalJsLoaded) {
            console.error("[MTS.getNotesForScale v2.2] Tonal.js not loaded.");
            return null;
        }
        console.log(`[MTS.getNotesForScale v2.2] Input: tonic=${tonicNameWithOctave}, scaleId=${scaleId}`);

        try {
            const tonicDetails = this.getNoteDetails(tonicNameWithOctave);
            if (!tonicDetails) {
                console.error(`[MTS.getNotesForScale v2.2] Invalid tonic: ${tonicNameWithOctave}`);
                return null;
            }
            const tonicPc = Tonal.Note.pitchClass(tonicNameWithOctave); // "C", "F#"

            // Пытаемся получить ноты строя (pitch classes) от Tonal.Scale.get()
            // Tonal.Scale.get("major").notes -> ["1P", "2M", "3M", "4P", "5P", "6M", "7M"] (интервалы) ИЛИ
            // Tonal.Scale.get("C major").notes -> ["C", "D", "E", "F", "G", "A", "B"] (ноты)
            // Tonal.js > 4.x.x использует ScaleType.get (Tonal.Scale.get)
            let scaleInfo = Tonal.Scale.get(scaleId); // Попробуем по ID/типу
            if (scaleInfo.empty) { // Если по ID не нашли, пробуем с тоникой
                scaleInfo = Tonal.Scale.get(`${tonicPc} ${scaleId}`);
            }

            console.log(`[MTS.getNotesForScale v2.2] Tonal.Scale.get("${scaleId}" or "${tonicPc} ${scaleId}") result:`,
                scaleInfo ? JSON.parse(JSON.stringify(scaleInfo)) : null);

            let baseScaleNotesPc; // Массив pitch classes ["C", "D", "E"...] или ["Db", "Eb", "F"...]
            if (!scaleInfo.empty && scaleInfo.notes && scaleInfo.notes.every(n => typeof n === 'string' && !n.match(/\d/))) {
                // Если .notes уже содержит pitch classes (например, для "C major")
                baseScaleNotesPc = scaleInfo.notes;
            } else if (!scaleInfo.empty && scaleInfo.intervals && Array.isArray(scaleInfo.intervals)) {
                // Если .notes содержит интервалы или их нет, но есть .intervals, генерируем pitch classes от тоники
                baseScaleNotesPc = scaleInfo.intervals.map(interval => Tonal.Note.simplify(Tonal.Distance.transpose(tonicPc, interval)));
            } else {
                 // Последний фоллбэк: используем наши кэшированные интервалы, если Tonal.Scale.get не дал нужного
                const intervalsFromCache = this.scaleDefinitions[scaleId];
                if (intervalsFromCache) {
                    console.warn(`[MTS.getNotesForScale v2.2] Falling back to cached intervals for scale ${scaleId}`);
                    baseScaleNotesPc = intervalsFromCache.map(semitone => Tonal.Note.simplify(Tonal.Distance.transpose(tonicPc, Tonal.Interval.fromSemitones(semitone))));
                } else {
                    console.error(`[MTS.getNotesForScale v2.2] Could not get notes or intervals for scale: ${scaleId}`);
                    return null;
                }
            }

            console.log(`[MTS.getNotesForScale v2.2] Base pitch classes for ${tonicPc} ${scaleId}:`, baseScaleNotesPc);

            if (!baseScaleNotesPc || baseScaleNotesPc.length === 0) {
                console.error(`[MTS.getNotesForScale v2.2] No base pitch classes found for scale: ${scaleId}`);
                return null;
            }

            const allNotes = [];
            const rootMidi = tonicDetails.midi; // MIDI нота корневой тоники, относительно которой строим диапазон

            // Определяем начальную октаву для сканирования
            // Мы хотим, чтобы ноты генерировались вокруг tonicNameWithOctave
            const minMidi = rootMidi - (octavesToScanBefore * 12);
            const maxMidi = rootMidi + (octavesToScanAfter * 12) + 11; // +11 чтобы захватить верхнюю октаву

            // Находим первую ноту строя, которая >= minMidi
            let currentMidi = Tonal.Note.midi(baseScaleNotesPc[0] + "0"); // Начинаем с очень низкой октавы
            while (currentMidi < minMidi - 12) { // -12 чтобы не пропустить первую нужную ноту
                currentMidi += 12;
            }
            
            let safetyCounter = 0;
            const maxSafety = (octavesToScanBefore + octavesToScanAfter + 2) * baseScaleNotesPc.length * 2; // Ограничение на количество итераций (умножено на 2 на всякий случай)

            while (currentMidi <= maxMidi && safetyCounter < maxSafety) {
                 // Проверяем, является ли текущая MIDI нота частью строя относительно tonicPc
                 const noteNameFromMidi = Tonal.Note.fromMidi(currentMidi);
                 if (noteNameFromMidi !== "") { // Пропускаем невалидные MIDI
                     const pitchClassFromMidi = Tonal.Note.pitchClass(noteNameFromMidi);
                     // Проверяем, есть ли этот pitch class в нашем baseScaleNotesPc (генерированном от tonicPc)
                     // Или, что надежнее, проверяем через chroma строя относительно tonicPc

                     // Получаем интервал в полутонах от tonicPc до текущей ноты (в пределах октавы)
                     const intervalInSemitones = Tonal.Distance.semitones(tonicPc + "4", pitchClassFromMidi + "4") % 12; // Используем C4 как референс для полутонов
                     const normalizedInterval = intervalInSemitones < 0 ? intervalInSemitones + 12 : intervalInSemitones;

                     if (!scaleInfo.empty && scaleInfo.chroma.includes(normalizedInterval)) {
                         const details = this.getNoteDetails(currentMidi); // Используем MIDI для получения деталей
                         if (details) {
                              allNotes.push(details);
                         }
                     } else if (scaleInfo.empty) { // Если Tonal.Scale.get не дал chroma, используем наш кэш (более точно)
                          const intervalsFromCache = this.scaleDefinitions[scaleId];
                          if (intervalsFromCache && intervalsFromCache.includes(normalizedInterval)) {
                               const details = this.getNoteDetails(currentMidi);
                                if (details) {
                                    allNotes.push(details);
                                }
                          }
                     }
                 }

                currentMidi++; // Переходим к следующему полутону
                safetyCounter++;
            }
            if (safetyCounter >= maxSafety) {
                console.warn("[MTS.getNotesForScale v2.2] Safety counter hit, loop terminated early.");
            }


            const uniqueNotes = Array.from(new Map(allNotes.map(note => [note.midi, note])).values());
            uniqueNotes.sort((a, b) => a.midi - b.midi);

            console.log(`[MTS.getNotesForScale v2.2] Generated ${uniqueNotes.length} unique notes.`);
            return uniqueNotes;

        } catch (e) {
            console.error(`[MTS.getNotesForScale v2.2] Error for ${tonicNameWithOctave} ${scaleId}:`, e, e.stack);
            return null;
        }
    },

    isSharpOrFlat(noteName) { /* ... без изменений ... */ },
    midiToFrequency(midiNote) { /* ... без изменений ... */ },
    midiToNoteName(midiNote) { /* ... без изменений ... */ },
    getAvailableScaleIds() { /* ... без изменений ... */ },

    getChordNotes(chordSymbolWithOptionalOctave) {
        if (!this.isTonalJsLoaded || !Tonal.Chord) {
            console.error("[MTS.getChordNotes] Tonal.js or Tonal.Chord is not loaded.");
            return null; // Возвращаем null в случае серьезной ошибки
        }
        try {
            // Tonal.Chord.get() ожидает символ аккорда, например, "C4M", "Am", "G7", "Ebmaj7#11"
            // Наш chordSymbolWithOptionalOctave (из ChordModeStrategy) имеет формат типа "C4M", "A4m", "G4dom7"
            // Tonal.Chord.get("C4M") вернет { tonic: "C4", type: "major", ... notes: ["C4", "E4", "G4"] }
            // Tonal.Chord.get("Am") вернет { tonic: "A", type: "minor", ... notes: ["A", "C", "E"] } (без октав в notes)
            // Tonal.Chord.get("Cmaj7") -> notes: ["C", "E", "G", "B"]
            // Tonal.Chord.get("C4maj7") -> notes: ["C4", "E4", "G4", "B4"]

            const chord = Tonal.Chord.get(chordSymbolWithOptionalOctave);

            if (chord.empty || !chord.notes || chord.notes.length === 0) {
                console.warn(`[MTS.getChordNotes] Tonal.js could not parse chord symbol or found no notes for: "${chordSymbolWithOptionalOctave}". Tonal.Chord.get result:`, JSON.stringify(chord));
                return []; // Возвращаем пустой массив, если аккорд не распознан или не имеет нот
            }

            // chord.notes должен содержать ноты с октавами, если исходный символ содержал октаву для основного тона.
            // Если нет (например, символ был "Am"), то Tonal.Chord.get(chordSymbol).notes вернет pitch classes ["A", "C", "E"].
            // В этом случае нам нужно добавить дефолтную октаву или использовать основной тон аккорда, если он с октавой.
            
            let notesWithOctaves = chord.notes;
            // Проверяем, есть ли в нотах октавы. Если нет, и у аккорда есть tonic с октавой, используем его.
            // Или используем дефолтную октаву, если даже tonic без октавы.
            if (notesWithOctaves.every(n => !/\d/.test(n))) { // Если все ноты - это просто pitch classes
                let baseOctave = 4; // Дефолтная октава
                if (chord.tonic && /\d/.test(chord.tonic)) { // Если основной тон аккорда имеет октаву (например "C4" из "C4M")
                    baseOctave = parseInt(chord.tonic.slice(-1), 10);
                }
                console.log(`[MTS.getChordNotes] Notes for "${chordSymbolWithOptionalOctave}" are pitch classes. Applying base octave: ${baseOctave}`);
                // Транспонируем pitch classes относительно tonic (если он без октавы) или первой ноты в нужную октаву.
                // Это сложнее, чем просто добавить номер октавы, т.к. нужно учитывать переход через B-C.
                // Самый надежный способ - если Tonal.Chord.get() возвращает ноты с октавами, когда входной символ содержит октаву.
                // Для символов типа "C4M", Tonal.Chord.notes(...) или Tonal.Chord.get(...).notes должен вернуть уже "C4", "E4", "G4".
                // Повторно запросим у Tonal.js, но через Tonal.Chord.notes, который может лучше работать с символом, уже содержащим октаву.
                notesWithOctaves = Tonal.Chord.notes(chordSymbolWithOptionalOctave);
                 if (notesWithOctaves.every(n => !/\d/.test(n))) { // Если и notes все еще без октав
                    console.warn(`[MTS.getChordNotes] Tonal.Chord.notes still returned pitch classes for ${chordSymbolWithOptionalOctave}. Attempting to add octave ${baseOctave} manually (may be incorrect for some chords).`);
                    // Это очень грубый подход, Tonal должен сам правильно обрабатывать октавы
                    const tonicPc = Tonal.Note.pitchClass(chord.tonic || notesWithOctaves[0]);
                    notesWithOctaves = notesWithOctaves.map(pc => {
                        let noteWithOctave = pc + baseOctave;
                        // Простая корректировка октавы, если pc < tonicPc (например, для инверсий или нот типа B при тонике C)
                        if (Tonal.Note.midi(pc + baseOctave) < Tonal.Note.midi(tonicPc + baseOctave)) {
                            noteWithOctave = pc + (baseOctave + 1);
                        }
                        return noteWithOctave;
                    });
                 }
            }

            const noteDetailsArray = notesWithOctaves.map(noteName => this.getNoteDetails(noteName)).filter(Boolean);

            if (noteDetailsArray.length !== notesWithOctaves.length) {
                console.warn(`[MTS.getChordNotes] Some notes could not be detailed for "${chordSymbolWithOptionalOctave}". Original Tonal notes: ${notesWithOctaves.join(', ')}`);
            }
            console.log(`[MTS.getChordNotes] For symbol "${chordSymbolWithOptionalOctave}", Tonal notes: ${notesWithOctaves.join(', ')}. Detailed notes:`, noteDetailsArray.map(n=>n.name));
            return noteDetailsArray;

        } catch (e) {
            console.error(`[MTS.getChordNotes] Error processing chord symbol "${chordSymbolWithOptionalOctave}":`, e);
            return null; // Возвращаем null в случае ошибки
        }
    },

    getDiatonicChordSuggestions({ tonic = 'C4', scaleName = 'major', currentChordTokenized = null, desiredOctave = 4 }) {
        if (!this.isTonalJsLoaded) {
            console.error("[MTS.getDiatonicChordSuggestions] Tonal.js not fully loaded.");
            return [];
        }

        let suggestions = [];
        try {
            const tonicPc = Tonal.Note.pitchClass(tonic);
            const scaleChords = Tonal.Scale.chords(tonicPc + " " + scaleName); // e.g., ["CM", "Dm", "Em", "FM", "GM", "Am", "Bdim"]
            
            if (!scaleChords || scaleChords.length === 0) {
                console.warn(`[MTS.getDiatonicChordSuggestions] No diatonic chords found for ${tonicPc} ${scaleName}.`);
                return [];
            }

            suggestions = scaleChords.map(chordSymbol => {
                // Tonal.Scale.chords возвращает символы без октавы, например "CM", "Dm"
                // Нам нужно добавить октаву и, возможно, преобразовать "M" в "maj" или другой суффикс, если это стандарт Tonal.js
                // Tonal.Chord.get(symbol) может дать более полную информацию, включая тип.
                const chordInfo = Tonal.Chord.get(chordSymbol); // Получаем { tonic, type, ... }
                if (chordInfo.empty) return null;

                // Формируем ID и nameForService с октавой
                // Если основной тон аккорда (chordInfo.tonic) уже содержит октаву (маловероятно из Scale.chords), используем ее
                // Иначе, используем desiredOctave, но нужно аккуратно его применять к тонике аккорда
                let chordTonicWithOctave = chordInfo.tonic;
                if (!/\d/.test(chordTonicWithOctave)) { // Если октавы нет
                    // Пытаемся разместить аккорд так, чтобы его основной тон был близок к desiredOctave
                    // Это упрощение, т.к. некоторые ноты аккорда могут выходить за пределы этой октавы
                    chordTonicWithOctave = chordInfo.tonic + desiredOctave;
                }
                
                // Формируем ID, который используется в ChordModeStrategy (например, C4M, A4m)
                // Tonal.Chord.get().symbol часто уже содержит нужный формат (e.g. CM, Am, G7)
                // Нам нужно добавить октаву к тонике и убедиться, что тип соответствует нашему ID.
                // Tonal.js типы: M (major), m (minor), maj7, m7, 7 (dominant 7th), dim, aug, sus4, sus2, etc.
                // Наши ID в ChordModeStrategy: M, m, maj7, m7, 7, dim, aug, sus4, sus2, 6, m6, dim7, m7b5
                // Типы Tonal.js и наши во многом совпадают. Для простоты будем использовать символ из Tonal.Chord.get() как основу.
                
                let finalSymbolForId = chordTonicWithOctave + chordInfo.type; // Например, C4Major, A4minor
                // Tonal.js может вернуть "Major" или "minor" в chordInfo.type.
                // Для наших ID мы используем M, m. Сделаем замену.
                if (chordInfo.type === "major") finalSymbolForId = chordTonicWithOctave + "M";
                else if (chordInfo.type === "minor") finalSymbolForId = chordTonicWithOctave + "m";
                // Другие типы (maj7, m7, dim, aug, sus4, sus2, 7) должны совпасть или быть близкими.
                // G7 из Tonal даст G + 7. Нам нужно G47 (если desiredOctave = 4)
                // Это нужно будет доработать для полной консистентности с _chordTypes в ChordModeStrategy.
                // Пока что это будет базовым предложением.

                // Исключаем текущий аккорд, если он передан и совпадает
                if (currentChordTokenized && 
                    Tonal.Note.pitchClass(chordInfo.tonic) === currentChordTokenized.tonic && 
                    chordInfo.type === currentChordTokenized.type) {
                    return null;
                }

                return {
                    id: finalSymbolForId, // e.g., C4M, A4m
                    nameForService: finalSymbolForId, // Для getChordNotes
                    displayName: `${Tonal.Note.pitchClass(chordInfo.tonic)} ${chordInfo.aliases[0] || chordInfo.type}` // e.g., "C Major", "A minor"
                };
            }).filter(Boolean); // Удаляем null (если были ошибки или текущий аккорд)

        } catch (e) {
            console.error("[MTS.getDiatonicChordSuggestions] Error:", e);
            return [];
        }
        console.log("[MTS.getDiatonicChordSuggestions] Suggestions:", suggestions);
        return suggestions;
    }
};

// MusicTheoryService.init() вызывается из app.js