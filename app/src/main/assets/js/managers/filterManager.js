// Файл: app/src/main/assets/js/managers/filterManager.js
// Менеджер для управления основным фильтром голоса (Tone.Filter)

const filterManager = {
    /**
     * Создает узел Tone.Filter.
     * @param {object} [initialSettings={}] - Начальные настройки фильтра из пресета.
     * @returns {object} - Объект { nodes: { filter: Tone.Filter }, audioInput: Tone.Filter, audioOutput: Tone.Filter, modInputs: { frequency, detune, Q, gain }, error: string | null }
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
     * Обновляет параметры фильтра.
     * @param {object} nodes - Объект узлов { filter }.
     * @param {object} newSettings - Новые настройки { frequency, Q, type, rolloff, gain }.
     * @returns {boolean} - true при успехе.
     */
    update(nodes, newSettings) {
        const t0 = performance.now();
        console.log("[FilterManager] update() called with:", newSettings);
        if (!nodes || !nodes.filter || !newSettings) {
            console.warn("[FilterManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const filterNode = nodes.filter;
        try {
            if (newSettings.frequency !== undefined && filterNode.frequency instanceof Tone.Param) {
                filterNode.frequency.rampTo(newSettings.frequency, 0.02);
            }
            if (newSettings.Q !== undefined && filterNode.Q instanceof Tone.Param) {
                filterNode.Q.rampTo(newSettings.Q, 0.02);
            }
            if (newSettings.gain !== undefined && filterNode.gain instanceof Tone.Param) {
                filterNode.gain.rampTo(newSettings.gain, 0.02);
            }
            if (newSettings.type !== undefined) {
                const validTypes = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'notch', 'allpass', 'peaking'];
                if (validTypes.includes(newSettings.type)) {
                    filterNode.type = newSettings.type;
                } else {
                    console.warn(`[FilterManager] Invalid filter type '${newSettings.type}' ignored.`);
                }
            }
            if (newSettings.rolloff !== undefined) {
                const validRolloffs = [-12, -24, -48, -96];
                if (validRolloffs.includes(newSettings.rolloff)) {
                    filterNode.rolloff = newSettings.rolloff;
                } else {
                    console.warn(`[FilterManager] Invalid filter rolloff '${newSettings.rolloff}' ignored.`);
                }
            }
            console.log("[FilterManager] update() finished.");
            const t1 = performance.now();
            console.log(`[FilterManager] update() duration: ${(t1-t0).toFixed(2)}ms`);
            return true;
        } catch (err) {
            console.error("[FilterManager] Error in update():", err);
            return false;
        }
    },

    /**
     * Соединяет фильтр с соседями по цепочке.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Основной фильтр обычно не имеет состояния enable/bypass.
     */
    enable(nodes, isEnabled) {
        console.log(`[FilterManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Подключает модулятор к параметру фильтра.
     * @param {object} nodes - Узлы этого компонента (должен содержать nodes.filter).
     * @param {string} targetParamPath - Имя целевого параметра ('frequency', 'Q', 'gain', 'detune').
     * @param {Tone.OutputNode} sourceNode - Выходной узел модулятора.
     * @returns {boolean} - true при успехе.
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
     * Отключает модулятор от параметра фильтра.
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
     * Уничтожает узел фильтра.
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