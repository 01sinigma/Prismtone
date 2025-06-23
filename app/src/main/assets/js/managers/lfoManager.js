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
    update(nodes, newSettings) {
        if (!nodes?.lfo || !nodes?.depth) {
            console.warn("[LFOManager] Update called with invalid nodes.", nodes);
            return false;
        }
        try {
            const lfoNode = nodes.lfo;
            const depthNode = nodes.depth;

            const lfoPropsToSet = {};
            if (newSettings.frequency !== undefined) lfoPropsToSet.frequency = newSettings.frequency;
            if (newSettings.type !== undefined) lfoPropsToSet.type = newSettings.type;
            if (newSettings.phase !== undefined) lfoPropsToSet.phase = newSettings.phase;

            if (Object.keys(lfoPropsToSet).length > 0) {
                lfoNode.set(lfoPropsToSet);
            }

            if (newSettings.depth !== undefined) {
                if (depthNode.factor && (depthNode.factor instanceof Tone.Signal || depthNode.factor instanceof Tone.Param)) {
                    depthNode.factor.value = newSettings.depth;
                } else {
                    console.warn("[LFOManager] depthNode.factor is not a Signal or Param. Depth not set for LFO.");
                }
            }
            return true;
        } catch (err) {
            console.error("[LFOManager] Error in update():", err);
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