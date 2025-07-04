/**
 * @file PadModeManager.js
 * @description
 * This manager is responsible for handling different pad modes within the Prismtone application.
 * Pad modes define how the XY touch pad is divided into zones and how touch interactions
 * are translated into musical notes or control signals.
 * It holds references to various PadModeStrategy instances, manages the currently active strategy,
 * and coordinates updates when the mode, tonic, or chord changes.
 */

// Assuming PadModeManager is an object
const PadModeManager = {
    appRef: null,
    musicTheoryServiceRef: null,
    strategies: {},
    currentModeId: null,
    currentStrategy: null,

    /**
     * Initializes the PadModeManager with references to the main application instance
     * and the music theory service.
     * @param {object} appInstance - A reference to the main `app` object.
     * @param {object} musicTheoryServiceInstance - A reference to the `MusicTheoryService` instance.
     */
    init(appInstance, musicTheoryServiceInstance) {
        this.appRef = appInstance;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        console.log("[PadModeManager.init] Initialized with appRef and musicTheoryServiceRef.");
        // Strategies are expected to register themselves using registerStrategy
    },

    /**
     * Registers a pad mode strategy with the manager.
     * Strategies are expected to have `getId`, `getName`, `getZoneLayoutOptions`, and `generateZoneData` methods.
     * @param {object} strategy - The pad mode strategy instance to register.
     *                          It should conform to the expected PadModeStrategy interface.
     */
    registerStrategy(strategy) {
        if (strategy && strategy.getId && strategy.getName && strategy.getZoneLayoutOptions && strategy.generateZoneData) {
            const id = strategy.getId();
            this.strategies[id] = strategy;
            console.log(`[PadModeManager] Registered strategy: ${strategy.getName()} (ID: ${id})`);
        } else {
            console.error("[PadModeManager] Attempted to register invalid strategy:", strategy);
        }
    },

    /**
     * Sets the active pad mode by its ID.
     * If a strategy for the given `modeId` is found, it becomes the `currentStrategy`,
     * and the application is notified to update its pad zones.
     * @param {string} modeId - The unique identifier of the pad mode strategy to activate.
     * @returns {Promise<boolean>} A promise that resolves to `true` if the mode was successfully set and zones updated,
     *                           `false` otherwise (e.g., if the strategy is not found or `appRef.updateZones` fails).
     */
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

    /**
     * Gets the ID of the currently active pad mode.
     * @returns {string|null} The ID of the current mode, or `null` if no mode is active.
     */
    getCurrentModeId() {
        return this.currentModeId;
    },

    /**
     * Gets the instance of the currently active pad mode strategy.
     * @returns {object|null} The current strategy instance, or `null` if no mode is active.
     */
    getCurrentStrategy() {
        return this.currentStrategy;
    },

    /**
     * Handles changes to the global tonic (root note).
     * It delegates this event to the current strategy if the strategy implements an `onTonicChanged` method.
     * Regardless of strategy support, it always triggers an update of the pad zones via `appRef.updateZones()`.
     * @param {string} newTonic - The new tonic note (e.g., "C4").
     * @returns {Promise<void>} A promise that resolves when the tonic change has been processed and zones updated.
     */
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

     /**
      * Handles changes to the global current chord.
      * It delegates this event to the current strategy if the strategy implements an `onChordChanged` method.
      * Regardless of strategy support, it always triggers an update of the pad zones via `appRef.updateZones()`
      * as chord changes can affect zone layouts or data in relevant modes.
      * @param {string} newChord - The new current chord (e.g., "Cm7").
      * @returns {Promise<void>} A promise that resolves when the chord change has been processed and zones updated.
      */
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