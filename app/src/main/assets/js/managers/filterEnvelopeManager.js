// Файл: app/src/main/assets/js/managers/filterEnvelopeManager.js
// Менеджер для огибающей фильтра (Filter Envelope)

const filterEnvelopeManager = {
    isOptional: true, // Это опциональный компонент

    /**
     * Создает узлы Tone.Envelope и Tone.Multiply для управления параметрами фильтра.
     * @param {object} [initialSettings={}] - Начальные настройки из пресета (секция filterEnvelope.params).
     * @returns {object} - Объект вида:
     * {
     *   nodes: { env: Tone.Envelope, amountControl: Tone.Multiply } | null,
     *   audioInput: null, // Модуляторы обычно не имеют аудио входа/выхода
     *   audioOutput: null,
     *   modOutputs: { output: Tone.Multiply } | {}, // Выход, уже масштабированный по amount
     *   error: string | null
     * }
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
     * Обновляет параметры огибающей и amount.
     * @param {object} nodes - Объект узлов (nodes.env, nodes.amountControl).
     * @param {object} newSettings - Новые настройки.
     * @returns {boolean} - true при успехе.
     */
    update(nodes, newSettings) {
        const t0 = performance.now();
        console.log("[FilterEnvManager] update() called with:", newSettings);
        if (!nodes?.env || !nodes?.amountControl) {
            console.warn("[FilterEnvManager] Update called with invalid nodes.", nodes);
            return false;
        }
        try {
            const envParamsToSet = {};
            if (newSettings.attack !== undefined) envParamsToSet.attack = newSettings.attack;
            if (newSettings.decay !== undefined) envParamsToSet.decay = newSettings.decay;
            if (newSettings.sustain !== undefined) envParamsToSet.sustain = newSettings.sustain;
            if (newSettings.release !== undefined) envParamsToSet.release = newSettings.release;
            if (newSettings.attackCurve !== undefined) envParamsToSet.attackCurve = newSettings.attackCurve;
            if (newSettings.decayCurve !== undefined) envParamsToSet.decayCurve = newSettings.decayCurve;
            if (newSettings.releaseCurve !== undefined) envParamsToSet.releaseCurve = newSettings.releaseCurve;
            if (Object.keys(envParamsToSet).length > 0) {
                nodes.env.set(envParamsToSet);
            }
            if (newSettings.amount !== undefined && nodes.amountControl.factor instanceof Tone.Signal) {
                nodes.amountControl.factor.value = newSettings.amount;
            } else if (newSettings.amount !== undefined) {
                nodes.amountControl.value = newSettings.amount;
            }
            console.log("[FilterEnvManager] update() finished.");
            const t1 = performance.now();
            console.log(`[FilterEnvManager] update() duration: ${(t1-t0).toFixed(2)}ms`);
            return true;
        } catch (err) {
            console.error("[FilterEnvManager] Error in update():", err);
            return false;
        }
    },

    /** Filter Envelope не участвует в основной аудио цепочке */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },

    /**
     * Включение/выключение (обычно управляется подключением/amount).
     * @param {object} nodes - Узлы компонента.
     * @param {boolean} isEnabled - Новое состояние.
     * @returns {boolean} - true.
     */
    enable(nodes, isEnabled) {
        console.log(`[FilterEnvManager] enable() called with state: ${isEnabled}. Effect primarily controlled by connection and amount parameter.`);
        return true;
    },

     /** Запуск атаки огибающей */
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

    /** Запуск затухания огибающей */
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

    /** FilterEnv является источником модуляции, а не целью */
    connectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[FilterEnvManager] connectModulator called for '${targetParamPath}', but FilterEnv is a modulator source, not a target.`);
        return false;
    },

    disconnectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[FilterEnvManager] disconnectModulator called for '${targetParamPath}'. (No action as it's a source)`);
        return true;
    },

    /** Освобождает ресурсы */
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