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
        touchEndTolerance: 300
    },
    lastY: 0.5,
    lastInteractionTime: 0,
    cachedRect: null,
    _currentDisplayedZones: [],
    _currentVisualHints: [], // Храним текущие подсказки

    init(containerElement) {
        console.log('[Pad v8 - PadMode Integration] Initializing...');
        if (!containerElement) {
            console.error('[Pad v8] Container element not provided!');
            this.isReady = false; return;
        }
        this.container = containerElement;
        this.visualizerCanvas = this.container.querySelector('#xy-visualizer');
        this.zonesContainer = this.container.querySelector('#xy-zones');
        this.labelsContainer = this.container.querySelector('#xy-labels');

        if (!this.visualizerCanvas || !this.zonesContainer || !this.labelsContainer) {
            console.error('[Pad v8] Missing required child elements (visualizer, zones, or labels).');
            this.isReady = false; return;
        }
        // Устанавливаем начальное состояние видимости линий из app.state, если app уже доступно
        if (typeof app !== 'undefined' && app.state && app.state.highlightSharpsFlats && zone.isSharpFlat) {
             console.log(`[Pad.drawZones] Applying .sharp-flat-zone to ${zone.noteName}`);
             zoneElement.classList.add('sharp-flat-zone');
        }

        this.addEventListeners();
        this.addGlobalSafetyHandlers();
        this.updateCachedRect();
        window.addEventListener('resize', this.updateCachedRect.bind(this));
        this.isReady = true;
        console.log('[Pad v8] Initialized successfully.');
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
        console.warn("[Pad v8] Emergency Cleanup triggered.");
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

    drawZones(zonesData, currentTonicNoteName) {
        console.log(`[Pad.drawZones ENTRY v8.1] Received zonesData (length: ${zonesData ? zonesData.length : 'null/undefined'}), currentTonic: ${currentTonicNoteName}`);
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) return;
        if (zonesData && zonesData.length > 0) console.log("[Pad.drawZones] First zone example:", JSON.stringify(zonesData[0]));

        console.log(`[Pad.drawZones v8] Drawing ${zonesData.length} zones. Current tonic: ${currentTonicNoteName}`);
        this._currentDisplayedZones = Array.isArray(zonesData) ? zonesData : [];

        this.zonesContainer.innerHTML = '';
        this.labelsContainer.innerHTML = '';

        if (this._currentDisplayedZones.length === 0) {
            console.warn("[Pad.drawZones v8] No zonesData to draw.");
            return;
        }

        let borderColorRgb = '224, 224, 224';
        let textColor = '#757575';
        let noteColorsForLabels = {};

        try {
            const computedStyle = getComputedStyle(document.body);
            borderColorRgb = computedStyle.getPropertyValue('--color-border-rgb').trim() || borderColorRgb;
            textColor = computedStyle.getPropertyValue('--color-text-secondary').trim() || textColor;
            if (typeof visualizer !== 'undefined' && visualizer.themeColors) {
                 noteColorsForLabels = visualizer.noteColors ||
                                       { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            } else {
                noteColorsForLabels = { 0: '#FF0000', 1: '#FF4500', 2: '#FFA500', 3: '#FFD700', 4: '#FFFF00', 5: '#9ACD32', 6: '#32CD32', 7: '#00BFFF', 8: '#0000FF', 9: '#8A2BE2', 10: '#FF00FF', 11: '#FF1493' };
            }
        } catch (e) { console.warn("[Pad v8 drawZones] Error getting styles/colors:", e); }

        const zoneLineColor = `rgba(${borderColorRgb}, ${this.config.linesVisibility ? 0.4 : 0})`;

        this._currentDisplayedZones.forEach((zone, index) => {
            console.log(`[Pad.drawZones] Drawing zone ${index}:`, zone.noteName,`startX: ${zone.startX}, width: ${(zone.endX - zone.startX) * 100}%`);
            zone.index = index;

            const zoneElement = document.createElement('div');
            zoneElement.className = 'xy-pad-zone-area';
            zoneElement.style.left = `${zone.startX * 100}%`;
            zoneElement.style.width = `${(zone.endX - zone.startX) * 100}%`;

            if (app.state.highlightSharpsFlats && zone.isSharpFlat) {
                zoneElement.classList.add('sharp-flat-zone');
            }
            if (zone.noteName === currentTonicNoteName) {
                zoneElement.classList.add('tonic-zone');
            }

            this.zonesContainer.appendChild(zoneElement);

            if (this.config.linesVisibility && index > 0) {
                const lineElement = document.createElement('div');
                lineElement.className = 'xy-zone-divider';
                lineElement.style.left = `${zone.startX * 100}%`;
                lineElement.style.borderLeftColor = zoneLineColor;
                this.zonesContainer.appendChild(lineElement);
            }

            if (this.config.labelVisibility && zone.startX !== undefined && zone.endX !== undefined) {
                const label = document.createElement('div');
                label.className = 'xy-label';
                label.textContent = zone.labelOverride || zone.noteName || '?';
                label.style.color = textColor;
                const labelX = ((zone.startX + zone.endX) / 2) * 100;
                label.style.left = `${labelX}%`;
                if (zone.midiNote !== undefined && noteColorsForLabels) {
                    const noteIndex = zone.midiNote % 12;
                    label.style.borderBottomColor = noteColorsForLabels[noteIndex] || 'transparent';
                }
                this.labelsContainer.appendChild(label);
            }
        });
        if (this.config.linesVisibility && this._currentDisplayedZones.length > 0) {
            const lastLine = document.createElement('div');
            lastLine.className = 'xy-zone-divider'; lastLine.style.left = `100%`;
            lastLine.style.borderLeftColor = zoneLineColor;
            this.zonesContainer.appendChild(lastLine);
        }
        // this.applyVisualHints(this._currentVisualHints); // Раскомментируйте, если нужно
    },

    _getPadContext() {
        return {
            appState: app.state,
            synthRef: synth,
            padDimensions: this.cachedRect ? { width: this.cachedRect.width, height: this.cachedRect.height } : null
        };
    },

    async handlePointerDown(event) {
        if (app && !app.state.isAudioReady && !app.state.hasUserInteracted) {
            app.state.hasUserInteracted = true;
            try {
                await Tone.start();
                if (Tone.context.state === 'running') { app.state.isAudioReady = true; }
                else { throw new Error(`Audio context state: ${Tone.context.state}`); }
            } catch (error) {
                console.error('[Pad v8] Failed to start audio context:', error);
                app.state.hasUserInteracted = false; app.state.isAudioReady = false; return;
            }
        }
        if (!this.isReady || !app?.state.isAudioReady || !synth?.isReady) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        event.preventDefault();
        this.lastInteractionTime = Date.now();
        try { this.container.setPointerCapture(event.pointerId); }
        catch (e) { console.warn(`[Pad v8] Failed to capture pointer ${event.pointerId}:`, e); }

        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;
        this.lastY = touchInfo.y;

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy || typeof strategy.onPointerDown !== 'function') {
            console.warn("[Pad v8] No current strategy or onPointerDown method missing.");
            return;
        }

        const noteAction = await strategy.onPointerDown(event.pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());

        if (noteAction) {
            if (noteAction.type === 'note_on' && noteAction.note) {
                const velocity = noteAction.velocityFactor !== undefined ? noteAction.velocityFactor : 0.7;
                synth.startNote(noteAction.note.frequency, velocity, touchInfo.y, event.pointerId);

                const zone = this._currentDisplayedZones.find(z => z.midiNote === noteAction.note.midiNote);
                this.activeTouchesInternal.set(event.pointerId, {
                    pointerId: event.pointerId, x: touchInfo.x, y: touchInfo.y,
                    currentZoneIndex: zone ? zone.index : -1,
                    baseFrequency: noteAction.note.frequency,
                    state: 'down'
                });

                if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchDown === 'function') {
                    visualizer.notifyTouchDown({
                        id: event.pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        noteInfo: noteAction.note,
                        state: 'down'
                    });
                }

            } else if (noteAction.type === 'chord_on' && noteAction.chordNotes) {
                console.log("[Pad v8] Chord ON action received:", noteAction.chordNotes);
                 synth.startChord(noteAction.chordNotes, 0.7, touchInfo.y, event.pointerId);

                 this.activeTouchesInternal.set(event.pointerId, {
                    pointerId: event.pointerId, x: touchInfo.x, y: touchInfo.y,
                    currentZoneIndex: -1,
                    state: 'down', isChord: true, chordNotes: noteAction.chordNotes
                 });
                 if (typeof visualizer !== 'function') {
                    visualizer.notifyTouchDown({
                        id: event.pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        isChord: true, chordNotes: noteAction.chordNotes,
                        state: 'down'
                    });
                 }

            }
        }
    },

    async handlePointerMove(event) {
        const pointerId = event.pointerId; // Получаем ID из события
        if (!this.activeTouchesInternal.has(pointerId) || !this.isReady || !app?.state.isAudioReady || !synth?.isReady) return;
        event.preventDefault();
        this.lastInteractionTime = Date.now();

        const touchInfo = this.getTouchInfo(event);
        if (!touchInfo) return;
        this.lastY = touchInfo.y;

        const strategy = PadModeManager.getCurrentStrategy();
        if (!strategy || typeof strategy.onPointerMove !== 'function') return;

        const internalTouchData = this.activeTouchesInternal.get(pointerId);
        if (!internalTouchData) return; // Этого не должно быть, если has(pointerId) true

        // Вызываем onPointerMove стратегии
        const noteAction = await strategy.onPointerMove(pointerId, touchInfo.x, touchInfo.y, this._currentDisplayedZones, this._getPadContext());

        if (noteAction) {
            if (noteAction.type === 'note_change') {
                // console.log(`[Pad.handlePointerMove] Note Change for pointerId ${pointerId}: Old ${noteAction.oldNote?.name}, New ${noteAction.newNote.name}`);
                if (synth.isReady) {
                    // Вместо triggerRelease/startNote, вызываем updateNote для возможности портаменто
                    const velocity = noteAction.newNote.velocityFactor !== undefined ? noteAction.newNote.velocityFactor : 0.7; // velocity для updateNote может быть менее критична
                    synth.updateNote(noteAction.newNote.frequency, velocity, touchInfo.y, pointerId); 
                }

                // Обновляем internalTouchData
                if (internalTouchData) { // internalTouchData должно быть здесь
                    internalTouchData.baseFrequency = noteAction.newNote.frequency;
                    internalTouchData.baseNoteMidi = noteAction.newNote.midiNote; // Если вы храните MIDI
                    const zone = this._currentDisplayedZones.find(z => z.midiNote === noteAction.newNote.midiNote && z.frequency === noteAction.newNote.frequency);
                    internalTouchData.currentZoneIndex = zone ? zone.index : -1;
                    internalTouchData.isChord = false; // Предполагаем, что это одиночная нота
                    delete internalTouchData.chordNotes;
                }

                // Обновляем visualizer
                 if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchMove === 'function') {
                    visualizer.notifyTouchMove({
                        id: pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        noteInfo: noteAction.newNote, state: 'move'
                    });
                }

            } else if (noteAction.type === 'note_update') {
                // console.log(`[Pad.handlePointerMove] Note Update for pointerId ${pointerId}: ${noteAction.note.name}`);
                if (synth.isReady) {
                    if (internalTouchData.isChord) synth.updateChord(pointerId, 0.7, touchInfo.y);
                    else synth.updateNote(noteAction.note.frequency, 0.7, touchInfo.y, pointerId);
                }
                // Обновляем visualizer
                 if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchMove === 'function') {
                    visualizer.notifyTouchMove({
                        id: pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        noteInfo: noteAction.note, state: 'move'
                    });
                }
            } else if (noteAction.type === 'note_off') { // Если стратегия решила, что нужно отпустить ноту
                console.log(`[Pad.handlePointerMove] Note Off requested by strategy for pointerId ${pointerId}`);
                if (synth.isReady) {
                    if (internalTouchData.isChord) synth.triggerReleaseChord(pointerId);
                    else synth.triggerRelease(pointerId);
                }
                this.activeTouchesInternal.delete(pointerId);
                if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchUp === 'function') {
                     visualizer.notifyTouchUp(pointerId);
                }
            } else if (noteAction.type === 'note_on' && noteAction.note) {
                if (internalTouchData.isChord) {
                    synth.triggerReleaseChord(pointerId);
                } else {
                    synth.triggerRelease(pointerId);
                }
                const velocity = noteAction.velocityFactor !== undefined ? noteAction.velocityFactor : 0.7;
                synth.startNote(noteAction.note.frequency, velocity, touchInfo.y, pointerId);

                const zone = this._currentDisplayedZones.find(z => z.midiNote === noteAction.note.midiNote);
                internalTouchData.currentZoneIndex = zone ? zone.index : -1;
                internalTouchData.baseFrequency = noteAction.note.frequency;
                internalTouchData.isChord = false; delete internalTouchData.chordNotes;

                if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchMove === 'function') {
                    visualizer.notifyTouchMove({
                        id: pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        noteInfo: noteAction.note, state: 'move'
                    });
                }

            } else if (noteAction.type === 'chord_on' && noteAction.chordNotes) {
                 if (internalTouchData.isChord) synth.triggerReleaseChord(pointerId);
                 else synth.triggerRelease(pointerId);

                 synth.startChord(noteAction.chordNotes, 0.7, touchInfo.y, pointerId);
                 internalTouchData.isChord = true; internalTouchData.chordNotes = noteAction.chordNotes;
                 internalTouchData.currentZoneIndex = -1;

                 if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchMove === 'function') {
                    visualizer.notifyTouchMove({
                        id: pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        isChord: true, chordNotes: noteAction.chordNotes, state: 'move'
                    });
                 }
            } else if (noteAction.type === 'noop' || noteAction === null) {
                if (internalTouchData.isChord) {
                     synth.updateChord(pointerId, 0.7, touchInfo.y);
                } else if (internalTouchData.baseFrequency) {
                     synth.updateNote(internalTouchData.baseFrequency, 0.7, touchInfo.y, pointerId);
                }

                 if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchMove === 'function') {
                     const noteInfoForViz = internalTouchData.isChord ? null : (internalTouchData.baseFrequency ? { frequency: internalTouchData.baseFrequency } : null);
                    visualizer.notifyTouchMove({
                        id: pointerId, x: touchInfo.x, y: touchInfo.y, rawX: event.clientX, rawY: event.clientY,
                        noteInfo: noteInfoForViz,
                        state: 'move'
                    });
                 }
            }
            // Добавить обработку 'chord_change', 'chord_update', если они будут
        } else {
            if (internalTouchData.isChord) synth.triggerReleaseChord(pointerId);
            else synth.triggerRelease(pointerId);
            this.activeTouchesInternal.delete(pointerId);

            if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchUp === 'function') {
                 visualizer.notifyTouchUp(pointerId);
            }
        }
        // Обновляем данные касания в любом случае, если оно еще активно
        if(this.activeTouchesInternal.has(pointerId)){
            internalTouchData.x = touchInfo.x;
            internalTouchData.y = touchInfo.y;
            internalTouchData.state = 'move';
        }
    },

    async handlePointerUpOrCancel(event) {
        if (!this.activeTouchesInternal.has(event.pointerId) || !this.isReady) return;
        event.preventDefault();
        this.lastInteractionTime = Date.now();
        const pointerId = event.pointerId;

        try { if (this.container.hasPointerCapture(pointerId)) { this.container.releasePointerCapture(pointerId); } } catch (e) { console.warn(`[Pad v8] Failed to release pointer ${pointerId}:`, e); }

        const strategy = PadModeManager.getCurrentStrategy();
        let noteAction = null;
        if (strategy && typeof strategy.onPointerUp === 'function') {
            noteAction = await strategy.onPointerUp(pointerId, this._getPadContext());
        }

        const internalTouchData = this.activeTouchesInternal.get(pointerId);

        if (synth?.isReady) {
            if (internalTouchData?.isChord) {
                synth.triggerReleaseChord(pointerId);
            } else {
                synth.triggerRelease(pointerId);
            }
        }

        if (noteAction) {
            console.log("[Pad v8] NoteAction from strategy onPointerUp:", noteAction);
        }

        if (typeof visualizer !== 'undefined' && typeof visualizer.notifyTouchUp === 'function') {
            visualizer.notifyTouchUp(pointerId);
        }
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
    }
};
