// Файл: app/src/main/assets/js/managers/outputGainManager.js
// Менеджер для управления выходным гейном голоса (Tone.Gain)

const outputGainManager = {
    /**
     * Создает узел Tone.Gain для выходной громкости голоса.
     * @param {object} [initialSettings={ gain: 0 }] - Начальные настройки (обычно гейн = 0).
     * @returns {object} - Объект { nodes: { gainNode: Tone.Gain }, audioInput: Tone.Gain, audioOutput: Tone.Gain, modInputs: { gain }, error: string | null }
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
     * Обновляет параметр gain выходного узла.
     * @param {object} nodes - Объект узлов { gainNode }.
     * @param {object} newSettings - Новые настройки { gain }.
     * @returns {boolean} - true при успехе.
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
                gainNode.gain.rampTo(newSettings.gain, 0.02);
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
     * Соединяет выходной гейн с соседями по цепочке.
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
     * Выходной гейн не имеет состояния enable/bypass.
     */
    enable(nodes, isEnabled) {
        console.log(`[OutputGainManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Подключает модулятор к параметру gain (если нужно).
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.connectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Отключает модулятор от параметра gain.
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.disconnectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Уничтожает узел гейна.
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