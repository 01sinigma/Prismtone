/**
 * @file filterEnvelopeManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a filter envelope.
 * A filter envelope typically modulates the cutoff frequency of a filter (like Tone.Filter)
 * over time, based on an ADSR (Attack, Decay, Sustain, Release) profile.
 * It uses a Tone.Envelope for the ADSR shape and a Tone.Multiply node to scale the envelope's
 * output by an 'amount' parameter, which then modulates the target filter parameter.
 */

// Файл: app/src/main/assets/js/managers/filterEnvelopeManager.js
// Менеджер для огибающей фильтра (Filter Envelope)

const filterEnvelopeManager = {
    isOptional: true, // Это опциональный компонент

    /**
     * Creates the necessary Tone.js nodes for a filter envelope modulator.
     * This includes a Tone.Envelope for the ADSR shape and a Tone.Multiply node
     * to control the modulation amount.
     * @param {object} [initialSettings={}] - Initial settings for the filter envelope.
     * @param {number} [initialSettings.attack=0.1] - The attack time in seconds.
     * @param {number} [initialSettings.decay=0.2] - The decay time in seconds.
     * @param {number} [initialSettings.sustain=0.5] - The sustain level (0-1).
     * @param {number} [initialSettings.release=0.5] - The release time in seconds.
     * @param {string} [initialSettings.attackCurve='linear'] - The curve shape for the attack phase.
     * @param {string} [initialSettings.decayCurve='exponential'] - The curve shape for the decay phase.
     * @param {string} [initialSettings.releaseCurve='exponential'] - The curve shape for the release phase.
     * @param {number} [initialSettings.amount=0] - The overall modulation amount. This scales the envelope's output.
     * @returns {{nodes: {env: Tone.Envelope, amountControl: Tone.Multiply}|null, audioInput: null, audioOutput: null, modOutputs: {output: Tone.Multiply}|object, error: string|null}}
     *          An object containing:
     *          - `nodes`: Contains the `env` (Tone.Envelope) and `amountControl` (Tone.Multiply) nodes.
     *          - `audioInput`, `audioOutput`: Null, as filter envelopes are modulators, not audio processors in the main chain.
     *          - `modOutputs`: An object with an `output` property referencing the `amountControl` node, which is the final modulated signal.
     *          - `error`: An error message string if creation failed, otherwise null.
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[FilterEnvManager CREATE ENTRY] Called with initialSettings:", JSON.stringify(initialSettings, null, 2));
        let nodes = { env: null, amountControl: null };
        let modOutputs = { output: null };
        let error = null;
        try {
            console.log("[FilterEnvManager] Creating Tone.Envelope and Tone.Multiply...");
            nodes.env = new Tone.Envelope({
                attack: initialSettings.attack ?? 0.1,
                decay: initialSettings.decay ?? 0.2,
                sustain: initialSettings.sustain ?? 0.5,
                release: initialSettings.release ?? 0.5,
                attackCurve: initialSettings.attackCurve || 'linear',
                decayCurve: initialSettings.decayCurve || 'exponential',
                releaseCurve: initialSettings.releaseCurve || 'exponential'
            });
            nodes.amountControl = new Tone.Multiply(initialSettings.amount ?? 0);
            nodes.env.connect(nodes.amountControl);
            modOutputs.output = nodes.amountControl;
            if (!modOutputs.output) {
                console.error("[FilterEnvManager CREATE CRITICAL] modOutputs.output is STILL NULL after assignment!");
                error = "modOutputs.output was not correctly assigned.";
            } else {
                console.log("[FilterEnvManager CREATE SUCCESS] Nodes created. env:", !!nodes.env, "amountControl:", !!nodes.amountControl, "modOutputs.output:", !!modOutputs.output);
            }
        } catch (err) {
            console.error("[FilterEnvManager CREATE ERROR]", err);
            error = `Failed to create FilterEnvelope: ${err.message}`;
            nodes = null;
            modOutputs = {};
        }
        const t1 = performance.now();
        console.log(`[FilterEnvManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        console.log(`[FilterEnvManager CREATE EXIT] Returning: error='${error}', hasNodes=${!!nodes}, hasEnv=${!!nodes?.env}, hasAmountCtrl=${!!nodes?.amountControl}, hasModOutput=${!!modOutputs?.output}`);
        return { nodes, audioInput: null, audioOutput: null, modOutputs, error };
    },

    /**
     * Updates the parameters of an existing filter envelope.
     * Modifies settings for both the Tone.Envelope (ADSR, curves) and the Tone.Multiply node (amount).
     * @param {object} nodes - An object containing the `env` (Tone.Envelope) and `amountControl` (Tone.Multiply) nodes.
     * @param {object} newSettings - An object with new settings to apply (attack, decay, sustain, release, curves, amount).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(componentData, newSettingsBundle, oldSettingsBundle) {
        const t0 = performance.now();
        if (!newSettingsBundle || !newSettingsBundle.params) {
            console.warn("[FilterEnvManager] Update called with invalid newSettingsBundle. Params missing.", { newSettingsBundle });
            return false;
        }

        const newSettings = newSettingsBundle.params;
        const isEnabledInNewPreset = newSettingsBundle.enabled === true; // Explicitly check for true
        const currentEnvNode = componentData?.nodes?.env;
        const currentAmountControlNode = componentData?.nodes?.amountControl;

        if (!currentEnvNode && isEnabledInNewPreset) {
            // Nodes don't exist, but component should be enabled: CREATE
            console.log("[FilterEnvManager] Nodes do not exist and component is enabled. Creating new Filter Env.");
            const creationResult = this.create(newSettings); // create expects params directly
            const t1_create = performance.now();
            console.log(`[FilterEnvManager] Created new Filter Env in ${(t1_create - t0).toFixed(2)}ms.`);
            return creationResult; // Returns { nodes, modOutputs, ... }
        }

        if (currentEnvNode && !isEnabledInNewPreset) {
            // Nodes exist, but component should be disabled: DISPOSE
            console.log("[FilterEnvManager] Nodes exist but component is now disabled. Disposing Filter Env.");
            this.dispose(componentData.nodes);
            const t1_dispose = performance.now();
            console.log(`[FilterEnvManager] Disposed Filter Env in ${(t1_dispose - t0).toFixed(2)}ms.`);
            return { nodes: null, audioInput: null, audioOutput: null, modOutputs: {}, error: null, effectivelyDisabled: true };
        }

        if (!currentEnvNode && !isEnabledInNewPreset) {
            // Nodes don't exist and component is disabled, do nothing.
            console.log("[FilterEnvManager] Nodes do not exist and component is disabled. No action.");
            return true;
        }

        // If nodes exist and component is enabled, update parameters
        const envNode = currentEnvNode;
        const amountControlNode = currentAmountControlNode;
        try {
            const envSettingsToUpdate = {};
            let envChanged = false;
            let amountChanged = false;

            // Envelope parameters
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
            if (newSettings.decayCurve !== undefined && envNode.decayCurve !== newSettings.decayCurve) {
                envSettingsToUpdate.decayCurve = newSettings.decayCurve;
                envChanged = true;
            }
            if (newSettings.releaseCurve !== undefined && envNode.releaseCurve !== newSettings.releaseCurve) {
                envSettingsToUpdate.releaseCurve = newSettings.releaseCurve;
                envChanged = true;
            }

            if (envChanged && Object.keys(envSettingsToUpdate).length > 0) {
                console.log("[FilterEnvManager] Updating envelope params:", envSettingsToUpdate);
                envNode.set(envSettingsToUpdate);
            }

            // Amount parameter
            if (newSettings.amount !== undefined) {
                const currentAmountVal = (amountControlNode.factor && amountControlNode.factor.value !== undefined)
                                       ? amountControlNode.factor.value
                                       : amountControlNode.value;
                if (currentAmountVal !== newSettings.amount) {
                    if (amountControlNode.factor && (amountControlNode.factor instanceof Tone.Signal || amountControlNode.factor instanceof Tone.Param)) {
                        amountControlNode.factor.value = newSettings.amount;
                    } else if (amountControlNode.hasOwnProperty('value')) {
                        amountControlNode.value = newSettings.amount;
                    } else {
                        console.warn("[FilterEnvManager] Could not set amount on amountControlNode", amountControlNode);
                    }
                    amountChanged = true;
                    console.log(`[FilterEnvManager] Updated amount to: ${newSettings.amount}`);
                }
            }

            const t1_update = performance.now();
            if (envChanged || amountChanged) {
                console.log(`[FilterEnvManager] Updated existing Filter Env in ${(t1_update - t0).toFixed(2)}ms.`);
            } else {
                console.log(`[FilterEnvManager] No Filter Env parameters changed. Duration: ${(t1_update - t0).toFixed(2)}ms.`);
            }
            return true; // Successfully updated in-place
        } catch (err) {
            console.error("[FilterEnvManager] Error in update() for existing Filter Env:", err, err.stack);
            const t1_err = performance.now();
            console.log(`[FilterEnvManager] Update error after ${(t1_err - t0).toFixed(2)}ms`);
            return false;
        }
    },

    /**
     * Connects peers in an audio chain. For a filter envelope (which is a modulator),
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
     * Enables or disables the filter envelope component.
     * For modulators like this, 'enabled' is often managed by whether it's connected to a target
     * or if its modulation `amount` is non-zero, rather than a direct enable/disable state.
     * This method logs the call but performs no direct action on the nodes.
     * @param {object} nodes - The component's nodes.
     * @param {boolean} isEnabled - The requested enabled state.
     * @returns {boolean} Always true.
     */
    enable(nodes, isEnabled) {
        console.log(`[FilterEnvManager] enable() called with state: ${isEnabled}. Effect primarily controlled by connection and amount parameter.`);
        return true;
    },

     /**
      * Triggers the attack phase of the filter envelope.
      * @param {object} nodes - An object containing the `env` (Tone.Envelope) node.
      * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to trigger the attack.
      * @returns {boolean} True if the attack was successfully triggered, false otherwise.
      */
    triggerAttack(nodes, time = Tone.now()) {
        const t0 = performance.now();
        console.log(`[FilterEnvManager] triggerAttack() called. Time: ${time}`);
        if (nodes?.env && typeof nodes.env.triggerAttack === 'function') {
            try {
                nodes.env.triggerAttack(time);
                const t1 = performance.now();
                console.log(`[FilterEnvManager] triggerAttack() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[FilterEnvManager] Error triggering attack:", e);
                try { if(nodes.env.state !== "stopped") nodes.env.triggerRelease(time); } catch (re) {}
                return false;
            }
        }
        console.warn("[FilterEnvManager] triggerAttack called, but envelope node is missing or invalid.");
        return false;
    },

    /**
     * Triggers the release phase of the filter envelope.
     * @param {object} nodes - An object containing the `env` (Tone.Envelope) node.
     * @param {Tone.Time} [time=Tone.now()] - The time (in Tone.js context) at which to trigger the release.
     * @returns {boolean} True if the release was successfully triggered, false otherwise.
     */
    triggerRelease(nodes, time = Tone.now()) {
        const t0 = performance.now();
        console.log(`[FilterEnvManager] triggerRelease() called. Time: ${time}`);
        if (nodes?.env && typeof nodes.env.triggerRelease === 'function') {
            // Логируем состояние огибающей перед вызовом
            console.log('[FilterEnvManager] env state before triggerRelease:', {
                state: nodes.env.state,
                value: nodes.env.value,
                attack: nodes.env.attack,
                decay: nodes.env.decay,
                sustain: nodes.env.sustain,
                release: nodes.env.release,
                attackCurve: nodes.env.attackCurve,
                decayCurve: nodes.env.decayCurve,
                releaseCurve: nodes.env.releaseCurve
            });
            // Анти-флуд: если triggerRelease вызывается повторно за 10мс
            if (!nodes.env._lastReleaseCall) nodes.env._lastReleaseCall = 0;
            const now = performance.now();
            if (now - nodes.env._lastReleaseCall < 10) {
                console.warn('[FilterEnvManager] triggerRelease called twice within 10ms for the same envelope!');
            }
            nodes.env._lastReleaseCall = now;
            try {
                nodes.env.triggerRelease(time);
                const t1 = performance.now();
                console.log(`[FilterEnvManager] triggerRelease() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                if (!e.message.toLowerCase().includes("cannot schedule") && !e.message.toLowerCase().includes("already triggered")) {
                    console.error("[FilterEnvManager] Error triggering release:", e);
                }
                return false;
            }
        }
        console.warn("[FilterEnvManager] triggerRelease called, but envelope node is missing or invalid.");
        return false;
    },

    /**
     * Attempts to connect a modulator source to a target parameter of this component.
     * Filter envelopes are typically modulator sources themselves, not targets for other modulators.
     * This method logs a warning and returns false.
     * @param {object} nodes - The component's nodes.
     * @param {string} targetParamPath - The path to the target parameter.
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} Always false, as filter envelopes are not typically modulated this way.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[FilterEnvManager] connectModulator called for '${targetParamPath}', but FilterEnv is a modulator source, not a target.`);
        return false;
    },

    /**
     * Attempts to disconnect a modulator source from this component.
     * Since filter envelopes are sources, this method logs a warning and returns true (as no connection was made).
     * @param {object} nodes - The component's nodes.
     * @param {string} targetParamPath - The path to the target parameter.
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} Always true.
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[FilterEnvManager] disconnectModulator called for '${targetParamPath}'. (No action as it's a source)`);
        return true;
    },

    /**
     * Disposes of the Tone.js nodes created for the filter envelope (Tone.Envelope and Tone.Multiply).
     * This is essential for freeing up audio resources.
     * @param {object} nodes - An object containing the `env` and `amountControl` nodes to be disposed.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[FilterEnvManager] dispose() called");
        if (nodes?.env) {
            try {
                nodes.env.disconnect();
                nodes.env.dispose();
                console.log("[FilterEnvManager] Envelope node disposed.");
            } catch (e) {
                console.warn("[FilterEnvManager] Error disposing env node:", e);
            }
        }
        if (nodes?.amountControl) {
            try {
                nodes.amountControl.disconnect();
                nodes.amountControl.dispose();
                console.log("[FilterEnvManager] Multiply node disposed.");
            } catch (e) {
                console.warn("[FilterEnvManager] Error disposing amountControl node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[FilterEnvManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && audioConfig.registerManager) {
    audioConfig.registerManager('filterEnvelope', filterEnvelopeManager);
} else {
    console.error("[FilterEnvManager] Unable to register manager: audioConfig or registerManager function not found.");
}