/**
 * @file pitchEnvManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a pitch envelope.
 * A pitch envelope modulates the pitch (or detune) of an oscillator over time, based on an ADSR
 * (Attack, Decay, Sustain, Release) profile. This is commonly used for percussive effects or pitch sweeps.
 * It uses a Tone.Envelope for the ADSR shape and a Tone.Multiply node to scale the envelope's
 * output by an 'amount' parameter (typically in cents), which then modulates the target oscillator's detune or frequency.
 */

// Файл: app/src/main/assets/js/managers/pitchEnvManager.js
// Менеджер для огибающей высоты тона (Pitch Envelope)

const pitchEnvManager = {
    isOptional: true, // Это опциональный компонент

    /**
     * Creates the necessary Tone.js nodes for a pitch envelope modulator.
     * This includes a Tone.Envelope for the ADSR shape and a Tone.Multiply node
     * to control the modulation amount (typically in cents for pitch modulation).
     *
     * @param {object} [initialSettings={}] - Initial settings for the pitch envelope.
     * @param {number} [initialSettings.attack=0.1] - The attack time in seconds.
     * @param {number} [initialSettings.decay=0.1] - The decay time in seconds.
     * @param {number} [initialSettings.sustain=0.5] - The sustain level (0-1).
     * @param {number} [initialSettings.release=0.2] - The release time in seconds.
     * @param {string} [initialSettings.attackCurve='linear'] - The curve shape for the attack phase.
     *        Note: Tone.Envelope primarily supports attackCurve. Decay and release curves are simpler.
     * @param {number} [initialSettings.amount=100] - The overall modulation amount in cents (e.g., 100 cents = 1 semitone).
     *                                                This scales the envelope's output before it modulates pitch.
     * @returns {{nodes: {env: Tone.Envelope, amount: Tone.Multiply}|null, audioInput: null, audioOutput: null, modOutputs: {pitch: Tone.Multiply}|object, error: string|null}}
     *          An object containing:
     *          - `nodes`: Contains the `env` (Tone.Envelope) and `amount` (Tone.Multiply for scaling) nodes.
     *          - `audioInput`, `audioOutput`: Null, as pitch envelopes are modulators, not audio processors in the main chain.
     *          - `modOutputs`: An object with a `pitch` property referencing the `amount` node, which is the final modulated signal intended for oscillator detune/frequency.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[PitchEnvManager] create() called with:", initialSettings);
        let nodes = {};
        let modOutputs = {}; // Выход для подключения к detune
        let error = null;

        // Компонент создается, только если enabled: true (проверяется в voiceBuilder)
        // Здесь мы просто создаем узлы на основе переданных настроек

        try {
            console.log("[PitchEnvManager] Creating Tone.Envelope and Tone.Multiply...");
            nodes.env = new Tone.Envelope({
                attack: initialSettings.attack ?? 0.1,
                decay: initialSettings.decay ?? 0.1,
                sustain: initialSettings.sustain ?? 0.5,
                release: initialSettings.release ?? 0.2,
                attackCurve: initialSettings.attackCurve || 'linear',
                // decay/release curve не поддерживаются в Tone.Envelope напрямую
            });

            // Узел для масштабирования выхода огибающей (0-1) в центы
            nodes.amount = new Tone.Multiply(initialSettings.amount ?? 100);

            // Соединяем выход огибающей с входом умножителя
            nodes.env.connect(nodes.amount);

            // Выход модулятора - это выход умножителя
            modOutputs.pitch = nodes.amount; // Стандартизированное имя выхода

            console.log("[PitchEnvManager] create() finished.");

        } catch (err) {
            console.error("[PitchEnvManager] Error in create():", err);
            error = `Failed to create PitchEnvelope nodes: ${err.message}`;
            nodes = null;
            modOutputs = {};
        }

        const t1 = performance.now();
        console.log(`[PitchEnvManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        // Pitch Env не имеет прямого аудио входа/выхода
        return { nodes, audioInput: null, audioOutput: null, modOutputs, error };
    },

    /**
     * Updates the parameters of an existing pitch envelope.
     * Modifies settings for both the Tone.Envelope (ADSR, attackCurve) and the Tone.Multiply node (amount).
     *
     * @param {object} nodes - An object containing the `env` (Tone.Envelope) and `amount` (Tone.Multiply) nodes.
     * @param {object} newSettings - An object with new settings to apply (attack, decay, sustain, release, attackCurve, amount).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(componentData, newSettingsBundle, oldSettingsBundle) {
        const t0 = performance.now();
        if (!newSettingsBundle || !newSettingsBundle.params) {
            console.warn("[PitchEnvManager] Update called with invalid newSettingsBundle. Params missing.", { newSettingsBundle });
            return false;
        }

        const newSettings = newSettingsBundle.params;
        const isEnabledInNewPreset = newSettingsBundle.enabled === true; // Explicitly check for true
        const currentEnvNode = componentData?.nodes?.env;
        const currentAmountNode = componentData?.nodes?.amount;

        if (!currentEnvNode && isEnabledInNewPreset) {
            // Nodes don't exist, but component should be enabled: CREATE
            console.log("[PitchEnvManager] Nodes do not exist and component is enabled. Creating new Pitch Env.");
            const creationResult = this.create(newSettings); // create expects params directly
            const t1_create = performance.now();
            console.log(`[PitchEnvManager] Created new Pitch Env in ${(t1_create - t0).toFixed(2)}ms.`);
            return creationResult; // Returns { nodes, modOutputs, ... }
        }

        if (currentEnvNode && !isEnabledInNewPreset) {
            // Nodes exist, but component should be disabled: DISPOSE
            console.log("[PitchEnvManager] Nodes exist but component is now disabled. Disposing Pitch Env.");
            this.dispose(componentData.nodes);
            const t1_dispose = performance.now();
            console.log(`[PitchEnvManager] Disposed Pitch Env in ${(t1_dispose - t0).toFixed(2)}ms.`);
            return { nodes: null, audioInput: null, audioOutput: null, modOutputs: {}, error: null, effectivelyDisabled: true };
        }

        if (!currentEnvNode && !isEnabledInNewPreset) {
            // Nodes don't exist and component is disabled, do nothing.
            console.log("[PitchEnvManager] Nodes do not exist and component is disabled. No action.");
            return true;
        }

        // If nodes exist and component is enabled, update parameters
        const envNode = currentEnvNode;
        const amountNode = currentAmountNode;
        try {
            const envSettingsToUpdate = {};
            let envChanged = false;
            let amountChanged = false;

            if (newSettings.attack !== undefined && envNode.attack !== newSettings.attack) {
                envSettingsToUpdate.attack = newSettings.attack;
                envChanged = true;
            }
            if (newSettings.decay !== undefined && envNode.decay !== newSettings.decay) {
                envSettingsToUpdate.decay = newSettings.decay;
                envChanged = true;
            }
            if (newSettings.sustain !== undefined && envNode.sustain !== newSettings.sustain) {
                envSettingsToUpdate.sustain = newSettings.sustain;
                envChanged = true;
            }
            if (newSettings.release !== undefined && envNode.release !== newSettings.release) {
                envSettingsToUpdate.release = newSettings.release;
                envChanged = true;
            }
            if (newSettings.attackCurve !== undefined && envNode.attackCurve !== newSettings.attackCurve) {
                envSettingsToUpdate.attackCurve = newSettings.attackCurve;
                envChanged = true;
            }
            // Note: Tone.Envelope decayCurve and releaseCurve are not standard settable properties post-construction.

            if (envChanged && Object.keys(envSettingsToUpdate).length > 0) {
                console.log("[PitchEnvManager] Updating envelope params:", envSettingsToUpdate);
                envNode.set(envSettingsToUpdate);
            }

            if (newSettings.amount !== undefined) {
                const currentAmountVal = (amountNode.factor && amountNode.factor.value !== undefined) ? amountNode.factor.value : amountNode.value;
                if (currentAmountVal !== newSettings.amount) {
                    if (amountNode.factor && (amountNode.factor instanceof Tone.Signal || amountNode.factor instanceof Tone.Param)) {
                        amountNode.factor.value = newSettings.amount;
                    } else if (amountNode.hasOwnProperty('value')) {
                        amountNode.value = newSettings.amount;
                    } else {
                        console.warn("[PitchEnvManager] Could not set amount on amountNode", amountNode);
                    }
                    amountChanged = true;
                    console.log(`[PitchEnvManager] Updated amount to: ${newSettings.amount}`);
                }
            }

            const t1_update = performance.now();
            if (envChanged || amountChanged) {
                console.log(`[PitchEnvManager] Updated existing Pitch Env in ${(t1_update - t0).toFixed(2)}ms.`);
            } else {
                console.log(`[PitchEnvManager] No Pitch Env parameters changed. Duration: ${(t1_update - t0).toFixed(2)}ms.`);
            }
            return true; // Successfully updated in-place
        } catch (err) {
            console.error("[PitchEnvManager] Error in update() for existing Pitch Env:", err, err.stack);
            const t1_err = performance.now();
            console.log(`[PitchEnvManager] Update error after ${(t1_err - t0).toFixed(2)}ms`);
            return false;
        }
    },

    /**
     * Connects peers in an audio chain. For a pitch envelope (which is a modulator),
     * this is typically a no-op as it doesn't process audio in the main signal path.
     *
     * @param {object} nodes - The component's nodes.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node.
     * @returns {boolean} Always true, as no connection is made.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },

    /**
     * Enables or disables the pitch envelope component.
     * For modulators like this, 'enabled' is often managed by whether it's connected to a target
     * (e.g., an oscillator's detune parameter) or if its modulation `amount` is non-zero.
     * The actual connection/disconnection is typically handled by `voiceBuilder` or `synth`.
     * This method logs the call but performs no direct action on the nodes in the provided code.
     *
     * @param {object} nodes - The component's nodes.
     * @param {boolean} isEnabled - The requested enabled state.
     * @returns {boolean} Always true.
     */
    enable(nodes, isEnabled) {
        console.log(`[PitchEnvManager] enable() called with state: ${isEnabled}. Connection handled elsewhere.`);
        // Логика включения/выключения (если не через connect/disconnect)
        // Например, можно установить amount в 0 при выключении:
        // if (nodes?.amount?.factor instanceof Tone.Signal) {
        //     nodes.amount.factor.value = isEnabled ? (nodes.amount._savedValue || 100) : 0;
        //     if (isEnabled) delete nodes.amount._savedValue; else nodes.amount._savedValue = nodes.amount.factor.value;
        // }
        return true;
    },

     /**
      * Triggers the attack phase of the pitch envelope.
      * This initiates the ADSR cycle of the `Tone.Envelope` node.
      *
      * @param {object} nodes - An object containing the `env` (Tone.Envelope) node.
      * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to trigger the attack.
      * @returns {boolean} True if the attack was successfully triggered, false otherwise (e.g., if `nodes.env` is missing).
      */
    triggerAttack(nodes, time) {
        const t0 = performance.now();
        console.log(`[PitchEnvManager] triggerAttack() called. Time: ${time}`);
        if (nodes?.env) {
            try {
                nodes.env.triggerAttack(time);
                const t1 = performance.now();
                console.log(`[PitchEnvManager] triggerAttack() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[PitchEnvManager] Error triggering attack:", e);
                return false;
            }
        }
        return false;
    },

    /**
     * Triggers the release phase of the pitch envelope.
     * This initiates the release segment of the ADSR cycle of the `Tone.Envelope` node.
     *
     * @param {object} nodes - An object containing the `env` (Tone.Envelope) node.
     * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to trigger the release.
     * @returns {boolean} True if the release was successfully triggered, false otherwise.
     */
    triggerRelease(nodes, time) {
        const t0 = performance.now();
        console.log(`[PitchEnvManager] triggerRelease() called. Time: ${time}`);
        if (nodes?.env) {
            try {
                nodes.env.triggerRelease(time);
                const t1 = performance.now();
                console.log(`[PitchEnvManager] triggerRelease() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[PitchEnvManager] Error triggering release:", e);
                return false;
            }
        }
        return false;
    },

    /**
     * Disposes of the Tone.js nodes created for the pitch envelope (Tone.Envelope and Tone.Multiply).
     * This is essential for freeing up audio resources.
     *
     * @param {object} nodes - An object containing the `env` and `amount` nodes to be disposed.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[PitchEnvManager] dispose() called");
        if (nodes?.env) {
            try {
                nodes.env.disconnect();
                nodes.env.dispose();
                console.log("[PitchEnvManager] Envelope node disposed.");
            } catch (e) {
                console.warn("[PitchEnvManager] Error disposing Envelope node:", e);
            }
        }
        if (nodes?.amount) {
            try {
                nodes.amount.disconnect();
                nodes.amount.dispose();
                console.log("[PitchEnvManager] Multiply node disposed.");
            } catch (e) {
                console.warn("[PitchEnvManager] Error disposing Multiply node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[PitchEnvManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

// Регистрация менеджера
if (typeof audioConfig !== 'undefined' && audioConfig.registerManager) {
    audioConfig.registerManager('pitchEnvelope', pitchEnvManager);
} else {
    console.error("[PitchEnvManager] Unable to register manager: audioConfig or registerManager function not found.");
}