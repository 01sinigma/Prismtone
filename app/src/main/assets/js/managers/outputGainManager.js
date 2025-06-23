/**
 * @file outputGainManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a Tone.Gain node
 * that acts as the final output gain stage for a synthesizer voice.
 * It allows setting the overall volume of the voice before it's passed to the main output or effects chain.
 */

// Файл: app/src/main/assets/js/managers/outputGainManager.js
// Менеджер для управления выходным гейном голоса (Tone.Gain)

const outputGainManager = {
    /**
     * Creates a new Tone.Gain node to control the output volume of a synth voice.
     * @param {object} [initialSettings={ gain: 0 }] - Initial settings for the gain node.
     *                                                Typically, the gain is initialized to 0 (or a preset master volume).
     * @param {number} [initialSettings.gain=0] - The initial gain value (linear). 1 is no change, 0 is silence.
     * @returns {{nodes: {gainNode: Tone.Gain}|null, audioInput: Tone.Gain|null, audioOutput: Tone.Gain|null, modInputs: {gain?: Tone.Param}, modOutputs: object, error: string|null}}
     *          An object containing:
     *          - `nodes`: Contains the created `gainNode` (Tone.Gain).
     *          - `audioInput`, `audioOutput`: References to the gain node itself, as it processes audio.
     *          - `modInputs`: An object with a `gain` property referencing the gain node's `gain` parameter, if modulatable.
     *          - `modOutputs`: An empty object.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = { gain: 0 }) {
        const t0 = performance.now();
        console.log("[OutputGainManager] create() called with:", initialSettings);
        let nodes = { gainNode: null };
        let audioInput = null;
        let audioOutput = null;
        let modInputs = {};
        let error = null;
        try {
            const gainNode = new Tone.Gain(0);
            nodes.gainNode = gainNode;
            audioInput = gainNode;
            audioOutput = gainNode;
            if (gainNode.gain instanceof Tone.Param) {
                modInputs.gain = gainNode.gain;
            }
            console.log("[OutputGainManager] create() finished.");
        } catch (err) {
            console.error("[OutputGainManager] Error in create():", err);
            error = `Failed to create Gain: ${err.message}`;
            nodes = null;
            audioInput = null;
            audioOutput = null;
            modInputs = {};
        }
        const t1 = performance.now();
        console.log(`[OutputGainManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput, audioOutput, modInputs, modOutputs: {}, error };
    },

    /**
     * Updates the gain parameter of an existing Tone.Gain node.
     * @param {object} nodes - An object containing the `gainNode` (the Tone.Gain instance).
     * @param {object} newSettings - An object containing the new `gain` value.
     * @param {number} newSettings.gain - The new gain value to set.
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings) {
        const t0 = performance.now();
        console.log("[OutputGainManager] update() called with:", JSON.stringify(newSettings, null, 2));
        if (!nodes || !nodes.gainNode || !newSettings) {
            console.warn("[OutputGainManager] Update called with invalid args", JSON.parse(JSON.stringify({ nodes, newSettings })));
            return false;
        }
        const gainNode = nodes.gainNode;
        try {
            if (newSettings.gain !== undefined && gainNode.gain instanceof Tone.Param) {
                gainNode.gain.value = newSettings.gain;
            } else if (newSettings.gain !== undefined) {
                gainNode.gain = newSettings.gain;
                console.warn("[OutputGainManager] Updated gain directly (not ramped).");
            }
            console.log("[OutputGainManager] update() finished.");
            const t1 = performance.now();
            console.log(`[OutputGainManager] update() duration: ${(t1-t0).toFixed(2)}ms`);
            return true;
        } catch (err) {
            console.error("[OutputGainManager] Error in update():", err);
            return false;
        }
    },

    /**
     * Connects the output gain node to previous and next nodes in an audio chain.
     * Specifically, it connects the `prevOutputNode` to the input of this gain node.
     * The output of this gain node would be connected by the `voiceBuilder` or a similar orchestrator.
     * @param {object} nodes - An object containing the `gainNode`.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node in the chain (e.g., an oscillator or filter).
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node (not used by this specific `connectPeers` implementation for an output gain, as it mainly handles its input connection).
     * @returns {boolean} True if the input connection was successful, false otherwise.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        if (!nodes || !nodes.gainNode || !prevOutputNode) {
            console.warn("[OutputGainManager] connectPeers called with invalid args", { nodes, prevOutputNode, nextInputNode });
            return false;
        }
        console.log("[OutputGainManager] Connecting previous node to gain input...");
        try {
            prevOutputNode.connect(nodes.gainNode);
            console.log("[OutputGainManager] Previous node connected to input.");
            return true;
        } catch (err) {
            console.error("[OutputGainManager] Error connecting input peer:", err);
            try { prevOutputNode.disconnect(nodes.gainNode); } catch(e){}
            return false;
        }
    },

    /**
     * Enables or disables the output gain component.
     * For a simple gain node, this typically has no direct action beyond what its `gain` parameter dictates.
     * A gain of 0 effectively disables it. This method logs the call but performs no direct action on the node.
     * @param {object} nodes - The component's nodes.
     * @param {boolean} isEnabled - The requested enabled state (ignored).
     * @returns {boolean} Always true.
     */
    enable(nodes, isEnabled) {
        console.log(`[OutputGainManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Connects a modulator source to the `gain` parameter of this output gain node.
     * Delegates to `blankManager.connectModulator` for generic modulator connection logic.
     * @param {object} nodes - An object containing the `gainNode` and its `modInputs` (which should include `gain`).
     * @param {string} targetParamPath - Should be 'gain' to modulate the output gain.
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} The result of the `blankManager.connectModulator` call.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.connectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Disconnects a modulator source from the `gain` parameter of this output gain node.
     * Delegates to `blankManager.disconnectModulator`.
     * @param {object} nodes - An object containing the `gainNode`.
     * @param {string} targetParamPath - Should be 'gain'.
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} The result of the `blankManager.disconnectModulator` call.
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.disconnectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Disposes of the Tone.Gain node, freeing its resources.
     * @param {object} nodes - An object containing the `gainNode` to be disposed.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[OutputGainManager] dispose() called");
        if (nodes && nodes.gainNode) {
            try {
                nodes.gainNode.disconnect();
                nodes.gainNode.dispose();
                console.log("[OutputGainManager] Gain node disposed.");
            } catch (e) {
                console.warn("[OutputGainManager] Error disposing gain node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[OutputGainManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('outputGain', outputGainManager);
} else {
    console.error("[OutputGainManager] audioConfig or audioConfig.registerManager is not available.");
}