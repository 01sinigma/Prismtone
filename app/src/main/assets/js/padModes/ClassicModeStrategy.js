// Файл: app/src/main/assets/js/padModes/ClassicModeStrategy.js
// Стратегия для классического режима работы XY-пэда
// ВЕРСИЯ 1.2: Исправление ReferenceError

const ClassicModeStrategy = {
    appRef: null,
    musicTheoryServiceRef: null,
    _isActive: false,
    _activeNoteInfo: new Map(),

    init(appReference, musicTheoryServiceInstance) {
        console.log(`[${this.getName()}Strategy.init] Received appReference:`, appReference ? 'Exists' : 'NULL');
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        console.log(`[${this.getName()}Strategy.init] this.appRef set to:`, this.appRef ? 'Exists' : 'NULL');
        console.log("[ClassicModeStrategy v1.2 PadModes] Initialized.");
    },

    getName: () => "classic",
    getDisplayName: () => i18n.translate('pad_mode_classic', 'Classic'), // Локализуемое имя

    requiresTonic: () => true,
    requiresScale: () => true,
    requiresChord: () => false,

    getModeSpecificControlsConfig: () => {
        // Для классического режима пока нет специфичных настроек
        return [];
    },

    onSpecificControlChanged(controlName, value) {
        // Обработка изменений специфичных контролов режима
        console.log(`[ClassicModeStrategy] Control '${controlName}' changed to:`, value);
        // Здесь будет логика, если для Classic Mode появятся настройки
        // Может потребоваться app.updateZones() или другие действия
    },

    async getZoneLayoutOptions(appState) {
        console.log("[ClassicModeStrategy.getZoneLayoutOptions] Received appState:", JSON.parse(JSON.stringify(appState))); // Log at beginning
        if (!appState) {
            console.error("[ClassicModeStrategy.getZoneLayoutOptions] appState is missing.");
            return null;
        }
        const layoutOptions = {
            tonicNameWithOctave: appState.currentTonic, // Переименовано для ясности
            scaleId: appState.scale,                  // Переименовано для ясности
            octaveOffsetFromTonic: appState.octaveOffset, // Это смещение применяется к тонике для пэда
        };
        console.log("[ClassicModeStrategy.getZoneLayoutOptions] Returning context:", layoutOptions); // Log before return
        return layoutOptions;
    },

    /**
     * @param {object} layoutContext - { tonicNameWithOctave, scaleId, octaveOffsetFromTonic }
     * @param {object} appState - Полное состояние app.state (для zoneCount)
     * @param {object} services - { musicTheoryService }
     * @returns {Promise<Array<ZoneData>>}
     * ZoneData: { index, startX, endX, noteName, frequency, midiNote, isSharpFlat, type: 'note' }
     */
    async generateZoneData(layoutContext, appState, services) {
        console.log("[ClassicModeStrategy.generateZoneData] Context:", layoutContext, "AppState:", appState);
        if (!layoutContext || !appState || !services?.musicTheoryService) {
            console.error("[ClassicModeStrategy.generateZoneData] Invalid arguments.");
            return [];
        }

        const { scaleId } = layoutContext; // Лад, выбранный пользователем
        const userSelectedTonic = layoutContext.tonicNameWithOctave; // Тоника, выбранная пользователем
        const zoneCount = appState.zoneCount;

        // --- НАША ЦЕЛЕВАЯ ЦЕНТРАЛЬНАЯ НОТА ИЗМЕНЕНА НА F4 ---
        const TARGET_CENTER_MIDI_NOTE = 65; // F4 (было 67 для G4)
        // ---------------------------------------------------

        if (!services.musicTheoryService.isTonalJsLoaded) {
            console.error("[ClassicModeStrategy.generateZoneData] MusicTheoryService not available.");
            return [];
        }

        // 1. Получаем полный пул нот для ВЫБРАННОГО ЛАДА от ВЫБРАННОЙ ТОНИКИ
        const octavesToScan = Math.ceil(zoneCount / 7) + 3;
        const scaleNotesPool = await services.musicTheoryService.getNotesForScale(
            userSelectedTonic,
            scaleId,
            octavesToScan,
            octavesToScan
        );

        if (!scaleNotesPool || scaleNotesPool.length === 0) {
            console.warn(`[ClassicModeStrategy.generateZoneData] No notes from MTS for ${userSelectedTonic} ${scaleId}.`);
            return [];
        }
        const targetCenterNoteName = services.musicTheoryService.midiToNoteName(TARGET_CENTER_MIDI_NOTE);
        console.log(`[ClassicModeStrategy.generateZoneData] Scale notes pool (length ${scaleNotesPool.length}) for ${userSelectedTonic} ${scaleId}. Target MIDI for center: ${TARGET_CENTER_MIDI_NOTE} (${targetCenterNoteName})`);

        // 2. Находим в этом пуле ноту, которая наиболее близка к нашей TARGET_CENTER_MIDI_NOTE (F4)
        let closestNoteToTargetCenter = null;
        let minMidiDiffToTarget = Infinity;

        for (const note of scaleNotesPool) {
            const diff = Math.abs(note.midi - TARGET_CENTER_MIDI_NOTE);
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
            console.error(`[ClassicModeStrategy.generateZoneData] Could not find any note in the pool for ${userSelectedTonic} ${scaleId}.`);
            return [];
        }
        console.log(`[ClassicModeStrategy.generateZoneData] Note closest to target F4 (MIDI ${TARGET_CENTER_MIDI_NOTE}) in current scale ${userSelectedTonic} ${scaleId} is: ${closestNoteToTargetCenter.name} (MIDI ${closestNoteToTargetCenter.midi})`);

        // 3. Находим индекс этой "центральной" ноты в нашем отсортированном пуле scaleNotesPool
        const centralNoteInPoolIndex = scaleNotesPool.findIndex(note => note.midi === closestNoteToTargetCenter.midi);

        if (centralNoteInPoolIndex === -1) {
            console.error("[ClassicModeStrategy.generateZoneData] CRITICAL: closestNoteToTargetCenter not found in scaleNotesPool by index.");
            return [];
        }

        const zones = [];
        const zoneWidth = 1.0 / zoneCount;
        const halfZoneCount = Math.floor(zoneCount / 2);

        // 4. Определяем начальный индекс в scaleNotesPool
        let targetZoneIndexForCenterNote = Math.floor(zoneCount / 2);
        if (zoneCount % 2 === 0) {
            targetZoneIndexForCenterNote = (zoneCount / 2) - 1;
        }
        
        let startIndexInPool = centralNoteInPoolIndex - targetZoneIndexForCenterNote;

        console.log(`[ClassicModeStrategy.generateZoneData] Target Zone Index for Center Note (F4 or closest): ${targetZoneIndexForCenterNote}. Calculated startIndexInPool: ${startIndexInPool}`);

        for (let i = 0; i < zoneCount; i++) {
            const currentPoolIndex = startIndexInPool + i;
            let noteDetailsToUse;

            if (currentPoolIndex >= 0 && currentPoolIndex < scaleNotesPool.length) {
                noteDetailsToUse = scaleNotesPool[currentPoolIndex];
            } else {
                console.warn(`[ClassicModeStrategy.generateZoneData] Index ${currentPoolIndex} out of bounds for scaleNotesPool (len ${scaleNotesPool.length}) for zone ${i}.`);
                if (scaleNotesPool.length > 0) {
                     const clampedIndex = Math.max(0, Math.min(scaleNotesPool.length - 1, currentPoolIndex));
                     noteDetailsToUse = scaleNotesPool[clampedIndex];
                     console.warn(`[ClassicModeStrategy.generateZoneData] Using fallback note ${noteDetailsToUse.name} for out-of-bounds zone ${i}`);
                } else {
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
                    type: 'note'
                });
            }
        }
        console.log(`[ClassicModeStrategy.generateZoneData] Generated zones (length ${zones.length}). Centered around MIDI ${closestNoteToTargetCenter.midi}.`);
        if (zones.length > targetZoneIndexForCenterNote && zones[targetZoneIndexForCenterNote]) {
            console.log(`[ClassicModeStrategy.generateZoneData] Note at target center zone index ${targetZoneIndexForCenterNote} is: ${zones[targetZoneIndexForCenterNote].noteName} (MIDI ${zones[targetZoneIndexForCenterNote].midiNote})`);
        }
        return zones;
    },

    onPointerDown(pointerId, x, y, currentZones, padContext) {
        if (!currentZones || currentZones.length === 0) return null;
        let foundZone = null;
        for (let i = 0; i < currentZones.length; i++) {
            const zone = currentZones[i];
            if (zone.startX !== undefined && zone.endX !== undefined && x >= zone.startX && x < zone.endX) {
                foundZone = zone; break;
            }
        }
        if (!foundZone && x >= 1.0 && currentZones.length > 0) {
            foundZone = currentZones[currentZones.length - 1];
        }
        if (foundZone) {
            const noteDetails = {
                frequency: foundZone.frequency,
                midiNote: foundZone.midiNote,
                name: foundZone.noteName
            };
            this._activeNoteInfo.set(pointerId, noteDetails);
            return { type: 'note_on', note: noteDetails };
        }
        return null;
    },

    onPointerMove(pointerId, x, y, currentZones, padContext) {
        if (!currentZones || currentZones.length === 0) return null;
        const previousNoteInfo = this._activeNoteInfo.get(pointerId);
        if (!previousNoteInfo) return null;
        let newFoundZone = null;
        for (let i = 0; i < currentZones.length; i++) {
            const zone = currentZones[i];
            if (zone.startX !== undefined && zone.endX !== undefined && x >= zone.startX && x < zone.endX) {
                newFoundZone = zone; break;
            }
        }
        if (!newFoundZone && x >= 1.0 && currentZones.length > 0) {
            newFoundZone = currentZones[currentZones.length - 1];
        }
        if (newFoundZone) {
            const newNoteDetails = {
                frequency: newFoundZone.frequency,
                midiNote: newFoundZone.midiNote,
                name: newFoundZone.noteName
            };
            if (newNoteDetails.midiNote !== previousNoteInfo.midiNote) {
                this._activeNoteInfo.set(pointerId, newNoteDetails);
                return { type: 'note_change', oldNote: previousNoteInfo, newNote: newNoteDetails };
            } else {
                return { type: 'note_update', note: newNoteDetails };
            }
        } else {
            this._activeNoteInfo.delete(pointerId);
            return { type: 'note_off', note: previousNoteInfo };
        }
    },

    onPointerUp(pointerId, padContext) {
        this._activeNoteInfo.delete(pointerId);
        return null;
    },

    getPadVisualHints: (currentZones, appState, services) => [], // Как раньше

    onModeActivated(appState, services, uiModules) {
        this._isActive = true;
        console.log("[ClassicModeStrategy v1.2 PadModes] Activated.");
    },
    onModeDeactivated(appState, services, uiModules) {
        this._isActive = false;
        console.log("[ClassicModeStrategy v1.2 PadModes] Deactivated.");
    },
    async onTonicChanged(newTonic, appState, services) {
        console.log(`[ClassicModeStrategy v1.2 PadModes] Notified of tonic change: ${newTonic}.`);
        // Zone update будет вызван PadModeManager -> app.updateZones()
    },
    async onScaleChanged(newScale, appState, services) {
        console.log(`[ClassicModeStrategy v1.2 PadModes] Notified of scale change: ${newScale}.`);
        // Zone update будет вызван PadModeManager -> app.updateZones()
    },
    async onChordChanged(newChord, appState, services) { /* Не используется */ }
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(ClassicModeStrategy);
} else {
    console.warn("[ClassicModeStrategy v1.2 PadModes] PadModeManager not found for self-registration.");
}