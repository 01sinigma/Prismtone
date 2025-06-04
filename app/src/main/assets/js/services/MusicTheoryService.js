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
                               typeof Tonal.Scale !== 'undefined' && // Проверяем наличие Tonal.Scale
                               typeof Tonal.Interval !== 'undefined'; // Нужен для транспонирования

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
    getAvailableScaleIds() { /* ... без изменений ... */ }
};

// MusicTheoryService.init() вызывается из app.js