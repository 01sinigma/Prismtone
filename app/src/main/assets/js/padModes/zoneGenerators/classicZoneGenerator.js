// Файл: app/src/main/assets/js/padModes/zoneGenerators/classicZoneGenerator.js
// Генератор зон для классического режима XY-пэда

/**
 * @typedef {import('../../../../../../../../../../user_query').ZoneData} ZoneData Определение из pad.js, если оно есть
 */

/**
 * @typedef {Object} ClassicModeSpecificContext
 * @property {string} tonicNameWithOctave - Начальная тоника с октавой (например, "C4").
 * @property {string} scaleId - Идентификатор лада (например, "major").
 * @property {number} octaveOffsetFromTonic - Смещение октавы от tonicNameWithOctave.
 */

/**
 * @typedef {Object} ZoneGenerationContext
 * @property {string} modeId
 * @property {object} appState
 * @property {object} services
 * @property {ClassicModeSpecificContext} modeSpecificContext
 */

/**
 * Генерирует зоны для классического режима.
 * @param {ZoneGenerationContext} context - Контекст для генерации зон.
 * @returns {Promise<Array<ZoneData>>}
 */
async function generateClassicZones(context) {
    const { appState, services, modeSpecificContext } = context;

    // console.log("[generateClassicZones] Context:", context); // Для отладки можно раскомментировать
    if (!modeSpecificContext || !appState || !services?.musicTheoryService) {
        console.error("[generateClassicZones] Invalid arguments. modeSpecificContext, appState, or musicTheoryService missing.", modeSpecificContext, appState, services);
        return [];
    }

    const { scaleId, tonicNameWithOctave: userSelectedTonic, octaveOffsetFromTonic } = modeSpecificContext;
    const zoneCount = appState.zoneCount;

    // Новая логика: центральная якорная нота всегда G4 (MIDI 79) + octaveOffsetFromTonic*12
    // Если octaveOffsetFromTonic не передан, берем из appState (для обратной совместимости)
    const octaveShift = typeof octaveOffsetFromTonic === 'number' ? octaveOffsetFromTonic : (typeof appState.octaveOffset === 'number' ? appState.octaveOffset : 0);
    const centralAnchorMidi = 65 + (octaveShift * 12); // G4 = 79
    // --------------------------------------------------

    if (!services.musicTheoryService.isTonalJsLoaded) {
        console.error("[generateClassicZones] MusicTheoryService not available or Tonal.js not loaded.");
        return [];
    }

    // 1. Получаем полный пул нот для ВЫБРАННОГО ЛАДА от ВЫБРАННОЙ ТОНИКИ
    // Количество октав для сканирования должно быть достаточным, чтобы покрыть zoneCount нот
    // Учитываем, что в некоторых ладах меньше 7 нот на октаву
    const notesPerOctaveEstimate = services.musicTheoryService.scaleDefinitions[scaleId]?.length || 7;
    const octavesToScan = Math.ceil(zoneCount / Math.max(1, notesPerOctaveEstimate)) + 3; // +3 для запаса с обеих сторон

    const scaleNotesPool = await services.musicTheoryService.getNotesForScale(
        userSelectedTonic,
        scaleId,
        octavesToScan, // octavesToScanBefore
        octavesToScan  // octavesToScanAfter
    );

    if (!scaleNotesPool || scaleNotesPool.length === 0) {
        console.warn(`[generateClassicZones] No notes from MTS for ${userSelectedTonic} ${scaleId}.`);
        return [];
    }
    // const targetCenterNoteName = services.musicTheoryService.midiToNoteName(TARGET_CENTER_MIDI_NOTE); // Для лога
    // console.log(`[generateClassicZones] Scale notes pool (length ${scaleNotesPool.length}) for ${userSelectedTonic} ${scaleId}. Target MIDI for center: ${TARGET_CENTER_MIDI_NOTE} (${targetCenterNoteName})`);

    // 2. Находим в этом пуле ноту, которая наиболее близка к нашей centralAnchorMidi
    let closestNoteToTargetCenter = null;
    let minMidiDiffToTarget = Infinity;

    for (const note of scaleNotesPool) {
        const diff = Math.abs(note.midi - centralAnchorMidi);
        if (diff < minMidiDiffToTarget) {
            minMidiDiffToTarget = diff;
            closestNoteToTargetCenter = note;
        } else if (diff === minMidiDiffToTarget) {
            if (closestNoteToTargetCenter && note.midi < closestNoteToTargetCenter.midi) {
                closestNoteToTargetCenter = note;
            }
        }
    }

    if (!closestNoteToTargetCenter) {
        console.error(`[generateClassicZones] Could not find any note in the pool for ${userSelectedTonic} ${scaleId}. This should not happen if scaleNotesPool is not empty.`);
        return [];
    }
    // console.log(`[generateClassicZones] Note closest to target F4 (MIDI ${TARGET_CENTER_MIDI_NOTE}) in current scale ${userSelectedTonic} ${scaleId} is: ${closestNoteToTargetCenter.name} (MIDI ${closestNoteToTargetCenter.midi})`);

    // 3. Находим индекс этой "центральной" ноты в нашем отсортированном пуле scaleNotesPool
    const centralNoteInPoolIndex = scaleNotesPool.findIndex(note => note.midi === closestNoteToTargetCenter.midi);

    if (centralNoteInPoolIndex === -1) {
        console.error("[generateClassicZones] CRITICAL: closestNoteToTargetCenter not found in scaleNotesPool by index.");
        return [];
    }

    const zones = [];
    const zoneWidth = 1.0 / zoneCount;

    // 4. Определяем, на какой по счету зоне XY-пэда должна оказаться наша closestNoteToTargetCenter
    let targetZoneIndexForCenterNoteOnPad = Math.floor(zoneCount / 2);
    // Для четного количества зон, "центр" смещен влево. Например, для 12 зон, это 6-я зона (индекс 5)
    if (zoneCount % 2 === 0) {
        targetZoneIndexForCenterNoteOnPad = (zoneCount / 2) - 1;
    }
    
    // 5. Определяем начальный индекс в scaleNotesPool, чтобы closestNoteToTargetCenter попала на targetZoneIndexForCenterNoteOnPad
    let startIndexInPool = centralNoteInPoolIndex - targetZoneIndexForCenterNoteOnPad;

    // console.log(`[generateClassicZones] zoneCount: ${zoneCount}, targetZoneIndexForCenterNoteOnPad: ${targetZoneIndexForCenterNoteOnPad}. centralNoteInPoolIndex: ${centralNoteInPoolIndex}, Calculated startIndexInPool: ${startIndexInPool}`);

    for (let i = 0; i < zoneCount; i++) {
        const currentPoolIndex = startIndexInPool + i;
        let noteDetailsToUse;

        if (currentPoolIndex >= 0 && currentPoolIndex < scaleNotesPool.length) {
            noteDetailsToUse = scaleNotesPool[currentPoolIndex];
        } else {
            // console.warn(`[generateClassicZones] Index ${currentPoolIndex} out of bounds for scaleNotesPool (len ${scaleNotesPool.length}) for zone ${i}.`);
            // Логика для "зацикливания" или выбора ближайшей существующей ноты, если выходим за пределы пула
            // В текущей реализации ClassicModeStrategy была попытка взять крайнюю ноту.
            // Для большей предсказуемости, можно либо возвращать пустые зоны, либо повторять крайние ноты с октавным сдвигом (сложнее).
            // Пока оставим как было - берем ближайшую существующую, если пул не пуст.
            if (scaleNotesPool.length > 0) {
                 const clampedIndex = Math.max(0, Math.min(scaleNotesPool.length - 1, currentPoolIndex < 0 ? 0 : scaleNotesPool.length - 1));
                 noteDetailsToUse = scaleNotesPool[clampedIndex];
                 // console.warn(`[generateClassicZones] Using fallback note ${noteDetailsToUse.name} for out-of-bounds zone ${i}`);
            } else {
                // Это не должно произойти, если scaleNotesPool не пуст
                continue; 
            }
        }
        
        if (noteDetailsToUse) {
            zones.push({
                index: i,
                startX: i * zoneWidth,
                endX: (i + 1) * zoneWidth,
                noteName: noteDetailsToUse.name,
                frequency: noteDetailsToUse.freq,
                midiNote: noteDetailsToUse.midi,
                isSharpFlat: noteDetailsToUse.isSharpFlat,
                type: 'note', // Тип зоны, может быть полезно для pad.js или visualizer
                labelOverride: null // Для будущего использования, если метка зоны должна отличаться от noteName
            });
        }
    }
    // console.log(`[generateClassicZones] Generated zones (length ${zones.length}). Centered around MIDI ${closestNoteToTargetCenter.midi}.`);
    // if (zones.length > targetZoneIndexForCenterNoteOnPad && zones[targetZoneIndexForCenterNoteOnPad]) {
        // console.log(`[generateClassicZones] Note at target center zone index ${targetZoneIndexForCenterNoteOnPad} on pad is: ${zones[targetZoneIndexForCenterNoteOnPad].noteName} (MIDI ${zones[targetZoneIndexForCenterNoteOnPad].midiNote})`);
    // }
    return zones;
} 