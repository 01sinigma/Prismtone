/**
 * @file ampEnvManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling
 * a Tone.AmplitudeEnvelope node, which shapes the overall loudness of a synth voice.
 * It handles the envelope's lifecycle (attack, decay, sustain, release) and allows
 * for dynamic updates to its parameters based on sound presets.
 */

// Файл: app/src/main/assets/js/managers/ampEnvManager.js
// Менеджер для управления огибающей амплитуды (Tone.AmplitudeEnvelope)

const ampEnvManager = {
    /**
     * Создает узел Tone.AmplitudeEnvelope.
     * @param {object} [initialSettings={}] - Начальные настройки из пресета.
     * @param {number} [initialSettings.attack=0.01] - Время атаки в секундах.
     * @param {number} [initialSettings.decay=0.1] - Время спада в секундах.
     * @param {number} [initialSettings.sustain=0.7] - Уровень поддержки (0-1).
     * @param {number} [initialSettings.release=0.5] - Время затухания в секундах.
     * @param {string} [initialSettings.attackCurve='linear'] - Тип кривой для атаки.
     * @param {string} [initialSettings.decayCurve='exponential'] - Тип кривой для спада.
     * @param {string} [initialSettings.releaseCurve='exponential'] - Тип кривой для затухания.
     * @returns {{nodes: {envelope: Tone.AmplitudeEnvelope}|null, audioInput: Tone.AmplitudeEnvelope|null, audioOutput: Tone.AmplitudeEnvelope|null, modInputs: object, modOutputs: object, error: string|null}}
     *          Объект, содержащий созданный узел `envelope`, точки входа/выхода аудио, пустые объекты для входов/выходов модуляции (т.к. AmpEnv обычно не модулируется и не модулирует), и сообщение об ошибке (null при успехе).
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
     * Обновляет параметры существующего узла Tone.AmplitudeEnvelope.
     * @param {object} nodes - Объект узлов, содержащий `nodes.envelope` (экземпляр Tone.AmplitudeEnvelope).
     * @param {object} newSettings - Объект с новыми настройками для обновления (attack, decay, sustain, release, attackCurve, decayCurve, releaseCurve).
     * @returns {boolean} True, если обновление прошло успешно, иначе false.
     */
    update(nodes, newSettings) {
        if (!nodes || !nodes.envelope || !newSettings) {
            console.warn("[AmpEnvManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        try {
            // >>> НАЧАЛО ИЗМЕНЕНИЙ (Оптимизация) <<<
            // Используем метод .set() для пакетного обновления параметров
            const settingsToUpdate = {};
            if (newSettings.attack !== undefined) settingsToUpdate.attack = newSettings.attack;
            if (newSettings.decay !== undefined) settingsToUpdate.decay = newSettings.decay;
            if (newSettings.sustain !== undefined) settingsToUpdate.sustain = newSettings.sustain;
            if (newSettings.release !== undefined) settingsToUpdate.release = newSettings.release;
            if (newSettings.attackCurve !== undefined) settingsToUpdate.attackCurve = newSettings.attackCurve;
            if (newSettings.decayCurve !== undefined) settingsToUpdate.decayCurve = newSettings.decayCurve;
            if (newSettings.releaseCurve !== undefined) settingsToUpdate.releaseCurve = newSettings.releaseCurve;

            if (Object.keys(settingsToUpdate).length > 0) {
                nodes.envelope.set(settingsToUpdate);
            }
            // >>> КОНЕЦ ИЗМЕНЕНИЙ <<<
            return true;
        } catch (err) {
            console.error("[AmpEnvManager] Error in update():", err);
            return false;
        }
    },

    /**
     * Соединяет вход и выход огибающей амплитуды с предыдущим и следующим узлами в аудиоцепочке.
     * Так как Tone.AmplitudeEnvelope является и входом, и выходом для аудиосигнала,
     * этот метод делегирует логику стандартному `blankManager.connectPeers`.
     * @param {object} nodes - Объект узлов, содержащий `nodes.envelope`.
     * @param {Tone.AudioNode|null} prevOutputNode - Аудиовыход предыдущего компонента.
     * @param {Tone.AudioNode|null} nextInputNode - Аудиовход следующего компонента.
     * @returns {boolean} Результат вызова `blankManager.connectPeers`.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Включает или выключает компонент. Для Tone.AmplitudeEnvelope это действие не применимо,
     * так как он всегда активен и его работа управляется через triggerAttack/triggerRelease.
     * @param {object} nodes - Объект узлов.
     * @param {boolean} isEnabled - Запрошенное состояние (игнорируется).
     * @returns {boolean} Всегда true.
     */
    enable(nodes, isEnabled) {
        console.log(`[AmpEnvManager] enable() called with ${isEnabled} (no action needed).`);
        return true;
    },

    /**
     * Подключает модулятор к параметру этого компонента.
     * Огибающая амплитуды обычно не является целью прямой модуляции своих основных параметров ADSR,
     * так как они не являются экземплярами Tone.Param или Tone.Signal.
     * @param {object} nodes - Объект узлов.
     * @param {string} targetParamPath - Путь к целевому параметру (игнорируется).
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - Исходный узел модулятора (игнорируется).
     * @returns {boolean} Всегда false, так как модуляция не поддерживается.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[AmpEnvManager] connectModulator called for '${targetParamPath}', but AmpEnv is not typically modulated.`);
        // Можно добавить поддержку модуляции attack/decay/sustain/release, если нужно,
        // но они не являются Tone.Param или Tone.Signal по умолчанию.
        return false; // Возвращаем false, т.к. не поддерживается
    },

    /**
     * Отключает модулятор от параметра этого компонента.
     * Так как подключение не поддерживается, этот метод просто регистрирует вызов.
     * @param {object} nodes - Объект узлов.
     * @param {string} targetParamPath - Путь к целевому параметру (игнорируется).
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - Исходный узел модулятора (игнорируется).
     * @returns {boolean} Всегда true.
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        console.warn(`[AmpEnvManager] disconnectModulator called for '${targetParamPath}'.`);
        return true; // Возвращаем true, т.к. подключения и не было
    },

    /**
     * Уничтожает узел Tone.AmplitudeEnvelope и отключает его от аудиографа.
     * @param {object} nodes - Объект узлов, содержащий `nodes.envelope`.
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
     * Запускает фазу атаки (attack) и затем спада (decay) огибающей амплитуды.
     * @param {object} nodes - Объект узлов, содержащий `nodes.envelope`.
     * @param {Tone.Time} [time=Tone.now()] - Время в звуковом контексте Tone.js, когда должна начаться атака.
     * @param {number} [velocity=1] - Нормализованное значение громкости (0-1), до которого нарастает сигнал во время атаки.
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
     * Запускает фазу затухания (release) огибающей амплитуды.
     * @param {object} nodes - Объект узлов, содержащий `nodes.envelope`.
     * @param {Tone.Time} [time=Tone.now()] - Время в звуковом контексте Tone.js, когда должно начаться затухание.
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