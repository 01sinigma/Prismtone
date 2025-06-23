/**
 * @file voiceFxSlotManager.js
 * @description
 * This manager acts as a placeholder or a very basic handler for a voice-level FX slot.
 * In its current implementation, it primarily provides a bypass path using a `Tone.Gain` node.
 * It's structured to be potentially expanded into a more complex FX slot manager that could host
 * various insert effects for an individual synthesizer voice.
 * The `isOptional: true` flag suggests it might not always be active or present in every voice configuration.
 */

const voiceFxSlotManager = {
    isOptional: true,
    /**
     * Creates the necessary Tone.js nodes for the voice FX slot.
     * In this basic implementation, it creates a single `Tone.Gain` node that acts as a bypass.
     * The node is temporarily connected to `Tone.Destination` to prevent errors if not immediately connected
     * into an audio chain, though this connection would typically be overridden by `connectPeers`.
     *
     * @returns {{nodes: {bypass: Tone.Gain}, audioInput: Tone.Gain, audioOutput: Tone.Gain, error: string|null}}
     *          An object containing:
     *          - `nodes`: An object with a `bypass` property referencing the created `Tone.Gain` node.
     *          - `audioInput`: The input of the `bypass` gain node.
     *          - `audioOutput`: The output of the `bypass` gain node.
     *          - `error`: Always `null` in this simple implementation.
     */
    create() {
        const bypassNode = new Tone.Gain(1).toDestination(); // Временно в toDestination, чтобы не было ошибок
        return {
            nodes: { bypass: bypassNode },
            audioInput: bypassNode,
            audioOutput: bypassNode,
            error: null
        };
    },
    /**
     * Updates parameters for the voice FX slot.
     * In this basic implementation, this method does nothing and always returns `true`.
     * It's a placeholder for future functionality where FX parameters might be updated.
     *
     * @returns {boolean} Always `true`.
     */
    update() { return true; },
    /**
     * Connects the voice FX slot (currently a bypass gain node) into an audio chain.
     * It connects the `prevOutputNode` to the input of the bypass node, and the output
     * of the bypass node to the `nextInputNode`.
     *
     * @param {object} nodes - An object containing `nodes.bypass` (the `Tone.Gain` node).
     * @param {Tone.OutputNode|null} prevOutputNode - The audio output of the preceding component in the chain.
     * @param {Tone.InputNode|null} nextInputNode - The audio input of the succeeding component in the chain.
     * @returns {boolean} `true` if connections were successfully made, `false` if essential nodes are missing.
     */
    connectPeers(nodes, prev, next) {
        if (nodes?.bypass && prev && next) {
            prev.connect(nodes.bypass);
            nodes.bypass.connect(next);
            return true;
        }
        return false; // Или true если некритично
     },
    /**
     * Enables or disables the voice FX slot.
     * In this basic implementation, this method does nothing and always returns `true`.
     * The actual effect is managed by the passthrough nature of the bypass node.
     *
     * @returns {boolean} Always `true`.
     */
    enable() { return true; },
    /**
     * Disposes of the Tone.js nodes created for this FX slot (the bypass gain node).
     *
     * @param {object} nodes - An object containing `nodes.bypass` (the `Tone.Gain` node to be disposed).
     */
    dispose(nodes) { if (nodes?.bypass) nodes.bypass.dispose(); },
    /**
     * Connects a modulator source to a parameter of this FX slot.
     * In this basic implementation, it does nothing and returns `false` as no modulatable parameters are exposed.
     *
     * @returns {boolean} Always `false`.
     */
    connectModulator() { return false; },
    /**
     * Disconnects a modulator source from a parameter of this FX slot.
     * In this basic implementation, it does nothing and returns `true` (as if disconnection was successful or not needed).
     *
     * @returns {boolean} Always `true`.
     */
    disconnectModulator() { return true; }
};
// Регистрация менеджера, если она не в audioConfig.js
// if (typeof audioConfig !== 'undefined') audioConfig.registerManager('VOICE_INSERT_FX_SLOT', voiceFxSlotManager);