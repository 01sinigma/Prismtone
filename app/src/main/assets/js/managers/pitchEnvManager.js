// Файл: app/src/main/assets/js/managers/pitchEnvManager.js
// Менеджер для огибающей высоты тона (Pitch Envelope)

const pitchEnvManager = {
    isOptional: true, // Это опциональный компонент

    /**
     * Создает узлы Tone.Envelope и Tone.Multiply для управления питчем.
     * @param {object} initialSettings - Настройки из пресета (секция pitchEnvelope).
     * @returns {object} - { nodes: object|null, audioInput: null, audioOutput: null, modOutputs?: object, error: string|null }
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
     * Обновляет параметры огибающей и amount.
     * @param {object} nodes - Объект узлов (nodes.env, nodes.amount).
     * @param {object} newSettings - Новые настройки.
     * @returns {boolean} - true при успехе.
     */
    update(nodes, newSettings) {
        if (!nodes?.env || !nodes?.amount) {
            console.warn("[PitchEnvManager] Update called with invalid nodes.", nodes);
            return false;
        }
        try {
            const envSettings = {};
            if (newSettings.attack !== undefined) envSettings.attack = newSettings.attack;
            if (newSettings.decay !== undefined) envSettings.decay = newSettings.decay;
            if (newSettings.sustain !== undefined) envSettings.sustain = newSettings.sustain;
            if (newSettings.release !== undefined) envSettings.release = newSettings.release;
            if (newSettings.attackCurve !== undefined) envSettings.attackCurve = newSettings.attackCurve;
            // decayCurve and releaseCurve are not directly settable on Tone.Envelope via .set like this.
            // They are usually set at construction or by replacing the curve property if available.

            if (Object.keys(envSettings).length > 0) {
                nodes.env.set(envSettings);
            }

            if (newSettings.amount !== undefined) {
                // Check if nodes.amount.factor exists and is a Tone.Signal or Tone.Param
                if (nodes.amount.factor && (nodes.amount.factor instanceof Tone.Signal || nodes.amount.factor instanceof Tone.Param)) {
                    nodes.amount.factor.value = newSettings.amount;
                } else if (nodes.amount.hasOwnProperty('value')) {
                    // Fallback for nodes where 'value' is a direct property (e.g., if it's not a Signal/Param wrapper)
                    nodes.amount.value = newSettings.amount; 
                } else {
                    console.warn("[PitchEnvManager] Could not set amount on nodes.amount", nodes.amount);
                }
            }
            return true;
        } catch (err) {
            console.error("[PitchEnvManager] Error in update():", err);
            return false;
        }
    },

    /** Pitch Env не участвует в основной аудио цепочке */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },

    /**
     * Включает/выключает эффект огибающей.
     * В данной реализации это управляется подключением/отключением к цели (detune) в voiceBuilder/synth.
     * Этот метод может быть пустым или управлять внутренним состоянием, если нужно.
     * @param {object} nodes - Узлы компонента.
     * @param {boolean} isEnabled - Новое состояние.
     * @returns {boolean} - true.
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

     /** Запуск атаки огибающей */
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

    /** Запуск затухания огибающей */
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

    /** Освобождает ресурсы */
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