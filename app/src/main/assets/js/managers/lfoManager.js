// Файл: app/src/main/assets/js/managers/lfoManager.js
// Менеджер для LFO (Low Frequency Oscillator)

const lfoManager = {
    isOptional: true,

    /**
     * Создает LFO и узел для управления глубиной модуляции.
     * @param {object} initialSettings - { type, rate, depth (0-1), phase, (target - не используется здесь) }
     * @returns {object} - { nodes: { lfo, depthControl }, modOutputs: { output: depthControlOutput } ... }
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[LFOManager] create() called with:", initialSettings);
        let nodes = { lfo: null, depth: null };
        let modOutputs = { output: null };
        let error = null;
        try {
            console.log("[LFOManager] Creating Tone.LFO and Tone.Multiply...");
            nodes.lfo = new Tone.LFO({
                frequency: initialSettings.frequency ?? 5,
                min: -1,
                max: 1,
                type: initialSettings.type || 'sine',
                phase: initialSettings.phase || 0,
            });
            nodes.depth = new Tone.Multiply(initialSettings.depth ?? 0.01); // Малый диапазон по умолчанию
            nodes.lfo.connect(nodes.depth);
            modOutputs.output = nodes.depth;
            console.log("[LFOManager] create() finished.");
        } catch (err) {
            console.error("[LFOManager] Error in create():", err);
            error = `Failed to create LFO: ${err.message}`;
            nodes = null;
            modOutputs = {};
        }
        const t1 = performance.now();
        console.log(`[LFOManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput: null, audioOutput: null, modOutputs, error };
    },

    update(nodes, newSettings) {
        if (!nodes?.lfo || !nodes?.depth) {
            console.warn("[LFOManager] Update called with invalid nodes.", nodes);
            return false;
        }
        try {
            const lfoNode = nodes.lfo;
            const depthNode = nodes.depth;

            const lfoPropsToSet = {};
            if (newSettings.frequency !== undefined) lfoPropsToSet.frequency = newSettings.frequency;
            if (newSettings.type !== undefined) lfoPropsToSet.type = newSettings.type;
            if (newSettings.phase !== undefined) lfoPropsToSet.phase = newSettings.phase;

            if (Object.keys(lfoPropsToSet).length > 0) {
                lfoNode.set(lfoPropsToSet);
            }

            if (newSettings.depth !== undefined) {
                if (depthNode.factor && (depthNode.factor instanceof Tone.Signal || depthNode.factor instanceof Tone.Param)) {
                    depthNode.factor.value = newSettings.depth;
                } else {
                    console.warn("[LFOManager] depthNode.factor is not a Signal or Param. Depth not set for LFO.");
                }
            }
            return true;
        } catch (err) {
            console.error("[LFOManager] Error in update():", err);
            return false;
        }
    },

    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },

    /**
     * Включает/выключает LFO.
     * @param {object} nodes - Узлы компонента.
     * @param {boolean} isEnabled - Новое состояние.
     * @param {object} [options={}] - Доп. опции, например { retrigger: true }
     * @returns {boolean} - true при успехе.
     */
    enable(nodes, isEnabled) {
        console.log(`[LFOManager] enable() called with state: ${isEnabled}.`);
        if (nodes?.lfo) {
            if (isEnabled) nodes.lfo.start();
            else nodes.lfo.stop();
        }
        return true;
    },

    triggerAttack(nodes, time) {
        const t0 = performance.now();
        console.log(`[LFOManager] triggerAttack() called. Time: ${time}`);
        if (nodes?.lfo) {
            try {
                nodes.lfo.start(time);
                const t1 = performance.now();
                console.log(`[LFOManager] triggerAttack() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[LFOManager] Error triggering LFO start:", e);
                return false;
            }
        }
        return false;
    },

    triggerRelease(nodes, time) {
        const t0 = performance.now();
        console.log(`[LFOManager] triggerRelease() called. Time: ${time}`);
        if (nodes?.lfo) {
            try {
                nodes.lfo.stop(time);
                const t1 = performance.now();
                console.log(`[LFOManager] triggerRelease() duration: ${(t1-t0).toFixed(2)}ms`);
                return true;
            } catch (e) {
                console.error("[LFOManager] Error triggering LFO stop:", e);
                return false;
            }
        }
        return false;
    },

    dispose(nodes) {
        const t0 = performance.now();
        console.log("[LFOManager] dispose() called");
        if (nodes?.lfo) {
            try {
                nodes.lfo.disconnect();
                nodes.lfo.dispose();
                console.log("[LFOManager] LFO node disposed.");
            } catch (e) {
                console.warn("[LFOManager] Error disposing LFO node:", e);
            }
        }
        if (nodes?.depth) {
            try {
                nodes.depth.disconnect();
                nodes.depth.dispose();
                console.log("[LFOManager] Multiply node disposed.");
            } catch (e) {
                console.warn("[LFOManager] Error disposing Multiply node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[LFOManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('lfo1', lfoManager);
} else {
    console.error("[LFOManager] audioConfig or audioConfig.registerManager is not available.");
}