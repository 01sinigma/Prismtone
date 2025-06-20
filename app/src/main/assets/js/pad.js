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

    drawZones(zonesData, currentTonicNoteName) {
        console.log(`[Pad.drawZones ENTRY v10.1] Received zonesData (length: ${zonesData ? zonesData.length : 'null/undefined'}), currentTonic: ${currentTonicNoteName}`);
        if (!this.isReady || !this.zonesContainer || !this.labelsContainer) return;
        if (zonesData && zonesData.length > 0) console.log("[Pad.drawZones] First zone example:", JSON.stringify(zonesData[0]));

        console.log(`[Pad.drawZones v10] Drawing ${zonesData.length} zones. Current tonic: ${currentTonicNoteName}`);
        this._currentDisplayedZones = Array.isArray(zonesData) ? zonesData : [];

        this.zonesContainer.innerHTML = '';
        this.labelsContainer.innerHTML = '';

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

            if (this.config.labelVisibility) {
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
