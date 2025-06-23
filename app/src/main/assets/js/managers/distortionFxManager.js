/**
 * @file distortionFxManager.js
 * @description
 * This manager handles the creation, configuration, and control of a Tone.Distortion effect node.
 * It allows for setting parameters like the amount of distortion, oversampling, and wet/dry mix,
 * enabling various types of distortion effects within an audio chain.
 */

// Файл: app/src/main/assets/js/managers/distortionFxManager.js
const distortionFxManager = {
    isOptional: true, // Инсертные эффекты опциональны

    /**
     * Creates a new Tone.Distortion effect node.
     * @param {object} [initialSettings={}] - Initial settings for the distortion effect.
     * @param {number} [initialSettings.distortion=0.4] - The amount of distortion (0-1).
     * @param {number} [initialSettings.wet=1.0] - The wet/dry mix. Defaults to 1.0 for an insert effect.
     * @param {'none'|'2x'|'4x'} [initialSettings.oversample='none'] - The oversampling rate for the distortion effect.
     * @returns {{nodes: {distortionNode: Tone.Distortion}|null, audioInput: Tone.Distortion|null, audioOutput: Tone.Distortion|null, modInputs: object, modOutputs: object, error: string|null}}
     *          An object containing the created `distortionNode`, audio input/output references, empty modulator I/O, and an error message (null on success).
     */
    create(initialSettings = {}) {
        console.log("[DistortionFxManager] Creating Distortion node with settings:", initialSettings);
        let nodes = {
            distortionNode: null
        };
        let audioInput = null;
        let audioOutput = null;
        let error = null;

        try {
            const settings = {
                distortion: initialSettings.distortion ?? 0.4, // Значение искажения
                wet: initialSettings.wet ?? 1.0,             // Wet по умолчанию 1.0 для инсертов
                oversample: initialSettings.oversample || 'none' // 'none', '2x', '4x'
            };

            const distortionNode = new Tone.Distortion(settings);
            nodes.distortionNode = distortionNode;
            audioInput = distortionNode;
            audioOutput = distortionNode;

            // modInputs не обязательны для простых эффектов, но можно добавить для wet/distortion
            // modInputs: {
            //    distortion: distortionNode.distortion, // Это Signal, а не Param
            //    wet: distortionNode.wet
            // }

            console.log("[DistortionFxManager] Distortion node created successfully.");

        } catch (err) {
            console.error("[DistortionFxManager] Error creating Distortion node:", err);
            error = `Failed to create Distortion: ${err.message}`;
            nodes = null;
            audioInput = null;
            audioOutput = null;
        }

        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    /**
     * Updates the parameters of an existing Tone.Distortion node.
     * @param {object} nodes - An object containing the `distortionNode` (the Tone.Distortion instance).
     * @param {object} newSettings - An object with the new settings to apply (distortion, wet, oversample).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings) {
        if (!nodes || !nodes.distortionNode || !newSettings) {
            console.warn("[DistortionFxManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const distortionNode = nodes.distortionNode;
        console.log("[DistortionFxManager] Updating Distortion with:", newSettings);

        try {
            if (newSettings.distortion !== undefined && typeof distortionNode.distortion === 'number') { // distortion - это просто число
                distortionNode.distortion = Math.max(0, Math.min(1, newSettings.distortion)); // Ограничиваем 0-1
            }
            if (newSettings.wet !== undefined && distortionNode.wet instanceof Tone.Param) {
                distortionNode.wet.rampTo(newSettings.wet, 0.02);
            }
            if (newSettings.oversample !== undefined && ['none', '2x', '4x'].includes(newSettings.oversample)) {
                distortionNode.oversample = newSettings.oversample;
            }
            return true;
        } catch (err) {
            console.error("[DistortionFxManager] Error updating Distortion:", err);
            return false;
        }
    },

    /**
     * Enables or disables the distortion effect by controlling its wet level.
     * Remembers the previous wet level when disabling and restores it (or a default of 1.0) upon enabling.
     * @param {object} nodes - An object containing the `distortionNode`.
     * @param {boolean} isEnabled - True to enable the effect, false to disable (sets wet to 0).
     * @returns {boolean} True if the operation was successful, false otherwise.
     */
    enable(nodes, isEnabled) {
        if (!nodes || !nodes.distortionNode) {
            console.warn("[DistortionFxManager] Enable called with invalid nodes.");
            return false;
        }
        const distortionNode = nodes.distortionNode;
        console.log(`[DistortionFxManager] Setting enabled to ${isEnabled}`);
        try {
            // Сохраняем предыдущее значение wet, если выключаем
            if (!isEnabled && distortionNode.wet.value > 0) {
                distortionNode._previousWet = distortionNode.wet.value;
            }
            const targetWet = isEnabled ? (distortionNode._previousWet ?? 1.0) : 0;
            distortionNode.wet.rampTo(targetWet, 0.02);
            return true;
        } catch (err) {
            console.error("[DistortionFxManager] Error in enable/disable:", err);
            return false;
        }
    },

    /**
     * Connects the distortion node to previous and next nodes in an audio chain.
     * Delegates to `blankManager.connectPeers` for standard connection logic.
     * @param {object} nodes - An object containing the `distortionNode`.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node in the chain.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node in the chain.
     * @returns {boolean} The result of the `blankManager.connectPeers` call.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Disposes of the Tone.Distortion node, freeing its resources.
     * Delegates to `blankManager.dispose` for the actual disposal of the node.
     * @param {object} nodes - An object containing the `distortionNode` to be disposed.
     */
    dispose(nodes) {
        console.log("[DistortionFxManager] Disposing Distortion node...");
        if (nodes && nodes.distortionNode) {
            blankManager.dispose({ distortionNode: nodes.distortionNode });
        } else {
            console.log("[DistortionFxManager] No distortion node found to dispose.");
        }
    },

    // connectModulator и disconnectModulator можно опустить, если не планируется модуляция параметров дисторшна
    // или использовать реализации из blankManager, если параметры объявлены в modInputs
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('distortion', distortionFxManager);
} else {
    console.error("[DistortionFxManager] audioConfig or audioConfig.registerManager is not available.");
}