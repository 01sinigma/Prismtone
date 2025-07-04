/**
 * @file chorusFxManager.js
 * @description
 * This manager handles the creation, configuration, and control of a Tone.Chorus effect node.
 * It allows for setting parameters like frequency, depth, delay time, and wet level for the chorus effect,
 * and manages its lifecycle within an audio chain.
 */

// Файл: app/src/main/assets/js/managers/chorusFxManager.js
const chorusFxManager = {
    /**
     * Creates a new Tone.Chorus effect node.
     * @param {object} [initialSettings={}] - Initial settings for the chorus effect.
     * @param {number} [initialSettings.frequency=1.5] - The frequency of the LFO modulating the chorus.
     * @param {number} [initialSettings.depth=0.7] - The depth of the LFO modulation (0-1).
     * @param {number} [initialSettings.delayTime=3.5] - The base delay time for the chorus voices in milliseconds.
     * @param {number} [initialSettings.wet=0.0] - The wet/dry mix of the effect (0 for dry, 1 for wet).
     * @param {string} [initialSettings.type='sine'] - The waveform type of the LFO (e.g., 'sine', 'square').
     * @param {number} [initialSettings.spread=180] - The stereo spread of the chorus voices in degrees.
     * @returns {{nodes: {chorusNode: Tone.Chorus}|null, audioInput: Tone.Chorus|null, audioOutput: Tone.Chorus|null, modInputs: object, modOutputs: object, error: string|null}}
     *          An object containing the created `chorusNode`, audio input/output references, empty modulator I/O (as Chorus is typically not a modulator source/target itself this way), and an error message (null on success).
     */
    create(initialSettings = {}) {
        console.log("[ChorusFxManager] Creating Chorus node with settings:", initialSettings);
        let nodes = { chorusNode: null };
        let audioInput = null;
        let audioOutput = null;
        let error = null;

        try {
            const settings = {
                frequency: initialSettings.frequency ?? 1.5,
                depth: initialSettings.depth ?? 0.7,
                delayTime: initialSettings.delayTime ?? 3.5,
                wet: initialSettings.wet ?? 0.0,
                type: initialSettings.type || 'sine', // Tone.Chorus поддерживает тип LFO
                spread: initialSettings.spread || 180 // Для стереоэффекта
            };
            nodes.chorusNode = new Tone.Chorus(settings).start(); // Запускаем LFO хоруса
            audioInput = nodes.chorusNode;
            audioOutput = nodes.chorusNode;
            console.log("[ChorusFxManager] Chorus node created successfully.");
        } catch (err) {
            console.error("[ChorusFxManager] Error creating Chorus node:", err);
            error = `Failed to create Chorus: ${err.message}`;
            nodes = null;
        }
        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    /**
     * Updates the parameters of an existing Tone.Chorus node.
     * @param {object} nodes - An object containing the `chorusNode` (the Tone.Chorus instance).
     * @param {object} newSettings - An object with the new settings to apply (frequency, depth, delayTime, wet, type, spread).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings) {
        if (!nodes?.chorusNode || !newSettings) return false;
        const chorusNode = nodes.chorusNode;
        console.log("[ChorusFxManager] Updating Chorus with:", newSettings);
        try {
            if (newSettings.frequency !== undefined && chorusNode.frequency instanceof Tone.Param) chorusNode.frequency.rampTo(newSettings.frequency, 0.02);
            if (newSettings.depth !== undefined && chorusNode.depth instanceof Tone.Param) chorusNode.depth.rampTo(newSettings.depth, 0.02);
            if (newSettings.delayTime !== undefined && typeof chorusNode.delayTime === 'number') chorusNode.delayTime = newSettings.delayTime; // delayTime - не Param
            if (newSettings.wet !== undefined && chorusNode.wet instanceof Tone.Param) chorusNode.wet.rampTo(newSettings.wet, 0.02);
            if (newSettings.type !== undefined) chorusNode.type = newSettings.type;
            if (newSettings.spread !== undefined) chorusNode.spread = newSettings.spread;
            return true;
        } catch (err) {
            console.error("[ChorusFxManager] Error updating Chorus:", err);
            return false;
        }
    },

    /**
     * Enables or disables the chorus effect by controlling its wet level.
     * Remembers the previous wet level when disabling and restores it upon enabling.
     * @param {object} nodes - An object containing the `chorusNode`.
     * @param {boolean} isEnabled - True to enable the effect, false to disable (sets wet to 0).
     * @returns {boolean} True if the operation was successful, false otherwise.
     */
    enable(nodes, isEnabled) {
        if (!nodes?.chorusNode) return false;
        const chorusNode = nodes.chorusNode;
        console.log(`[ChorusFxManager] Setting enabled to ${isEnabled}`);
        try {
            if (!isEnabled && chorusNode.wet.value > 0) chorusNode._previousWet = chorusNode.wet.value;
            const targetWet = isEnabled ? (chorusNode._previousWet ?? 0.5) : 0; // Дефолтный wet 0.5 при включении, если не было сохранено
            chorusNode.wet.rampTo(targetWet, 0.02);
            // LFO хоруса стартует в create, останавливать его не нужно, wet=0 достаточно
            return true;
        } catch (err) { return false; }
    },

    /**
     * Connects the chorus node to previous and next nodes in an audio chain.
     * Delegates to `blankManager.connectPeers` for standard connection logic.
     * @param {object} nodes - An object containing the `chorusNode`.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node in the chain.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node in the chain.
     * @returns {boolean} The result of the `blankManager.connectPeers` call.
     */
    connectPeers(nodes, prev, next) { return blankManager.connectPeers(nodes, prev, next); },
    /**
     * Disposes of the Tone.Chorus node, stopping its LFO and freeing resources.
     * Delegates to `blankManager.dispose` for the actual disposal of the node.
     * @param {object} nodes - An object containing the `chorusNode` to be disposed.
     */
    dispose(nodes) {
        if (nodes?.chorusNode) {
            nodes.chorusNode.stop(); // Останавливаем LFO перед удалением
            blankManager.dispose({ chorusNode: nodes.chorusNode });
        }
    }
    // connectModulator и disconnectModulator можно наследовать от blankManager или реализовать если нужно
};

if (typeof audioConfig !== 'undefined' && audioConfig.registerManager) {
    audioConfig.registerManager('chorus', chorusFxManager);
} else {
    console.error("[ChorusFxManager] audioConfig or registerManager missing.");
}