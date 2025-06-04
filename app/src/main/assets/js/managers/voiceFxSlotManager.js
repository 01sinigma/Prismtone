const voiceFxSlotManager = {
    isOptional: true,
    create() {
        const bypassNode = new Tone.Gain(1).toDestination(); // Временно в toDestination, чтобы не было ошибок
        return {
            nodes: { bypass: bypassNode },
            audioInput: bypassNode,
            audioOutput: bypassNode,
            error: null
        };
    },
    update() { return true; },
    connectPeers(nodes, prev, next) {
        if (nodes?.bypass && prev && next) {
            prev.connect(nodes.bypass);
            nodes.bypass.connect(next);
            return true;
        }
        return false; // Или true если некритично
     },
    enable() { return true; },
    dispose(nodes) { if (nodes?.bypass) nodes.bypass.dispose(); },
    connectModulator() { return false; },
    disconnectModulator() { return true; }
};
// Регистрация менеджера, если она не в audioConfig.js
// if (typeof audioConfig !== 'undefined') audioConfig.registerManager('VOICE_INSERT_FX_SLOT', voiceFxSlotManager);