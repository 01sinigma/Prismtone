const SequencerModeStrategy = {
    _isActive: false,
    _gridContainer: null,
    _playheadElement: null,
    _padContext: null,
    _currentNotesInScale: [], // ['C4', 'D4', 'E4', ...]
    _totalSteps: 16, // Default number of steps
    _stepsPerBeat: 4, // For time conversion, assuming 4/4 time
    _beatsPerBar: 4,

    // Standard PadModeStrategy properties
    name: "SequencerMode",
    displayName: "Sequencer", // TODO: i18n
    requiresTonic: true,
    requiresScale: true,
    requiresChord: false, // Sequencer mode typically works with the entire scale

    init(padContext) {
        this._padContext = padContext;
        this._gridContainer = document.getElementById('sequencer-grid');
        this._playheadElement = document.getElementById('sequencer-playhead');

        if (!this._gridContainer || !this._playheadElement) {
            console.error("[SequencerModeStrategy] UI elements for sequencer not found!");
            // Potentially disable this mode if UI is not there
            return false;
        }
        console.log("[SequencerModeStrategy] Initialized.");
        // Initial grid draw might be deferred to onModeActivated or based on default settings
        return true;
    },

    getName() {
        return this.name;
    },

    getDisplayName() {
        return this.displayName; // TODO: i18n.translate(this.displayName)
    },

    requiresUpdateForConfig(newConfig) {
        // This mode needs redraw if scale or tonic changes
        return newConfig.scale !== this._padContext.scale.name ||
               newConfig.tonic !== this._padContext.tonic.name ||
               newConfig.octave !== this._padContext.octave;
    },

    onConfigChange(newConfig, oldConfig) {
        console.log("[SequencerModeStrategy] Config change detected. Updating grid.");
        // Update internal context if necessary (though padContext should be the source of truth)
        // this._padContext.tonic = MusicTheoryService.getNoteByName(newConfig.tonic);
        // this._padContext.scale = MusicTheoryService.getScaleByName(newConfig.scale);
        // this._padContext.octave = newConfig.octave;
        // this._padContext.key = MusicTheoryService.getKey(this._padContext.tonic.name, this._padContext.scale.name);

        if (this._isActive) {
            this.drawGrid(); // Redraw grid with new scale/tonic
            this.refreshGridHighlights(); // Update highlights based on new pattern data if notes changed scale
        }
    },

    onModeActivated() {
        this._isActive = true;
        document.getElementById('xy-pad-container').classList.add('hidden');
        document.getElementById('sequencer-container').classList.remove('hidden');
        document.getElementById('transport-controls').classList.remove('hidden');

        // Ensure sequencer core is initialized
        if (typeof sequencer !== 'undefined' && !sequencer.isSetup) {
            sequencer.init();
        }

        this.drawGrid();
        this.refreshGridHighlights(); // Highlight active notes from sequencer.notes
        console.log("[SequencerModeStrategy] Activated.");
    },

    onModeDeactivated() {
        this._isActive = false;
        document.getElementById('xy-pad-container').classList.remove('hidden');
        document.getElementById('sequencer-container').classList.add('hidden');
        document.getElementById('transport-controls').classList.add('hidden');
        console.log("[SequencerModeStrategy] Deactivated.");
    },

    // --- Pointer Event Handlers ---
    onPointerDown(pointerId, x, y, currentZones, padContext) {
        if (!this._isActive || !this._gridContainer) return null;

        const { stepIndex, noteRowIndex, noteToToggle } = this._getGridCellFromCoordinates(x, y);

        if (noteToToggle && stepIndex !== -1) {
            const time = this._stepToToneTime(stepIndex);
            sequencer.toggleNote(noteToToggle, time); // Default duration '16n'
            this.updateCellView(stepIndex, noteRowIndex, noteToToggle, time);
        }
        return null; // Sequencer mode doesn't directly trigger synth notes on touch
    },

    onPointerMove(pointerId, x, y, currentZones, padContext) {
        // Could implement "drawing" notes by dragging, but for now, keep it simple.
        // Requires tracking if a cell was already toggled in the current drag operation.
        return null;
    },

    onPointerUp(pointerId, x, y, padContext) {
        // Cleanup for drag-drawing if implemented
        return null;
    },

    // --- Grid Rendering ---
    drawGrid() {
        if (!this._gridContainer || !this._padContext || !this._padContext.scale || !this._padContext.tonic) {
            console.warn("[SequencerModeStrategy] Cannot draw grid: Missing container or music context.");
            return;
        }
        this._gridContainer.innerHTML = ''; // Clear previous grid

        // Get notes for the current scale and octave
        // Assuming a range, e.g., 2 octaves from current base octave
        const baseOctave = this._padContext.octave; // e.g., 4
        this._currentNotesInScale = MusicTheoryService.getNotesInScaleRange(
            this._padContext.tonic.name,
            this._padContext.scale.name,
            baseOctave -1 , // Start one octave below
            baseOctave + 1  // End one octave above
        );

        if (!this._currentNotesInScale || this._currentNotesInScale.length === 0) {
            console.warn("[SequencerModeStrategy] No notes generated for the current scale/tonic/octave range.");
            this._gridContainer.innerHTML = '<p style="padding:20px; text-align:center; color: var(--color-text-secondary);">Could not generate notes for grid. Check tonality settings.</p>';
            return;
        }

        // Create rows for each note
        this._currentNotesInScale.forEach((noteObj, noteIndex) => {
            const rowElement = document.createElement('div');
            rowElement.classList.add('sequencer-row');
            rowElement.dataset.note = noteObj.name; // e.g., "C#4"
            if (noteObj.isSharpFlat) {
                rowElement.classList.add('sharp-flat-row');
            }

            // Create cells for each step in the row
            for (let step = 0; step < this._totalSteps; step++) {
                const cellElement = document.createElement('div');
                cellElement.classList.add('sequencer-cell');
                cellElement.dataset.step = step.toString();
                cellElement.dataset.note = noteObj.name;
                cellElement.dataset.noteRowIndex = noteIndex.toString(); // Store noteRowIndex for easier updates
                // cellElement.addEventListener('click', (e) => this._handleCellClick(e)); // Alternative to onPointerDown
                rowElement.appendChild(cellElement);
            }
            this._gridContainer.appendChild(rowElement);
        });
        console.log(`[SequencerModeStrategy] Grid drawn with ${this._currentNotesInScale.length} notes and ${this._totalSteps} steps.`);
    },

    _getGridCellFromCoordinates(x, y) {
        if (this._currentNotesInScale.length === 0) return { stepIndex: -1, noteRowIndex: -1, noteToToggle: null };

        const relativeX = x; // x is already 0-1 relative to pad
        const relativeY = y; // y is already 0-1 relative to pad

        const stepIndex = Math.min(this._totalSteps - 1, Math.max(0, Math.floor(relativeX * this._totalSteps)));

        // Note rows are drawn from bottom (index 0) to top, but _currentNotesInScale is typically low to high.
        // If flex-direction: column-reverse is used for #sequencer-grid, y=0 is the highest note.
        const noteRowIndex = Math.min(this._currentNotesInScale.length - 1, Math.max(0, Math.floor(relativeY * this._currentNotesInScale.length)));

        // Since the visual rows are reversed, the note index needs to be mapped accordingly
        // OR, if currentNotesInScale is already sorted visually (high to low), then direct mapping is fine.
        // Let's assume _currentNotesInScale is sorted musically (low to high), and CSS handles visual reversal.
        // So, a high Y value (near 1.0) should map to a low index in _currentNotesInScale if origin is top-left.
        // However, pad coordinates usually have y=0 at top, y=1 at bottom.
        // If #sequencer-grid has `column-reverse`, then the first child row (note 0) is visually at the bottom.
        // A click near y=1 (bottom of pad) should correspond to the first rows (lowest notes).
        // A click near y=0 (top of pad) should correspond to the last rows (highest notes).

        // Let's adjust based on `column-reverse`:
        // If y = 0 (top edge of pad), it's the last element in `_currentNotesInScale` (highest pitch).
        // If y = 1 (bottom edge of pad), it's the first element in `_currentNotesInScale` (lowest pitch).
        // So, we need to invert y for indexing if _currentNotesInScale is low-to-high.
        const invertedY = 1 - relativeY;
        const mappedNoteRowIndex = Math.min(this._currentNotesInScale.length - 1, Math.max(0, Math.floor(invertedY * this._currentNotesInScale.length)));
        const noteToToggle = this._currentNotesInScale[mappedNoteRowIndex]?.name; // Get the note name like "C4"

        return { stepIndex, noteRowIndex: mappedNoteRowIndex, noteToToggle };
    },

    _stepToToneTime(stepIndex) {
        // Convert step index to Tone.js time notation (e.g., "0:0:0" for step 0, "0:0:1" for step 1, etc.)
        // This assumes 16th notes by default.
        const bar = Math.floor(stepIndex / (this._stepsPerBeat * this._beatsPerBar));
        const beat = Math.floor((stepIndex % (this._stepsPerBeat * this._beatsPerBar)) / this._stepsPerBeat);
        const subdivision = stepIndex % this._stepsPerBeat; // e.g., 0, 1, 2, 3 for 16ths in a beat
        return `${bar}:${beat}:${subdivision}`;
    },

    updateCellView(stepIndex, noteRowIndex, noteName, time) {
        // Find the cell element
        // This query might be slow if grid is huge. Consider direct references if performance becomes an issue.
        const cellElement = this._gridContainer.querySelector(`.sequencer-cell[data-step="${stepIndex}"][data-note="${noteName}"]`);
        if (cellElement) {
            const eventKey = `${time}:${noteName}`;
            if (sequencer.notes.has(eventKey)) {
                cellElement.classList.add('active');
            } else {
                cellElement.classList.remove('active');
            }
        }
    },

    refreshGridHighlights() {
        if (!this._gridContainer || !sequencer || !sequencer.notes) return;

        const cells = this._gridContainer.querySelectorAll('.sequencer-cell');
        cells.forEach(cell => {
            const step = parseInt(cell.dataset.step, 10);
            const noteName = cell.dataset.note;
            const time = this._stepToToneTime(step);
            const eventKey = `${time}:${noteName}`;

            if (sequencer.notes.has(eventKey)) {
                cell.classList.add('active');
            } else {
                cell.classList.remove('active');
            }
        });
        console.log("[SequencerModeStrategy] Grid highlights refreshed.");
    },

    // --- Playhead ---
    // This will be called by sequencer.js via a visualizer object or direct call
    updatePlayhead(progress) { // progress is 0-1 over the loop duration
        if (!this._isActive || !this._playheadElement || !this._gridContainer) return;

        const loopDuration = Tone.Time(sequencer.getLoopEnd()).toSeconds();
        if (loopDuration === 0) return;

        const currentTimeInLoop = progress * loopDuration;

        // Calculate total width of the grid
        const firstCell = this._gridContainer.querySelector('.sequencer-cell');
        if (!firstCell) return;

        const cellWidth = firstCell.offsetWidth; // Assumes all cells have same width
        const totalGridWidth = cellWidth * this._totalSteps;

        // Position playhead
        // The playhead's position should be relative to the visible part of the grid.
        // If the grid scrolls, this needs to account for scrollLeft.
        let playheadX = (currentTimeInLoop / loopDuration) * totalGridWidth;

        // Ensure playhead stays within grid boundaries if loop is shorter/longer than display
        playheadX = Math.max(0, Math.min(playheadX, totalGridWidth -2)); // -2 for playhead width

        this._playheadElement.style.transform = `translateX(${playheadX}px)`;

        // Auto-scroll logic (simple version)
        const containerWidth = this._gridContainer.parentElement.offsetWidth;
        const scrollLeft = this._gridContainer.parentElement.scrollLeft;

        if (playheadX > scrollLeft + containerWidth - cellWidth) { // If playhead is near the right edge
            this._gridContainer.parentElement.scrollLeft = playheadX - containerWidth + (cellWidth * 2);
        } else if (playheadX < scrollLeft + cellWidth) { // If playhead is near the left edge
             this._gridContainer.parentElement.scrollLeft = Math.max(0, playheadX - (cellWidth * 2));
        }
    },

    // --- Methods for PadModeManager and App ---
    getZoneLayoutOptions(appState) {
        // Sequencer mode does not use the traditional XY zone layout.
        // It has its own grid. This method is to satisfy the interface
        // expected by PadModeManager or app.updateZoneLayout.
        console.log("[SequencerModeStrategy] getZoneLayoutOptions called. Returning null as sequencer handles its own layout.");
        return null; // Or return { usesStandardZones: false } or similar indicator
    },

    generateZoneData(layoutContext, appState, services) {
        // Sequencer mode does not generate zones in the same way as XY modes.
        // The grid itself is the "zone data" in a sense, but it's drawn differently.
        console.log("[SequencerModeStrategy] generateZoneData called. Returning empty array as sequencer handles its own grid drawing.");
        return []; // Return empty array as pad.drawZones will not be used in the standard way.
    },

    getPadVisualHints(currentZonesData, appState, services) {
        // This strategy doesn't use the standard zone highlighting.
        // Visual feedback (active cells, playhead) is handled internally.
        // However, if there were global hints to show on the pad overlay, they could be returned here.
        return [];
    },

    // --- Optional: API for PadModeManager or other components ---
    getCurrentPatternData() {
        if (typeof sequencer !== 'undefined') {
            return sequencer.getPatternData();
        }
        return [];
    },

    loadPattern(patternData) {
        if (typeof sequencer !== 'undefined') {
            sequencer.loadPatternData(patternData);
            if (this._isActive) {
                this.refreshGridHighlights();
            }
        }
    },

    clearPattern() {
        if (typeof sequencer !== 'undefined') {
            sequencer.clearPattern();
            if (this._isActive) {
                this.refreshGridHighlights();
            }
        }
    },

    setTotalSteps(steps) {
        this._totalSteps = steps;
        // Potentially update loopEnd in sequencer if it's tied to total steps
        // For now, just redraw the grid
        if (this._isActive) {
            this.drawGrid();
            this.refreshGridHighlights();
        }
    }
};

// Register the strategy with the PadModeManager
// This assumes PadModeManager.js is already loaded and PadModeManager is a global object
if (typeof PadModeManager !== 'undefined') {
    PadModeManager.registerStrategy(SequencerModeStrategy);
} else {
    console.error("[SequencerModeStrategy] PadModeManager is not defined. Strategy not registered.");
}
