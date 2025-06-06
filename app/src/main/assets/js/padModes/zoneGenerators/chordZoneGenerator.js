// Файл: app/src/main/assets/js/padModes/zoneGenerators/chordZoneGenerator.js
// Генератор зон для режима CHORD Mode (с поддержкой октав и центрированием)

/**
 * @typedef {import('./classicZoneGenerator.js').ZoneGenerationContext} ZoneGenerationContext
 * Это определение будет работать, если classicZoneGenerator.js в той же директории
 * или нужно будет указать корректный путь к JSDoc typedef ZoneData, если он вынесен.
 * Для простоты, предположим, что структура ZoneData известна.
 */

/**
 * @typedef {Object} ChordModeSpecificContext
 * @property {string | null} currentChordName - Имя выбранного аккорда (например, "Cmaj7").
 * @property {Array<object> | null} currentChordNotes - Массив объектов нот аккорда {name, midi, freq, ...}.
 */

/**
 * Генерирует зоны для CHORD режима на основе выбранного аккорда.
 * @param {ZoneGenerationContext & { modeSpecificContext: ChordModeSpecificContext }} context - Контекст.
 * @returns {Promise<Array<ZoneData>>}
 */
async function generateChordZones(context) {
    const { appState, services, modeSpecificContext } = context;

    if (!modeSpecificContext || !appState || !services?.musicTheoryService) {
        console.error("[generateChordZones] Invalid arguments.", modeSpecificContext, appState, services);
        return [];
    }

    // currentChordNotes - это базовый набор нот аккорда в ОДНОЙ октаве, например [C4, E4, G4]
    // currentChordName - это просто имя для логов, например "C Major" (из displayName) или ID "C4M"
    const { currentChordName, currentChordNotes } = modeSpecificContext;
    const zoneCount = appState.zoneCount;
    const musicTheory = services.musicTheoryService;

    if (!currentChordName || !currentChordNotes || currentChordNotes.length === 0 || zoneCount === 0) {
        return [];
    }

    if (!musicTheory.isTonalJsLoaded || !Tonal.Note || !Tonal.Interval) { // Добавил Tonal.Interval для транспонирования
        console.error("[generateChordZones] MusicTheoryService not available or Tonal.js submodules not loaded.");
        return [];
    }

    // 1. Создание расширенного пула нот аккорда в нескольких октавах
    const basePitchClasses = currentChordNotes.map(n => Tonal.Note.pitchClass(n.name)); // ["C", "E", "G"]
    const originalOctaveOfRoot = Tonal.Note.get(currentChordNotes[0].name).oct; // Октава основного тона изначального аккорда

    const generatedNotesPool = [];
    const OCTAVE_RANGE_DOWN = 2; // Сколько октав вниз от originalOctaveOfRoot
    const OCTAVE_RANGE_UP = 2;   // Сколько октав вверх от originalOctaveOfRoot
    
    const minOctave = Math.max(0, originalOctaveOfRoot - OCTAVE_RANGE_DOWN);
    const maxOctave = Math.min(8, originalOctaveOfRoot + OCTAVE_RANGE_UP);

    for (let oct = minOctave; oct <= maxOctave; oct++) {
        for (const pcName of basePitchClasses) {
            const noteFullName = pcName + oct;
            const details = musicTheory.getNoteDetails(noteFullName);
            if (details) {
                generatedNotesPool.push(details);
            }
        }
    }

    // Убираем дубликаты по MIDI (на всякий случай) и сортируем
    const uniqueNotesMap = new Map();
    generatedNotesPool.forEach(note => uniqueNotesMap.set(note.midi, note));
    const sortedFullChordNotePool = Array.from(uniqueNotesMap.values()).sort((a, b) => a.midi - b.midi);

    if (sortedFullChordNotePool.length === 0) {
        console.warn(`[generateChordZones] Could not generate any notes for chord ${currentChordName}.`);
        return [];
    }
    // console.log(`[generateChordZones] Full pool for ${currentChordName}:`, sortedFullChordNotePool.map(n=>n.name));


    // 2. Определение "якорной ноты" для центра пэда
    // Основной тон аккорда (pitch class) в 4-й октаве
    const rootPitchClass = basePitchClasses[0]; // "C"
    let anchorNoteOnPad = sortedFullChordNotePool.find(n => n.pc === rootPitchClass && n.oct === 4);

    if (!anchorNoteOnPad) { 
        let closestNoteToTargetCenter = sortedFullChordNotePool[0];
        let minMidiDiffToTarget = Infinity;
        const TARGET_MIDI_FALLBACK = 65; 

        for (const note of sortedFullChordNotePool) {
            const diff = Math.abs(note.midi - TARGET_MIDI_FALLBACK);
            if (diff < minMidiDiffToTarget) {
                minMidiDiffToTarget = diff;
                closestNoteToTargetCenter = note;
            } else if (diff === minMidiDiffToTarget) {
                if (closestNoteToTargetCenter && note.midi < closestNoteToTargetCenter.midi) { // Предпочитаем более низкую ноту при равной разнице
                    closestNoteToTargetCenter = note;
                }
            }
        }
        anchorNoteOnPad = closestNoteToTargetCenter || sortedFullChordNotePool[Math.floor(sortedFullChordNotePool.length / 2)];
        // console.log(`[generateChordZones] Anchor note (fallback to nearest F4): ${anchorNoteOnPad.name}`);
    }
     if (!anchorNoteOnPad && sortedFullChordNotePool.length > 0){ 
        anchorNoteOnPad = sortedFullChordNotePool[Math.floor(sortedFullChordNotePool.length / 2)];
    }
    if (!anchorNoteOnPad){
        console.warn(`[generateChordZones] CRITICAL: Could not define an anchor note for ${currentChordName}.`);
        return [];
    }
    // console.log(`[generateChordZones] Final Anchor note for pad for ${currentChordName}: ${anchorNoteOnPad.name}`);


    // 3. Находим индекс якорной ноты в расширенном пуле
    const centralNoteInPoolIndex = sortedFullChordNotePool.findIndex(note => note.midi === anchorNoteOnPad.midi);

    if (centralNoteInPoolIndex === -1) {
        console.error("[generateChordZones] CRITICAL: anchorNoteOnPad not found in sortedFullChordNotePool by index.");
        return [];
    }

    // 4. Распределение зон (логика как в classicZoneGenerator)
    const zones = [];
    const zoneWidth = 1.0 / zoneCount;
    
    // Определяем, на какой по счету зоне XY-пэда должна оказаться наша anchorNoteOnPad
    let targetZoneIndexForCenterNoteOnPad = Math.floor(zoneCount / 2);
    if (zoneCount % 2 === 0) { // Для четного количества зон, "центр" смещен влево
        targetZoneIndexForCenterNoteOnPad = (zoneCount / 2) - 1;
    }
    
    // Определяем начальный индекс в sortedFullChordNotePool
    let startIndexInPool = centralNoteInPoolIndex - targetZoneIndexForCenterNoteOnPad;

    // console.log(`[generateChordZones] zoneCount: ${zoneCount}, anchor: ${anchorNoteOnPad.name} (idx ${centralNoteInPoolIndex}), targetZoneIdxOnPad: ${targetZoneIndexForCenterNoteOnPad}, startIndexInPool: ${startIndexInPool}`);

    for (let i = 0; i < zoneCount; i++) {
        const currentPoolIndex = startIndexInPool + i;
        let noteDetailsToUse;

        if (currentPoolIndex >= 0 && currentPoolIndex < sortedFullChordNotePool.length) {
            noteDetailsToUse = sortedFullChordNotePool[currentPoolIndex];
        } else {
            if (sortedFullChordNotePool.length > 0) {
                 const clampedIndex = currentPoolIndex < 0 ? 0 : sortedFullChordNotePool.length - 1;
                 noteDetailsToUse = sortedFullChordNotePool[clampedIndex];
            } else {
                continue; 
            }
        }
        
        if (noteDetailsToUse) {
            // Убедимся, что этот лог активен и информативен
            console.log(`[chordZoneGenerator] Zone[${i}]: Name=${noteDetailsToUse.name}, MIDI=${noteDetailsToUse.midi}, Freq=${noteDetailsToUse.freq ? noteDetailsToUse.freq.toFixed(2) : 'N/A'}, Oct=${noteDetailsToUse.oct}, PC=${noteDetailsToUse.pc}`); 
            zones.push({
                index: i,
                startX: i * zoneWidth,
                endX: (i + 1) * zoneWidth,
                noteName: noteDetailsToUse.name,    
                frequency: noteDetailsToUse.freq,  
                midiNote: noteDetailsToUse.midi,   
                isSharpFlat: noteDetailsToUse.isSharpFlat,
                type: 'chord_note',
                labelOverride: noteDetailsToUse.name 
            });
        }
    }
    // console.log(`[generateChordZones] Generated ${zones.length} zones for chord ${currentChordName}. First zone: ${zones[0]?.noteName}, Last zone: ${zones[zones.length-1]?.noteName}`);
    return zones;
} 