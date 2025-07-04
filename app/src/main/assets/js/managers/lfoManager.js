/**
 * @file lfoManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a Low Frequency Oscillator (LFO).
 * An LFO generates a periodic waveform at a low frequency (typically below 20Hz) and is used to modulate
 * parameters of other audio components (e.g., filter cutoff, oscillator pitch, amplitude) to create
 * effects like vibrato, tremolo, filter sweeps, etc.
 * It uses a Tone.LFO for the oscillation and a Tone.Multiply node to scale the LFO's output
 * by a 'depth' parameter, which then modulates the target parameter.
 */

// Файл: app/src/main/assets/js/managers/lfoManager.js
// Менеджер для LFO (Low Frequency Oscillator)

const lfoManager = {
    isOptional: true,

    /**
     * Creates the necessary Tone.js nodes for an LFO modulator.
     * This includes a Tone.LFO for generating the waveform and a Tone.Multiply node
     * to control the modulation depth (amplitude of the LFO signal).
     * @param {object} [initialSettings={}] - Initial settings for the LFO.
     * @param {Tone.Frequency} [initialSettings.frequency=5] - The frequency (rate) of the LFO in Hz.
     * @param {string} [initialSettings.type='sine'] - The waveform type of the LFO (e.g., 'sine', 'square', 'sawtooth', 'triangle').
     * @param {number} [initialSettings.phase=0] - The starting phase of the LFO in degrees (0-360).
     * @param {number} [initialSettings.depth=0.01] - The modulation depth (0-1), scaling the LFO's output (-1 to 1).
     *                                                Note: Tone.LFO outputs bipolar (-1 to 1). The depth scales this range.
     * @returns {{nodes: {lfo: Tone.LFO, depth: Tone.Multiply}|null, audioInput: null, audioOutput: null, modOutputs: {output: Tone.Multiply}|object, error: string|null}}
     *          An object containing:
     *          - `nodes`: Contains the `lfo` (Tone.LFO) and `depth` (Tone.Multiply for depth control) nodes.
     *          - `audioInput`, `audioOutput`: Null, as LFOs are modulators, not audio processors in the main chain.
     *          - `modOutputs`: An object with an `output` property referencing the `depth` node, which is the final modulated signal.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[LFOManager] create() called with:", initialSettings);
        let nodes = { lfo: null, depth: null };
        let modOutputs = { output: null };
        let error = null;
        try {
            console.log("[LFOManager] Creating Tone.LFO and Tone.Multiply...");
            nodes.lfo = new Tone.LFO({
                frequency: initialSettings.frequency ?? 5,
                min: -1,
                max: 1,
                type: initialSettings.type || 'sine',
                phase: initialSettings.phase || 0,
            });
            nodes.depth = new Tone.Multiply(initialSettings.depth ?? 0.01); // Малый диапазон по умолчанию
            nodes.lfo.connect(nodes.depth);
            modOutputs.output = nodes.depth;
            console.log("[LFOManager] create() finished.");
        } catch (err) {
            console.error("[LFOManager] Error in create():", err);
            error = `Failed to create LFO: ${err.message}`;
            nodes = null;
            modOutputs = {};
        }
        const t1 = performance.now();
        console.log(`[LFOManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput: null, audioOutput: null, modOutputs, error };
    },

    /**
     * Updates the parameters of an existing LFO.
     * Modifies settings for both the Tone.LFO (frequency, type, phase) and the Tone.Multiply node (depth).
     * @param {object} nodes - An object containing the `lfo` (Tone.LFO) and `depth` (Tone.Multiply) nodes.
     * @param {object} newSettings - An object with new settings to apply (frequency, type, phase, depth).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(componentData, newSettingsBundle, oldSettingsBundle) {
        const t0 = performance.now();
        if (!newSettingsBundle || !newSettingsBundle.params) {
            console.warn("[LFOManager] Update called with invalid newSettingsBundle. Params missing.", { newSettingsBundle });
            return false;
        }

        const newSettings = newSettingsBundle.params;
        // 'enabled' is at newSettingsBundle.enabled, not newSettingsBundle.params.enabled
        const isEnabledInNewPreset = newSettingsBundle.enabled === true;
        const currentLfoNode = componentData?.nodes?.lfo;

        if (!currentLfoNode && isEnabledInNewPreset) {
            // LFO does not exist, but it should be enabled: CREATE and START
            console.log("[LFOManager] LFO does not exist and component is enabled. Creating and starting LFO.");
            const creationResult = this.create(newSettings); // create expects params directly
            if (creationResult.error) {
                console.error("[LFOManager] Failed to create LFO during update.", creationResult.error);
                return creationResult; // Propagate error
            }
            this.enable(creationResult.nodes, true); // Start the newly created LFO
            const t1_create = performance.now();
            console.log(`[LFOManager] Created and started new LFO in ${(t1_create - t0).toFixed(2)}ms.`);
            return creationResult; // Returns { nodes, modOutputs, ... }
        }

        if (currentLfoNode && !isEnabledInNewPreset) {
            // LFO exists, but it should be disabled: STOP and DISPOSE
            console.log("[LFOManager] LFO exists but component is now disabled. Stopping and disposing LFO.");
            this.enable(componentData.nodes, false); // Stop the LFO
            this.dispose(componentData.nodes);
            const t1_dispose = performance.now();
            console.log(`[LFOManager] Stopped and disposed LFO in ${(t1_dispose - t0).toFixed(2)}ms.`);
            return { nodes: null, audioInput: null, audioOutput: null, modOutputs: {}, error: null, effectivelyDisabled: true };
        }

        if (!currentLfoNode && !isEnabledInNewPreset) {
            // LFO does not exist and it's disabled, do nothing.
            console.log("[LFOManager] LFO does not exist and component is disabled. No action.");
            return true;
        }

        // If LFO exists and is enabled, update its parameters
        // Also, ensure it's running if it was previously stopped for some reason but is now enabled.
        const lfoNode = currentLfoNode;
        const depthNode = componentData.nodes.depth;
        try {
            let paramsChanged = false;
            const lfoPropsToSet = {};

            if (newSettings.frequency !== undefined && lfoNode.frequency.value !== newSettings.frequency) {
                lfoPropsToSet.frequency = newSettings.frequency;
                paramsChanged = true;
            }
            if (newSettings.type !== undefined && lfoNode.type !== newSettings.type) {
                lfoPropsToSet.type = newSettings.type;
                paramsChanged = true;
            }
            if (newSettings.phase !== undefined && lfoNode.phase !== newSettings.phase) {
                lfoPropsToSet.phase = newSettings.phase;
                paramsChanged = true;
            }

            if (paramsChanged && Object.keys(lfoPropsToSet).length > 0) {
                console.log("[LFOManager] Updating LFO node params:", lfoPropsToSet);
                lfoNode.set(lfoPropsToSet);
            }

            if (newSettings.depth !== undefined) {
                const currentDepthVal = (depthNode.factor && depthNode.factor.value !== undefined)
                                      ? depthNode.factor.value
                                      : depthNode.value; // Fallback if factor isn't the holder, though it should be for Tone.Multiply
                if (currentDepthVal !== newSettings.depth) {
                    if (depthNode.factor && (depthNode.factor instanceof Tone.Signal || depthNode.factor instanceof Tone.Param)) {
                        depthNode.factor.value = newSettings.depth;
                    } else if (depthNode.hasOwnProperty('value')) { // Should not be hit if factor exists
                        depthNode.value = newSettings.depth;
                    } else {
                        console.warn("[LFOManager] Could not set depth on depthNode", depthNode);
                    }
                    paramsChanged = true;
                    console.log(`[LFOManager] Updated LFO depth to: ${newSettings.depth}`);
                }
            }

            // Ensure LFO is started if it's supposed to be enabled
            // The `enable` method handles the actual start/stop logic.
            // If it was already enabled and running, calling enable(true) again is fine.
            // If it was disabled (e.g. by a previous preset) but its nodes were not disposed,
            // and now it's enabled again, this ensures it starts.
             if (isEnabledInNewPreset && lfoNode.state !== "started") {
                 console.log("[LFOManager] LFO is enabled in preset but not started. Starting LFO.");
                 this.enable(componentData.nodes, true); // Ensure LFO is running
                 paramsChanged = true; // Indicate an action was taken
             }


            const t1_update = performance.now();
            if (paramsChanged) {
                console.log(`[LFOManager] Updated existing LFO in ${(t1_update - t0).toFixed(2)}ms.`);
            } else {
                console.log(`[LFOManager] No LFO parameters changed. Duration: ${(t1_update - t0).toFixed(2)}ms.`);
            }
            return true; // Successfully updated in-place or no change needed
        } catch (err) {
            console.error("[LFOManager] Error in update() for existing LFO:", err, err.stack);
            const t1_err = performance.now();
            console.log(`[LFOManager] Update error after ${(t1_err - t0).toFixed(2)}ms`);
            return false;
        }
    },

    /**
     * Connects peers in an audio chain. For an LFO (which is a modulator),
     * this is typically a no-op as it doesn't process audio in the main signal path.
     * @param {object} nodes - The component's nodes.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node.
     * @returns {boolean} Always true, as no connection is made.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },

    /**
     * Enables or disables the LFO by starting or stopping its internal oscillator.
     * @param {object} nodes - An object containing the `lfo` (Tone.LFO) node.
     * @param {boolean} isEnabled - True to start the LFO, false to stop it.
     * @returns {boolean} Always true.
     */
    enable(nodes, isEnabled) {
        console.log(`[LFOManager] enable() called with state: ${isEnabled}.`);
        if (nodes?.lfo) {
            if (isEnabled) nodes.lfo.start();
            else nodes.lfo.stop();
        }
        return true;
    },

    /**
     * Triggers the start of the LFO at a specific time.
     * This is useful if the LFO needs to be synchronized with note events or other timed events.
     * @param {object} nodes - An object containing the `lfo` (Tone.LFO) node.
     * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to start the LFO.
     * @returns {boolean} True if the LFO was successfully started, false otherwise.
     */
    triggerAttack(nodes, time) {
        const t0 = performance.now();
        console.log(`[LFOManager] triggerAttack() called. Time: ${time}`);
        if (nodes?.lfo) {
            try {
                nodes.lfo.start(time);
                const t1 = performance.now();
                console.log(`[LFOManager] triggerAttack() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[LFOManager] Error triggering LFO start:", e);
                return false;
            }
        }
        return false;
    },

    /**
     * Triggers the stop of the LFO at a specific time.
     * @param {object} nodes - An object containing the `lfo` (Tone.LFO) node.
     * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to stop the LFO.
     * @returns {boolean} True if the LFO was successfully stopped, false otherwise.
     */
    triggerRelease(nodes, time) {
        const t0 = performance.now();
        console.log(`[LFOManager] triggerRelease() called. Time: ${time}`);
        if (nodes?.lfo) {
            try {
                nodes.lfo.stop(time);
                const t1 = performance.now();
                console.log(`[LFOManager] triggerRelease() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[LFOManager] Error triggering LFO stop:", e);
                return false;
            }
        }
        return false;
    },

    /**
     * Disposes of the Tone.js nodes created for the LFO (Tone.LFO and Tone.Multiply for depth).
     * This is essential for freeing up audio resources.
     * @param {object} nodes - An object containing the `lfo` and `depth` nodes to be disposed.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[LFOManager] dispose() called");
        if (nodes?.lfo) {
            try {
                nodes.lfo.disconnect();
                nodes.lfo.dispose();
                console.log("[LFOManager] LFO node disposed.");
            } catch (e) {
                console.warn("[LFOManager] Error disposing LFO node:", e);
            }
        }
        if (nodes?.depth) {
            try {
                nodes.depth.disconnect();
                nodes.depth.dispose();
                console.log("[LFOManager] Multiply node disposed.");
            } catch (e) {
                console.warn("[LFOManager] Error disposing Multiply node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[LFOManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('lfo1', lfoManager);
} else {
    console.error("[LFOManager] audioConfig or audioConfig.registerManager is not available.");
}