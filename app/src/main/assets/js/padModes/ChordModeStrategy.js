// Файл: app/src/main/assets/js/padModes/ChordModeStrategy.js
// Стратегия для режима работы XY-пэда "CHORD Mode"

const ChordModeStrategy = {
    _sortableInstance: null, // Добавлено для SortableJS
    appRef: null,
    musicTheoryServiceRef: null,
    harmonicMarkerEngineRef: null, // Пока не используется, но для консистентности
    _isActive: false,
    
    // Новые свойства для управления прогрессиями
    _progressionSelectDisplay: null,
    _saveProgressionBtn: null,
    _boundShowProgressionPopover: null,
    _boundSaveCurrentProgression: null,
    _loadedProgressionId: null,
    
    // Внутреннее состояние режима CHORD
    _selectedChordId: null, 
    _selectedChordDisplayName: null, 
    _selectedChordNotes: [],
    
    // Список аккордов, доступных на панели (для начала статичный)
    _availableChords: [ 
        { id: 'C4M', nameForService: 'C4M', displayName: 'C Major' },
        { id: 'G4M', nameForService: 'G4M', displayName: 'G Major' },
        { id: 'D4M', nameForService: 'D4M', displayName: 'D Major' },
        { id: 'E4m', nameForService: 'E4m', displayName: 'E minor' }
    ],
    _currentChordPanel: null, // Ссылка на DOM-элемент панели аккордов
    _chordListContainer: null, // Добавлено для хранения ссылки на контейнер списка
    _suggestedChordsContainer: null, // Новое свойство
    _boundHandleChordButtonClick: null, // Для хранения ссылки на привязанную функцию
    _addChordModal: null,
    _chordRootSelect: null,
    _chordOctaveSelect: null,
    _chordTypeSelect: null,
    _confirmAddChordButton: null,
    _cancelAddChordButton: null,
    _closeAddChordModalButton: null,
    _addChordButtonOnPanel: null, // Кнопка "+" на панели аккордов
    _modalOverlay: null, // Для оверлея

    // Предопределенные значения для селектов
    _rootNotes: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    _octaves: [2, 3, 4, 5, 6],
    // Типы аккордов: ключ - то, что пойдет в Tonal, значение - то, что увидит пользователь
    _chordTypes: {
        "M": "Major",
        "m": "Minor",
        "maj7": "Major 7th",
        "m7": "Minor 7th",
        "7": "Dominant 7th",
        "dim": "Diminished",
        "aug": "Augmented",
        "sus4": "Suspended 4th",
        "sus2": "sus2", // Изменено с "Suspended 2nd"
        "6": "Major 6th",
        "m6": "min6",     // Изменено с "Minor 6th"
        "dim7": "Diminished 7th",
        "m7b5": "Minor 7th b5 (Half-dim)"
    },

    // Привязанные обработчики
    _boundHandleClickOnChordList: null,
    _boundHandleClickOnSuggestedChords: null, // Новый обработчик
    _boundShowAddChordModal: null,
    _boundHideAddChordModal: null,
    _boundConfirmAddChord: null,

    // Новые свойства для логики удаления
    _activeNoteInfo: new Map(), // Добавлено

    // Добавляем новые свойства
    _collapseBtn: null,
    _expandBtn: null,
    
    // Добавляем привязанные обработчики
    _boundCollapsePanel: null,
    _boundExpandPanel: null,

    // Добавляем новые свойства
    _isDeleteModeActive: false,
    _deleteModeToggleButton: null,

    // Обновляем привязанные обработчики
    _boundToggleDeleteMode: null,

    // Добавляем новые свойства
    _chordRootDisplay: null,
    _chordTypeDisplay: null,
    _modalSelectedRoot: 'C',   // Временное хранение выбора в модальном окне
    _modalSelectedType: 'M',   // Временное хранение выбора в модальном окне
    
    // Обновляем привязанные обработчики
    _boundShowRootNotePopover: null,
    _boundShowChordTypePopover: null,

    // Добавляем свойства для жеста "щипок"
    _pinchState: {
        isPinching: false,
        initialDistance: 0,
        initialWidth: 0,
        pointers: new Map() // Map<pointerId, {x, y}>
    },

    // === НОВЫЕ СВОЙСТВА для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
    _saveProgressionModal: null,
    _progressionNameInput: null,
    _confirmSaveProgressionButton: null,
    _cancelSaveProgressionButton: null,
    _closeSaveProgressionModalButton: null,
    _boundHideSaveProgressionModal: null,
    _boundConfirmSaveProgression: null,
    // =============================================================

    // === НОВЫЕ СВОЙСТВА для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ПРЕСЕТА ===
    _confirmDeletePresetModal: null,
    _confirmDeletePresetMessageElement: null,
    _confirmDeletePresetActionButton: null,
    _cancelDeletePresetButton: null,
    _closeConfirmDeletePresetModalButton: null,
    _progressionIdToDelete: null, // Для хранения ID пресета, ожидающего удаления
    _boundShowConfirmDeletePresetModal: null, // Не используется напрямую, но для симметрии
    _boundHideConfirmDeletePresetModal: null,
    _boundExecuteActualPresetDeletion: null,
    _xyPadContainerElementForModalClose: null, // Ссылка на элемент пэда для закрытия модального окна
    _boundHideAddChordModalOnPadInteraction: null, // Обработчик для закрытия модального окна добавления по клику на пэд
    _boundHideSaveProgressionModalOnPadInteraction: null, // Для окна сохранения
    _boundHideConfirmDeletePresetModalOnPadInteraction: null, // Привязка для окна подтверждения удаления
    // === НОВЫЕ СВОЙСТВА ДЛЯ ТАЙМЕРА ===
    _timerState: {
        isActive: false,
        mode: 'rhythm', // 'rhythm' или 'seconds'
        interval: '1m', // Значение для Tone.Transport (1 мера)
        seconds: 4,
        bpm: 120,
        scheduleId: null // ID для отмены события Tone.Transport
    },

    // Ссылки на UI элементы таймера
    _timerModal: null,
    _timerToggleButton: null,
    _timerModeRadios: null,
    _rhythmSettingsContainer: null,
    _secondsSettingsContainer: null,
    _bpmInput: null,
    _intervalDisplay: null,
    _secondsInput: null,
    _startTimerBtn: null,
    _cancelTimerBtn: null,
    _closeTimerModalBtn: null,

    // Привязанные обработчики для таймера
    _boundToggleTimer: null,
    _boundShowTimerModal: null,
    _boundHideTimerModal: null,
    _boundStartTimer: null,
    _boundStopTimer: null,
    _boundSwitchTimerModeUI: null,
    _boundShowIntervalPopover: null,
    _boundSelectNextChord: null, 

    // === НАЧАЛО ЗАМЕНЫ: _handleActiveTouchesOnChordSwitch ===
    _handleActiveTouchesOnChordSwitch() {
        console.log('[ChordModeStrategy] Auto-switch triggered. Handling active touches...');
        
        if (typeof pad === 'undefined' || !pad.activeTouchesInternal || pad.activeTouchesInternal.size === 0) {
            return null; // Возвращаем null, если нечего было сбрасывать
        }

        const releasedTouches = new Map(pad.activeTouchesInternal); // <<<--- СОЗДАЕМ КОПИЮ КАСАНИЙ
        console.log(`[ChordModeStrategy] Found ${releasedTouches.size} active touches to clean up.`);

        // 1. Используем глобальный метод synth для остановки всех нот.
        if (typeof synth !== 'undefined' && synth.stopAllNotes) {
            synth.stopAllNotes();
        }

        // 2. Уведомляем визуализатор об "отпускании" каждого касания
        if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchUp === 'function') {
            releasedTouches.forEach((touchData, touchId) => { // Итерируем по копии
                visualizer.notifyTouchUp(touchId);
            });
        }

        // 3. Очищаем состояние
        this._activeNoteInfo.clear();
        if (pad.activeTouchesInternal) { // Добавлена проверка на существование
            pad.activeTouchesInternal.clear();
        }
        
        console.log('[ChordModeStrategy] All active touches have been handled and cleared from pad state.');

        return releasedTouches; // <<<--- ВОЗВРАЩАЕМ КОПИЮ
    },
    // === КОНЕЦ ЗАМЕНЫ: _handleActiveTouchesOnChordSwitch ===

    // === НАЧАЛО: НОВЫЙ УНИВЕРСАЛЬНЫЙ МЕТОД ПЕРЕКЛЮЧЕНИЯ АККОРДОВ ===
    _switchChord(direction) {
        if (!this._availableChords || this._availableChords.length < 2) { // Добавлена проверка на существование _availableChords
            console.log('[ChordStrategy._switchChord] Not enough chords to switch or chord list not initialized.');
            return;
        }

        // 1. Сбрасываем активные касания и сохраняем их состояние
        const releasedTouches = this._handleActiveTouchesOnChordSwitch();

        // 2. Используем requestAnimationFrame для плавной смены
        requestAnimationFrame(async () => {
            // Повторная проверка, так как состояние могло измениться
            if (!this._availableChords || this._availableChords.length < 2) {
                console.log('[ChordStrategy._switchChord in rAF] Not enough chords to switch after rAF.');
                return;
            }
            if (this._selectedChordId === null && this._availableChords.length > 0) {
                 // Если _selectedChordId не установлен, но аккорды есть, установим на первый перед вычислением индекса
                 // Это предотвратит NaN, если currentIndex = -1 и direction = -1
                 await this.selectChord(this._availableChords[0].id); // Это обновит _selectedChordId
                 console.log('[ChordStrategy._switchChord in rAF] Initialized _selectedChordId to first available chord.');
            }


            const currentIndex = this._availableChords.findIndex(c => c.id === this._selectedChordId);
            
            // Если currentIndex все еще -1 (например, если this.selectChord выше не смог установить его, хотя должен),
            // или если this._availableChords пуст (хотя мы проверили), то выходим.
            if (currentIndex === -1 && this._availableChords.length > 0) {
                console.warn('[ChordStrategy._switchChord in rAF] Could not find current chord index, defaulting to 0 for next calculation.');
                // Можно было бы просто установить currentIndex = 0, но это может быть нежелательно, если список пуст.
                // Вместо этого, если selectChord не установил, то лучше выйти.
                // Однако, для безопасности, если аккорды есть, а selectChord по какой-то причине не обновил _selectedChordId,
                // но мы хотим продолжить, можно сделать так:
                // const current ChordToUseForIndex = this._selectedChordId || this._availableChords[0].id;
                // const currentIndex = this._availableChords.findIndex(c => c.id === current ChordToUseForIndex);
                // Это уже слишком сложно, this.selectChord должен был отработать.
                // Проще выйти, если currentIndex === -1 после selectChord
                if (this._selectedChordId === null) { // Если selectChord не смог ничего выбрать
                    console.error('[ChordStrategy._switchChord in rAF] _selectedChordId is still null after attempting to select one. Cannot proceed.');
                    return;
                }
            }


            // Вычисляем следующий индекс с учетом направления
            const nextIndex = (currentIndex + direction + this._availableChords.length) % this._availableChords.length;
            
            if (!this._availableChords[nextIndex] || !this._availableChords[nextIndex].id) {
                console.error(`[ChordStrategy._switchChord in rAF] Could not determine next chord at index ${nextIndex}. Available:`, this._availableChords);
                return;
            }
            const nextChordId = this._availableChords[nextIndex].id;
            
            console.log(`[ChordStrategy._switchChord] Switching from ${this._selectedChordId} to: ${nextChordId} (Direction: ${direction}, CurrentIndex: ${currentIndex}, NextIndex: ${nextIndex})`);
            
            // 3. Вызываем основной метод смены аккорда
            await this.selectChord(nextChordId);

            // 4. Восстанавливаем касания для нового аккорда
            if (releasedTouches && releasedTouches.size > 0) {
                console.log(`[ChordStrategy] Re-evaluating ${releasedTouches.size} touches for the new chord: ${nextChordId}`);
                
                if (typeof pad === 'undefined' || !pad._currentDisplayedZones || typeof pad._getPadContext !== 'function') {
                    console.warn('[ChordStrategy._switchChord] Pad context not fully available for re-evaluating touches.');
                    return;
                }

                for (const [pointerId, touchData] of releasedTouches.entries()) {
                    const { x, y } = touchData;
                    // Убедимся, что pad._currentDisplayedZones актуальны для нового аккорда
                    // this.selectChord(nextChordId) уже должен был обновить их через app.updateZoneLayout()
                    const noteAction = await this.onPointerDown(pointerId, x, y, pad._currentDisplayedZones, pad._getPadContext());

                    if (noteAction && noteAction.type === 'note_on' && noteAction.note) {
                        console.log(`[ChordStrategy._switchChord] Re-starting note ${noteAction.note.name} for persistent touchId: ${pointerId} on new chord ${nextChordId}`);
                        
                        if (typeof synth !== 'undefined' && typeof synth.startNote === 'function') {
                            synth.startNote(noteAction.note.frequency, 0.7, y, pointerId);
                        } else {
                            console.warn(`[ChordStrategy._switchChord] synth.startNote not available for re-starting note.`);
                        }
                        
                        if (pad.activeTouchesInternal) {
                            const zone = pad._currentDisplayedZones.find(z => z.midiNote === noteAction.note.midiNote);
                            pad.activeTouchesInternal.set(pointerId, {
                                pointerId: pointerId, x: x, y: y,
                                currentZoneIndex: zone ? zone.index : -1, // Убедимся, что zone существует
                                baseFrequency: noteAction.note.frequency,
                                state: 'down'
                            });
                        } else {
                            console.warn(`[ChordStrategy._switchChord] pad.activeTouchesInternal not available for re-registering touch.`);
                        }
                        
                        if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchDown === 'function') {
                            visualizer.notifyTouchDown({
                                id: pointerId, x: x, y: y, 
                                rawX: touchData.rawX || 0, // Добавим проверку на существование rawX/rawY
                                rawY: touchData.rawY || 0,
                                noteInfo: noteAction.note,
                                state: 'down'
                            });
                        } else {
                            console.warn(`[ChordStrategy._switchChord] visualizer.notifyTouchDown not available.`);
                        }
                    }
                }
            }
        });
    },
    // === КОНЕЦ: НОВЫЙ УНИВЕРСАЛЬНЫЙ МЕТОД ПЕРЕКЛЮЧЕНИЯ АККОРДОВ ===

    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance) {
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineInstance;
        
        // +++ ИЗМЕНЕНИЕ: Привязываем ВСЕ обработчики один раз в init +++
        this._boundHandleClickOnChordList = this._handleClickOnChordList.bind(this);
        this._boundHandleClickOnSuggestedChords = this._handleClickOnSuggestedChords.bind(this);
        
        this._boundShowProgressionPopover = this._showProgressionPopover.bind(this);
        this._boundSaveCurrentProgression = this.saveCurrentProgression.bind(this);
        
        this._boundCollapsePanel = () => this.appRef.toggleChordPanel(true);
        this._boundExpandPanel = () => this.appRef.toggleChordPanel(false);

        this._boundToggleDeleteMode = this._toggleDeleteMode.bind(this);
        
        // Обработчики для модального окна добавления
        this._boundShowAddChordModal = this._showAddChordModal.bind(this);
        this._boundHideAddChordModal = this._hideAddChordModal.bind(this);
        this._boundConfirmAddChord = this._confirmAddChord.bind(this);
        this._boundShowRootNotePopover = this._showRootNotePopover.bind(this);
        this._boundShowChordTypePopover = this._showChordTypePopover.bind(this);
        
        // === ПРИВЯЗКА ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ===
        this._boundHideSaveProgressionModal = this._hideSaveProgressionModal.bind(this);
        this._boundConfirmSaveProgression = this._confirmSaveProgression.bind(this);
        // ==========================================================
        // === ПРИВЯЗКА ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===
        this._boundHideConfirmDeletePresetModal = this._hideConfirmDeletePresetModal.bind(this);
        this._boundExecuteActualPresetDeletion = this._executeActualPresetDeletion.bind(this);
        // =======================================================================
        this._boundHideAddChordModalOnPadInteraction = this._hideAddChordModal.bind(this); 
        this._boundHideSaveProgressionModalOnPadInteraction = this._hideSaveProgressionModal.bind(this); // Привязка для окна сохранения
        this._boundHideConfirmDeletePresetModalOnPadInteraction = this._hideConfirmDeletePresetModal.bind(this); // Привязка для окна подтверждения удаления
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
        
        console.log(`[${this.getName()}Strategy] Initialized.`);
    },

    getName: () => "chord",
    getDisplayName: () => i18n.translate('pad_mode_chord', 'Chord Mode'),

    requiresTonic: () => false, // Глобальная тоника может быть полезна для предложений, но сам режим работает от аккордов
    requiresScale: () => false, // Лад не используется, когда активен аккорд
    requiresChord: () => true,  // Режим зависит от выбранного аккорда

    getModeSpecificControlsConfig: () => {
        // Конфигурация для UI-контролов на панели настроек этого режима
        // Пока пусто, будет добавлено на следующих этапах
        return [
            // {
            //     type: 'toggle',
            //     name: 'autoSuggestChords',
            //     labelKey: 'chord_mode_auto_suggest_label',
            //     labelDefault: 'Suggest Next Chords',
            //     initialValue: true // или из app.state.chordModeSettings.autoSuggest
            // },
            // ... другие настройки
        ];
    },

    onSpecificControlChanged(controlName, value) {
        console.log(`[${this.getName()}Strategy] Control '${controlName}' changed to:`, value);
        // if (controlName === 'autoSuggestChords') {
        //     this.appRef.setModeSpecificSetting(this.getName(), 'autoSuggestChords', value);
        // }
        // Потребуется обновить UI или поведение
    },

    async getZoneLayoutOptions(appState) {
        // Контекст для генератора зон будет включать выбранный аккорд
        return {
            currentChordId: this._selectedChordId,
            currentChordNotes: this._selectedChordNotes,
        };
    },

    async generateZoneData(layoutContext, appState, services) {
        // console.log(`[${this.getName()}Strategy.generateZoneData] Context:`, layoutContext);
        // layoutContext здесь будет содержать { currentChordName, currentChordNotes } из getZoneLayoutOptions
        
        if (!this._isActive || !layoutContext || !layoutContext.currentChordId || !layoutContext.currentChordNotes || layoutContext.currentChordNotes.length === 0) {
            // Если режим не активен, или аккорд не выбран (в layoutContext), или в аккорде нет нот - возвращаем пустые зоны
            return [];
        }

        const zoneGenContext = {
            modeId: this.getName(),
            appState: appState, // для zoneCount
            services: services,
            modeSpecificContext: { // Передаем то, что получили из getZoneLayoutOptions
                currentChordName: this._selectedChordId,
                currentChordNotes: layoutContext.currentChordNotes
            }
        };

        if (typeof generateChordZones === 'function') {
            return await generateChordZones(zoneGenContext);
        } else {
            console.error(`[${this.getName()}Strategy.generateZoneData] generateChordZones function is not defined. Make sure chordZoneGenerator.js is loaded before this strategy.`);
            return [];
        }
    },

    onPointerDown(pointerId, x, y, currentZones, padContext) {
        // Логика для воспроизведения нот выбранного аккорда
        // Будет реализована в Фазе 2
        if (!this._isActive || !this._selectedChordId || currentZones.length === 0) return null;
        
        let foundZone = null;
        // Стандартная логика поиска зоны
        for (let i = 0; i < currentZones.length; i++) {
            const zone = currentZones[i];
            if (zone.startX !== undefined && zone.endX !== undefined && x >= zone.startX && x < zone.endX) {
                foundZone = zone; break;
            }
        }
        if (!foundZone && x >= 1.0 && currentZones.length > 0) { // Если коснулись самого края справа
            foundZone = currentZones[currentZones.length - 1];
        }

        if (foundZone) {
            const noteDetails = {
                frequency: foundZone.frequency,
                midiNote: foundZone.midiNote,
                name: foundZone.noteName
            };
            this._activeNoteInfo.set(pointerId, { ...noteDetails }); 
            return { type: 'note_on', note: noteDetails };
        }
        return null;
    },

    onPointerMove(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive || !this._selectedChordId || !currentZones || currentZones.length === 0) return null;
        
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
            console.log(`[ChordModeStrategy.onPointerMove] Pointer: ${pointerId}, PrevNote: ${previousNoteInfo.name} (MIDI: ${previousNoteInfo.midiNote}), NewFoundZone: ${newFoundZone.noteName} (MIDI: ${newFoundZone.midiNote}), NewDetails: ${newNoteDetails.name} (Freq: ${newNoteDetails.frequency})`);

            if (newNoteDetails.midiNote !== previousNoteInfo.midiNote) {
                this._activeNoteInfo.set(pointerId, { ...newNoteDetails });
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
        // this._activeNoteInfo.delete(pointerId);
        return null;
    },

    getPadVisualHints: (currentZones, appState, services) => {
        // Подсказки для XY-пэда, если нужны (например, подсветить основной тон аккорда)
        // Пока пусто
        return [];
    },

    async onModeActivated(appState, services, uiModules) {
        this._isActive = true;
        console.log(`[${this.getName()}Strategy] Activated.`);

        // --- Получение ссылок на DOM-элементы панели аккордов ---
        this._currentChordPanel = document.getElementById('chord-mode-panel');
        if (!this._currentChordPanel) {
            console.error('[ChordModeStrategy.onModeActivated] Chord panel element not found!');
            // Можно добавить более строгую обработку ошибки, если панель критична
        }

        this._chordListContainer = this._currentChordPanel?.querySelector('#chord-list-container');
        this._suggestedChordsContainer = this._currentChordPanel?.querySelector('#suggested-chords-list');
        this._addChordButtonOnPanel = this._currentChordPanel?.querySelector('#add-chord-button');
        this._deleteModeToggleButton = this._currentChordPanel?.querySelector('#delete-chords-toggle-btn');
        
        this._progressionSelectDisplay = this._currentChordPanel?.querySelector('#progression-select-display');
        this._saveProgressionBtn = this._currentChordPanel?.querySelector('#save-progression-btn');


        // --- Получение ссылок на DOM-элементы модального окна добавления аккорда ---
        this._addChordModal = document.getElementById('add-chord-modal');
        if (this._addChordModal) {
            console.log('[ChordStrategy.onModeActivated] #add-chord-modal element FOUND.');
            this._chordRootDisplay = this._addChordModal.querySelector('#chord-root-note-display'); 
            this._chordTypeDisplay = this._addChordModal.querySelector('#chord-type-display');    
            this._confirmAddChordButton = this._addChordModal.querySelector('#confirm-add-chord-button'); 
            this._cancelAddChordButton = this._addChordModal.querySelector('#cancel-add-chord-button');   
            this._closeAddChordModalButton = this._addChordModal.querySelector('#close-add-chord-modal'); 

            console.log(`[ChordStrategy.onModeActivated] Querying for #chord-root-note-display: ${this._chordRootDisplay ? 'FOUND' : 'NOT FOUND'}`);
            console.log(`[ChordStrategy.onModeActivated] Querying for #chord-type-display: ${this._chordTypeDisplay ? 'FOUND' : 'NOT FOUND'}`);
            console.log(`[ChordStrategy.onModeActivated] Querying for #confirm-add-chord-button (Add): ${this._confirmAddChordButton ? 'FOUND' : 'NOT FOUND'}`);
            console.log(`[ChordStrategy.onModeActivated] Querying for #cancel-add-chord-button (Cancel): ${this._cancelAddChordButton ? 'FOUND' : 'NOT FOUND'}`);
            console.log(`[ChordStrategy.onModeActivated] Querying for #close-add-chord-modal (X): ${this._closeAddChordModalButton ? 'FOUND' : 'NOT FOUND'}`);
        } else {
            console.error('[ChordStrategy.onModeActivated] #add-chord-modal element itself NOT FOUND!');
        }

        // === ПОЛУЧЕНИЕ ССЫЛОК для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
        this._saveProgressionModal = document.getElementById('save-progression-modal');
        if (this._saveProgressionModal) {
            this._progressionNameInput = this._saveProgressionModal.querySelector('#progression-name-input');
            this._confirmSaveProgressionButton = this._saveProgressionModal.querySelector('#confirm-save-progression-btn');
            this._cancelSaveProgressionButton = this._saveProgressionModal.querySelector('#cancel-save-progression-btn');
            this._closeSaveProgressionModalButton = this._saveProgressionModal.querySelector('#close-save-progression-modal-btn');
        } else {
            console.error('[ChordModeStrategy.onModeActivated] Save progression modal element not found!');
        }
        // ====================================================================
        // === ПОЛУЧЕНИЕ ССЫЛОК для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===
        this._confirmDeletePresetModal = document.getElementById('confirm-delete-preset-modal');
        if (this._confirmDeletePresetModal) {
            this._confirmDeletePresetMessageElement = this._confirmDeletePresetModal.querySelector('#confirm-delete-preset-message');
            this._confirmDeletePresetActionButton = this._confirmDeletePresetModal.querySelector('#confirm-delete-preset-action-btn');
            this._cancelDeletePresetButton = this._confirmDeletePresetModal.querySelector('#cancel-delete-preset-btn');
            this._closeConfirmDeletePresetModalButton = this._confirmDeletePresetModal.querySelector('#close-confirm-delete-preset-modal-btn');
        } else {
            console.error('[ChordModeStrategy.onModeActivated] Confirm delete preset modal element not found!');
        }
        // ===========================================================================

        // --- Добавление обработчиков событий ---
        this._chordListContainer?.addEventListener('click', this._boundHandleClickOnChordList);
        this._suggestedChordsContainer?.addEventListener('click', this._boundHandleClickOnSuggestedChords);
        this._addChordButtonOnPanel?.addEventListener('click', this._boundShowAddChordModal);
        this._deleteModeToggleButton?.addEventListener('click', this._boundToggleDeleteMode);
        
        this._progressionSelectDisplay?.addEventListener('click', this._boundShowProgressionPopover);
        this._saveProgressionBtn?.addEventListener('click', this._boundSaveCurrentProgression); // Теперь вызывает _showSaveProgressionModal

        // Обработчики для модального окна добавления аккорда
        // Удаляем слушатель с _modalOverlay, так как его нет в HTML для #add-chord-modal
        // this._modalOverlay?.addEventListener('click', this._boundHideAddChordModal);
        
        this._chordRootDisplay?.addEventListener('click', this._boundShowRootNotePopover);
        this._chordTypeDisplay?.addEventListener('click', this._boundShowChordTypePopover);

        // Явное добавление слушателей для кнопок модального окна #add-chord-modal
        if (this._confirmAddChordButton) {
            this._confirmAddChordButton.addEventListener('click', this._boundConfirmAddChord);
            console.log('[ChordStrategy.onModeActivated] Listener ADDED for #confirm-add-chord-button (Add).');
        } else {
            console.error('[ChordStrategy.onModeActivated] _confirmAddChordButton was NOT FOUND, listener for Add not added.');
        }

        if (this._cancelAddChordButton) {
            this._cancelAddChordButton.addEventListener('click', this._boundHideAddChordModal);
            console.log('[ChordStrategy.onModeActivated] Listener ADDED for #cancel-add-chord-button (Cancel).');
        } else {
            console.error('[ChordStrategy.onModeActivated] _cancelAddChordButton was NOT FOUND, listener for Cancel not added.');
        }

        if (this._closeAddChordModalButton) {
            this._closeAddChordModalButton.addEventListener('click', this._boundHideAddChordModal);
            console.log('[ChordStrategy.onModeActivated] Listener ADDED for #close-add-chord-modal (X).');
        } else {
            console.error('[ChordStrategy.onModeActivated] _closeAddChordModalButton was NOT FOUND, listener for X not added.');
        }

        // === ДОБАВЛЕНИЕ ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
        if (this._saveProgressionModal) {
            this._confirmSaveProgressionButton?.addEventListener('click', this._boundConfirmSaveProgression);
            this._cancelSaveProgressionButton?.addEventListener('click', this._boundHideSaveProgressionModal);
            this._closeSaveProgressionModalButton?.addEventListener('click', this._boundHideSaveProgressionModal);
            // Добавляем обработчик для Enter в поле ввода
            this._progressionNameInput?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault(); // Предотвращаем стандартное поведение (например, перенос строки)
                    this._boundConfirmSaveProgression();
                }
            });
        }
        // ======================================================================
        // === ДОБАВЛЕНИЕ ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===
        if (this._confirmDeletePresetModal) {
            this._confirmDeletePresetActionButton?.addEventListener('click', this._boundExecuteActualPresetDeletion);
            this._cancelDeletePresetButton?.addEventListener('click', this._boundHideConfirmDeletePresetModal);
            this._closeConfirmDeletePresetModalButton?.addEventListener('click', this._boundHideConfirmDeletePresetModal);
        }
        // ===========================================================================

        // Кнопки сворачивания/разворачивания панели
        this._collapseBtn = document.getElementById('chord-panel-collapse-btn');
        this._expandBtn = document.getElementById('chord-panel-expand-btn');
        this._collapseBtn?.addEventListener('click', this._boundCollapsePanel);
        this._expandBtn?.addEventListener('click', this._boundExpandPanel);
        
        // Инициализация SortableJS для списка аккордов
        if (this._chordListContainer && typeof Sortable !== 'undefined') {
            this._sortableInstance = Sortable.create(this._chordListContainer, {
                animation: 150,
                ghostClass: 'sortable-ghost', // Класс для элемента-призрака
                chosenClass: 'sortable-chosen', // Класс для выбранного элемента
                dragClass: 'sortable-dragging', // Класс для перетаскиваемого элемента
                filter: '.delete-chord-btn', // Игнорировать перетаскивание по кнопке удаления
                preventOnFilter: true,
                onEnd: (evt) => {
                    if (evt.oldIndex !== evt.newIndex) {
                        const movedItem = this._availableChords.splice(evt.oldIndex, 1)[0];
                        this._availableChords.splice(evt.newIndex, 0, movedItem);
                        console.log(`[ChordStrategy.onEnd] Dragged item: ${movedItem.displayName} (ID: ${movedItem.id}) from ${evt.oldIndex} to ${evt.newIndex}`);
                        this._renderChordPanel();
                        
                        this.selectChord(movedItem.id).then(() => {
                            console.log(`[ChordStrategy.onEnd] AFTER selectChord for ${movedItem.id}, current selected ID is: ${this._selectedChordId}`);
                        }).catch(error => {
                            console.error(`[ChordStrategy.onEnd] Error selecting chord ${movedItem.id} after drag-n-drop:`, error);
                        });
                        console.log('[ChordModeStrategy] Chord order changed by drag-n-drop.');
                    }
                }
            });
        }
        

        // --- Инициализация состояния панели и UI ---
        this._renderChordPanel();
        this._updateDeleteModeUI();

        // Загрузка прогрессии по умолчанию или последней выбранной (если есть)
        if (!this._loadedProgressionId && moduleManager) {
            const defaultProg = await moduleManager.getModule('default_progression');
            if (defaultProg && defaultProg.id) {
                await this.loadProgression(defaultProg.id);
            } else if (this._availableChords.length > 0) {
                // Если нет дефолтной, но есть какие-то аккорды, выбираем первый
                await this.selectChord(this._availableChords[0].id);
            }
        } else if (this._loadedProgressionId) {
             await this.loadProgression(this._loadedProgressionId); // Перезагружаем текущую, чтобы обновить дисплей
        }
        
        // Если аккордов нет, но и прогрессия не загружена, может быть, стоит выбрать первый добавленный аккорд.
        // Но selectChord уже вызывается в loadProgression или при загрузке по умолчанию.
        if (this._availableChords.length > 0 && !this._selectedChordId) {
            await this.selectChord(this._availableChords[0].id);
        }


        this.appRef.updateZoneLayout(); // Первоначальная отрисовка зон
        this.appRef.notifyProgressionChanged(); // Обновить топбар

        // Убедимся, что оверлей модального окна добавления аккорда скрыт при активации режима
        this._hideAddChordModal(); 
        this._hideSaveProgressionModal(); // И для окна сохранения

        // --- Получение ссылок на UI таймера ---
        this._timerModal = document.getElementById('chord-timer-modal');
        this._timerToggleButton = this._currentChordPanel?.querySelector('#chord-timer-toggle-btn');
        if (this._timerModal) {
            this._timerModeRadios = this._timerModal.querySelectorAll('input[name="timer-mode"]');
            this._rhythmSettingsContainer = this._timerModal.querySelector('#timer-rhythm-settings');
            this._secondsSettingsContainer = this._timerModal.querySelector('#timer-seconds-settings');
            this._bpmInput = this._timerModal.querySelector('#timer-bpm-input');
            this._intervalDisplay = this._timerModal.querySelector('#timer-interval-select-display');
            this._secondsInput = this._timerModal.querySelector('#timer-seconds-input');
            this._startTimerBtn = this._timerModal.querySelector('#start-chord-timer-btn');
            this._cancelTimerBtn = this._timerModal.querySelector('#cancel-chord-timer-btn');
            this._closeTimerModalBtn = this._timerModal.querySelector('#close-chord-timer-modal-btn');
        }

        // --- Привязка обработчиков таймера ---
        this._boundToggleTimer = this._toggleTimer.bind(this);
        this._boundShowTimerModal = this._showTimerModal.bind(this);
        this._boundHideTimerModal = this._hideTimerModal.bind(this);
        this._boundStartTimer = this._startTimer.bind(this);
        this._boundStopTimer = this._stopTimer.bind(this);
        this._boundSwitchTimerModeUI = this._switchTimerModeUI.bind(this);
        this._boundShowIntervalPopover = this._showIntervalPopover.bind(this);
        // _boundSelectNextChord will be bound to this._selectNextChord (a new method) later if needed for direct event listening,
        // for now it's called directly by the timer. The plan had this.selectNextChord.bind(this) which is an existing method.
        // Let's stick to the plan:
        this._boundSelectNextChord = this._selectNextChord.bind(this);


        // --- Добавление слушателей для таймера ---
        this._timerToggleButton?.addEventListener('click', this._boundToggleTimer);
        this._startTimerBtn?.addEventListener('click', this._boundStartTimer);
        this._cancelTimerBtn?.addEventListener('click', this._boundHideTimerModal);
        this._closeTimerModalBtn?.addEventListener('click', this._boundHideTimerModal);
        this._timerModeRadios?.forEach(radio => radio.addEventListener('change', this._boundSwitchTimerModeUI));
        this._intervalDisplay?.addEventListener('mousedown', this._boundShowIntervalPopover);

        // this.appRef.updateZones(); // Обновление зон, если оно не вызывается где-то еще после активации
        // console.log(`[${this.getName()}Strategy] Activated. Selected chord: ${this._selectedChordId}`); // Этот лог уже может быть в конце метода
    },

    onModeDeactivated(appState, services, uiModules) {
        this._isActive = false;
        
        // Отвязываем ВСЕ слушатели
        this._chordListContainer?.removeEventListener('click', this._boundHandleClickOnChordList);
        this._suggestedChordsContainer?.removeEventListener('click', this._boundHandleClickOnSuggestedChords);
        this._progressionSelectDisplay?.removeEventListener('click', this._boundShowProgressionPopover);
        this._saveProgressionBtn?.removeEventListener('click', this._boundSaveCurrentProgression);
        this._collapseBtn?.removeEventListener('click', this._boundCollapsePanel);
        this._expandBtn?.removeEventListener('click', this._boundExpandPanel);
        this._addChordButtonOnPanel?.removeEventListener('click', this._boundShowAddChordModal);
        this._deleteModeToggleButton?.removeEventListener('click', this._boundToggleDeleteMode);
        this._closeAddChordModalButton?.removeEventListener('click', this._boundHideAddChordModal);
        this._cancelAddChordButton?.removeEventListener('click', this._boundHideAddChordModal);
        this._confirmAddChordButton?.removeEventListener('click', this._boundConfirmAddChord);
        this._chordRootDisplay?.removeEventListener('click', this._boundShowRootNotePopover);
        this._chordTypeDisplay?.removeEventListener('click', this._boundShowChordTypePopover);

        // === УДАЛЕНИЕ ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
        if (this._saveProgressionModal) {
            this._confirmSaveProgressionButton?.removeEventListener('click', this._boundConfirmSaveProgression);
            this._cancelSaveProgressionButton?.removeEventListener('click', this._boundHideSaveProgressionModal);
            this._closeSaveProgressionModalButton?.removeEventListener('click', this._boundHideSaveProgressionModal);
            // Удаляем обработчик для Enter (если он был добавлен таким же способом)
            // Для анонимных функций, как в примере выше, прямое удаление сложно.
            // Лучше определить именованную функцию-обработчик и привязывать/удалять ее.
            // Но для данного случая, так как слушатель добавляется только если this._progressionNameInput существует,
            // и сам this._progressionNameInput обнуляется в onModeDeactivated, это не должно вызвать утечек.
            // Если бы это было проблемой, нужно было бы сохранить ссылку на функцию обработчика.
        }
        // ========================================================================
        // === УДАЛЕНИЕ ОБРАБОТЧИКОВ для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===
        if (this._confirmDeletePresetModal) {
            this._confirmDeletePresetActionButton?.removeEventListener('click', this._boundExecuteActualPresetDeletion);
            this._cancelDeletePresetButton?.removeEventListener('click', this._boundHideConfirmDeletePresetModal);
            this._closeConfirmDeletePresetModalButton?.removeEventListener('click', this._boundHideConfirmDeletePresetModal);
        }
        // ===========================================================================

        // Очистка ссылок на DOM элементы модального окна добавления
        this._addChordModal = null;
        this._modalOverlay = null;
        this._chordRootDisplay = null;
        this._chordTypeDisplay = null;
        this._confirmAddChordButton = null;
        this._cancelAddChordButton = null;
        this._closeAddChordModalButton = null;
        
        // === ОЧИСТКА ССЫЛОК для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
        this._saveProgressionModal = null;
        this._progressionNameInput = null;
        this._confirmSaveProgressionButton = null;
        this._cancelSaveProgressionButton = null;
        this._closeSaveProgressionModalButton = null;
        // ================================================================
        // === ОЧИСТКА ССЫЛОК для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===
        this._confirmDeletePresetModal = null;
        this._confirmDeletePresetMessageElement = null;
        this._confirmDeletePresetActionButton = null;
        this._cancelDeletePresetButton = null;
        this._closeConfirmDeletePresetModalButton = null;
        this._progressionIdToDelete = null;
        // ====================================================================
        
        // Уничтожаем экземпляр SortableJS
        if (this._sortableInstance) {
            this._sortableInstance.destroy();
            this._sortableInstance = null;
        }
        
        console.log(`[${this.getName()}Strategy] Mode deactivated and listeners removed.`);

        this._stopTimer(); // Гарантированно останавливаем таймер

        // --- Удаление слушателей таймера ---
        this._timerToggleButton?.removeEventListener('click', this._boundToggleTimer);
        this._startTimerBtn?.removeEventListener('click', this._boundStartTimer);
        this._cancelTimerBtn?.removeEventListener('click', this._boundHideTimerModal);
        this._closeTimerModalBtn?.removeEventListener('click', this._boundHideTimerModal);
        this._timerModeRadios?.forEach(radio => radio.removeEventListener('change', this._boundSwitchTimerModeUI));
        this._intervalDisplay?.removeEventListener('mousedown', this._boundShowIntervalPopover);
    },

    _renderChordPanel() {
        if (!this._chordListContainer) {
            console.warn(`[${this.getName()}Strategy] _renderChordPanel: Chord list container not found.`);
            return;
        }
        this._chordListContainer.innerHTML = ''; 
        this._availableChords.forEach(chordData => {
            const button = document.createElement('button');
            button.classList.add('button', 'chord-button');
            button.dataset.chordId = chordData.id;
            
            const nameSpan = document.createElement('span');
            nameSpan.classList.add('chord-name-display');
            nameSpan.textContent = chordData.displayName;
            button.appendChild(nameSpan);

            const deleteBtn = document.createElement('span');
            deleteBtn.classList.add('delete-chord-btn');
            deleteBtn.innerHTML = '&times;'; 
            deleteBtn.dataset.deleteChordId = chordData.id; 
            button.appendChild(deleteBtn);
            
            this._chordListContainer.appendChild(button);
        });
        this._updateChordButtonSelection(this._selectedChordId);
        if (this._deleteConfirmTargetId) {
            const btnToShowX = this._chordListContainer.querySelector(`.chord-button[data-chord-id="${this._deleteConfirmTargetId}"]`);
            if (btnToShowX) btnToShowX.classList.add('confirm-delete');
        }
    },

    _hideDeleteConfirmation() {
        const buttons = this._chordListContainer?.querySelectorAll('.chord-button');
        if (buttons) {
            buttons.forEach(btn => btn.classList.remove('confirm-delete'));
        }
        this._deleteConfirmTargetId = null;
    },

    _populateSelect(selectElement, options, defaultValue) {
        if (!selectElement) return;
        selectElement.innerHTML = '';
        if (Array.isArray(options)) { // Для простых массивов (ноты, октавы)
            options.forEach(optValue => {
                const option = document.createElement('option');
                option.value = optValue;
                option.textContent = optValue;
                selectElement.appendChild(option);
            });
        } else { // Для объекта (типы аккордов)
            for (const val in options) {
                const option = document.createElement('option');
                option.value = val;
                option.textContent = options[val]; // Отображаемое имя
                selectElement.appendChild(option);
            }
        }
        if (defaultValue !== undefined) {
            selectElement.value = defaultValue;
        }
    },

    _showAddChordModal() {
        if (this._isDeleteModeActive) {
            this._toggleDeleteMode();
        }
        
        if (!this._addChordModal) return;
        
        // Сбрасываем временные значения на дефолтные при каждом открытии
        this._modalSelectedRoot = 'C';
        this._modalSelectedType = 'M';
        
        // Обновляем текст в div'ах
        if (this._chordRootDisplay) this._chordRootDisplay.textContent = this._modalSelectedRoot;
        if (this._chordTypeDisplay) this._chordTypeDisplay.textContent = this._chordTypes[this._modalSelectedType];
        
        this._addChordModal.style.display = 'block';

        // Добавляем слушатель на XY-пэд для закрытия модального окна
        this._xyPadContainerElementForModalClose = document.getElementById('xy-pad-container');
        if (this._xyPadContainerElementForModalClose) {
            this._xyPadContainerElementForModalClose.addEventListener('pointerdown', this._boundHideAddChordModalOnPadInteraction, { once: true });
            console.log('[ChordStrategy._showAddChordModal] Added pointerdown listener to xy-pad-container');
        } else {
            console.warn('[ChordStrategy._showAddChordModal] xy-pad-container not found for attaching close listener.');
        }
    },

    _hideAddChordModal() {
        console.log('[ChordStrategy._hideAddChordModal] CALLED'); 
        if (this._addChordModal) {
            this._addChordModal.style.display = 'none';
        }
        // Удаляем слушатель с XY-пэда, если он был добавлен
        if (this._xyPadContainerElementForModalClose && this._boundHideAddChordModalOnPadInteraction) {
            // Опция { once: true } не указывается при удалении, только сам флаг useCapture (третий аргумент), если он был true.
            // В нашем случае useCapture не использовался, поэтому достаточно двух аргументов.
            this._xyPadContainerElementForModalClose.removeEventListener('pointerdown', this._boundHideAddChordModalOnPadInteraction);
            console.log('[ChordStrategy._hideAddChordModal] Removed pointerdown listener from xy-pad-container');
        }
        this._xyPadContainerElementForModalClose = null; 
    },

    _showRootNotePopover() {
        console.log('[ChordStrategy._showRootNotePopover] CALLED'); // Лог вызова
        if (typeof showCustomSelectorPopover !== 'function') {
            console.error('[ChordStrategy._showRootNotePopover] showCustomSelectorPopover is not a function!');
            return;
        }
        
        showCustomSelectorPopover({
            type: 'chordRootNote',
            title: i18n.translate('chord_root_note_label', 'Root Note'),
            itemsArray: this._rootNotes.map(note => ({ id: note, name: note })),
            currentValue: this._modalSelectedRoot,
            onSelect: (selectedValue) => {
                this._modalSelectedRoot = selectedValue;
                if (this._chordRootDisplay) {
                    this._chordRootDisplay.textContent = selectedValue;
                }
            }
        });
    },
    
    _showChordTypePopover() {
        console.log('[ChordStrategy._showChordTypePopover] CALLED'); // Лог вызова
        if (typeof showCustomSelectorPopover !== 'function') {
            console.error('[ChordStrategy._showChordTypePopover] showCustomSelectorPopover is not a function!');
            return;
        }
        
        const chordTypeOptions = Object.entries(this._chordTypes).map(([key, displayName]) => ({
            id: key,
            name: displayName
        }));
        
        showCustomSelectorPopover({
            type: 'chordType',
            title: i18n.translate('chord_type_label', 'Chord Type'),
            itemsArray: chordTypeOptions,
            currentValue: this._modalSelectedType,
            onSelect: (selectedValue) => {
                this._modalSelectedType = selectedValue;
                if (this._chordTypeDisplay) {
                    this._chordTypeDisplay.textContent = this._chordTypes[selectedValue];
                }
            }
        });
    },

    _confirmAddChord() {
        console.log('[ChordStrategy._confirmAddChord] CALLED'); 
        const root = this._modalSelectedRoot;
        const typeKey = this._modalSelectedType;
        const octave = 4; // Октава по умолчанию для ID и nameForService

        // Формируем displayName без октавы
        const displayName = `${root} ${this._chordTypes[typeKey] || typeKey}`;
        // ID и nameForService по-прежнему включают октаву для уникальности и работы с Tonal.js
        const newChordId = `${root}${octave}${typeKey}`;
        const nameForService = newChordId;
        
        if (this._availableChords.find(c => c.id === newChordId)) {
            console.warn(`[ChordStrategy] Chord ${newChordId} already exists.`);
            this._hideAddChordModal();
            return;
        }
        
        const newChordData = { id: newChordId, nameForService, displayName };
        
        this._availableChords.push(newChordData);
        this._renderChordPanel(); // Обновляем отображение списка аккордов на панели
        
        console.log(`[ChordStrategy] Added new chord:`, newChordData);
        this._hideAddChordModal(); // Скрываем модальное окно
        
        // АВТОМАТИЧЕСКИ ВЫБИРАЕМ НОВЫЙ АККОРД
        // Это должно вызвать обновление зон XY-пэда и звука
        this.selectChord(newChordData.id).then(() => {
            console.log(`[ChordStrategy] New chord ${newChordData.id} selected after add.`);
            // Дополнительно уведомляем топбар, если selectChord сам этого не делает в конце
            // (хотя он должен это делать)
            this.appRef.notifyProgressionChanged(); 
        }).catch(error => {
            console.error(`[ChordStrategy] Error selecting new chord ${newChordData.id} after add:`, error);
        });

        // Старый вызов notifyProgressionChanged, который мог быть преждевременным
        // this.appRef.notifyProgressionChanged(); 
    },

    _handleClickOnChordList(event) {
        if (!this._isActive) return;
        
        const targetDeleteButton = event.target.closest('.delete-chord-btn');
        const targetChordButton = event.target.closest('.chord-button');
        
        if (this._isDeleteModeActive) {
            if (targetDeleteButton && targetChordButton) { // Клик на иконку "X" внутри кнопки аккорда
                event.stopPropagation(); // Предотвращаем обработку клика родительской кнопкой
                const chordIdToDelete = targetDeleteButton.dataset.deleteChordId;
                // Убедимся, что это "X" от той же кнопки, на которую кликнули
                if (chordIdToDelete === targetChordButton.dataset.chordId) { 
                    console.log(`[ChordStrategy] Delete icon clicked for chord: ${chordIdToDelete}. Executing delete.`);
                    this._deleteChord(chordIdToDelete);
                } else {
                    console.warn("[ChordStrategy] Mismatch between delete icon's chordId and parent button's chordId or button not found.");
                }
            } else if (targetChordButton) { // Клик на тело кнопки аккорда (не на "X") в режиме удаления
                console.log(`[ChordStrategy] Chord button body clicked in delete mode for chord: ${targetChordButton.dataset.chordId}. No action.`);
                // Ничего не делаем, предотвращаем выбор
            }
            return; // В режиме удаления дальнейшая логика выбора не нужна
        }

        // Логика для обычного режима (не режим удаления)
            if (targetChordButton) {
            const chordIdToSelect = targetChordButton.dataset.chordId;
            console.log(`[ChordStrategy] Chord button clicked (normal mode): ${chordIdToSelect}. Selecting.`);
            this.selectChord(chordIdToSelect);
        }
    },

    _deleteChord(chordId) {
        const wasSelected = this._selectedChordId === chordId;
        this._availableChords = this._availableChords.filter(c => c.id !== chordId);
        this._renderChordPanel(); // Перерисовываем панель без удаленного аккорда
        
        if (wasSelected) {
            // Если удалили активный аккорд, выбираем первый из оставшихся или ничего
            if (this._availableChords.length > 0) {
                this.selectChord(this._availableChords[0].id);
            } else {
                // Если аккордов не осталось, сбрасываем состояние
                this._selectedChordId = null;
                this._selectedChordDisplayName = null;
                this._selectedChordNotes = [];
                if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
                    this.appRef.updateZoneLayout();
                }
            }
        }
        
        // Если после удаления не осталось аккордов, выключаем режим удаления
        if (this._availableChords.length === 0 && this._isDeleteModeActive) {
            this._toggleDeleteMode();
        }
        
        console.log(`[${this.getName()}Strategy] Chord ${chordId} deleted.`);
        if (this.appRef && typeof this.appRef.notifyProgressionChanged === 'function') {
            this.appRef.notifyProgressionChanged();
        }
    },

    _renderSuggestedChords(suggestedChordsArray = []) {
        if (!this._suggestedChordsContainer) return;
        this._suggestedChordsContainer.innerHTML = ''; 

        if (suggestedChordsArray.length === 0) {
            return;
        }

        suggestedChordsArray.forEach(chordData => {
            const button = document.createElement('button');
            button.classList.add('button', 'chord-button'); 
            button.dataset.chordId = chordData.id; 
            button.textContent = chordData.displayName;
            this._suggestedChordsContainer.appendChild(button);
        });
    },
    
    _getChordSuggestions(currentChordData) {
        if (!this.musicTheoryServiceRef || typeof this.musicTheoryServiceRef.getDiatonicChordSuggestions !== 'function') {
            console.warn("[ChordStrategy._getChordSuggestions] MusicTheoryService or getDiatonicChordSuggestions not available.");
            return [];
        }

        const globalTonic = this.appRef?.state?.currentTonic || 'C4';
        const globalScale = this.appRef?.state?.scale || 'major';
        let currentChordTokenized = null;
        let desiredOctave = 4; // Дефолтная октава для предложений

        if (currentChordData && currentChordData.nameForService) {
            try {
                const currentChordInfo = Tonal.Chord.get(currentChordData.nameForService);
                if (!currentChordInfo.empty) {
                    currentChordTokenized = {
                        tonic: Tonal.Note.pitchClass(currentChordInfo.tonic),
                        type: currentChordInfo.type
                    };
                    // Попробуем взять октаву из текущего аккорда для предложений
                    if (currentChordInfo.tonic && /\d/.test(currentChordInfo.tonic)) {
                        desiredOctave = parseInt(currentChordInfo.tonic.slice(-1), 10);
                    }
                }
            } catch (e) {
                console.warn("[ChordStrategy._getChordSuggestions] Error tokenizing current chord:", e);
            }
        }
        
        console.log(`[ChordStrategy._getChordSuggestions] Requesting suggestions for tonic: ${globalTonic}, scale: ${globalScale}, current: ${JSON.stringify(currentChordTokenized)}, octave: ${desiredOctave}`);

        const suggestionsFromService = this.musicTheoryServiceRef.getDiatonicChordSuggestions({
            tonic: globalTonic,
            scaleName: globalScale,
            currentChordTokenized: currentChordTokenized,
            desiredOctave: desiredOctave
        });

        if (!Array.isArray(suggestionsFromService)) {
            console.warn("[ChordStrategy._getChordSuggestions] Suggestions from service is not an array.");
            return [];
        }

        // Фильтруем предложения, которые уже есть в _availableChords
        const finalSuggestions = suggestionsFromService.filter(sugg => 
            !this._availableChords.find(avail => avail.id === sugg.id)
        );
        
        console.log("[ChordStrategy._getChordSuggestions] Final suggestions after filtering:", finalSuggestions);
        return finalSuggestions;
    },

    _updateSuggestedChordsDisplay(selectedChordData) {
        // +++ Сохраняем предложения в свойство экземпляра +++
        this._currentSuggestions = this._getChordSuggestions(selectedChordData);
        this._renderSuggestedChords(this._currentSuggestions);
    },

    _handleClickOnSuggestedChords(event) {
        const button = event.target.closest('.chord-button'); 
        if (!button) return;

            const chordId = button.dataset.chordId;
        console.log(`[ChordStrategy] Suggested chord button clicked: ${chordId}`);

        // +++ ИЗМЕНЕНИЕ: Ищем в _currentSuggestions, а не вызываем get... заново +++
        const suggestedChordInfo = this._currentSuggestions.find(s => s.id === chordId);

        if (!suggestedChordInfo) {
            console.error(`Could not find suggestion data for ID: ${chordId}. This shouldn't happen.`);
            return;
        }

                    if (!this._availableChords.find(c => c.id === suggestedChordInfo.id)) {
                        this._availableChords.push(suggestedChordInfo); 
                        this._renderChordPanel(); 
                    }
        
            this.selectChord(chordId); 
    },

    _toggleDeleteMode() {
        this._isDeleteModeActive = !this._isDeleteModeActive;
        console.log(`[ChordStrategy] Delete mode toggled to: ${this._isDeleteModeActive}`);
        this._updateDeleteModeUI();
    },

    _updateDeleteModeUI() {
        if (!this._chordListContainer || !this._deleteModeToggleButton) return;
        this._chordListContainer.classList.toggle('delete-mode', this._isDeleteModeActive);
        this._deleteModeToggleButton.classList.toggle('active', this._isDeleteModeActive);
    },

    _onPinchPointerDown(event) {
        // Жест работает, только если касание произошло на самой панели (не на контенте)
        // или на специальной области, если хотим ее выделить.
        // Для простоты, ловим на всей панели.
        if (event.target !== this._currentChordPanel && event.target !== this._chordListContainer) {
            return;
        }
        
        // Добавляем палец в отслеживание
        this._pinchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        
        // Если это второй палец, начинаем отслеживание жеста
        if (this._pinchState.pointers.size === 2) {
            event.stopPropagation(); // Предотвращаем другие действия
            this._pinchState.isPinching = true;
            
            const pointers = Array.from(this._pinchState.pointers.values());
            const p1 = pointers[0];
            const p2 = pointers[1];
            
            this._pinchState.initialDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            this._pinchState.initialWidth = this._currentChordPanel.offsetWidth;
            
            // Добавляем глобальные обработчики
            document.addEventListener('pointermove', this._boundOnPinchPointerMove);
            document.addEventListener('pointerup', this._boundOnPinchPointerUp);
        }
    },
    
    _onPinchPointerMove(event) {
        if (!this._pinchState.isPinching || !this._pinchState.pointers.has(event.pointerId)) {
            return;
        }
        
        // Обновляем позицию пальца
        this._pinchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        
        const pointers = Array.from(this._pinchState.pointers.values());
        if (pointers.length < 2) return; // На случай если один палец уже убрали
        
        const p1 = pointers[0];
        const p2 = pointers[1];
        const currentDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        
        const scaleFactor = currentDistance / this._pinchState.initialDistance;
        const newWidth = this._pinchState.initialWidth * scaleFactor;
        
        // Вызываем централизованную функцию для изменения ширины
        this.appRef.setChordPanelWidth(newWidth);
    },
    
    _onPinchPointerUp(event) {
        if (this._pinchState.pointers.has(event.pointerId)) {
            this._pinchState.pointers.delete(event.pointerId);
        }
        
        // Если пальцев осталось меньше двух, прекращаем жест
        if (this._pinchState.pointers.size < 2 && this._pinchState.isPinching) {
            this._pinchState.isPinching = false;
            
            // Удаляем глобальные обработчики
            document.removeEventListener('pointermove', this._boundOnPinchPointerMove);
            document.removeEventListener('pointerup', this._boundOnPinchPointerUp);
            
            console.log("Pinch gesture ended.");
        }
    },

    // Добавляем геттеры
    getAvailableChords: function() { return this._availableChords; },
    getSelectedChordId: function() { return this._selectedChordId; },

    _showProgressionPopover() {
        showCustomSelectorPopover({
            type: 'chordProgression',
            title: i18n.translate('progression_select_title', 'Select Progression'),
            currentValue: this._loadedProgressionId,
            onSelect: (presetId) => {
                if (presetId) {
                    this.loadProgression(presetId);
                }
            },
            onDelete: (presetId) => {
                if (presetId) {
                    this.deleteProgression(presetId);
                }
            }
        });
    },

    _updateProgressionDisplay(name) {
        if (this._progressionSelectDisplay) {
            this._progressionSelectDisplay.textContent = name;
        }
    },

    async loadProgression(progressionId) {
        console.log(`[ChordStrategy] Loading progression: ${progressionId}`);
        const module = await moduleManager.getModule(progressionId);
        if (!module?.data?.data?.chordIds) {
            console.error(`Failed to load progression data for ${progressionId}`);
            return;
        }

        const chordIds = module.data.data.chordIds;
        this._availableChords = chordIds.map(id => {
            const rootMatch = id.match(/[A-Ga-g][#b]?/);
            const octaveMatch = id.match(/\d/);
            if (!rootMatch || !octaveMatch) return null; 
            
            const root = rootMatch[0];
            const octave = octaveMatch[0];
            const typeKey = id.replace(root, '').replace(octave, '');
            // Формируем displayName без октавы
            const displayName = `${root} ${this._chordTypes[typeKey] || typeKey}`;

            return { id: id, nameForService: id, displayName: displayName };
        }).filter(Boolean); 

        this._loadedProgressionId = progressionId;
        
        this._renderChordPanel();
        this._updateProgressionDisplay(module.name);
        
        // Выбираем первый аккорд или сбрасываем, если прогрессия пуста
        if (this._availableChords.length > 0) {
            await this.selectChord(this._availableChords[0].id);
        } else {
            await this.selectChord(null); // Сбросить выбор, если прогрессия пуста
        }
    },

    async saveCurrentProgression() {
        if (!this._isActive) return;
        
        // Теперь этот метод просто показывает модальное окно
        this._showSaveProgressionModal();
    },

    async deleteProgression(progressionId) {
        if (!progressionId.startsWith('user_')) {
            alert(i18n.translate('cannot_delete_default_progressions', "Cannot delete default progressions."));
            return;
        }
        
        const progressionToDelete = moduleManager.moduleDataCache[progressionId];
        const progressionName = progressionToDelete ? progressionToDelete.name : progressionId;

        this._showConfirmDeletePresetModal(progressionId, progressionName);
    },

    // === НОВЫЕ МЕТОДЫ для МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ПРЕСЕТА ===
    _showConfirmDeletePresetModal(progressionId, progressionName) {
        if (!this._confirmDeletePresetModal || !this._confirmDeletePresetMessageElement) return;

        this._progressionIdToDelete = progressionId; 
        
        const message = i18n.translate('confirm_delete_preset_message', 
            `Are you sure you want to delete the progression "${progressionName || 'this preset'}"? This action cannot be undone.`
        );
        this._confirmDeletePresetMessageElement.textContent = message;
        
        this._confirmDeletePresetModal.style.display = 'block';

        // Добавляем слушатель на XY-пэд для закрытия модального окна подтверждения удаления
        this._xyPadContainerElementForModalClose = document.getElementById('xy-pad-container');
        if (this._xyPadContainerElementForModalClose) {
            this._xyPadContainerElementForModalClose.addEventListener('pointerdown', this._boundHideConfirmDeletePresetModalOnPadInteraction, { once: true });
            console.log('[ChordStrategy._showConfirmDeletePresetModal] Added pointerdown listener to xy-pad-container');
        } else {
            console.warn('[ChordStrategy._showConfirmDeletePresetModal] xy-pad-container not found for attaching close listener.');
        }
    },

    _hideConfirmDeletePresetModal() {
        if (!this._confirmDeletePresetModal) return;
        this._confirmDeletePresetModal.style.display = 'none';
        this._progressionIdToDelete = null; 
        if (this._confirmDeletePresetMessageElement) {
            this._confirmDeletePresetMessageElement.textContent = ''; 
        }

        // Удаляем слушатель с XY-пэда, если он был добавлен
        if (this._xyPadContainerElementForModalClose && this._boundHideConfirmDeletePresetModalOnPadInteraction) {
            this._xyPadContainerElementForModalClose.removeEventListener('pointerdown', this._boundHideConfirmDeletePresetModalOnPadInteraction, { once: true });
            console.log('[ChordStrategy._hideConfirmDeletePresetModal] Removed pointerdown listener from xy-pad-container');
        }
        // this._xyPadContainerElementForModalClose = null; // Обнулять здесь не нужно
    },

    async _executeActualPresetDeletion() {
        if (!this._progressionIdToDelete) {
            this._hideConfirmDeletePresetModal();
            return;
        }

        const progressionId = this._progressionIdToDelete;
        this._hideConfirmDeletePresetModal(); // Сначала скрываем модальное окно

        try {
            console.log(`[ChordStrategy._executeActualPresetDeletion] Attempting to delete progression: ${progressionId}`);
            const success = await bridgeFix.callBridge('deleteChordProgression', progressionId);
            
            if (success) {
                alert(i18n.translate('progression_deleted_success_short', "Progression deleted."));
                
                // Важно: Обновляем UI немедленно, не дожидаясь полного обновления от moduleManager,
                // если есть проблемы с кэшированием на стороне Java/FS.
                if (moduleManager.moduleDataCache && moduleManager.moduleDataCache[progressionId]) {
                    delete moduleManager.moduleDataCache[progressionId];
                }
                if (moduleManager.modules && moduleManager.modules['chordProgression']) {
                    const index = moduleManager.modules['chordProgression'].findIndex(p => p.id === progressionId);
                    if (index > -1) {
                        moduleManager.modules['chordProgression'].splice(index, 1);
                    }
                }
                // Запускаем полный рефреш в фоне, чтобы синхронизироваться с сервером/FS в итоге
                moduleManager.getModules('chordProgression', true).catch(err => {
                    console.warn('[ChordStrategy] Background refresh of chord progressions failed after delete:', err);
                });

                if (this._loadedProgressionId === progressionId) {
                    this._loadedProgressionId = null;
                    this._updateProgressionDisplay(i18n.translate('progression_current_session', "Current Session"));
                }
                // Если поповер выбора пресетов был открыт, его нужно будет обновить/переоткрыть,
                // но он и так делает getModules(true) при каждом открытии.
            } else {
                alert(i18n.translate('error_deleting_progression_bridge', "Failed to delete progression (bridge error)."));
            }
        } catch (e) {
            console.error(`[ChordStrategy._executeActualPresetDeletion] Exception while deleting ${progressionId}:`, e);
            alert(i18n.translate('error_deleting_progression_exception', `Exception: ${e.message}`));
        }
    },
    // ===========================================================================

    // === НОВЫЕ МЕТОДЫ для МОДАЛЬНОГО ОКНА СОХРАНЕНИЯ ПРОГРЕССИИ ===
    _showSaveProgressionModal() {
        if (!this._saveProgressionModal || !this._progressionNameInput) return;

        const currentName = this._loadedProgressionId ? moduleManager.moduleDataCache[this._loadedProgressionId]?.name : '';
        const defaultName = currentName || i18n.translate('my_progression_default_name', 'My Progression');
        this._progressionNameInput.value = defaultName;
        
        this._saveProgressionModal.style.display = 'block'; 

        this._progressionNameInput.focus();
        this._progressionNameInput.select();

        // Добавляем слушатель на XY-пэд для закрытия модального окна сохранения
        this._xyPadContainerElementForModalClose = document.getElementById('xy-pad-container');
        if (this._xyPadContainerElementForModalClose) {
            this._xyPadContainerElementForModalClose.addEventListener('pointerdown', this._boundHideSaveProgressionModalOnPadInteraction, { once: true });
            console.log('[ChordStrategy._showSaveProgressionModal] Added pointerdown listener to xy-pad-container');
        } else {
            console.warn('[ChordStrategy._showSaveProgressionModal] xy-pad-container not found for attaching close listener.');
        }
    },

    _hideSaveProgressionModal() {
        if (!this._saveProgressionModal) return;
        
        this._saveProgressionModal.style.display = 'none';
        if (this._progressionNameInput) this._progressionNameInput.value = ''; 

        // Удаляем слушатель с XY-пэда, если он был добавлен
        if (this._xyPadContainerElementForModalClose && this._boundHideSaveProgressionModalOnPadInteraction) {
            this._xyPadContainerElementForModalClose.removeEventListener('pointerdown', this._boundHideSaveProgressionModalOnPadInteraction, { once: true });
            console.log('[ChordStrategy._hideSaveProgressionModal] Removed pointerdown listener from xy-pad-container');
        }
        // this._xyPadContainerElementForModalClose = null; // Обнулять здесь не нужно, если используется разными модальными окнами
    },

    async _confirmSaveProgression() {
        if (!this._progressionNameInput) {
            this._hideSaveProgressionModal();
            return;
        }
        const progressionName = this._progressionNameInput.value.trim();

        if (!progressionName) {
            alert(i18n.translate('progression_name_required', 'Progression name cannot be empty.'));
            this._progressionNameInput.focus();
            return;
        }

        const chordIds = this._availableChords.map(c => c.id);
        if (chordIds.length === 0) {
            alert(i18n.translate('cannot_save_empty_progression', 'Cannot save an empty progression.'));
            this._hideSaveProgressionModal();
            return;
        }
        
        const progressionData = {
            name: progressionName,
            type: 'chordProgression',
            data: {
                chordIds: chordIds
            }
        };
        
        try {
            console.log('[ChordModeStrategy._confirmSaveProgression] Saving progression:', progressionData);
            const newProgressionId = await bridgeFix.callBridge('saveChordProgression', JSON.stringify(progressionData));

            if (typeof newProgressionId === 'string' && newProgressionId.startsWith('Error:')) {
                console.error('[ChordModeStrategy._confirmSaveProgression] Error saving progression from bridge:', newProgressionId);
                alert(i18n.translate('error_saving_progression_details', `Error: ${newProgressionId.substring(7)}`));
                // Не скрываем модальное окно, чтобы пользователь мог исправить имя
                return;
            }

            if (newProgressionId && !newProgressionId.startsWith("Error:")) {
                console.log(`[ChordModeStrategy._confirmSaveProgression] Progression saved with ID: ${newProgressionId}`);
                await moduleManager.getModules('chordProgression', true); // Принудительно обновить кэш
                alert(i18n.translate('progression_saved_success', `Progression '${progressionName}' saved!`));
                this._hideSaveProgressionModal();
                // Опционально, загружаем новую сохраненную прогрессию
                await this.loadProgression(newProgressionId);
            } else {
                console.error('[ChordModeStrategy._confirmSaveProgression] Failed to save progression, no valid ID returned.');
                alert(i18n.translate('error_saving_progression_unknown', 'Unknown error saving progression. Please try again.'));
                // Не скрываем модальное окно
            }
        } catch (e) {
            console.error('[ChordModeStrategy._confirmSaveProgression] Exception while saving:', e);
            alert(i18n.translate('error_saving_progression_exception', `Exception: ${e.message}`));
            // Не скрываем модальное окно
        }
    },
    // =================================================================

    // === НАЧАЛО ВОССТАНОВЛЕННЫХ МЕТОДОВ ===
    _updateChordButtonSelection(activeChordId) {
        console.log(`[ChordStrategy._updateChordButtonSelection] Called with activeChordId: ${activeChordId}`);
        if (this._chordListContainer) {
            const buttons = this._chordListContainer.querySelectorAll('.chord-button');
            buttons.forEach(btn => {
                // console.log(`[ChordStrategy._updateChordButtonSelection] Checking button with ID: ${btn.dataset.chordId}`);
                if (btn.dataset.chordId === activeChordId) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    },

    async onTonicChanged(newTonic, appState, services) {
        console.log(`[${this.getName()}Strategy] Global tonic changed to: ${newTonic}. This might affect chord suggestions later.`);
        // Если в будущем понадобится реакция на смену тоники (например, для пересчета предложений),
        // логика будет добавлена здесь. Пока только логируем.
        // Может потребоваться this.appRef.updateZoneLayout() или this._updateSuggestedChordsDisplay(),
        // если отображение аккордов или их зон зависит от глобальной тоники.
    },

    async onScaleChanged(newScale, appState, services) {
        console.log(`[${this.getName()}Strategy] Global scale changed to: ${newScale}. Generally not used in Chord Mode directly.`);
        // Аналогично onTonicChanged, Chord Mode обычно не зависит от глобального лада напрямую,
        // но это может быть полезно для более умных предложений аккордов.
    },
    
    async selectChord(chordId) {
        if (this._selectedChordId === chordId && chordId !== null) {
            // Если аккорд уже выбран, и это не сброс (null), ничего не делаем.
            // Можно добавить console.log, если нужно отслеживать такие случаи.
            return;
        }
        console.log(`[ChordStrategy] Selecting new chord: ${chordId}. Current: ${this._selectedChordId}`);
        const previousChordIdForRollback = this._selectedChordId; // Для отката UI

        try {
            const chordData = chordId ? this._availableChords.find(c => c.id === chordId) : null;

            if (!chordData && chordId !== null) { // Если chordId есть, но данных нет - это ошибка
                console.error(`[ChordStrategy] Chord data not found for ID: ${chordId}. Clearing selection.`);
                this._selectedChordId = null;
                this._selectedChordDisplayName = null;
                this._selectedChordNotes = [];
                // Возможно, стоит уведомить пользователя или вызвать appRef.updateZoneLayout для очистки пэда
            } else if (!chordData && chordId === null) { // Явный сброс аккорда
                 this._selectedChordId = null;
                 this._selectedChordDisplayName = null;
                 this._selectedChordNotes = [];
                 console.log("[ChordStrategy] Chord selection cleared.");
            } else if (chordData) { // Аккорд найден
                this._selectedChordId = chordData.id;
                this._selectedChordDisplayName = chordData.displayName;
                
                if (!this.musicTheoryServiceRef || typeof this.musicTheoryServiceRef.getChordNotes !== 'function') {
                    console.error("[ChordStrategy] MusicTheoryService or getChordNotes is not available!");
                    this._selectedChordNotes = []; // Безопасное значение по умолчанию
                    // Можно выбросить ошибку, чтобы прервать выполнение и попасть в catch
                    throw new Error("MusicTheoryService.getChordNotes is not available");
                }
                // ЖДЕМ получения нот нового аккорда
                this._selectedChordNotes = await this.musicTheoryServiceRef.getChordNotes(chordData.nameForService);
                if (!this._selectedChordNotes || this._selectedChordNotes.length === 0) {
                     console.warn(`[ChordStrategy] No notes returned for chord ${chordData.nameForService}. Display will be empty.`);
                     this._selectedChordNotes = []; // Убедимся, что это массив
                }
            }
            
            // Обновляем подсветку кнопки в списке (даже если аккорд сброшен)
            this._updateChordButtonSelection(this._selectedChordId);
            
            // Вызываем логику "живого" переключения нот для уже зажатых пальцев
            // Эта логика должна быть тщательно проверена на предмет асинхронности и корректности
            const activeSynthVoices = synth.activeVoices; 
            if (activeSynthVoices && activeSynthVoices.size > 0) {
                 console.log(`[ChordStrategy.selectChord] Active touches detected (${activeSynthVoices.size}). Applying live update.`);
                 await this._liveUpdateActiveTouches(Array.from(activeSynthVoices.values()), this._selectedChordNotes);
            }
            
            if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
                // ЖДЕМ, пока пэд полностью перерисуется под новый аккорд (или сброшенное состояние)
                await this.appRef.updateZoneLayout(); 
                
                // ТОЛЬКО ПОТОМ обновляем зависимые UI элементы
                if (typeof this.appRef.notifyProgressionChanged === 'function') {
                    this.appRef.notifyProgressionChanged();
                }
            } else {
                console.error("[ChordStrategy] appRef or appRef.updateZoneLayout is not available!");
                // Это критическая ошибка, возможно, стоит ее обработать более серьезно
            }

            // Обновляем список предложений на основе нового аккорда (или null, если аккорд сброшен)
            this._updateSuggestedChordsDisplay(chordData); // chordData может быть null

        } catch (error) {
            console.error(`[ChordStrategy] Error during selectChord(${chordId}):`, error, error.stack);
            // Попытка отката UI, если возможно
            this._selectedChordId = previousChordIdForRollback;
            this._updateChordButtonSelection(previousChordIdForRollback);
            // Возможно, нужно также откатить _selectedChordDisplayName и _selectedChordNotes
            // и уведомить appRef, чтобы он перерисовал layout под previousChordIdForRollback
            if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
                 console.warn(`[ChordStrategy] Attempting to rollback UI to previous chord: ${previousChordIdForRollback}`);
                 // Сначала нужно восстановить _selectedChordNotes для previousChordIdForRollback, если это возможно
                 // Затем вызвать updateZoneLayout
                 // this.appRef.updateZoneLayout(); // Это может потребовать доп. логики
            }
        }
    },

    // === КОНЕЦ ВОССТАНОВЛЕННЫХ МЕТОДОВ ===

    _toggleTimer() {
        if (this._timerState.isActive) {
            this._stopTimer();
        } else {
            this._showTimerModal();
        }
    },

    _showTimerModal() {
        if (!this._timerModal) return;
        
        if (this.appRef && this.appRef.state) {
           this._timerState.bpm = this.appRef.state.transportBpm;
        }
        if (this._bpmInput) this._bpmInput.value = this._timerState.bpm;
        if (this._secondsInput) this._secondsInput.value = this._timerState.seconds;
        if (this._intervalDisplay) this._intervalDisplay.textContent = this._getIntervalDisplayName(this._timerState.interval);

        this._switchTimerModeUI(); 
        this._timerModal.style.display = 'block';
    },

    _hideTimerModal() {
        if (this._timerModal) {
            this._timerModal.style.display = 'none';
        }
    },

    _switchTimerModeUI() {
        if (!this._timerModal) return; 
        const selectedRadio = this._timerModal.querySelector('input[name="timer-mode"]:checked');
        if (!selectedRadio) return; 
        const selectedMode = selectedRadio.value;
        this._timerState.mode = selectedMode;
        
        if (this._rhythmSettingsContainer) {
            this._rhythmSettingsContainer.style.display = selectedMode === 'rhythm' ? 'block' : 'none';
        }
        if (this._secondsSettingsContainer) {
            this._secondsSettingsContainer.style.display = selectedMode === 'seconds' ? 'block' : 'none';
        }
    },

    _showIntervalPopover() {
        const intervals = [
            { id: '4n', name: 'Quarter Note (1/4)' },
            { id: '2n', name: 'Half Note (1/2)' },
            { id: '1m', name: '1 Bar (4/4)' },
            { id: '2m', name: '2 Bars (4/4)' },
            { id: '3n', name: '3 Beats (3/4 time feel)' }
        ];
        
        const title = (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('interval_label', 'Interval') : 'Interval';

        if (typeof showCustomSelectorPopover === 'function') {
            showCustomSelectorPopover({
                type: 'timerInterval',
                title: title,
                itemsArray: intervals,
                currentValue: this._timerState.interval,
                targetElement: this._intervalDisplay,
                onSelect: (value) => {
                    this._timerState.interval = value;
                    if (this._intervalDisplay) {
                        this._intervalDisplay.textContent = this._getIntervalDisplayName(value);
                    }
                }
            });
        } else {
            console.error("[ChordModeStrategy._showIntervalPopover] showCustomSelectorPopover is not defined.");
            const promptMessage = 'Select interval:\n' + intervals.map(i => i.id + ': ' + i.name).join('\n');
            const selectedInterval = prompt(promptMessage, this._timerState.interval);
            if (selectedInterval && intervals.some(i => i.id === selectedInterval)) {
                 this._timerState.interval = selectedInterval;
                 if (this._intervalDisplay) {
                     this._intervalDisplay.textContent = this._getIntervalDisplayName(selectedInterval);
                 }
            }
        }
    },

    _getIntervalDisplayName(intervalId) {
        const intervalMap = {
            '4n': 'Quarter Note (1/4)',
            '2n': 'Half Note (1/2)',
            '1m': '1 Bar (4/4)',
            '2m': '2 Bars (4/4)',
            '3n': '3 Beats (3/4 feel)'
        };
        return intervalMap[intervalId] || intervalId;
    },

    _stopTimer() {
        if (!this._timerState.isActive) return;
        
        if (this._timerState.scheduleId !== null && typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.clear(this._timerState.scheduleId);
        }
        
        this._timerState.isActive = false;
        this._timerState.scheduleId = null;

        // === НАЧАЛО ИЗМЕНЕНИЙ ДЛЯ ТЕКСТА КНОПКИ ===
        if (this._timerToggleButton) {
            this._timerToggleButton.classList.remove('active');
            const span = this._timerToggleButton.querySelector('span');
            // Используем i18n.translate с фолбэком
            const buttonText = (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('start_timer_label', 'Auto-Switch') : 'Auto-Switch';
            if (span) span.textContent = buttonText;
        }
        // === КОНЕЦ ИЗМЕНЕНИЙ ДЛЯ ТЕКСТА КНОПКИ ===
        console.log('[ChordStrategy] Timer stopped.');
    },

    _startTimer() {
        this._stopTimer(); 

        if (!this._timerModal || !this._bpmInput || !this._secondsInput || !this.appRef) {
            console.error("[ChordStrategy._startTimer] Timer modal or inputs not found, or appRef is missing.");
            return;
        }

        const selectedRadio = this._timerModal.querySelector('input[name="timer-mode"]:checked');
        if (!selectedRadio) {
             console.error("[ChordStrategy._startTimer] No timer mode selected.");
             alert("Please select a timer mode."); 
             return;
        }
        this._timerState.mode = selectedRadio.value;
        this._timerState.bpm = parseInt(this._bpmInput.value, 10);
        this._timerState.seconds = parseFloat(this._secondsInput.value);

        if (this._timerState.mode === 'rhythm') {
            if (isNaN(this._timerState.bpm) || this._timerState.bpm < 20 || this._timerState.bpm > 300) { 
                alert('Invalid BPM value. Must be between 20 and 300.'); return; 
            }
            this.appRef.setBpm(this._timerState.bpm); 
        } else { 
            if (isNaN(this._timerState.seconds) || this._timerState.seconds < 0.5) { 
                alert('Invalid seconds value. Must be at least 0.5.'); return; 
            }
        }

        this._timerState.isActive = true;
        const interval = this._timerState.mode === 'rhythm' ? this._timerState.interval : this._timerState.seconds;

        if (typeof Tone === 'undefined' || !Tone.Transport) {
            console.error("[ChordStrategy._startTimer] Tone.js or Tone.Transport not available.");
            alert("Audio scheduling system (Tone.Transport) is not available.");
            this._timerState.isActive = false; 
            return;
        }

        try {
            this._timerState.scheduleId = Tone.Transport.scheduleRepeat(time => {
                Tone.Draw.schedule(() => {
                    this._selectNextChord(); 
                }, time);
            }, interval);
    
            if (Tone.Transport.state !== 'started') { 
                Tone.Transport.start();
                console.log('[ChordStrategy._startTimer] Tone.Transport was not started, starting now.');
            }

        } catch (e) {
            console.error("[ChordStrategy._startTimer] Error scheduling with Tone.Transport:", e);
            alert("Error starting timer: " + e.message);
            this._timerState.isActive = false;
            return;
        }

        // === НАЧАЛО ИЗМЕНЕНИЙ ДЛЯ ТЕКСТА КНОПКИ ===
        if (this._timerToggleButton) {
            this._timerToggleButton.classList.add('active');
            const span = this._timerToggleButton.querySelector('span');
            // Используем i18n.translate с фолбэком
            const buttonText = (typeof i18n !== 'undefined' && i18n.translate) ? i18n.translate('stop_timer_label', 'Stop') : 'Stop';
            if (span) span.textContent = buttonText;
        }
        // === КОНЕЦ ИЗМЕНЕНИЙ ДЛЯ ТЕКСТА КНОПКИ ===

        console.log(`[ChordStrategy] Timer started. Mode: ${this._timerState.mode}, Interval: ${interval}, BPM: ${this._timerState.bpm}`);
        this._hideTimerModal();
    },

    // This method was _selectNextChord in the plan, used by the timer.
    // The plan also had _boundSelectNextChord = this.selectNextChord.bind(this) which is an existing method.
    // Clarifying: the timer should call a method that selects the *next* chord.
    // The existing selectChord(chordId) selects a *specific* chord.
    // So, _selectNextChord is a new helper for the timer.
    // === НАЧАЛО ЗАМЕНЫ: _selectNextChord ===
    _selectNextChord() {
        // Этот метод вызывается таймером
        this._switchChord(1); // 1 означает "вперед"
    },
    // === КОНЕЦ ЗАМЕНЫ: _selectNextChord ===

    // === НАЧАЛО: НОВЫЕ ПУБЛИЧНЫЕ МЕТОДЫ ДЛЯ ПЕРЕКЛЮЧЕНИЯ АККОРДОВ ===
    selectNextChord() {
        // Этот метод может быть вызван, например, кнопками UI
        this._switchChord(1);
    },

    selectPreviousChord() {
        // Этот метод может быть вызван, например, кнопками UI
        this._switchChord(-1);
    }
    // === КОНЕЦ: НОВЫЕ ПУБЛИЧНЫЕ МЕТОДЫ ДЛЯ ПЕРЕКЛЮЧЕНИЯ АККОРДОВ ===
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(ChordModeStrategy);
} else {
    console.warn("[ChordModeStrategy] PadModeManager not found for self-registration.");
} 