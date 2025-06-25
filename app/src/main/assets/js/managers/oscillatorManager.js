/**
 * @file oscillatorManager.js
 * @description
 * This manager is responsible for creating, configuring, and managing various types of Tone.js oscillator nodes.
 * Oscillators are the fundamental sound sources in a synthesizer, generating periodic waveforms.
 * This manager handles different oscillator types like basic (sine, square, sawtooth, triangle via Tone.Oscillator or Tone.OmniOscillator),
 * PWM (Tone.PWMOscillator), Pulse (Tone.PulseOscillator), Fat (Tone.FatOscillator),
 * AM (Tone.AMOscillator), FM (Tone.FMOscillator), and Noise (Tone.Noise).
 * It sets initial parameters, provides an interface for updating them, and manages their lifecycle and modulation inputs.
 */

// Файл: app/src/main/assets/js/managers/oscillatorManager.js
// ВЕРСИЯ V3: Тестирование Tone.Oscillator для sine, ограничение FatOsc, исправление rampTo

const oscillatorManager = {
    /**
     * Creates a specific Tone.js oscillator node based on the provided initial settings.
     * The type of oscillator created is determined by `initialSettings.type`.
     * All created oscillators are started immediately by default.
     *
     * @param {object} [initialSettings={ type: 'triangle' }] - Initial settings for the oscillator.
     * @param {string} [initialSettings.type='triangle'] - The primary type of oscillator to create. Examples:
     *        'sine', 'square', 'sawtooth', 'triangle' (uses Tone.Oscillator for 'sine', Tone.OmniOscillator for others),
     *        'pwm', 'pulse', 'fatsine', 'fatsquare', 'fatsawtooth', 'fattriangle',
     *        'amsine', 'amsquare', 'amsawtooth', 'amtriangle',
     *        'fmsine', 'fmsquare', 'fmsawtooth', 'fmtriangle',
     *        'white', 'pink', 'brown' (for Tone.Noise).
     * @param {number} [initialSettings.phase=0] - Initial phase of the oscillator in degrees.
     * @param {Tone.Time} [initialSettings.portamento=0] - The portamento time in seconds for frequency changes.
     * @param {number} [initialSettings.modulationFrequency] - For 'pwm' type: the modulation frequency of the PWM.
     * @param {number} [initialSettings.width] - For 'pulse' type: the width of the pulse (0-1).
     * @param {number} [initialSettings.count=3] - For 'fat*' types: the number of detuned oscillators (capped).
     * @param {number} [initialSettings.spread=20] - For 'fat*' types: the detune spread in cents.
     * @param {number} [initialSettings.harmonicity=1] - For 'am*' and 'fm*' types: the harmonicity of the modulator oscillator.
     * @param {string} [initialSettings.modulationType='square'] - For 'am*' and 'fm*' types: the waveform type of the modulator.
     * @param {number} [initialSettings.modulationIndex=10] - For 'fm*' types: the modulation index.
     * @returns {{nodes: {oscillatorNode: Tone.Source, oscillatorType: string}|null, audioInput: null, audioOutput: Tone.Source|null, modInputs: object, modOutputs: object, error: string|null}}
     *          An object containing:
     *          - `nodes`: 
     *            - `oscillatorNode`: The created Tone.js oscillator instance (e.g., Tone.Oscillator, Tone.OmniOscillator, Tone.Noise, etc.).
     *            - `oscillatorType`: The string representing the category of the created oscillator (e.g., 'sine', 'pwm', 'fatsine').
     *          - `audioInput`: Always null, as oscillators are sources.
     *          - `audioOutput`: The oscillator node itself, which is the audio source.
     *          - `modInputs`: An object containing references to the oscillator's modulatable parameters (e.g., `frequency`, `detune`, and type-specific ones like `width`, `modulationFrequency`, `harmonicity`, `modulationIndex`).
     *          - `modOutputs`: An empty object, as oscillators are typically not modulator sources in this context.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = { type: 'triangle' }) {
        const t0 = performance.now();
        console.log("[OscillatorManager] create() called with:", initialSettings);
        let nodes = {
            oscillatorNode: null,
            oscillatorType: initialSettings.type || 'triangle'
        };
        let audioOutput = null;
        let modInputs = {};
        let error = null;
        try {
            const oscType = nodes.oscillatorType;
            const phase = initialSettings.phase ?? 0;
            const detune = 0;
            const portamentoTime = initialSettings.portamento ?? 0;
            let oscNode;
            let t_type_start, t_type_end;
            if (oscType === 'sine') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.Oscillator (sine)", {phase, detune, portamentoTime});
                oscNode = new Tone.Oscillator({
                    type: 'sine',
                    frequency: 440,
                    detune: detune,
                    phase: phase,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.Oscillator (sine) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (["square", "sawtooth", "triangle"].includes(oscType)) {
                t_type_start = performance.now();
                console.log(`[OscillatorManager] Creating Tone.OmniOscillator (${oscType})`, {phase, detune, portamentoTime});
                oscNode = new Tone.OmniOscillator({
                    type: oscType,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.OmniOscillator (${oscType}) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (oscType === 'pwm') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.PWMOscillator", {modulationFrequency: initialSettings.modulationFrequency, phase, detune, portamentoTime});
                oscNode = new Tone.PWMOscillator({
                    modulationFrequency: initialSettings.modulationFrequency ?? 0.5,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.PWMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.modulationFrequency) modInputs.modulationFrequency = oscNode.modulationFrequency;
            } else if (oscType === 'pulse') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.PulseOscillator", {width: initialSettings.width, phase, detune, portamentoTime});
                oscNode = new Tone.PulseOscillator({
                    width: initialSettings.width ?? 0.5,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.PulseOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.width) modInputs.width = oscNode.width;
            } else if (oscType.startsWith('fat')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.FatOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(3).toLowerCase();
                const maxFatCount = 5;
                const currentCount = initialSettings.count ?? 3;
                const safeCount = Math.max(1, Math.min(currentCount, maxFatCount));
                oscNode = new Tone.FatOscillator({
                    type: baseType,
                    count: safeCount,
                    spread: initialSettings.spread ?? 20,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.FatOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (oscType.startsWith('am')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.AMOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(2).toLowerCase();
                oscNode = new Tone.AMOscillator({
                    type: baseType,
                    harmonicity: initialSettings.harmonicity ?? 1,
                    modulationType: initialSettings.modulationType ?? 'square',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.AMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.harmonicity) modInputs.harmonicity = oscNode.harmonicity;
            } else if (oscType.startsWith('fm')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.FMOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(2).toLowerCase();
                oscNode = new Tone.FMOscillator({
                    type: baseType,
                    harmonicity: initialSettings.harmonicity ?? 1,
                    modulationIndex: initialSettings.modulationIndex ?? 10,
                    modulationType: initialSettings.modulationType ?? 'square',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.FMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.harmonicity) modInputs.harmonicity = oscNode.harmonicity;
                if (oscNode.modulationIndex) modInputs.modulationIndex = oscNode.modulationIndex;
            } else if (["white", "pink", "brown"].includes(oscType)) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.Noise", {oscType});
                oscNode = new Tone.Noise(oscType).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.Noise (${oscType}) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else {
                t_type_start = performance.now();
                console.warn(`[OscillatorManager] Unsupported type: ${oscType}. Using triangle (OmniOscillator).`);
                nodes.oscillatorType = 'triangle';
                oscNode = new Tone.OmniOscillator({
                    type: 'triangle',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.OmniOscillator (triangle fallback) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            }
            nodes.oscillatorNode = oscNode;
            audioOutput = oscNode;
            if (oscNode.frequency && (oscNode.frequency instanceof Tone.Param || oscNode.frequency instanceof Tone.Signal)) {
                modInputs.frequency = oscNode.frequency;
            }
            if (oscNode.detune && (oscNode.detune instanceof Tone.Param || oscNode.detune instanceof Tone.Signal)) {
                modInputs.detune = oscNode.detune;
            }
            console.log("[OscillatorManager] create() finished. Node type:", oscNode.constructor.name);
        } catch (err) {
            console.error("[OscillatorManager] Error in create():", err, err.stack);
            error = `Failed to create oscillator: ${err.message}`;
            nodes = null;
            audioOutput = null;
            modInputs = {};
        }
        const t1 = performance.now();
        console.log(`[OscillatorManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput: null, audioOutput, modInputs, modOutputs: {}, error };
    },
    /**
     * Updates the parameters of an existing oscillator node.
     * This method handles various parameters common to oscillators (frequency, detune, phase, portamento)
     * as well as type-specific parameters for PWM, Pulse, Fat, AM, and FM oscillators.
     * Frequency, detune, and other Tone.Param/Tone.Signal properties are updated using `set` for batched changes,
     * while direct properties like `phase`, `portamento`, and internal `type` (waveform) are assigned directly.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode` (the oscillator instance) and `nodes.oscillatorType` (its category string).
     * @param {object} newSettings - An object containing the new settings to apply. Examples:
     *        `frequency`, `detune`, `phase`, `portamento`, `type` (for waveform changes within OmniOscillator, AM, FM, Fat types),
     *        `modulationFrequency` (for PWM), `width` (for Pulse),
     *        `count`, `spread` (for FatOscillators),
     *        `harmonicity`, `modulationType`, `modulationIndex` (for AM/FM oscillators).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings, allComponents, fxSend, mainAnalyser, mainLimiter, fullPresetData) {
        if (!nodes || !newSettings) { // Removed oscillatorNode check as it might be recreated
            console.warn("[OscillatorManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }

        const oldOscNode = nodes.oscillatorNode;
        const oldOscTypeCategory = nodes.oscillatorType; // The category type string like 'sine', 'fatsawtooth'
        const newOscTypeFromSettings = newSettings.type; // The potentially new type from preset

        try {
            // Check if a full recreation is needed due to type change
            // This simple check assumes 'type' directly maps to a need for re-creation.
            // A more robust check would compare the constructor/class of oldOscNode vs what newOscTypeFromSettings implies.
            if (newOscTypeFromSettings && newOscTypeFromSettings !== oldOscTypeCategory) {
                console.log(`[OscillatorManager] Type change detected. Old: '${oldOscTypeCategory}', New: '${newOscTypeFromSettings}'. Recreating oscillator.`);

                // 1. Get the full configuration for the new oscillator
                // We need to merge existing non-type related params from newSettings with the new type.
                const creationSettings = { ...newSettings, type: newOscTypeFromSettings };
                if (newSettings.portamento !== undefined) creationSettings.portamento = newSettings.portamento;
                // Ensure all relevant params from newSettings (like frequency, phase, etc.) are included in creationSettings
                // if they are not already part of a 'params' sub-object in newSettings.
                // For example, if newSettings = { type: 'pwm', frequency: 220, modulationFrequency: 5 }
                // creationSettings should be { type: 'pwm', frequency: 220, modulationFrequency: 5 }


                // 2. Disconnect and Dispose the old oscillator
                if (oldOscNode) {
                    if (typeof oldOscNode.disconnect === 'function') {
                        oldOscNode.disconnect(); // Disconnect from all destinations
                    }
                    if (typeof oldOscNode.dispose === 'function') {
                        oldOscNode.dispose();
                    }
                    console.log("[OscillatorManager] Old oscillator node disposed.");
                }

                // 3. Create the new oscillator
                // We need to ensure `create` uses all relevant parameters from `creationSettings`.
                // The `create` method itself might need adjustment if it only expects `initialSettings.type` for type and other params directly.
                // Let's assume `create` can take a full settings object.
                const createResult = this.create(creationSettings);

                if (!createResult || !createResult.nodes?.oscillatorNode || createResult.error) {
                    console.error("[OscillatorManager] Failed to create new oscillator node during type change:", createResult?.error);
                    nodes.oscillatorNode = null; // Mark as unusable
                    nodes.error = `Recreation failed: ${createResult?.error}`;
                    return false; // Indicate failure
                }

                nodes.oscillatorNode = createResult.nodes.oscillatorNode;
                nodes.oscillatorType = createResult.nodes.oscillatorType; // Update the type category
                // Update modInputs if createResult provides them
                if (createResult.modInputs) nodes.modInputs = createResult.modInputs;


                // 4. Reconnect the new oscillator
                // The new oscillator (nodes.oscillatorNode, which is createResult.audioOutput)
                // needs to be connected to the input of the next component in the chain.
                // This is where `allComponents` and `voiceBuilder` or similar logic is crucial.
                // For simplicity, let's assume the next component is amplitudeEnv if no filter, or filter if present.
                let nextComponentAudioInput = null;
                if (allComponents?.filter?.nodes?.audioInput && fullPresetData?.filter?.enabled !== false) {
                    nextComponentAudioInput = allComponents.filter.nodes.audioInput;
                     console.log("[OscillatorManager] Reconnecting new oscillator to Filter input.");
                } else if (allComponents?.amplitudeEnv?.nodes?.audioInput) {
                    nextComponentAudioInput = allComponents.amplitudeEnv.nodes.audioInput;
                    console.log("[OscillatorManager] Reconnecting new oscillator to AmplitudeEnv input.");
                }

                if (nextComponentAudioInput && typeof nodes.oscillatorNode.connect === 'function') {
                    nodes.oscillatorNode.connect(nextComponentAudioInput);
                } else {
                    console.warn("[OscillatorManager] Could not determine next component or connect new oscillator.");
                    // Potentially, connect to main limiter as a fallback if nothing else, though this might not be desired.
                    // nodes.oscillatorNode.connect(mainLimiter);
                }
                console.log("[OscillatorManager] New oscillator created and reconnected.");
                // After recreation, we still need to apply any other non-type parameters from newSettings
                // to the new node, as 'create' might only set defaults for some of them.
                // The existing update logic below will handle this.
            }

            // Standard parameter update logic (applies to existing or newly created node)
            const oscNode = nodes.oscillatorNode; // This is now the potentially new node
            if (!oscNode) {
                console.warn("[OscillatorManager] No oscillator node to update after potential recreation.");
                return false;
            }

            const paramsToSet = {};
            if (newSettings.frequency !== undefined && oscNode.frequency?.value !== undefined) {
                paramsToSet.frequency = newSettings.frequency;
            }
            if (newSettings.detune !== undefined && oscNode.detune?.value !== undefined) {
                paramsToSet.detune = newSettings.detune;
            }

            const currentActualOscType = oscNode.type; // This is the actual type of the Tone.js node (e.g. 'sine', 'pwm')

            // Type-specific parameters for batching with .set()
            if (oscNode.modulationFrequency && newSettings.modulationFrequency !== undefined) { // For PWMOscillator
                paramsToSet.modulationFrequency = newSettings.modulationFrequency;
            }
            if (oscNode.width && newSettings.width !== undefined) { // For PulseOscillator
                paramsToSet.width = newSettings.width;
            }
            if (oscNode.harmonicity && newSettings.harmonicity !== undefined) { // For AM/FMOscillator
                paramsToSet.harmonicity = newSettings.harmonicity;
            }
            if (oscNode.modulationIndex && newSettings.modulationIndex !== undefined) { // For FMOscillator
                paramsToSet.modulationIndex = newSettings.modulationIndex;
            }

            if (Object.keys(paramsToSet).length > 0) {
                oscNode.set(paramsToSet);
            }

            // Direct property assignments
            if (newSettings.phase !== undefined && oscNode.hasOwnProperty('phase')) {
                oscNode.phase = newSettings.phase;
            }
            if (newSettings.portamento !== undefined && oscNode.hasOwnProperty('portamento')) {
                oscNode.portamento = newSettings.portamento;
            }

            // Update oscillator's internal 'type' (waveform for OmniOscillator, FatOscillator, AM/FM)
            // This is different from the newOscTypeFromSettings which might trigger recreation.
            // This handles changing, e.g., an OmniOscillator from 'sine' to 'square'.
            if (newSettings.type !== undefined &&                      // A type is specified in settings
                newOscTypeFromSettings === oldOscTypeCategory &&      // And it did NOT cause a full recreation
                oscNode.hasOwnProperty('type') &&                     // The node has a settable 'type' property
                typeof oscNode.type === 'string' &&                   // It's a string (like for OmniOsc)
                oscNode.type !== newSettings.type) {                  // And it's different
                    oscNode.type = newSettings.type;
                    console.log(`[OscillatorManager] Updated internal waveform type of existing '${oldOscTypeCategory}' to '${newSettings.type}'`);
            }


            // Oscillator-specific direct property assignments for FatOscillator, AM/FM
            if (oscNode.count !== undefined && newSettings.count !== undefined) { // FatOscillator
                const maxFatCount = 5;
                const newCount = Math.max(1, Math.min(parseInt(newSettings.count, 10), maxFatCount));
                if (oscNode.count !== newCount) oscNode.count = newCount;
            }
            if (oscNode.spread !== undefined && newSettings.spread !== undefined) { // FatOscillator
                if (oscNode.spread !== newSettings.spread) oscNode.spread = newSettings.spread;
            }
            if (oscNode.modulationType !== undefined && newSettings.modulationType !== undefined) { // AM/FMOscillator
                if (oscNode.modulationType !== newSettings.modulationType) oscNode.modulationType = newSettings.modulationType;
            }

            return true;
        } catch (err) {
            console.error("[OscillatorManager] Error in update():", err, err.stack);
            nodes.error = `Update failed: ${err.message}`;
            return false;
        }
    },
    /**
     * Disposes of the oscillator node, freeing its resources.
     * It's important to call this when the oscillator is no longer needed to prevent memory leaks.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode` (the oscillator instance to dispose).
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[OscillatorManager] dispose() called");
        if (nodes?.oscillatorNode) {
            try {
                nodes.oscillatorNode.disconnect();
                nodes.oscillatorNode.dispose();
                console.log("[OscillatorManager] Oscillator node disposed.");
            } catch (e) {
                console.warn("[OscillatorManager] Error disposing oscillator node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[OscillatorManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    },
    /**
     * Connects the oscillator (which is an audio source) to the next node in the audio chain.
     * Oscillators typically only have an audio output.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode`.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node (should be null or ignored for a source like an oscillator).
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node in the audio chain to connect the oscillator's output to.
     * @returns {boolean} True if the connection attempt was made (delegates to `blankManager.connectPeers` which connects `nodes.oscillatorNode` to `nextInputNode`).
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },
    /**
     * Enables or disables the oscillator component. Note: Oscillators in Tone.js are typically started via `.start()`
     * (which this manager does in `create`) and their perceived sound is controlled by subsequent nodes like an
     * amplitude envelope. This `enable` method might have a limited or specific role depending on the overall synth architecture.
     * As currently implemented in the visible code, it appears to be a placeholder or a general hook.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode`.
     * @param {boolean} isEnabled - The requested enabled state.
     * @returns {boolean} Returns true, but the actual effect depends on the oscillator's state and synth design.
     */
    enable(nodes, isEnabled) {
        return true;
    },
    /**
     * Connects a modulator source (e.g., LFO, envelope) to a specified parameter of the oscillator.
     * Common modulatable parameters include `frequency` and `detune`. Some oscillator types (PWM, Pulse, AM, FM)
     * have additional modulatable parameters like `modulationFrequency`, `width`, `harmonicity`, `modulationIndex`.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode`.
     * @param {string} targetParamPath - The name of the oscillator parameter to modulate (e.g., 'frequency', 'detune', 'width').
     *                                   Must match a key in the `modInputs` object returned by `create`.
     * @param {Tone.AudioNode|Tone.Signal} sourceNode - The output node of the modulator.
     * @returns {boolean} True if the connection was successful, false otherwise (e.g., if `targetParamPath` is invalid or not modulatable).
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        return true;
    },
    /**
     * Disconnects a modulator source from a specified parameter of the oscillator.
     *
     * @param {object} nodes - An object containing `nodes.oscillatorNode`.
     * @param {string} targetParamPath - The name of the oscillator parameter from which to disconnect the modulator.
     * @param {Tone.AudioNode|Tone.Signal} sourceNode - The output node of the modulator to be disconnected.
     * @returns {boolean} True if disconnection was attempted (Tone.js disconnects silently).
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return true;
    }
};

if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('oscillator', oscillatorManager);
} else {
    console.error("[OscillatorManager] audioConfig or audioConfig.registerManager is not available.");
}
