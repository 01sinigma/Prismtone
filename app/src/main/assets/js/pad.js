const pad = {
    container: null,
    visualizerCanvas: null,
    zonesContainer: null,
    labelsContainer: null,
    isReady: false,
    zonesData: [],
    activeTouchesInternal: new Map(),
    config: {
        labelVisibility: true,
        linesVisibility: true, // Это значение будет управляться через toggleLines
        debug: true,
        touchEndTolerance: 300,
        throttleMoveEventsMs: 16, // 16 ~ 60 FPS. 33 ~ 30 FPS. 0 - отключает троттлинг.
    },
    // DOM element pools for zones, labels, and lines to optimize drawing by reusing elements.
    zoneElementPool: [],
    labelElementPool: [],
    lineElementPool: [],
    maxPoolSize: 38,
    lastY: 0.5,
    lastInteractionTime: 0,
    cachedRect: null,
    _currentDisplayedZones: [],
    _currentVisualHints: [], // Храним текущие подсказки
    _lastMoveEvent: null,
    _lastMoveProcessTime: 0,
    _isMoveProcessingQueued: false,
    _pendingMoveEvents: new Map(), // Map<pointerId, event> для хранения последних событий

    init(containerElement) {
        console.log('[Pad v10.2 - Crash Fix] Initializing...');
        if (!containerElement) {
            console.error('[Pad v10.2] Container element not provided!');
            this.isReady = false;
            return;
        }
        this.container = containerElement;
        this.visualizerCanvas = this.container.querySelector('#xy-visualizer');
        this.zonesContainer = this.container.querySelector('#xy-zones');
        this.labelsContainer = this.container.querySelector('#xy-labels');

        if (!this.visualizerCanvas || !this.zonesContainer || !this.labelsContainer) {
            console.error('[Pad v10.2] Missing required child elements (visualizer, zones, or labels).');
            this.isReady = false;
            return;
        }

        this.addEventListeners();
        this.addGlobalSafetyHandlers();
        this.updateCachedRect();
        window.addEventListener('resize', this.updateCachedRect.bind(this));

        this.zoneElementPool = [];
        this.labelElementPool = [];
        this.lineElementPool = [];

        // Pre-populate DOM element pools for zones, labels, and lines.
        for (let i = 0; i < this.maxPoolSize; i++) {
            // Create Zone Element
            const zoneElement = document.createElement('div');
            zoneElement.className = 'xy-pad-zone-area'; // Base class
            zoneElement.style.position = 'absolute';
            zoneElement.style.top = '0';
            zoneElement.style.bottom = '0';
            zoneElement.style.display = 'none'; // Initially hidden
            this.zonesContainer.appendChild(zoneElement);
            this.zoneElementPool.push(zoneElement);

            // Create Line Element (for dividers)
            const lineElement = document.createElement('div');
            lineElement.className = 'xy-zone-divider';
            lineElement.style.position = 'absolute';
            lineElement.style.top = '0';
            lineElement.style.bottom = '0';
            lineElement.style.display = 'none'; // Initially hidden
            this.zonesContainer.appendChild(lineElement);
            this.lineElementPool.push(lineElement);

            // Create Label Element
            const labelElement = document.createElement('div');
            labelElement.className = 'xy-label';
            labelElement.style.position = 'absolute';
            labelElement.style.display = 'none'; // Initially hidden
            this.labelsContainer.appendChild(labelElement);
            this.labelElementPool.push(labelElement);
        }
        console.log(`[Pad v10.2] DOM pools created with size ${this.maxPoolSize}.`);
        this.isReady = true;
        console.log('[Pad v10.2] Initialized successfully.');
    },

    updateCachedRect() {
        if (this.container) {
            this.cachedRect = this.container.getBoundingClientRect();
        } else {
            this.cachedRect = null;
        }
    },

    addGlobalSafetyHandlers() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { this.emergencyCleanup(); }
        });
        window.addEventListener('blur', () => { this.emergencyCleanup(); });
    },

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

    addEventListeners() {
        if (!this.container) return;
        const eventOptions = { passive: false, capture: true };
        this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this), eventOptions);
        this.container.addEventListener('pointermove', this.handlePointerMove.bind(this), eventOptions);
        this.container.addEventListener('pointerup', this.handlePointerUpOrCancel.bind(this), eventOptions);
        this.container.addEventListener('pointercancel', this.handlePointerUpOrCancel.bind(this), eventOptions);
        this.container.addEventListener('pointerleave', this.handlePointerLeave.bind(this), eventOptions);
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    },

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

    // Draws pad zones using pre-created DOM elements from pools to improve performance
    // by avoiding repeated DOM creation and destruction.
    drawZones(zonesData, currentTonicNoteName) {
        // console.log(`[Pad.drawZones POOLING v10.2] Received zonesData (length: ${zonesData ? zonesData.length : 'null/undefined'}), currentTonic: ${currentTonicNoteName}`);
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) {
            console.warn('[Pad.drawZones POOLING] Aborting: Not ready or containers missing.');
            return;
        }

        this._currentDisplayedZones = Array.isArray(zonesData) ? zonesData : [];
        const numZonesToDisplay = this._currentDisplayedZones.length;

        let borderColorRgb = '224, 224, 224';
        let textColor = '#757575';
        let noteColorsForLabels = {};

        try {
            const computedStyle = getComputedStyle(document.body);
            borderColorRgb = computedStyle.getPropertyValue('--color-border-rgb').trim() || borderColorRgb;
            textColor = computedStyle.getPropertyValue('--color-text-secondary').trim() || textColor;

            if (typeof app !== 'undefined' && app.state && app.state.noteColors) {
                 noteColorsForLabels = app.state.noteColors;
            } else if (typeof visualizer !== 'undefined' && visualizer.noteColors) {
                 noteColorsForLabels = visualizer.noteColors;
            } else {
                noteColorsForLabels = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            }
        } catch (e) { console.warn("[Pad v10 drawZones POOLING] Error getting styles/colors:", e); }

        const zoneLineColor = `rgba(${borderColorRgb}, ${this.config.linesVisibility ? 0.4 : 0})`;

        for (let i = 0; i < numZonesToDisplay; i++) {
            if (i >= this.maxPoolSize) {
                console.warn(`[Pad.drawZones POOLING] Attempting to draw more zones (${i}) than available in pool (${this.maxPoolSize}). Stopping.`);
                break;
            }
            const zoneData = this._currentDisplayedZones[i];
            zoneData.index = i;

            const zoneElement = this.zoneElementPool[i];
            zoneElement.style.left = `${zoneData.startX * 100}%`;
            zoneElement.style.width = `${(zoneData.endX - zoneData.startX) * 100}%`;

            zoneElement.className = 'xy-pad-zone-area';
            if (app.state.highlightSharpsFlats && zoneData.isSharpFlat) {
                zoneElement.classList.add('sharp-flat-zone');
            }
            if (zoneData.noteName === currentTonicNoteName) {
                zoneElement.classList.add('tonic-zone');
            }
            zoneElement.style.display = 'block';

            if (i > 0) {
                const lineElement = this.lineElementPool[i - 1];
                lineElement.style.left = `${zoneData.startX * 100}%`;
                lineElement.style.borderLeftColor = zoneLineColor;
                lineElement.style.display = this.config.linesVisibility ? 'block' : 'none';
            }

            const labelElement = this.labelElementPool[i];
            if (this.config.labelVisibility) {
                labelElement.textContent = zoneData.labelOverride || zoneData.noteName || '?';
                labelElement.style.color = textColor;
                const labelX = ((zoneData.startX + zoneData.endX) / 2) * 100;
                labelElement.style.left = `${labelX}%`;
                labelElement.style.transform = 'translateX(-50%)';
                labelElement.style.bottom = '5px';
                // Add padding to lift text above its bottom border (the colored stripe).
                labelElement.style.paddingBottom = '3px';

                labelElement.style.borderBottomColor = 'transparent';
                if (zoneData.midiNote !== undefined && noteColorsForLabels) {
                    const noteIndex = zoneData.midiNote % 12;
                    labelElement.style.borderBottomColor = noteColorsForLabels[noteIndex] || 'transparent';
                }
                labelElement.style.display = 'block';
            } else {
                labelElement.style.display = 'none';
            }
        }

        if (this.config.linesVisibility && numZonesToDisplay > 0 && numZonesToDisplay <= this.maxPoolSize) {
            const lastLineElement = this.lineElementPool[numZonesToDisplay -1];
            lastLineElement.style.left = `100%`;
            lastLineElement.style.borderLeftColor = zoneLineColor;
            lastLineElement.style.display = 'block';
        } else if (numZonesToDisplay > 0 && numZonesToDisplay <= this.maxPoolSize) {
            if (this.lineElementPool[numZonesToDisplay - 1]) { // Check if element exists
               this.lineElementPool[numZonesToDisplay - 1].style.display = 'none';
            }
        }

        for (let i = numZonesToDisplay; i < this.maxPoolSize; i++) {
            if(this.zoneElementPool[i]) this.zoneElementPool[i].style.display = 'none';
            if(this.labelElementPool[i]) this.labelElementPool[i].style.display = 'none';
        }

        for (let i = Math.max(0, numZonesToDisplay -1); i < this.maxPoolSize; i++) {
            // Hide lines that are for zones not being displayed.
            // If numZonesToDisplay is 5, lines used are 0,1,2,3,4. So hide from index 5.
            // If numZonesToDisplay is 0, this loop should correctly start from 0.
            // If numZonesToDisplay is 1, lines used is 0. Hide from 1.
            // The lines used are indexed from 0 to numZonesToDisplay-1 for the last line.
            if (numZonesToDisplay === 0) { // if no zones, hide all lines
                 if(this.lineElementPool[i]) this.lineElementPool[i].style.display = 'none';
            } else if (i >= numZonesToDisplay) { // For lines beyond the count of zones
                 if(this.lineElementPool[i]) this.lineElementPool[i].style.display = 'none';
            }
        }
        if (numZonesToDisplay === 0) { // Special case: if no zones, ensure all lines from pool are hidden
            for(let k=0; k < this.maxPoolSize; k++) {
                if(this.lineElementPool[k]) this.lineElementPool[k].style.display = 'none';
            }
        }

        // console.log(`[Pad.drawZones POOLING v10.2] Finished drawing ${numZonesToDisplay} zones.`);
    },

    _getPadContext() {
        return {
            appState: app.state,
            synthRef: synth,
            padDimensions: this.cachedRect ? { width: this.cachedRect.width, height: this.cachedRect.height } : null
        };
    },

    handlePointerDown(event) {
        if (app && !app.state.isAudioReady && !app.state.hasUserInteracted) {
            app.state.hasUserInteracted = true;
            Tone.start().then(() => {
                if (Tone.context.state === 'running') app.state.isAudioReady = true;
            }).catch(error => {
                console.error('[Pad] Failed to start audio context on interaction:', error);
                app.state.hasUserInteracted = false;
            });
        }
        if (!this.isReady || !app?.state.isAudioReady || !synth?.isReady) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        event.preventDefault();
        this.lastInteractionTime = Date.now();
        try { this.container.setPointerCapture(event.pointerId); } 
        catch (e) { console.warn(`[Pad] Failed to capture pointer ${event.pointerId}:`, e); }

        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;
        this.lastY = touchInfo.y;

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy || typeof strategy.onPointerDown !== 'function') return;
        
        const noteAction = strategy.onPointerDown(event.pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());

        if (noteAction) {
            // >>> НАЧАЛО ЛОГИКИ ВИБРАЦИИ (v2) <<<
            if (VibrationService.isEnabled) {
                const strength = touchInfo.y;
                VibrationService.trigger('touch_down', strength);
            }
            // >>> КОНЕЦ ЛОГИКИ ВИБРАЦИИ <<<

            if (noteAction.type === 'note_on' && noteAction.note) {
                synth.startNote(noteAction.note.frequency, 0.7, touchInfo.y, event.pointerId);
                const zone = this._currentDisplayedZones.find(z => z.midiNote === noteAction.note.midiNote);
                this.activeTouchesInternal.set(event.pointerId, {
                    pointerId: event.pointerId, x: touchInfo.x, y: touchInfo.y,
                    currentZoneIndex: zone ? zone.index : -1,
                    previousZoneIndex: zone ? zone.index : -1, // Инициализируем
                    baseFrequency: noteAction.note.frequency,
                    state: 'down'
                });
                visualizer?.notifyTouchDown({
                    id: event.pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                    noteInfo: noteAction.note, state: 'down'
                });
            } else if (noteAction.type === 'chord_on' && noteAction.chordNotes) {
                synth.startChord(noteAction.chordNotes, 0.7, touchInfo.y, event.pointerId);
            }
        }
    },

    processSinglePointerMove(event) {
        if (!this.activeTouchesInternal.has(event.pointerId) || !this.isReady) return;
        
        this.lastInteractionTime = Date.now();
        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;

        this.lastY = touchInfo.y;
        
        const internalTouchData = this.activeTouchesInternal.get(event.pointerId);
        const previousZoneIndex = internalTouchData ? internalTouchData.previousZoneIndex : -1;

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy || typeof strategy.onPointerMove !== 'function') return;

        const noteAction = strategy.onPointerMove(event.pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());
        
        if (noteAction) {
            let newZoneIndex = -1;
            const noteOrNewNote = noteAction.newNote || noteAction.note;
            if (noteOrNewNote) {
                const midi = noteOrNewNote.midiNote;
                const zone = this._currentDisplayedZones.find(z => z.midiNote === midi);
                if (zone) newZoneIndex = zone.index;
            }

            if (VibrationService.isEnabled) {
                if (newZoneIndex !== -1 && newZoneIndex !== previousZoneIndex) {
                    const strength = touchInfo.y;
                    VibrationService.trigger('zone_cross', strength);
                    if (internalTouchData) internalTouchData.previousZoneIndex = newZoneIndex;
                }
            }
            
            if (noteAction.type === 'note_change') {
                synth.updateNote(noteAction.newNote.frequency, 0.7, touchInfo.y, event.pointerId);
            } else if (noteAction.type === 'note_update') {
                synth.updateNote(noteAction.note.frequency, 0.7, touchInfo.y, event.pointerId);
            } else if (noteAction.type === 'note_off') {
                synth.triggerRelease(event.pointerId);
            }

            visualizer?.notifyTouchMove({
                id: event.pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                noteInfo: noteOrNewNote, state: 'move'
            });
        }
        
        if (internalTouchData) {
            internalTouchData.x = touchInfo.x;
            internalTouchData.y = touchInfo.y;
            internalTouchData.state = 'move';
        }
    },

    _processPendingMoves() {
        if (this._pendingMoveEvents.size === 0) {
            this._isMoveProcessingQueued = false;
            return;
        }

        this._pendingMoveEvents.forEach(event => {
            this.processSinglePointerMove(event);
        });

        this._pendingMoveEvents.clear();
        this._isMoveProcessingQueued = false;
    },

    handlePointerMove(event) {
        if (!this.activeTouchesInternal.has(event.pointerId)) return;
        event.preventDefault();

        this._pendingMoveEvents.set(event.pointerId, event);

        if (!this._isMoveProcessingQueued) {
            this._isMoveProcessingQueued = true;
            requestAnimationFrame(this._processPendingMoves.bind(this));
        }
    },

    handlePointerUpOrCancel(event) {
        if (!this.activeTouchesInternal.has(event.pointerId) || !this.isReady) return;
        event.preventDefault();
        
        const pointerId = event.pointerId;
        this.lastInteractionTime = Date.now();
        try { if (this.container.hasPointerCapture(pointerId)) { this.container.releasePointerCapture(pointerId); } } 
        catch (e) { console.warn(`[Pad] Failed to release pointer ${pointerId}:`, e); }

        synth.triggerRelease(pointerId);

        // >>> НАЧАЛО ЛОГИКИ ВИБРАЦИИ (v2) <<<
        if (VibrationService.isEnabled) {
            VibrationService.stop();
        }
        // >>> КОНЕЦ ЛОГИКИ ВИБРАЦИИ <<<

        visualizer?.notifyTouchUp(pointerId);
        this.activeTouchesInternal.delete(pointerId);
    },

    handlePointerLeave(event) {
        if (this.activeTouchesInternal.has(event.pointerId)) {
            console.log(`[Pad.handlePointerLeave] Pointer ${event.pointerId} left container. Releasing note.`);
            this.handlePointerUpOrCancel(event);
        }
    },

    getTouchInfo(event) {
        if (!this.cachedRect) this.updateCachedRect();
        if (!this.cachedRect) return null;

        const x = Math.max(0, Math.min(1, (event.clientX - this.cachedRect.left) / this.cachedRect.width));
        const y = Math.max(0, Math.min(1, 1.0 - (event.clientY - this.cachedRect.top) / this.cachedRect.height));

        return { x, y };
    },

    toggleLabels(show) {
        const enabled = typeof show === 'boolean' ? show : !this.config.labelVisibility;
        if (this.config.labelVisibility === enabled) return;
        this.config.labelVisibility = enabled;
        this.drawZones(this._currentDisplayedZones, app.state.currentTonic);
    },

    toggleLines(show) {
        const enabled = typeof show === 'boolean' ? show : !this.config.linesVisibility;
        if (this.config.linesVisibility === enabled) return;
        this.config.linesVisibility = enabled;
        this.drawZones(this._currentDisplayedZones, app.state.currentTonic);
    },

    hasRecentActivity() {
        return Date.now() - this.lastInteractionTime < 1000;
    },

    getLastYPosition() {
        return this.lastY;
    },

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

    setMoveThrottle(intervalMs) {
        const ms = parseInt(intervalMs, 10);
        if (!isNaN(ms) && ms >= 0) {
            this.config.throttleMoveEventsMs = ms;
            console.log(`[Pad.js] Движение касаний теперь обрабатывается не чаще, чем раз в ${ms} мс.`);
        }
    }
};
