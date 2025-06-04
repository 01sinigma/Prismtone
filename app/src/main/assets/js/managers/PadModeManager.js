// Assuming PadModeManager is an object
const PadModeManager = {
    appRef: null,
    musicTheoryServiceRef: null,
    strategies: {},
    currentModeId: null,
    currentStrategy: null,

    init(appInstance, musicTheoryServiceInstance) {
        this.appRef = appInstance;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        console.log("[PadModeManager.init] Initialized with appRef and musicTheoryServiceRef.");
        // Strategies are expected to register themselves using registerStrategy
    },

    registerStrategy(strategy) {
        if (strategy && strategy.getId && strategy.getName && strategy.getZoneLayoutOptions && strategy.generateZoneData) {
            const id = strategy.getId();
            this.strategies[id] = strategy;
            console.log(`[PadModeManager] Registered strategy: ${strategy.getName()} (ID: ${id})`);
        } else {
            console.error("[PadModeManager] Attempted to register invalid strategy:", strategy);
        }
    },

    async setActiveMode(modeId) {
        console.log("[PadModeManager.setActiveMode] Attempting to set active mode to:", modeId); // Log at entry
        if (!this.strategies[modeId]) {
            console.error(`[PadModeManager.setActiveMode] Strategy for mode '${modeId}' not found.`);
            // Optionally fallback to a default mode or clear pad
            return false; // Indicate failure
        }

        this.currentModeId = modeId;
        this.currentStrategy = this.strategies[modeId];
        console.log("[PadModeManager.setActiveMode] Strategy set to:", this.currentStrategy ? this.currentStrategy.getName() : "null"); // Log strategy set

        // Notify the app that the mode has changed and zones need updating
        // Assuming appRef is set and has an updateZones method
        if (this.appRef && typeof this.appRef.updateZones === 'function') {
            console.log("[PadModeManager.setActiveMode] About to call appRef.updateZones()"); // Log before calling updateZones
            await this.appRef.updateZones();
            return true; // Indicate success
        } else {
            console.error("[PadModeManager.setActiveMode] appRef is not set or appRef.updateZones is not a function.");
            return false; // Indicate failure
        }
    },

    getCurrentModeId() {
        return this.currentModeId;
    },

    getCurrentStrategy() {
        return this.currentStrategy;
    },

    // Handle tonic changes - delegate to current strategy if it supports it
    async onTonicChanged(newTonic) {
        console.log("[PadModeManager.onTonicChanged] Tonic changed to:", newTonic);
        if (this.currentStrategy && typeof this.currentStrategy.onTonicChanged === 'function') {
            console.log("[PadModeManager.onTonicChanged] Delegating to current strategy.");
            await this.currentStrategy.onTonicChanged(newTonic, this.appRef.state, this.appRef.services);
        }
        // Always trigger updateZones as tonic change affects all modes
        if (this.appRef && typeof this.appRef.updateZones === 'function') {
            console.log("[PadModeManager.onTonicChanged] Calling appRef.updateZones() after tonic change.");
            await this.appRef.updateZones();
        }
    },

     // Handle chord changes - delegate to current strategy if it supports it
    async onChordChanged(newChord) {
        console.log("[PadModeManager.onChordChanged] Chord changed to:", newChord);
        if (this.currentStrategy && typeof this.currentStrategy.onChordChanged === 'function') {
            console.log("[PadModeManager.onChordChanged] Delegating to current strategy.");
            await this.currentStrategy.onChordChanged(newChord, this.appRef.state, this.appRef.services);
        }
         // Always trigger updateZones as chord change affects relevant modes
        if (this.appRef && typeof this.appRef.updateZones === 'function') {
            console.log("[PadModeManager.onChordChanged] Calling appRef.updateZones() after chord change.");
            await this.appRef.updateZones();
        }
    }

    // Add other methods as needed, e.g., for handling other global state changes
}; 