// Файл: app/src/main/assets/js/managers/ampEnvManager.js
// Менеджер для управления огибающей амплитуды (Tone.AmplitudeEnvelope)

const ampEnvManager = {
    /**
     * Создает узел Tone.AmplitudeEnvelope.
     * @param {object} [initialSettings={}] - Начальные настройки огибающей из пресета.
     * @returns {object} - Объект { nodes: { envelope: Tone.AmplitudeEnvelope }, audioInput: Tone.AmplitudeEnvelope, audioOutput: Tone.AmplitudeEnvelope, error: string | null }
     */
    create(initialSettings = {}) {
        const t0 = performance.now();
        console.log("[AmpEnvManager] create() called with:", initialSettings);
        let nodes = { envelope: null };
        let audioInput = null;
        let audioOutput = null;
        let error = null;
        try {
            const settings = {
                attack: initialSettings.attack ?? 0.01,
                decay: initialSettings.decay ?? 0.1,
                sustain: initialSettings.sustain ?? 0.7,
                release: initialSettings.release ?? 0.5,
                attackCurve: initialSettings.attackCurve || 'linear',
                decayCurve: initialSettings.decayCurve || 'exponential',
                releaseCurve: initialSettings.releaseCurve || 'exponential'
            };
            console.log("[AmpEnvManager] Creating Tone.AmplitudeEnvelope with:", settings);
            const envelope = new Tone.AmplitudeEnvelope(settings);
            nodes.envelope = envelope;
            audioInput = envelope;
            audioOutput = envelope;
            console.log("[AmpEnvManager] create() finished.");
        } catch (err) {
            console.error("[AmpEnvManager] Error in create():", err);
            error = `Failed to create AmplitudeEnvelope: ${err.message}`;
            nodes = null;
            audioInput = null;
            audioOutput = null;
        }
        const t1 = performance.now();
        console.log(`[AmpEnvManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    /**
     * Обновляет параметры огибающей амплитуды.
     * @param {object} nodes - Объект узлов { envelope }.
     * @param {object} newSettings - Новые настройки { attack, decay, sustain, release, attackCurve, decayCurve, releaseCurve }.
     * @returns {boolean} - true при успехе.
     */
    update(nodes, newSettings) {
        const t0 = performance.now();
        console.log("[AmpEnvManager] update() called with:", newSettings);
        if (!nodes || !nodes.envelope || !newSettings) {
            console.warn("[AmpEnvManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const envelope = nodes.envelope;
        try {
            if (newSettings.attack !== undefined) envelope.attack = newSettings.attack;
            if (newSettings.decay !== undefined) envelope.decay = newSettings.decay;
            if (newSettings.sustain !== undefined) envelope.sustain = newSettings.sustain;
            if (newSettings.release !== undefined) envelope.release = newSettings.release;
            if (newSettings.attackCurve !== undefined) envelope.attackCurve = newSettings.attackCurve;
            if (newSettings.decayCurve !== undefined) envelope.decayCurve = newSettings.decayCurve;
            if (newSettings.releaseCurve !== undefined) envelope.releaseCurve = newSettings.releaseCurve;
            console.log("[AmpEnvManager] update() finished.");
            const t1 = performance.now();
            console.log(`[AmpEnvManager] update() duration: ${(t1-t0).toFixed(2)}ms`);
            return true;
        } catch (err) {
            console.error("[AmpEnvManager] Error in update():", err);
            return false;
        }
    },

    /**
     * Соединяет огибающую с соседями по цепочке.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Огибающая амплитуды не имеет состояния enable/bypass.
     */
    enable(nodes, isEnabled) {
        console.log(`[AmpEnvManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Огибающая амплитуды обычно не является целью модуляции.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[AmpEnvManager] connectModulator called for '${targetParamPath}', but AmpEnv is not typically modulated.`);
        // Можно добавить поддержку модуляции attack/decay/sustain/release, если нужно,
        // но они не являются Tone.Param или Tone.Signal по умолчанию.
        return false; // Возвращаем false, т.к. не поддерживается
    },

    /**
     * Отключение модулятора (неприменимо).
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[AmpEnvManager] disconnectModulator called for '${targetParamPath}'.`);
        return true; // Возвращаем true, т.к. подключения и не было
    },

    /**
     * Уничтожает узел огибающей.
     */
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[AmpEnvManager] dispose() called");
        if (nodes && nodes.envelope) {
            try {
                nodes.envelope.disconnect();
                nodes.envelope.dispose();
                console.log("[AmpEnvManager] Envelope node disposed.");
            } catch (e) {
                console.warn("[AmpEnvManager] Error disposing envelope node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[AmpEnvManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    },

    // --- Специфичные методы для AmpEnv ---

    /**
     * Запускает фазу атаки огибающей.
     * @param {object} nodes - Узлы компонента { envelope }.
     * @param {Tone.Time} [time=Tone.now()] - Время запуска.
     * @param {number} [velocity=1] - Громкость атаки (0-1).
     */
    triggerAttack(nodes, time = Tone.now(), velocity = 1) {
        const t0 = performance.now();
        console.log(`[AmpEnvManager] triggerAttack() called. Time: ${time}, Velocity: ${velocity}`);
        if (!nodes || !nodes.envelope) {
            console.warn("[AmpEnvManager] triggerAttack called, but envelope node is missing.");
            return;
        }
        try {
            nodes.envelope.triggerAttack(time, velocity);
        } catch (e) {
            console.error("[AmpEnvManager] Error in triggerAttack():", e);
            try { nodes.envelope.triggerRelease(time); } catch (re) {}
        }
        const t1 = performance.now();
        console.log(`[AmpEnvManager] triggerAttack() duration: ${(t1-t0).toFixed(2)}ms`);
    },

    /**
     * Запускает фазу затухания огибающей.
     * @param {object} nodes - Узлы компонента { envelope }.
     * @param {Tone.Time} [time=Tone.now()] - Время запуска затухания.
     */
    triggerRelease(nodes, time = Tone.now()) {
        const t0 = performance.now();
        console.log(`[AmpEnvManager] triggerRelease() called. Time: ${time}`);
        if (!nodes || !nodes.envelope) {
            console.warn("[AmpEnvManager] triggerRelease called, but envelope node is missing.");
            return;
        }
        try {
            nodes.envelope.triggerRelease(time);
        } catch (e) {
            if (e.message.includes("cannot schedule triggerRelease") || e.message.includes("already triggered release")) {
                console.warn(`[AmpEnvManager] Warning during triggerRelease (likely safe to ignore): ${e.message}`);
            } else {
                console.error("[AmpEnvManager] Error in triggerRelease():", e);
            }
        }
        const t1 = performance.now();
        console.log(`[AmpEnvManager] triggerRelease() duration: ${(t1-t0).toFixed(2)}ms`);
    }
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('amplitudeEnv', ampEnvManager); // Используем ID 'amplitudeEnv'
} else {
    console.error("[AmpEnvManager] audioConfig or audioConfig.registerManager is not available.");
}