/**
 * @file filterManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a Tone.Filter node,
 * which is a crucial component in shaping the timbre of a synthesizer voice.
 * It handles parameters like filter type, frequency, Q (resonance), rolloff, and gain.
 * It also supports modulation of its key parameters (frequency, Q, gain, detune).
 */

// Файл: app/src/main/assets/js/managers/filterManager.js
// Менеджер для управления основным фильтром голоса (Tone.Filter)

const filterManager = {
    /**
     * Creates a new Tone.Filter node.
     * @param {object} [initialSettings={}] - Initial settings for the filter.
     * @param {Tone.Frequency} [initialSettings.frequency=5000] - The cutoff or center frequency of the filter.
     * @param {number} [initialSettings.Q=1] - The Q factor (resonance) of the filter.
     * @param {BiquadFilterType} [initialSettings.type='lowpass'] - The type of the filter (e.g., 'lowpass', 'highpass', 'bandpass').
     * @param {-12|-24|-48|-96} [initialSettings.rolloff=-12] - The rolloff slope of the filter in dB/octave.
     * @param {number} [initialSettings.gain=0] - The gain of the filter, applicable for some filter types like 'lowshelf', 'highshelf', 'peaking'.
     * @returns {{nodes: {filter: Tone.Filter}|null, audioInput: Tone.Filter|null, audioOutput: Tone.Filter|null, modInputs: {frequency?: Tone.Param, detune?: Tone.Param, Q?: Tone.Param, gain?: Tone.Param}, modOutputs: object, error: string|null}}
     *          An object containing:
     *          - `nodes`: Contains the created `filter` node (Tone.Filter).
     *          - `audioInput`, `audioOutput`: References to the filter node itself, as it processes audio.
     *          - `modInputs`: An object mapping parameter names (frequency, detune, Q, gain) to their respective Tone.Param instances if available for modulation.
     *          - `modOutputs`: An empty object, as the filter is not a modulator source in this context.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[FilterManager] create() called with:", initialSettings);
        let nodes = { filter: null };
        let audioInput = null;
        let audioOutput = null;
        let modInputs = {};
        let error = null;
        try {
            const settings = {
                frequency: initialSettings.frequency ?? 5000,
                Q: initialSettings.Q ?? initialSettings.resonance ?? 1,
                type: initialSettings.type || 'lowpass',
                rolloff: initialSettings.rolloff ?? -12,
                gain: initialSettings.gain ?? 0
            };
            // Валидация типа фильтра
            const validTypes = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'notch', 'allpass', 'peaking'];
            if (!validTypes.includes(settings.type)) {
                console.warn(`[FilterManager] Invalid filter type '${settings.type}'. Using 'lowpass'.`);
                settings.type = 'lowpass';
            }
            // Валидация rolloff
            const validRolloffs = [-12, -24, -48, -96];
            if (!validRolloffs.includes(settings.rolloff)) {
                console.warn(`[FilterManager] Invalid filter rolloff '${settings.rolloff}'. Using '-12'.`);
                settings.rolloff = -12;
            }
            console.log("[FilterManager] Creating Tone.Filter with:", settings);
            const filterNode = new Tone.Filter(settings);
            nodes.filter = filterNode;
            audioInput = filterNode;
            audioOutput = filterNode;
            const isConnectableAudioParam = (param) => param && typeof param.value !== 'undefined' && typeof param.rampTo === 'function';
            if (isConnectableAudioParam(filterNode.frequency)) modInputs.frequency = filterNode.frequency;
            if (isConnectableAudioParam(filterNode.detune)) modInputs.detune = filterNode.detune;
            if (isConnectableAudioParam(filterNode.Q)) modInputs.Q = filterNode.Q;
            if (isConnectableAudioParam(filterNode.gain)) modInputs.gain = filterNode.gain;
            console.log("[FilterManager] create() finished.");
        } catch (err) {
            console.error("[FilterManager] Error in create():", err);
            error = `Failed to create Filter: ${err.message}`;
            nodes = null;
            audioInput = null;
            audioOutput = null;
            modInputs = {};
        }
        const t1 = performance.now();
        console.log(`[FilterManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput, audioOutput, modInputs, modOutputs: {}, error };
    },

    /**
     * Updates the parameters of an existing Tone.Filter node.
     * Parameters like frequency, Q, and gain are ramped for smooth transitions, while type and rolloff are set directly.
     * @param {object} nodes - An object containing the `filter` node (the Tone.Filter instance).
     * @param {object} newSettings - An object with new settings to apply (frequency, Q, type, rolloff, gain).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings) {
        if (!nodes || !nodes.filter || !newSettings) {
            console.warn("[FilterManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const filterNode = nodes.filter;
        try {
            // >>> НАЧАЛО ИЗМЕНЕНИЙ (Оптимизация) <<<
            const paramsToUpdate = {};
            const rampTime = 0.02; // Стандартное время для плавного перехода

            if (newSettings.frequency !== undefined) paramsToUpdate.frequency = newSettings.frequency;
            if (newSettings.Q !== undefined) paramsToUpdate.Q = newSettings.Q;
            if (newSettings.gain !== undefined) paramsToUpdate.gain = newSettings.gain;
            
            // Применяем параметры, которые можно плавно изменять
            if (Object.keys(paramsToUpdate).length > 0) {
                filterNode.set(paramsToUpdate, rampTime);
            }

            // Применяем параметры, которые изменяются мгновенно
            if (newSettings.type !== undefined) {
                const validTypes = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'notch', 'allpass', 'peaking'];
                if (validTypes.includes(newSettings.type)) {
                    filterNode.type = newSettings.type;
                }
            }
            if (newSettings.rolloff !== undefined) {
                const validRolloffs = [-12, -24, -48, -96];
                if (validRolloffs.includes(newSettings.rolloff)) {
                    filterNode.rolloff = newSettings.rolloff;
                }
            }
            // >>> КОНЕЦ ИЗМЕНЕНИЙ <<<
            return true;
        } catch (err) {
            console.error("[FilterManager] Error in update():", err);
            return false;
        }
    },

    /**
     * Connects the filter node to previous and next nodes in an audio chain.
     * Delegates to `blankManager.connectPeers` for standard connection logic.
     * @param {object} nodes - An object containing the `filter` node.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node in the chain.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node in the chain.
     * @returns {boolean} The result of the `blankManager.connectPeers` call.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Enables or disables the filter component. For Tone.Filter, which is always part of the audio chain
     * if included, this typically has no direct action, as its effect is controlled by its parameters (e.g., type, frequency).
     * @param {object} nodes - The component's nodes.
     * @param {boolean} isEnabled - The requested enabled state (ignored).
     * @returns {boolean} Always true.
     */
    enable(nodes, isEnabled) {
        console.log(`[FilterManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Connects a modulator source (e.g., LFO, envelope) to a specified parameter of the filter.
     * @param {object} nodes - An object containing the `filter` node (Tone.Filter instance).
     * @param {string} targetParamPath - The name of the filter parameter to modulate (e.g., 'frequency', 'Q', 'gain', 'detune').
     * @param {Tone.AudioNode|Tone.Signal} sourceNode - The output node of the modulator.
     * @returns {boolean} True if the connection was successful, false otherwise.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        if (!nodes?.filter || !targetParamPath || !sourceNode) return false;
        let targetParamInstance = null;
        switch (targetParamPath) {
            case 'frequency': targetParamInstance = nodes.filter.frequency; break;
            case 'Q': targetParamInstance = nodes.filter.Q; break;
            case 'gain': targetParamInstance = nodes.filter.gain; break;
            case 'detune': targetParamInstance = nodes.filter.detune; break;
            default:
                console.warn(`[FilterManager] Unsupported targetParamPath: '${targetParamPath}'`);
                return false;
        }
        if (targetParamInstance && (targetParamInstance instanceof Tone.Param || targetParamInstance instanceof Tone.Signal)) {
            try {
                sourceNode.connect(targetParamInstance);
                console.log(`[FilterManager] Modulator connected to filter.${targetParamPath}`);
                return true;
            } catch (e) {
                console.error(`[FilterManager] Error connecting modulator to filter.${targetParamPath}:`, e);
                return false;
            }
        } else {
            console.warn(`[FilterManager] Target parameter 'filter.${targetParamPath}' not found or not a connectable Param/Signal. Instance:`, targetParamInstance);
            return false;
        }
    },

    /**
     * Disconnects a modulator source from a specified parameter of the filter.
     * @param {object} nodes - An object containing the `filter` node.
     * @param {string} targetParamPath - The name of the filter parameter from which to disconnect the modulator.
     * @param {Tone.AudioNode|Tone.Signal} sourceNode - The output node of the modulator to be disconnected.
     * @returns {boolean} True if disconnection was attempted (Tone.js disconnects silently even if not previously connected).
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        if (!nodes?.filter || !targetParamPath || !sourceNode) return false;
        let targetParamInstance = null;
        switch (targetParamPath) {
            case 'frequency': targetParamInstance = nodes.filter.frequency; break;
            case 'Q': targetParamInstance = nodes.filter.Q; break;
            case 'gain': targetParamInstance = nodes.filter.gain; break;
            case 'detune': targetParamInstance = nodes.filter.detune; break;
        }
        if (targetParamInstance && (targetParamInstance instanceof Tone.Param || targetParamInstance instanceof Tone.Signal)) {
            try {
                sourceNode.disconnect(targetParamInstance);
                console.log(`[FilterManager] Modulator disconnected from filter.${targetParamPath}`);
                return true;
            } catch (e) {
                console.warn(`[FilterManager] Error/Warning disconnecting modulator from filter.${targetParamPath}:`, e.message);
                return true;
            }
        }
        return true;
    },

    /**
     * Disposes of the Tone.Filter node, freeing its resources.
     * @param {object} nodes - An object containing the `filter` node to be disposed.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[FilterManager] dispose() called");
        if (nodes && nodes.filter) {
            try {
                nodes.filter.disconnect();
                nodes.filter.dispose();
                console.log("[FilterManager] Filter node disposed.");
            } catch (e) {
                console.warn("[FilterManager] Error disposing filter node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[FilterManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('filter', filterManager);
} else {
    console.error("[FilterManager] audioConfig or audioConfig.registerManager is not available.");
}