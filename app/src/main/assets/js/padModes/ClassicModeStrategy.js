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
     * ZoneData: { index, startX, endX, noteName, frequency, midiNote, isSharpFlat, type: string, labelOverride?: string }
     */
    async generateZoneData(layoutContext, appState, services) {
        if (!layoutContext || !appState || !services?.musicTheoryService) {
            console.error("[ClassicModeStrategy.generateZoneData] Invalid arguments.");
            return [];
        }

        // Формируем контекст для внешнего генератора зон
        const zoneGenContext = {
            modeId: this.getName(),
            appState: appState,
            services: services,
            modeSpecificContext: layoutContext // layoutContext от getZoneLayoutOptions
        };

        if (typeof generateClassicZones === 'function') {
            return await generateClassicZones(zoneGenContext);
        } else {
            console.error("[ClassicModeStrategy.generateZoneData] generateClassicZones function is not defined. Make sure classicZoneGenerator.js is loaded before this strategy.");
            return [];
        }
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