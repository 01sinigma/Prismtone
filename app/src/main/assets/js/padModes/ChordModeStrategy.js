// Файл: app/src/main/assets/js/padModes/ChordModeStrategy.js
// Стратегия для режима работы XY-пэда "CHORD Mode"

const ChordModeStrategy = {
    appRef: null,
    musicTheoryServiceRef: null,
    harmonicMarkerEngineRef: null, // Пока не используется, но для консистентности
    _isActive: false,
    
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
        "sus2": "Suspended 2nd",
        "6": "Major 6th",
        "m6": "Minor 6th",
        "dim7": "Diminished 7th",
        "m7b5": "Minor 7th b5 (Half-dim)"
    },

    // Привязанные обработчики
    _boundHandleClickOnChordList: null,
    _boundHandlePointerDownOnChordList: null,
    _boundHandlePointerUpOnChordList: null,
    _boundHandleClickOnSuggestedChords: null, // Новый обработчик
    _boundShowAddChordModal: null,
    _boundHideAddChordModal: null,
    _boundConfirmAddChord: null,

    // Новые свойства для логики удаления
    _longPressTimer: null,
    _longPressTargetId: null, 
    _deleteConfirmTargetId: null, 
    _activeNoteInfo: new Map(), // Добавлено

    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance) {
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineInstance;
        this._boundHandleChordButtonClick = this._handleChordButtonClick.bind(this);
        // Привязываем обработчики для модального окна
        this._boundShowAddChordModal = this._showAddChordModal.bind(this);
        this._boundHideAddChordModal = this._hideAddChordModal.bind(this);
        this._boundConfirmAddChord = this._confirmAddChord.bind(this);
        this._boundHandleClickOnChordList = this._handleClickOnChordList.bind(this);
        this._boundHandlePointerDownOnChordList = this._handlePointerDownOnChordList.bind(this);
        this._boundHandlePointerUpOnChordList = this._handlePointerUpOnChordList.bind(this);
        this._boundHandleClickOnSuggestedChords = this._handleClickOnSuggestedChords.bind(this);
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

    onModeActivated(appState, services, uiModules) {
        this._isActive = true;
        this._activeNoteInfo.clear();
        console.log(`[${this.getName()}Strategy] Activated.`);
        
        this._currentChordPanel = document.getElementById('chord-mode-panel'); 
        this._chordListContainer = document.getElementById('chord-list-container');
        this._suggestedChordsContainer = document.getElementById('suggested-chords-list');
        this._addChordButtonOnPanel = document.getElementById('add-chord-button');

        this._addChordModal = document.getElementById('add-chord-modal');
        this._chordRootSelect = document.getElementById('chord-root-note-select');
        this._chordOctaveSelect = document.getElementById('chord-octave-select');
        this._chordTypeSelect = document.getElementById('chord-type-select');
        this._confirmAddChordButton = document.getElementById('confirm-add-chord-button');
        this._cancelAddChordButton = document.getElementById('cancel-add-chord-button');
        this._closeAddChordModalButton = document.getElementById('close-add-chord-modal');
        
        this._modalOverlay = document.getElementById('modal-overlay-dynamic');
        if (!this._modalOverlay) {
            this._modalOverlay = document.createElement('div');
            this._modalOverlay.id = 'modal-overlay-dynamic';
            this._modalOverlay.className = 'modal-overlay';
            document.body.appendChild(this._modalOverlay);
        }

        if (this._chordListContainer) {
            this._chordListContainer.removeEventListener('pointerdown', this._boundHandlePointerDownOnChordList);
            this._chordListContainer.addEventListener('pointerdown', this._boundHandlePointerDownOnChordList);
            document.body.removeEventListener('pointerup', this._boundHandlePointerUpOnChordList);
            document.body.addEventListener('pointerup', this._boundHandlePointerUpOnChordList);
            this._chordListContainer.removeEventListener('click', this._boundHandleClickOnChordList);
            this._chordListContainer.addEventListener('click', this._boundHandleClickOnChordList);
        }
        if (this._suggestedChordsContainer) { 
            this._suggestedChordsContainer.removeEventListener('click', this._boundHandleClickOnSuggestedChords);
            this._suggestedChordsContainer.addEventListener('click', this._boundHandleClickOnSuggestedChords);
        }
        if (this._addChordButtonOnPanel) {
            this._addChordButtonOnPanel.removeEventListener('click', this._boundShowAddChordModal);
            this._addChordButtonOnPanel.addEventListener('click', this._boundShowAddChordModal);
        }
        if (this._closeAddChordModalButton) {
            this._closeAddChordModalButton.removeEventListener('click', this._boundHideAddChordModal);
            this._closeAddChordModalButton.addEventListener('click', this._boundHideAddChordModal);
        }
        if (this._cancelAddChordButton) {
            this._cancelAddChordButton.removeEventListener('click', this._boundHideAddChordModal);
            this._cancelAddChordButton.addEventListener('click', this._boundHideAddChordModal);
        }
        if (this._confirmAddChordButton) {
            this._confirmAddChordButton.removeEventListener('click', this._boundConfirmAddChord);
            this._confirmAddChordButton.addEventListener('click', this._boundConfirmAddChord);
        }
        if (this._modalOverlay) {
            this._modalOverlay.removeEventListener('click', this._boundHideAddChordModal);
            this._modalOverlay.addEventListener('click', this._boundHideAddChordModal);
        }

        if (uiModules && uiModules.sidePanel && typeof uiModules.sidePanel.showPanel === 'function') {
            uiModules.sidePanel.showPanel('chord-mode-panel');
        } else {
            if (this._currentChordPanel) this._currentChordPanel.classList.add('show');
        }

        this._selectedChordId = null;
        this._selectedChordDisplayName = null;
        this._selectedChordNotes = [];
        
        this._renderChordPanel();
        this._updateSuggestedChordsDisplay(null); 
        this._hideDeleteConfirmation(); 
        this._updateChordButtonSelection(null); 

        if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
            this.appRef.updateZoneLayout();
        }
    },

    onModeDeactivated(appState, services, uiModules) {
        this._isActive = false;
        this._activeNoteInfo.clear();
        console.log(`[${this.getName()}Strategy] Deactivated.`);
        
        // Скрываем модальное окно, если оно было открыто
        this._hideAddChordModal(); 

        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        this._hideDeleteConfirmation();

        if (uiModules && uiModules.sidePanel && typeof uiModules.sidePanel.hidePanel === 'function') {
            uiModules.sidePanel.hidePanel('chord-mode-panel');
        } else {
            if (this._currentChordPanel) this._currentChordPanel.classList.remove('show');
        }
        this._updateChordButtonSelection(null); 
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
        if (!this._addChordModal) return;
        
        this._populateSelect(this._chordRootSelect, this._rootNotes, 'C');
        this._populateSelect(this._chordOctaveSelect, this._octaves, 4);
        this._populateSelect(this._chordTypeSelect, this._chordTypes, 'M');

        this._addChordModal.style.display = 'block';
        if (this._modalOverlay) this._modalOverlay.style.display = 'block';
        // Фокус на первый элемент для доступности
        if(this._chordRootSelect) this._chordRootSelect.focus();
    },

    _hideAddChordModal() {
        if (this._addChordModal) {
            this._addChordModal.style.display = 'none';
        }
        if (this._modalOverlay) {
            this._modalOverlay.style.display = 'none';
        }
    },

    _confirmAddChord() {
        if (!this._chordRootSelect || !this._chordOctaveSelect || !this._chordTypeSelect) {
             console.error("Chord selection elements not found in modal.");
             this._hideAddChordModal();
             return;
        }
        const root = this._chordRootSelect.value;
        const octave = this._chordOctaveSelect.value;
        const typeKey = this._chordTypeSelect.value; 
        const typeDisplayName = this._chordTypes[typeKey];

        const newChordId = root + octave + typeKey; 
        const nameForService = root + octave + typeKey; 
        const displayName = root + octave + " " + typeDisplayName;

        if (this._availableChords.find(c => c.id === newChordId)) {
            console.warn(`[${this.getName()}Strategy] Chord ${newChordId} already exists.`);
            this._hideAddChordModal();
            return;
        }
        
        const newChordData = {
            id: newChordId,
            nameForService: nameForService, 
            displayName: displayName
        };

        this._availableChords.push(newChordData);
        this._renderChordPanel(); 
        
        console.log(`[${this.getName()}Strategy] Added new chord:`, newChordData);
        this._hideAddChordModal();
    },

    _handleChordButtonClick(event) {
        const button = event.target.closest('.chord-button');
        if (button && button.dataset.chordId) {
            const chordId = button.dataset.chordId;
            console.log(`[${this.getName()}Strategy] Chord button clicked: ${chordId}`);
            this.selectChord(chordId);
        }
    },

    _updateChordButtonSelection(activeChordId) {
        if (this._chordListContainer) {
            const buttons = this._chordListContainer.querySelectorAll('.chord-button');
            buttons.forEach(btn => {
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
    },

    async onScaleChanged(newScale, appState, services) {
        console.log(`[${this.getName()}Strategy] Global scale changed to: ${newScale}. Generally not used in Chord Mode directly.`);
    },
    
    // Новый метод для обработки выбора аккорда с панели
    async selectChord(chordId) {
        const chordData = this._availableChords.find(c => c.id === chordId);
        let successfullySelected = false;

        if (!chordData) {
            console.warn(`[${this.getName()}Strategy] Chord with id "${chordId}" not found in _availableChords.`);
            this._selectedChordId = null;
            this._selectedChordDisplayName = null;
            this._selectedChordNotes = [];
        } else {
            this._selectedChordId = chordData.id;
            this._selectedChordDisplayName = chordData.displayName;
            
            const chordSymbolForService = chordData.nameForService;

            if (this.musicTheoryServiceRef && typeof this.musicTheoryServiceRef.getChordNotes === 'function') {
                const notes = await this.musicTheoryServiceRef.getChordNotes(chordSymbolForService); 
                this._selectedChordNotes = notes || [];
                if (!notes || notes.length === 0) {
                     console.warn(`[${this.getName()}Strategy] Could not get notes or no notes found for chord symbol: ${chordSymbolForService} from MusicTheoryService.`);
                     this._selectedChordId = null; 
                     this._selectedChordDisplayName = null;
                } else {
                    successfullySelected = true;
                }
            } else {
                console.error(`[${this.getName()}Strategy] MusicTheoryServiceRef or getChordNotes method is not available.`);
                this._selectedChordNotes = [];
                this._selectedChordId = null;
                this._selectedChordDisplayName = null;
            }
            console.log(`[${this.getName()}Strategy] Chord selected: ${this._selectedChordDisplayName} (ID: ${this._selectedChordId}, Queried as: ${chordSymbolForService}), Notes:`, this._selectedChordNotes.map(n=>n.name));
        }

        this._updateChordButtonSelection(this._selectedChordId);
        
        if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
            await this.appRef.updateZoneLayout();
        }

        if (successfullySelected) {
            this._updateSuggestedChordsDisplay(chordData); 
        } else {
            this._updateSuggestedChordsDisplay(null); 
        }
    },

    _handlePointerDownOnChordList(event) {
        if (!this._isActive) return;
        const targetButton = event.target.closest('.chord-button');
        if (targetButton && !event.target.classList.contains('delete-chord-btn')) {
            this._longPressTargetId = targetButton.dataset.chordId;
            if (this._longPressTimer) clearTimeout(this._longPressTimer);
            this._longPressTimer = setTimeout(() => {
                if (this._longPressTargetId) { 
                    this._showDeleteConfirmation(this._longPressTargetId);
                }
                this._longPressTimer = null;
                this._longPressTargetId = null; 
            }, 700); 
        }
    },
    _handlePointerUpOnChordList(event) {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        // _longPressTargetId сбрасывается в _handleClickOnChordList или если таймер сработал
    },
    _handleClickOnChordList(event) {
        if (!this._isActive) return;
        const targetDeleteButton = event.target.closest('.delete-chord-btn');
        const targetChordButton = event.target.closest('.chord-button');

        if (targetDeleteButton) {
            event.stopPropagation(); 
            const chordIdToDelete = targetDeleteButton.dataset.deleteChordId;
            if (chordIdToDelete && chordIdToDelete === this._deleteConfirmTargetId) {
                this._deleteChord(chordIdToDelete);
            }
        } else if (targetChordButton) {
            const chordId = targetChordButton.dataset.chordId;
            if (this._deleteConfirmTargetId && this._deleteConfirmTargetId !== chordId) {
                this._hideDeleteConfirmation();
            }
            else if (this._deleteConfirmTargetId && this._deleteConfirmTargetId === chordId) {
                 this._hideDeleteConfirmation();
            }
            
            if (this._longPressTargetId === chordId && this._longPressTimer) {
                 clearTimeout(this._longPressTimer);
                 this._longPressTimer = null;
            }
            this.selectChord(chordId);
        } else {
            if (this._deleteConfirmTargetId) {
                this._hideDeleteConfirmation();
            }
        }
        this._longPressTargetId = null; 
    },
    _showDeleteConfirmation(chordId) {
        if (this._deleteConfirmTargetId && this._deleteConfirmTargetId !== chordId) {
            this._hideDeleteConfirmation(this._deleteConfirmTargetId); 
        }
        this._deleteConfirmTargetId = chordId;
        if (this._chordListContainer) {
            const button = this._chordListContainer.querySelector(`.chord-button[data-chord-id="${chordId}"]`);
            if (button) {
                button.classList.add('confirm-delete');
            }
        }
    },
    _hideDeleteConfirmation(chordIdToClear = null) {
        const idToProcess = chordIdToClear || this._deleteConfirmTargetId;
        if (idToProcess && this._chordListContainer) {
            const button = this._chordListContainer.querySelector(`.chord-button[data-chord-id="${idToProcess}"]`);
            if (button) {
                button.classList.remove('confirm-delete');
            }
        }
        if (!chordIdToClear) { 
            this._deleteConfirmTargetId = null;
        }
    },
    _deleteChord(chordId) {
        this._availableChords = this._availableChords.filter(c => c.id !== chordId);
        this._hideDeleteConfirmation(chordId); 
        this._renderChordPanel(); 

        if (this._selectedChordId === chordId) {
            this._selectedChordId = null;
            this._selectedChordDisplayName = null;
            this._selectedChordNotes = [];
            if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
                this.appRef.updateZoneLayout();
            }
        }
        console.log(`[${this.getName()}Strategy] Chord ${chordId} deleted.`);
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
        if (!currentChordData || !this.musicTheoryServiceRef) return [];
        const suggestions = [];
        const currentTonic = this.appRef.state.currentTonic || 'C4'; // Глобальная тоника проекта
        const currentScale = this.appRef.state.scale || 'major'; // Глобальный лад проекта

        // Пример логики (очень упрощенный):
        // Если текущий аккорд - тоника (I ступень в текущей тональности), предложить IV и V
        // Это требует определения ступени текущего аккорда в глобальной тональности
        // Для простоты, пока сделаем проще, как обсуждали:
        if (currentChordData.id.startsWith('C')) { // Если выбран C-мажорный или минорный аккорд
            suggestions.push({ id: 'F4M', nameForService: 'F4M', displayName: 'F Major (IV)' });
            suggestions.push({ id: 'G4M', nameForService: 'G4M', displayName: 'G Major (V)' });
        } else if (currentChordData.id.startsWith('G')) {
            suggestions.push({ id: 'C4M', nameForService: 'C4M', displayName: 'C Major (IV)' });
            suggestions.push({ id: 'D4M', nameForService: 'D4M', displayName: 'D Major (V)' });
        } else if (currentChordData.id.startsWith('E') && currentChordData.id.includes('m')) { // Em
            suggestions.push({ id: 'A4m', nameForService: 'A4m', displayName: 'A minor (iv)' });
            suggestions.push({ id: 'C4M', nameForService: 'C4M', displayName: 'C Major (VI)' });
        }
        
        return suggestions.filter(sugg => !this._availableChords.find(avail => avail.id === sugg.id));
    },

    _updateSuggestedChordsDisplay(selectedChordData) {
        const suggestions = this._getChordSuggestions(selectedChordData);
        this._renderSuggestedChords(suggestions);
    },

    _handleClickOnSuggestedChords(event) {
        const button = event.target.closest('.chord-button'); 
        if (button && button.dataset.chordId) {
            const chordId = button.dataset.chordId;
            console.log(`[${this.getName()}Strategy] Suggested chord button clicked: ${chordId}`);
            
            let chordData = this._availableChords.find(c => c.id === chordId);
            if (!chordData) {
                const activeChord = this._selectedChordId ? this._availableChords.find(c => c.id === this._selectedChordId) : null;
                const allSuggestions = this._getChordSuggestions(activeChord); 
                const suggestedChordInfo = allSuggestions.find(s => s.id === chordId);
                
                if (suggestedChordInfo) {
                    if (!this._availableChords.find(c => c.id === suggestedChordInfo.id)) {
                        this._availableChords.push(suggestedChordInfo); 
                        this._renderChordPanel(); 
                    }
                    chordData = suggestedChordInfo; 
                } else {
                     console.warn(`[${this.getName()}Strategy] Clicked suggested chord ${chordId} but its info not found to add.`);
                     return;
                }
            }
            this.selectChord(chordId); 
        }
    }
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(ChordModeStrategy);
} else {
    console.warn("[ChordModeStrategy] PadModeManager not found for self-registration.");
} 