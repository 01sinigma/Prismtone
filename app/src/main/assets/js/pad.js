/**
 * @file pad.js
 * @description
 * This file manages the XY touch pad interface of Prismtone.
 * It handles pointer events (down, move, up/cancel), translates touch coordinates into musical actions,
 * and interacts with the active PadModeStrategy to determine note generation lógica.
 * Key responsibilities include:
 * - Initializing the pad container and its child elements (visualizer canvas, zones, labels).
 * - Adding event listeners for pointer interactions.
 * - Throttling `pointermove` events using `requestAnimationFrame` for performance (`_processPendingMoves`).
 * - Managing active touches and their states (`activeTouchesInternal`).
 * - Requesting zone layout and data from the `PadModeManager` and its current strategy.
 * - Drawing zones and labels on the pad (`drawZones`).
 * - Applying visual hints to zones and the visualizer (`applyVisualHints`).
 * - Communicating note on/off/update events to `synth.js`.
 * - Providing utility functions for touch coordinate conversion and state retrieval.
 */

// Файл: app/src/main/assets/js/pad.js
// ВЕРСИЯ 10.3: Оптимизированная обработка pointermove через requestAnimationFrame

const pad = {
    container: null,
    visualizerCanvas: null,
    zonesContainer: null,
    labelsContainer: null,
    isReady: false,
    activeTouchesInternal: new Map(), // Хранит { pointerId, x, y, currentZoneIndex, previousZoneIndex, baseFrequency, state }
    _currentDisplayedZones: [],
    _zoneMidiNoteToIndexMap: new Map(), // Карта для быстрого поиска индекса зоны по MIDI ноте
    cachedRect: null,
    lastInteractionTime: 0,
    _lastDrawnTonic: null, // Для оптимизации drawZones
    _lastLabelVisibility: true, // НОВОЕ
    _lastLinesVisibility: true, // НОВОЕ
    _lastHighlightSharpsFlats: false, // НОВОЕ - для отслеживания состояния подсветки диезов/бемолей

    // >>> OPTIMIZATION: Свойства для троттлинга pointermove <<<
    _isMoveProcessingQueued: false,
    _pendingMoveEvents: new Map(), // Map<pointerId, event>

    config: {
        labelVisibility: true,
        linesVisibility: true,
        debug: true
    },

    /**
     * Initializes the XY pad component.
     * Sets up references to DOM elements, adds event listeners, and updates cached dimensions.
     * @param {HTMLElement} containerElement - The main container element for the XY pad.
     */
    init(containerElement) {
        console.log('[Pad v10.3 - Move Throttling] Initializing...');
        if (!containerElement) { console.error('[Pad] Container element not provided!'); return; }

        this.container = containerElement;
        this.visualizerCanvas = this.container.querySelector('#xy-visualizer');
        this.zonesContainer = this.container.querySelector('#xy-zones');
        this.labelsContainer = this.container.querySelector('#xy-labels');

        if (!this.visualizerCanvas || !this.zonesContainer || !this.labelsContainer) {
            console.error('[Pad] Missing required child elements.');
            return;
        }

        this.addEventListeners();
        this.addGlobalSafetyHandlers();
        this.updateCachedRect();
        window.addEventListener('resize', this.updateCachedRect.bind(this));
        this.isReady = true;
        console.log('[Pad v10.3] Initialized successfully.');
    },

    /**
     * Updates the cached bounding rectangle of the pad container.
     * Called on initialization and window resize.
     */
    updateCachedRect() {
        if (this.container) {
            this.cachedRect = this.container.getBoundingClientRect();
        } else {
            this.cachedRect = null;
        }
    },

    /**
     * Adds global event handlers for document visibility changes and window blur
     * to trigger an emergency cleanup (stop all notes).
     */
    addGlobalSafetyHandlers() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { this.emergencyCleanup(); }
        });
        window.addEventListener('blur', () => { this.emergencyCleanup(); });
    },

    /**
     * Performs an emergency cleanup, typically when the app loses focus or becomes hidden.
     * Stops all notes in the synth and clears active touch data.
     */
    emergencyCleanup() {
        console.warn("[Pad v10] Emergency Cleanup triggered.");
        if (typeof synth !== 'undefined' && synth.forceStopAllNotes) {
            synth.forceStopAllNotes();
        }
        this.activeTouchesInternal.forEach((touchData) => {
            if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchUp === 'function') {
                visualizer.notifyTouchUp(touchData.pointerId);
            }
        });
        this.activeTouchesInternal.clear();
    },

    /**
     * Adds pointer event listeners to the pad container.
     * Handles pointer down, move, up, cancel, and leave events.
     * Prevents default context menu behavior.
     */
    addEventListeners() {
        if (!this.container) return;
        const eventOptions = { passive: false }; // passive: false необходимо для preventDefault()
        this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this), eventOptions);
        this.container.addEventListener('pointermove', this.handlePointerMove.bind(this), eventOptions);
        this.container.addEventListener('pointerup', this.handlePointerUpOrCancel.bind(this), eventOptions);
        this.container.addEventListener('pointercancel', this.handlePointerUpOrCancel.bind(this), eventOptions);
        this.container.addEventListener('pointerleave', this.handlePointerUpOrCancel.bind(this)); // Leave - это тоже конец касания
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    /**
     * Updates the pad zones based on the current PadModeStrategy.
     * Fetches zone layout options and data from the strategy, then calls `drawZones`
     * and `applyVisualHints`.
     * @async
     * @returns {Promise<void>}
     */
    async updateZones() {
        if (!this.isReady || !PadModeManager || !PadModeManager.getCurrentStrategy()) {
            console.warn(`[Pad.updateZones] Aborting: Not ready or no strategy. PadReady: ${this.isReady}`);
            if (this.isReady) this.drawZones([], app.state.currentTonic);
            return;
        }
        console.log(`[Pad.updateZones] Updating zones for mode: ${PadModeManager.getCurrentModeId()}.`);
        try {
            const currentStrategy = PadModeManager.getCurrentStrategy();
            const layoutContext = await currentStrategy.getZoneLayoutOptions(app.state);
            if (!layoutContext) {
                console.warn("[Pad.updateZones] No layout context from strategy. Pad cleared.");
                this.drawZones([], app.state.currentTonic);
                return;
            }
            const servicesForStrategy = { musicTheoryService: MusicTheoryService };
            const zonesData = await currentStrategy.generateZoneData(layoutContext, app.state, servicesForStrategy);
            this.drawZones(zonesData, app.state.currentTonic);
            if (typeof currentStrategy.getPadVisualHints === 'function') {
                console.log(`[Pad.updateZones] Calling getPadVisualHints for mode: ${PadModeManager.getCurrentModeId()}`);
                const hints = await currentStrategy.getPadVisualHints(this._currentDisplayedZones, app.state, servicesForStrategy);
                console.log(`[Pad.updateZones] Hints received:`, hints ? JSON.parse(JSON.stringify(hints)) : hints);
                this.applyVisualHints(hints);
            } else {
                this.applyVisualHints([]);
            }
        } catch (error) {
            console.error('[Pad.updateZones] Error:', error, error.stack);
            if (this.isReady) this.drawZones([], app.state.currentTonic);
        }
    },

    /**
     * Applies visual hints (e.g., highlighting active notes, suggested notes) to the pad zones
     * and notifies the visualizer.
     * @param {Array<object>} hintsArray - An array of hint objects, each specifying zoneIndex, style, color, etc.
     */
    applyVisualHints(hintsArray) {
        if (!this.isReady) return;
        this._currentVisualHints = hintsArray || [];
        const visualizerHintsPayload = [];
        this.zonesContainer.querySelectorAll('.xy-pad-zone-area').forEach(zoneEl => {
            const hintClasses = Array.from(zoneEl.classList).filter(cls => cls.startsWith('hint-'));
            if (hintClasses.length > 0) zoneEl.classList.remove(...hintClasses);
        });
        if (this._currentVisualHints.length === 0) {
            if (typeof visualizer !== 'undefined' && typeof visualizer.updatePadHints === 'function') {
                visualizer.updatePadHints([]);
            }
            return;
        }
        this._currentVisualHints.forEach(hint => {
            const zone = this._currentDisplayedZones[hint.zoneIndex];
            if (zone) {
                if (hint.styleClass && hint.type === 'active_note') {
                    const zoneDivs = this.zonesContainer.querySelectorAll('.xy-pad-zone-area');
                    const targetZoneDiv = zoneDivs[hint.zoneIndex];
                    if (targetZoneDiv) {
                        targetZoneDiv.classList.add(hint.styleClass);
                    }
                }
                const hintXcenterNormalized = zone.startX + (zone.endX - zone.startX) / 2;
                let color = hint.colorHint || '#FFFFFF';
                let sizeFactor = 1.0;
                let intensity = 1.0;
                if (hint.function === 'ACTIVE') {
                    sizeFactor = 1.2; intensity = 1.0;
                }
                visualizerHintsPayload.push({
                    id: `padhint_${zone.index}_${hint.function || hint.type}`,
                    x: hintXcenterNormalized,
                    yPosOnCanvas: 0.03,
                    color: color,
                    type: hint.function || hint.type,
                    intensity: intensity,
                    sizeFactor: sizeFactor
                });
            }
        });
        if (typeof visualizer !== 'undefined' && typeof visualizer.updatePadHints === 'function') {
            visualizer.updatePadHints(visualizerHintsPayload);
        }
    },

    /**
     * Draws the interactive zones and their labels on the pad.
     * Clears existing zones and labels, then redraws them based on `zonesData`.
     * @param {Array<object>} zonesData - An array of zone objects, each defining its position, note, label, etc.
     * @param {string} currentTonicNoteName - The name of the current tonic note (e.g., "C4") for highlighting.
     */
    drawZones(zonesData, currentTonicNoteName) {
        console.log(`[Pad.drawZones ENTRY v10.1] Received zonesData (length: ${zonesData ? zonesData.length : 'null/undefined'}), currentTonic: ${currentTonicNoteName}`);
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) return;
        if (zonesData && zonesData.length > 0) console.log("[Pad.drawZones] First zone example:", JSON.stringify(zonesData[0]));

        // >>> ОПТИМИЗАЦИЯ: Проверка на реальные изменения <<<
        // Сравнение может быть сложным, если объекты содержат функции или сложные структуры.
        // Простая проверка по длине и MIDI первой ноты может отсечь большинство ненужных перерисовок.
        // >>> ОПТИМИЗАЦИЯ v2: Проверка на реальные изменения данных И конфигурации <<<
        if (this._currentDisplayedZones && zonesData &&
            this._currentDisplayedZones.length === zonesData.length &&
            this._currentDisplayedZones[0]?.midiNote === zonesData[0]?.midiNote &&
            this._lastDrawnTonic === currentTonicNoteName &&
            this._lastLabelVisibility === this.config.labelVisibility &&
            this._lastLinesVisibility === this.config.linesVisibility &&
            this._lastHighlightSharpsFlats === app.state.highlightSharpsFlats) // <-- ДОБАВЛЕНО
        {
             console.log("[Pad.drawZones] Zone data and config unchanged. Skipping DOM redraw.");
             return;
        }
        // this._lastDrawnTonic = currentTonicNoteName; // Сохраняем для следующей проверки -- ПЕРЕМЕЩЕНО В КОНЕЦ ФУНКЦИИ
        // --- КОНЕЦ ОПТИМИЗАЦИИ ---

        console.log(`[Pad.drawZones v10] Drawing ${zonesData.length} zones. Current tonic: ${currentTonicNoteName}`);
        this._currentDisplayedZones = Array.isArray(zonesData) ? zonesData : [];

        this.zonesContainer.innerHTML = '';
        this.labelsContainer.innerHTML = '';
        this._zoneMidiNoteToIndexMap.clear(); // Очищаем карту перед заполнением

        if (this._currentDisplayedZones.length === 0) {
            console.warn("[Pad.drawZones v10] No zonesData to draw.");
            return;
        }

        let borderColorRgb = '224, 224, 224';
        let textColor = '#757575';
        let noteColorsForLabels;
        if (typeof visualizer !== 'undefined' && visualizer.noteColors && visualizer.noteColors.length === 12) {
            noteColorsForLabels = visualizer.noteColors;
        }

        try {
            const computedStyle = getComputedStyle(document.body);
            borderColorRgb = computedStyle.getPropertyValue('--color-border-rgb').trim() || borderColorRgb;
            textColor = computedStyle.getPropertyValue('--color-text-secondary').trim() || textColor;
        } catch (e) { console.warn("[Pad v10 drawZones] Error getting styles:", e); }

        const zoneLineColor = `rgba(${borderColorRgb}, ${this.config.linesVisibility ? 0.4 : 0})`;

        this._currentDisplayedZones.forEach((zone, index) => {
            console.log(`[Pad.drawZones] Drawing zone ${index}:`, zone.noteName,`startX: ${zone.startX}, width: ${(zone.endX - zone.startX) * 100}%`);
            zone.index = index; // Убедимся, что у каждой зоны есть ее индекс

            // Заполняем карту <midiNote, zoneIndex>
            if (zone.midiNote !== undefined) {
                this._zoneMidiNoteToIndexMap.set(zone.midiNote, index);
            }

            const zoneElement = document.createElement('div');
            zoneElement.className = 'xy-pad-zone-area';
            zoneElement.id = zone.id || `zone-${index}`; // Assign ID from zone data or generate one

            if (zone.type === 'drum_pad') {
                zoneElement.classList.add('drum-pad-cell');
                // For drum pads, use startY and endY for vertical positioning
                zoneElement.style.left = `${zone.startX * 100}%`;
                zoneElement.style.width = `${(zone.endX - zone.startX) * 100}%`;
                zoneElement.style.top = `${zone.startY * 100}%`; // Y is 0 at top, 1 at bottom for layout
                zoneElement.style.height = `${(zone.endY - zone.startY) * 100}%`;
                // Drum pads generally don't have tonic/sharp/flat highlighting
            } else {
                // Existing logic for melodic pads
                zoneElement.style.left = `${zone.startX * 100}%`;
                zoneElement.style.width = `${(zone.endX - zone.startX) * 100}%`;
                // Melodic pads take full height by default, unless specified otherwise
                zoneElement.style.top = '0%';
                zoneElement.style.height = '100%';


                if (app.state.highlightSharpsFlats && zone.isSharpFlat) {
                    zoneElement.classList.add('sharp-flat-zone');
                }
                if (zone.noteName === currentTonicNoteName) {
                    zoneElement.classList.add('tonic-zone');
                }
            }

            this.zonesContainer.appendChild(zoneElement);

            // Dividers for melodic zones (vertical lines)
            if (zone.type !== 'drum_pad' && this.config.linesVisibility && index > 0) {
                const lineElement = document.createElement('div');
                lineElement.className = 'xy-zone-divider';
                lineElement.style.left = `${zone.startX * 100}%`;
                lineElement.style.borderLeftColor = zoneLineColor;
                this.zonesContainer.appendChild(lineElement);
            }
            // For drum_pad, grid lines would ideally be part of the cell's border or pseudo-elements
            // Or handled by a separate grid drawing function if more complex lines are needed

            if (this.config.labelVisibility) {
                const label = document.createElement('div');
                label.className = 'xy-label';
                // For drum pads, labelOverride (soundName) is preferred.
                label.textContent = zone.labelOverride || zone.noteName || (zone.type === 'drum_pad' && zone.soundName ? zone.soundName : '?');
                label.style.color = textColor;

                const labelX = ((zone.startX + zone.endX) / 2) * 100;
                label.style.left = `${labelX}%`;

                if (zone.type === 'drum_pad') {
                    // Center label vertically within the drum pad cell
                    const labelY = ((zone.startY + zone.endY) / 2) * 100;
                    label.style.top = `${labelY}%`;
                    label.style.transform = 'translate(-50%, -50%)'; // Adjust for centering
                    // Remove bottom border for drum pad labels or make it specific
                    label.style.borderBottomColor = 'transparent';
                } else {
                    // Existing label positioning for melodic pads
                    if (zone.midiNote !== undefined && noteColorsForLabels) {
                        const noteIndex = zone.midiNote % 12;
                        label.style.borderBottomColor = noteColorsForLabels[noteIndex] || 'transparent';
                    }
                }
                this.labelsContainer.appendChild(label);
            }
        });

        // Last vertical line for melodic zones
        if (this.config.linesVisibility && this._currentDisplayedZones.length > 0 &&
            this._currentDisplayedZones.some(z => z.type !== 'drum_pad')) {
            const lastLine = document.createElement('div');
            lastLine.className = 'xy-zone-divider';
            lastLine.style.left = `100%`;
            lastLine.style.borderLeftColor = zoneLineColor;
            this.zonesContainer.appendChild(lastLine);
        }
        // this.applyVisualHints(this._currentVisualHints); // Раскомментируйте, если нужно

        // >>> Сохраняем последнее состояние отрисовки для следующей оптимизации <<<
        this._lastDrawnTonic = currentTonicNoteName;
    },

    /**
     * Clears all drawn zones and labels from the pad.
     * Resets internal state related to displayed zones.
     */
    clearZones() {
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) {
            console.warn("[Pad.clearZones] Pad not ready or containers missing.");
            return;
        }
        console.log("[Pad.clearZones] Clearing all zones and labels.");
        this.zonesContainer.innerHTML = '';
        this.labelsContainer.innerHTML = '';
        this._currentDisplayedZones = [];
        this._zoneMidiNoteToIndexMap.clear();
        this.applyVisualHints([]); // Clear any visual hints

        // Reset optimization flags as the state is now clean
        this._lastDrawnTonic = null;
        // this._lastLabelVisibility and this._lastLinesVisibility can remain as they reflect config, not drawn content.
        // this._lastHighlightSharpsFlats can also remain.
        this._lastLabelVisibility = this.config.labelVisibility;
        this._lastLinesVisibility = this.config.linesVisibility;
        this._lastHighlightSharpsFlats = app.state.highlightSharpsFlats; // <-- ДОБАВЛЕНО
    },

    /**
     * Clears all drawn zones and labels from the pad.
     * Resets internal state related to displayed zones.
     */
    clearZones() {
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) {
            console.warn("[Pad.clearZones] Pad not ready or containers missing.");
            return;
        }
        console.log("[Pad.clearZones] Clearing all zones and labels.");
        this.zonesContainer.innerHTML = '';
        this.labelsContainer.innerHTML = '';
        this._currentDisplayedZones = [];
        this._zoneMidiNoteToIndexMap.clear();
        this.applyVisualHints([]); // Clear any visual hints

        // Reset optimization flags as the state is now clean.
        // _lastDrawnTonic is reset because the tonic highlighting is gone.
        this._lastDrawnTonic = null;
        // The visibility flags for labels/lines and highlightSharpsFlats reflect config,
        // so they don't need to be reset here as they weren't part of the *drawn content* state
        // that this._currentDisplayedZones represented.
        console.log("[Pad.clearZones] Pad cleared.");
    },

    /**
     * Provides context for the PadModeStrategy, including app state and synth reference.
     * @returns {{appState: object, synthRef: object, musicTheoryServiceRef: object, padRef: object}}
     * @private
     */
    _getPadContext() {
        return {
            appState: app.state,
            synthRef: synth,
            padDimensions: this.cachedRect ? { width: this.cachedRect.width, height: this.cachedRect.height } : null
        };
    },

    /**
     * Handles the 'pointerdown' event on the pad.
     * Records the new touch, determines the target zone, and requests a note action
     * from the current PadModeStrategy. Then, interacts with the synth and visualizer.
     * @param {PointerEvent} event - The pointerdown event object.
     */
    handlePointerDown(event) {
        event.preventDefault();
        if (!this.isReady || !app?.state.isAudioReady || !synth?.isReady) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        this.lastInteractionTime = Date.now();
        try { this.container.setPointerCapture(event.pointerId); }
        catch (e) { console.warn(`[Pad] Failed to capture pointer ${event.pointerId}:`, e); }

        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy?.onPointerDown) return;

        const noteAction = strategy.onPointerDown(event.pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());

        if (noteAction) {
            if (VibrationService.isEnabled) {
                VibrationService.trigger('touch_down', touchInfo.y);
            }

            if (noteAction.type === 'note_on' && noteAction.note) {
                // >>> ИЗМЕНЕНИЕ: ВЫЗЫВАЕМ НЕБЛОКИРУЮЩИЙ МЕТОД ОЧЕРЕДИ <<<
                // This call is already correct as per the new synth.js structure
                synth.startNote(noteAction.note.frequency, 0.7, touchInfo.y, event.pointerId);

                let zoneIndex = -1;
                if (noteAction.note && noteAction.note.midiNote !== undefined) {
                    zoneIndex = this._zoneMidiNoteToIndexMap.get(noteAction.note.midiNote);
                    if (zoneIndex === undefined) zoneIndex = -1; // Если нота не найдена в карте
                }

                this.activeTouchesInternal.set(event.pointerId, {
                    pointerId: event.pointerId, x: touchInfo.x, y: touchInfo.y,
                    currentZoneIndex: zoneIndex,
                    previousZoneIndex: zoneIndex,
                    baseFrequency: noteAction.note.frequency,
                    state: 'down'
                });
                visualizer?.notifyTouchDown({ id: event.pointerId, x: touchInfo.x, y: touchInfo.y, noteInfo: noteAction.note });
            }
            // ... (обработка других noteAction.type, например 'chord_on') ...
        }
    },

    /**
     * Handles the 'pointermove' event on the pad.
     * Adds the event to a queue (`_pendingMoveEvents`) to be processed asynchronously
     * via `requestAnimationFrame` by `_processPendingMoves` for performance.
     * @param {PointerEvent} event - The pointermove event object.
     */
    handlePointerMove(event) {
        // Проверяем, отслеживаем ли мы это касание. Если нет, игнорируем.
        if (!this.activeTouchesInternal.has(event.pointerId)) return;

        event.preventDefault();

        // Сохраняем последнее событие для данного касания, перезаписывая предыдущее.
        this._pendingMoveEvents.set(event.pointerId, event);

        // Если обработка очереди еще не запланирована, планируем ее на следующий кадр анимации.
        if (!this._isMoveProcessingQueued) {
            this._isMoveProcessingQueued = true;
            requestAnimationFrame(this._processPendingMoves.bind(this));
        }
    },

    /**
     * Processes pending pointer move events that were queued by `handlePointerMove`.
     * This method is called via `requestAnimationFrame` to ensure smooth UI performance.
     * Calls `processSinglePointerMove` for each event in the queue.
     * @private
     */
    _processPendingMoves() {
        // Обрабатываем все накопившиеся за кадр события движения.
        this._pendingMoveEvents.forEach(event => {
            this.processSinglePointerMove(event);
        });

        // Очищаем карту событий для следующего кадра.
        this._pendingMoveEvents.clear();
        this._isMoveProcessingQueued = false; // Сбрасываем флаг, готовы к новому планированию.
    },

    /**
     * Processes a single pointer move event.
     * Updates the touch's position, determines the new target zone, and requests
     * a note update action from the current PadModeStrategy.
     * Interacts with the synth and visualizer accordingly.
     * @param {PointerEvent} event - The pointermove event object to process.
     */
    processSinglePointerMove(event) {
        const pointerId = event.pointerId;
        const internalTouchData = this.activeTouchesInternal.get(pointerId);
        if (!internalTouchData || !this.isReady) return;

        this.lastInteractionTime = Date.now();
        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;

        internalTouchData.x = touchInfo.x;
        internalTouchData.y = touchInfo.y;
        internalTouchData.state = 'move';

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy?.onPointerMove) return;

        const noteAction = strategy.onPointerMove(pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());

        if (noteAction) {
            const noteOrNewNote = noteAction.newNote || noteAction.note;
            visualizer?.notifyTouchMove({ id: pointerId, x: touchInfo.x, y: touchInfo.y, noteInfo: noteOrNewNote });

            // >>> НАЧАЛО ИЗМЕНЕНИЙ <<<
            switch (noteAction.type) {
                case 'note_change':
                    if (noteAction.oldNote && noteAction.newNote) {
                        // [Связь -> synth.js] Вместо двух вызовов используем один, предназначенный для легато.
                        // Это дает synth.js больше контроля над тем, как именно реализовать переход.
                        synth.setNote(
                            noteAction.oldNote.frequency,
                            noteAction.newNote.frequency,
                            0.7, // velocity
                            touchInfo.y,
                            pointerId
                        );
                        // Обновляем `baseFrequency` в нашем внутреннем состоянии касания
                        internalTouchData.baseFrequency = noteAction.newNote.frequency;
                    }
                    break;
                case 'note_update':
                    synth.updateNote(noteAction.note.frequency, 0.7, touchInfo.y, pointerId);
                    break;
                case 'note_off':
                    synth.triggerRelease(pointerId);
                    break;
            }
            // >>> КОНЕЦ ИЗМЕНЕНИЙ <<<
        }
    },

    /**
     * Handles 'pointerup', 'pointercancel', and 'pointerleave' events on the pad.
     * Requests a note release action from the current PadModeStrategy for the ended touch.
     * Interacts with the synth and visualizer, then removes the touch from active tracking.
     * @param {PointerEvent} event - The pointer event object.
     */
    handlePointerUpOrCancel(event) {
        const pointerId = event.pointerId;
        if (!this.activeTouchesInternal.has(pointerId) || !this.isReady) return;

        event.preventDefault();
        this.lastInteractionTime = Date.now();
        try { if (this.container.hasPointerCapture(pointerId)) { this.container.releasePointerCapture(pointerId); } }
        catch (e) { console.warn(`[Pad] Failed to release pointer ${pointerId}:`, e); }

        // Важно: Удаляем отложенное событие move для этого пальца, если оно есть.
        this._pendingMoveEvents.delete(pointerId);

        // >>> ИЗМЕНЕНИЕ: ВЫЗЫВАЕМ НЕБЛОКИРУЮЩИЙ МЕТОД ОЧЕРЕДИ <<<
        // Отправляем команду на затухание в очередь synth.js.
        synth.triggerRelease(pointerId);

        if (VibrationService.isEnabled) {
            VibrationService.stop();
        }

        visualizer?.notifyTouchUp(pointerId);
        this.activeTouchesInternal.delete(pointerId);
    },

    /**
     * Retrieves and normalizes touch information from a pointer event.
     * @param {PointerEvent} event - The pointer event.
     * @returns {{x: number, y: number, rawX: number, rawY: number, pointerId: number, target: EventTarget|null, originalEvent: PointerEvent} | null} Touch information or null if pad not ready.
     * @private
     */
    getTouchInfo(event) {
        if (!this.cachedRect) this.updateCachedRect();
        if (!this.cachedRect) return null;

        const x = Math.max(0, Math.min(1, (event.clientX - this.cachedRect.left) / this.cachedRect.width));
        const y = Math.max(0, Math.min(1, 1.0 - (event.clientY - this.cachedRect.top) / this.cachedRect.height));

        return { x, y };
    },

    /**
     * Toggles the visibility of note labels on the pad.
     * @param {boolean} show - True to show labels, false to hide.
     */
    toggleLabels(show) {
        const enabled = typeof show === 'boolean' ? show : !this.config.labelVisibility;
        if (this.config.labelVisibility === enabled) return;
        this.config.labelVisibility = enabled;
        this.drawZones(this._currentDisplayedZones, app.state.currentTonic);
    },

    /**
     * Toggles the visibility of grid lines on the pad.
     * @param {boolean} show - True to show lines, false to hide.
     */
    toggleLines(show) {
        const enabled = typeof show === 'boolean' ? show : !this.config.linesVisibility;
        if (this.config.linesVisibility === enabled) return;
        this.config.linesVisibility = enabled;
        this.drawZones(this._currentDisplayedZones, app.state.currentTonic);
    },

    /**
     * Checks if there has been recent user activity on the pad.
     * @returns {boolean} True if interaction occurred within the last 5 seconds, false otherwise.
     */
    hasRecentActivity() {
        return Date.now() - this.lastInteractionTime < 1000;
    },

    /**
     * Gets the last recorded Y position of the primary touch (if any).
     * @returns {number|null} The normalized Y position (0-1) or null if no active touches.
     */
    getLastYPosition() {
        return this.lastY;
    },

    /**
     * Returns a snapshot of the current active touch states on the pad.
     * This can be used by other modules (e.g., visualizers) to get information about ongoing interactions.
     * Each entry in the returned Map contains details like x, y, currentZoneIndex, noteFrequency, etc.
     * @returns {Map<number, object>} A Map where keys are pointerIds and values are touch state objects.
     */
    getActiveTouchStates() {
        const states = [];
        this.activeTouchesInternal.forEach((touchData, pointerId) => {
            let noteInfoForViz = null;
            if (!touchData.isChord && touchData.baseFrequency) {
                const zone = this._currentDisplayedZones.find(z => Math.abs(z.frequency - touchData.baseFrequency) < 0.01);
                noteInfoForViz = zone ? { noteName: zone.noteName, frequency: zone.frequency, midiNote: zone.midiNote } : { frequency: touchData.baseFrequency };
            } else if (touchData.isChord && touchData.chordNotes) {
                 noteInfoForViz = { isChord: true, chordNotes: touchData.chordNotes };
            }

            states.push({
                id: pointerId,
                x: touchData.x, y: touchData.y, state: touchData.state,
                noteInfo: noteInfoForViz,
                isChord: touchData.isChord,
                chordNotes: touchData.chordNotes
            });
        });
        return states;
    },

    /**
     * Sets the throttle interval for processing pointermove events.
     * Note: Currently, pointermove is processed via requestAnimationFrame, so this interval
     * is not directly used for throttling in the rAF loop, but could be used if a different
     * throttling strategy was employed.
     * @param {number} intervalMs - The desired interval in milliseconds.
     * @deprecated Since pointermove is handled by requestAnimationFrame, this method's direct effect on throttling is limited.
     */
    setMoveThrottle(intervalMs) {
        const ms = parseInt(intervalMs, 10);
        if (!isNaN(ms) && ms >= 0) {
            this.config.throttleMoveEventsMs = ms;
            console.log(`[Pad.js] Движение касаний теперь обрабатывается не чаще, чем раз в ${ms} мс.`);
        }
    }
};
