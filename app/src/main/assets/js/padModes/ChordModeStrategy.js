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
        "sus2": "Suspended 2nd",
        "6": "Major 6th",
        "m6": "Minor 6th",
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
        this._boundHandleClickOnSuggestedChords = this._handleClickOnSuggestedChords.bind(this);
        
        // Привязываем новые обработчики
        this._boundCollapsePanel = () => this.appRef.toggleChordPanel(true);
        this._boundExpandPanel = () => this.appRef.toggleChordPanel(false);
        this._boundToggleDeleteMode = this._toggleDeleteMode.bind(this);
        
        // Привязываем новые обработчики
        this._boundShowRootNotePopover = this._showRootNotePopover.bind(this);
        this._boundShowChordTypePopover = this._showChordTypePopover.bind(this);
        
        // Привязываем обработчики для жеста щипка
        this._boundOnPinchPointerDown = this._onPinchPointerDown.bind(this);
        this._boundOnPinchPointerMove = this._onPinchPointerMove.bind(this);
        this._boundOnPinchPointerUp = this._onPinchPointerUp.bind(this);
        
        // Привязываем обработчики для управления прогрессиями
        this._boundShowProgressionPopover = this._showProgressionPopover.bind(this);
        this._boundSaveCurrentProgression = this.saveCurrentProgression.bind(this);
        
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
        this._currentChordPanel = document.getElementById('chord-mode-panel');
        this._chordListContainer = document.getElementById('chord-list-container');
        this._suggestedChordsContainer = document.getElementById('suggested-chords-list');
        this._addChordButtonOnPanel = document.getElementById('add-chord-button');
        this._deleteModeToggleButton = document.getElementById('delete-chords-toggle-btn');
        this._collapseBtn = document.getElementById('chord-panel-collapse-btn');
        this._expandBtn = document.getElementById('chord-panel-expand-btn');
        
        // Находим новые элементы для управления прогрессиями
        this._progressionSelectDisplay = document.getElementById('progression-select-display');
        this._saveProgressionBtn = document.getElementById('save-progression-btn');
        
        // Добавляем обработчики для прогрессий
        this._progressionSelectDisplay?.addEventListener('mousedown', this._boundShowProgressionPopover);
        this._saveProgressionBtn?.addEventListener('click', this._boundSaveCurrentProgression);
        
        // Вызываем начальное обновление текста в выпадающем списке
        this._updateProgressionDisplay("Current Session");
        
        // Добавляем обработчики для модального окна
        this._modalOverlay = document.getElementById('modal-overlay');
        this._addChordModal = document.getElementById('add-chord-modal');
        this._chordRootSelect = document.getElementById('chord-root-select');
        this._chordOctaveSelect = document.getElementById('chord-octave-select');
        this._chordTypeSelect = document.getElementById('chord-type-select');
        this._confirmAddChordButton = document.getElementById('confirm-add-chord-button');
        this._cancelAddChordButton = document.getElementById('cancel-add-chord-button');
        this._closeAddChordModalButton = document.getElementById('close-add-chord-modal-button');
        
        // Добавляем обработчики для модального окна
        this._addChordButtonOnPanel?.addEventListener('click', this._boundShowAddChordModal);
        this._closeAddChordModalButton?.addEventListener('click', this._boundHideAddChordModal);
        this._cancelAddChordButton?.addEventListener('click', this._boundHideAddChordModal);
        this._confirmAddChordButton?.addEventListener('click', this._boundConfirmAddChord);
        
        // Добавляем обработчики для кнопок сворачивания/разворачивания
        this._collapseBtn?.addEventListener('click', this._boundCollapsePanel);
        this._expandBtn?.addEventListener('click', this._boundExpandPanel);
        
        // Добавляем обработчик для режима удаления
        this._deleteModeToggleButton?.addEventListener('click', this._boundToggleDeleteMode);
        
        // Добавляем обработчики для жеста щипка
        this._currentChordPanel?.addEventListener('pointerdown', this._boundOnPinchPointerDown);
        this._currentChordPanel?.addEventListener('pointermove', this._boundOnPinchPointerMove);
        this._currentChordPanel?.addEventListener('pointerup', this._boundOnPinchPointerUp);
        this._currentChordPanel?.addEventListener('pointercancel', this._boundOnPinchPointerUp);
        
        // Инициализируем SortableJS для списка аккордов
        if (this._chordListContainer && !this._sortableInstance) {
            this._sortableInstance = new Sortable(this._chordListContainer, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    // Обновляем порядок аккордов в _availableChords
                    const newOrder = Array.from(this._chordListContainer.children).map(button => {
                        const chordId = button.getAttribute('data-chord-id');
                        return this._availableChords.find(chord => chord.id === chordId);
                    }).filter(Boolean);
                    
                    if (newOrder.length === this._availableChords.length) {
                        this._availableChords = newOrder;
                        // Обновляем UI после изменения порядка
                        this._renderChordPanel();
                    }
                }
            });
        }
        
        // Отрисовываем панель аккордов
        this._renderChordPanel();
        
        // Если есть выбранный аккорд, обновляем предложения
        if (this._selectedChordId) {
            this._updateSuggestedChordsDisplay(this._selectedChordId);
        }
        
        console.log(`[${this.getName()}Strategy] Mode activated.`);
    },

    onModeDeactivated(appState, services, uiModules) {
        this._isActive = false;
        this._activeNoteInfo.clear();
        
        // Удаляем обработчики для прогрессий
        this._progressionSelectDisplay?.removeEventListener('mousedown', this._boundShowProgressionPopover);
        this._saveProgressionBtn?.removeEventListener('click', this._boundSaveCurrentProgression);
        
        // Удаляем обработчики для модального окна
        this._addChordButtonOnPanel?.removeEventListener('click', this._boundShowAddChordModal);
        this._closeAddChordModalButton?.removeEventListener('click', this._boundHideAddChordModal);
        this._cancelAddChordButton?.removeEventListener('click', this._boundHideAddChordModal);
        this._confirmAddChordButton?.removeEventListener('click', this._boundConfirmAddChord);
        
        // Удаляем обработчики для кнопок сворачивания/разворачивания
        this._collapseBtn?.removeEventListener('click', this._boundCollapsePanel);
        this._expandBtn?.removeEventListener('click', this._boundExpandPanel);
        
        // Удаляем обработчик для режима удаления
        this._deleteModeToggleButton?.removeEventListener('click', this._boundToggleDeleteMode);
        
        // Удаляем обработчики для жеста щипка
        this._currentChordPanel?.removeEventListener('pointerdown', this._boundOnPinchPointerDown);
        this._currentChordPanel?.removeEventListener('pointermove', this._boundOnPinchPointerMove);
        this._currentChordPanel?.removeEventListener('pointerup', this._boundOnPinchPointerUp);
        this._currentChordPanel?.removeEventListener('pointercancel', this._boundOnPinchPointerUp);
        
        // Уничтожаем экземпляр SortableJS
        if (this._sortableInstance) {
            this._sortableInstance.destroy();
            this._sortableInstance = null;
        }
        
        console.log(`[${this.getName()}Strategy] Mode deactivated.`);
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
        
        // Сбрасываем временные значения на дефолтные
        this._modalSelectedRoot = 'C';
        this._modalSelectedType = 'M';
        
        // Обновляем текст в div'ах
        if (this._chordRootDisplay) this._chordRootDisplay.textContent = this._modalSelectedRoot;
        if (this._chordTypeDisplay) this._chordTypeDisplay.textContent = this._chordTypes[this._modalSelectedType];
        
        this._addChordModal.style.display = 'block';
        if (this._modalOverlay) this._modalOverlay.style.display = 'block';
        if(this._chordRootDisplay) this._chordRootDisplay.focus();
    },

    _hideAddChordModal() {
        if (this._addChordModal) {
            this._addChordModal.style.display = 'none';
        }
        if (this._modalOverlay) {
            this._modalOverlay.style.display = 'none';
        }
    },

    _showRootNotePopover() {
        if (typeof showCustomSelectorPopover !== 'function') return;
        
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
        if (typeof showCustomSelectorPopover !== 'function') return;
        
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
        const root = this._modalSelectedRoot;
        const typeKey = this._modalSelectedType;
        const octave = 4; // Октава по умолчанию
        
        const displayName = root + octave + " " + this._chordTypes[typeKey];
        const newChordId = root + octave + typeKey;
        const nameForService = root + octave + typeKey;
        
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
        if (this.appRef && typeof this.appRef.notifyProgressionChanged === 'function') {
            this.appRef.notifyProgressionChanged();
        }
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
        if (this.appRef && typeof this.appRef.notifyProgressionChanged === 'function') {
            this.appRef.notifyProgressionChanged();
        }
    },

    _handleClickOnChordList(event) {
        if (!this._isActive) return;
        
        const targetDeleteButton = event.target.closest('.delete-chord-btn');
        const targetChordButton = event.target.closest('.chord-button');
        
        if (this._isDeleteModeActive) {
            if (targetDeleteButton) {
                event.stopPropagation();
                const chordIdToDelete = targetDeleteButton.dataset.deleteChordId;
                if (chordIdToDelete) {
                    this._deleteChord(chordIdToDelete);
                }
            }
        } else {
            if (targetChordButton) {
                const chordId = targetChordButton.dataset.chordId;
                this.selectChord(chordId);
            }
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
    },

    _toggleDeleteMode() {
        this._isDeleteModeActive = !this._isDeleteModeActive;
        console.log(`[${this.getName()}Strategy] Delete mode toggled to: ${this._isDeleteModeActive}`);
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
            title: 'Select Progression',
            currentValue: this._loadedProgressionId,
            onSelect: (presetId) => {
                if (presetId) {
                    this.loadProgression(presetId);
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
        if (!module || !module.data?.data?.chordIds) {
            console.error(`Failed to load progression data for ${progressionId}`);
            return;
        }
        const chordIds = module.data.data.chordIds;
        // Преобразуем массив ID в наш рабочий массив _availableChords
        const newChords = [];
        for (const id of chordIds) {
            // Эта логика парсинга ID в displayName и nameForService должна быть в хелпере
            const root = id.match(/[A-Ga-g#b]+/)[0];
            const octave = id.match(/\d/)[0];
            const typeKey = id.replace(root, '').replace(octave, '');
            const displayName = `${root}${octave} ${this._chordTypes[typeKey] || typeKey}`;
            newChords.push({ id, nameForService: id, displayName });
        }
        this._availableChords = newChords;
        this._loadedProgressionId = progressionId; // Сохраняем ID загруженного пресета
        
        this._renderChordPanel(); // Перерисовываем панель
        this._updateProgressionDisplay(module.name); // Обновляем текст в выпадающем списке
        
        // Выбираем первый аккорд из новой прогрессии
        if (this._availableChords.length > 0) {
            this.selectChord(this._availableChords[0].id);
        } else {
            this.appRef.notifyProgressionChanged();
            this.appRef.updateZoneLayout();
        }
    },

    async saveCurrentProgression() {
        const name = window.prompt("Enter a name for the chord progression:", "My Progression");
        if (!name) return;
        
        const progressionData = {
            id: `user_prog_${Date.now()}`, // Временный ID, будет заменен нативным
            type: "chordProgression",
            name: name,
            version: "1.0.0",
            description: "User-saved chord progression.",
            active: false,
            data: {
                chordIds: this._availableChords.map(c => c.id)
            }
        };
        
        try {
            const savedId = await bridgeFix.callBridge('saveChordProgression', JSON.stringify(progressionData));
            if (savedId && !savedId.startsWith("Error:")) {
                console.log(`Progression saved with ID: ${savedId}`);
                // Опционально: обновить список в выпадающем меню без перезагрузки
                await moduleManager.getModules('chordProgression', true); // Принудительно обновить кэш
            } else {
                alert(`Error saving progression: ${savedId}`);
            }
        } catch (e) {
            alert(`Exception while saving: ${e.message}`);
        }
    }
};

if (typeof PadModeManager !== 'undefined' && PadModeManager.registerStrategy) {
    PadModeManager.registerStrategy(ChordModeStrategy);
} else {
    console.warn("[ChordModeStrategy] PadModeManager not found for self-registration.");
} 