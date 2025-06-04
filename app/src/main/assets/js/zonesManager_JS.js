// Файл: app/src/main/assets/js/zonesManager_JS.js
// JavaScript аналог ZonesManager для расчета зон XY-пада
const zonesManagerJS = {
    isInitialized: false,

    /**
     * Загружает данные о гаммах из модулей 'scale'.
     */
    async loadScales() {
        console.log("[ZonesManagerJS.loadScales] Loading available scale names...");
        this.availableScaleNames = []; // Очищаем
        try {
            const scaleModules = await moduleManager.getModules('scale', true);
            if (Array.isArray(scaleModules)) {
                scaleModules.forEach(mod => {
                    if (mod?.id && typeof mod.id === 'string') { // mod.id - это имя строя для Tonal.js
                        this.availableScaleNames.push(mod.id);
                    }
                });
                // Добавим стандартные, если их нет в модулях, на всякий случай
                ['major', 'minor', 'chromatic', 'pentatonic', 'blues'].forEach(stdScale => {
                    if (!this.availableScaleNames.includes(stdScale)) {
                        this.availableScaleNames.push(stdScale);
                    }
                });
                console.log(`[ZonesManagerJS.loadScales] Available scale names:`, this.availableScaleNames);
            } else {
                console.error("[ZonesManagerJS.loadScales] Failed to load scale modules.");
                this.availableScaleNames = ['major', 'minor', 'chromatic']; // Fallback
            }
        } catch (error) {
            console.error("[ZonesManagerJS.loadScales] Error loading scales:", error);
            this.availableScaleNames = ['major', 'minor', 'chromatic']; // Fallback
        }
        this.isInitialized = true;
    },

    /**
     * Рассчитывает зоны на основе текущего состояния app.state
     * @returns {Array<object>} - Массив объектов зон или пустой массив
     */
    async calculateZones() { // Делаем асинхронной, т.к. getNotesForScale асинхронный
        // ... (получение scaleIdToUse, octaveOffset, zoneCount из app.state как раньше) ...
        // ---> НОВОЕ: Получение тоники
        const { scale: scaleIdToUse = 'chromatic', octaveOffset = 0, zoneCount = 12 } = app.state; // Получаем из app.state
        const currentTonic = app.state.currentTonic || "C4"; // "C4" как дефолт

        console.log(`[ZonesManagerJS.calculateZones] Input - Tonic: ${currentTonic}, Scale: ${scaleIdToUse}, Offset: ${octaveOffset}, Count: ${zoneCount}`);

        if (!MusicTheoryService.isTonalJsLoaded) {
            console.error("[ZonesManagerJS.calculateZones] MusicTheoryService (Tonal.js) not available.");
            return [];
        }

        // Получаем одну октаву нот строя от заданной тоники
        // MusicTheoryService.getNotesForScale должен быть доработан, чтобы корректно обрабатывать это
        // и возвращать ноты с правильными октавами.
        // Например, Tonal.Scale.rangeOf(tonicPitchClass + " " + scaleName)(tonic, Tonal.Note.transpose(tonic, "P8"))
        // или Tonal.Mode.notes(scaleName, tonic) - но это даст только одну октаву
        console.log(`[ZonesManagerJS.calculateZones] Calling MusicTheoryService.getNotesForScale("${currentTonic}", "${scaleIdToUse}")`);
        const scaleNotesInfo = await MusicTheoryService.getNotesForScale(currentTonic, scaleIdToUse);
        console.log(`[ZonesManagerJS.calculateZones] MusicTheoryService.getNotesForScale result:`, scaleNotesInfo);

        if (!scaleNotesInfo || scaleNotesInfo.length === 0) {
            console.error("[ZMJSCalc] No notes from MusicTheoryService.");
            return [];
        }
        console.log("[ZMJSCalc] scaleNotesInfo from MTS:", JSON.parse(JSON.stringify(scaleNotesInfo)));

        const zones = [];
        const zoneWidth = 1.0 / zoneCount;

        for (let i = 0; i < zoneCount; i++) {
            // Простая логика для теста: берем ноты по кругу из полученного массива
            const noteIndexInScale = i % scaleNotesInfo.length;
            const baseNote = scaleNotesInfo[noteIndexInScale];
            const octaveShift = Math.floor(i / scaleNotesInfo.length); // Для смещения октав, если zoneCount > нот в строе

            // Нужно получить ПОЛНОЕ имя ноты с правильной октавой
            // Если baseNote уже содержит правильную октаву, это проще.
            // Если baseNote - это pitch class, нужно его комбинировать с октавой тоники + octaveShift
            // Предположим, baseNote уже содержит имя с начальной октавой.
            let currentNoteName = baseNote.name;
            if (octaveShift > 0) {
                // Tonal.Interval.fromSemitones expects an interval string like "12st" for 12 semitones (1 octave)
                // Need to handle potential errors if transpose fails
                try {
                     currentNoteName = Tonal.Note.transpose(baseNote.name, Tonal.Interval.fromSemitones(octaveShift * 12));
                } catch (e) {
                     console.error(`[ZMJSCalc] Error transposing note ${baseNote.name} by ${octaveShift} octaves:`, e);
                     currentNoteName = null; // Indicate failure
                }

            }
            const noteDetails = currentNoteName ? MusicTheoryService.getNoteDetails(currentNoteName) : null;

            if (noteDetails) {
                console.log(`[ZMJSCalc] Zone ${i}: MIDI=${noteDetails.midi}, Freq=${noteDetails.freq.toFixed(1)}, Name=${noteDetails.name}`);
                zones.push({
                    index: i,
                    startX: i * zoneWidth,
                    endX: (i + 1) * zoneWidth,
                    noteName: noteDetails.name,
                    frequency: noteDetails.freq,
                    midiNote: noteDetails.midi,
                    isSharpFlat: noteDetails.acc !== "" // или MusicTheoryService.isSharpOrFlat(noteDetails.name)
                });
            } else {
                console.warn(`[ZMJSCalc] Could not get details for note ${currentNoteName || 'derived name'} for zone ${i}. Original baseNote: ${baseNote.name}. Skipping zone ${i}.`);
            }
        }
        console.log(`[ZMJSCalc] Generated zones:`, JSON.parse(JSON.stringify(zones)));
        return zones;
    },

    // Методы midiToFrequency и midiToNoteName удалены.
};

// Инициализация вызывается из app.js