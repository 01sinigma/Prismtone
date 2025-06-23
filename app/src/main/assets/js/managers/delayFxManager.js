/**
 * @file delayFxManager.js
 * @description
 * This manager is responsible for creating, configuring, and controlling a Tone.FeedbackDelay effect node.
 * It handles parameters like delay time, feedback amount, and wet/dry mix, allowing for dynamic
 * echo and delay effects within an audio chain.
 */

// Файл: app/src/main/assets/js/managers/delayFxManager.js
const delayFxManager = {
    /**
     * Creates a new Tone.FeedbackDelay effect node.
     * @param {object} [initialSettings={}] - Initial settings for the delay effect.
     * @param {Tone.Time} [initialSettings.delayTime=0.25] - The delay time.
     * @param {number} [initialSettings.feedback=0.3] - The amount of feedback (0-1).
     * @param {number} [initialSettings.wet=0.0] - The wet/dry mix of the effect (0 for dry, 1 for wet).
     * @param {number} [initialSettings.maxDelay=1] - The maximum delay time in seconds.
     * @returns {{nodes: {delayNode: Tone.FeedbackDelay}|null, audioInput: Tone.FeedbackDelay|null, audioOutput: Tone.FeedbackDelay|null, modInputs: object, modOutputs: object, error: string|null}}
     *          An object containing the created `delayNode`, audio input/output references, empty modulator I/O, and an error message (null on success).
     */
    create(initialSettings = {}) {
        console.log("[DelayFxManager] Creating FeedbackDelay with settings:", initialSettings);
        let nodes = {
            delayNode: null
        };
        let audioInput = null;
        let audioOutput = null;
        let error = null;

        try {
            const settings = {
                delayTime: initialSettings.delayTime ?? 0.25,
                feedback: initialSettings.feedback ?? 0.3,
                wet: initialSettings.wet ?? 0.0, // По умолчанию инсертный эффект может быть выключен (wet=0) или полностью включен (wet=1)
                maxDelay: initialSettings.maxDelay || 1 // Максимальное время задержки
            };

            const delayNode = new Tone.FeedbackDelay(settings);
            nodes.delayNode = delayNode;
            audioInput = delayNode;
            audioOutput = delayNode;

            console.log("[DelayFxManager] FeedbackDelay node created successfully.");

        } catch (err) {
            console.error("[DelayFxManager] Error creating FeedbackDelay node:", err);
            error = `Failed to create FeedbackDelay: ${err.message}`;
            nodes = null; // Обнуляем узлы при ошибке
        }

        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    /**
     * Updates the parameters of an existing Tone.FeedbackDelay node.
     * @param {object} nodes - An object containing the `delayNode` (the Tone.FeedbackDelay instance).
     * @param {object} newSettings - An object with the new settings to apply (delayTime, feedback, wet).
     * @returns {boolean} True if the update was successful, false otherwise.
     */
    update(nodes, newSettings) {
        if (!nodes || !nodes.delayNode || !newSettings) {
            console.warn("[DelayFxManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const delayNode = nodes.delayNode;
        // console.log("[DelayFxManager] Updating FeedbackDelay with:", newSettings); // Менее подробный лог

        try {
            if (newSettings.delayTime !== undefined && delayNode.delayTime instanceof Tone.Param) {
                delayNode.delayTime.rampTo(newSettings.delayTime, 0.02);
            }
            if (newSettings.feedback !== undefined && delayNode.feedback instanceof Tone.Param) {
                delayNode.feedback.rampTo(newSettings.feedback, 0.02);
            }
            if (newSettings.wet !== undefined && delayNode.wet instanceof Tone.Param) {
                delayNode.wet.rampTo(newSettings.wet, 0.02);
            }
            return true;
        } catch (err) {
            console.error("[DelayFxManager] Error updating FeedbackDelay:", err);
            return false;
        }
    },

    /**
     * Connects the delay node to previous and next nodes in an audio chain.
     * Delegates to `blankManager.connectPeers` for standard connection logic.
     * @param {object} nodes - An object containing the `delayNode`.
     * @param {Tone.AudioNode|null} prevOutputNode - The output of the preceding node in the chain.
     * @param {Tone.AudioNode|null} nextInputNode - The input of the succeeding node in the chain.
     * @returns {boolean} The result of the `blankManager.connectPeers` call.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Enables or disables the delay effect by controlling its wet level.
     * It attempts to store and restore the `wet` value when toggling, to preserve the effect's intensity.
     * @param {object} nodes - An object containing the `delayNode` and potentially `_lastWetValueForEnable`.
     * @param {boolean} isEnabled - True to enable the effect, false to disable (sets wet to 0).
     * @returns {boolean} True if the operation was successful, false otherwise.
     */
    enable(nodes, isEnabled) {
        if (!nodes || !nodes.delayNode) {
            console.warn("[DelayFxManager] Enable called with invalid nodes", nodes);
            return false;
        }
        console.log(`[DelayFxManager] Setting enabled state to: ${isEnabled}`);
        try {
            // Управляем через wet. Сохраняем предыдущее значение wet, если оно было.
            const delayNode = nodes.delayNode;
            if (isEnabled) {
                // Восстанавливаем сохраненное значение wet или используем дефолтное (например, 0.5)
                // Это значение должно приходить из настроек пресета.
                // Пока что, если enable(true), то мы ожидаем, что update() установит правильный wet.
                // Здесь можно просто убедиться, что wet не 0, если isEnabled.
                // Более сложная логика:
                // if (delayNode.wet.value === 0 && delayNode._savedWetValue === undefined) {
                //    delayNode._savedWetValue = 0.5; // Default wet if enabling from 0
                // }
                // delayNode.wet.rampTo(delayNode._savedWetValue || 0.5, 0.02);
                // delete delayNode._savedWetValue;
                // Простой вариант: enable просто готовит его к работе, а update установит wet.
                // Если эффект был выключен (wet=0), то при включении он должен взять wet из пресета.
                // voiceBuilder должен вызвать update после enable, или enable должен принимать settings.
                // Для простоты, предположим, что 'wet' из пресета будет применен через update.
                // Этот метод в основном для ситуаций, когда мы переключаем enable без изменения пресета.

                // Если мы хотим, чтобы enable(true) устанавливал некий дефолтный wet, если он был 0:
                const currentWet = delayNode.wet.value;
                const targetWet = nodes._lastWetValueForEnable !== undefined ? nodes._lastWetValueForEnable : 0.3; // или из defaultSettings
                if (currentWet < 0.01 && targetWet > 0) { // Если был выключен
                     delayNode.wet.rampTo(targetWet, 0.02);
                } else if (currentWet >= 0.01 && targetWet > 0){ // Если уже был включен, просто используем его значение
                    // Ничего не делаем, update должен был установить правильный wet
                }
                // Если пресет говорит wet:0 и enabled:true - это валидно, он включен, но не активен.
                // Поэтому, enable не должен сам по себе менять wet на не-ноль, если только он не был выключен через enable(false)
            } else {
                // Сохраняем текущее значение wet перед тем, как установить его в 0
                if (delayNode.wet.value > 0) {
                    nodes._lastWetValueForEnable = delayNode.wet.value;
                }
                delayNode.wet.rampTo(0, 0.02);
            }
            return true;
        } catch (err) {
            console.error(`[DelayFxManager] Error setting enabled state to ${isEnabled}:`, err);
            return false;
        }
    },

    /**
     * Connects a modulator source to a target parameter of the delay effect.
     * Delegates to `blankManager.connectModulator` for generic modulator connection logic.
     * @param {object} nodes - An object containing the `delayNode` and its internal structure if needed by `blankManager`.
     * @param {string} targetParamPath - The path to the target parameter within the delay node (e.g., 'delayTime.value').
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} The result of the `blankManager.connectModulator` call.
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.connectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Disconnects a modulator source from a target parameter of the delay effect.
     * Delegates to `blankManager.disconnectModulator` for generic modulator disconnection logic.
     * @param {object} nodes - An object containing the `delayNode`.
     * @param {string} targetParamPath - The path to the target parameter.
     * @param {Tone.Signal|Tone.AudioNode} sourceNode - The modulator's output node.
     * @returns {boolean} The result of the `blankManager.disconnectModulator` call.
     */
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.disconnectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Disposes of the Tone.FeedbackDelay node, freeing its resources.
     * Delegates to `blankManager.dispose` for the actual disposal of the node.
     * @param {object} nodes - An object containing the `delayNode` to be disposed.
     */
    dispose(nodes) {
        console.log("[DelayFxManager] Disposing FeedbackDelay node...");
        if (nodes && nodes.delayNode) {
            blankManager.dispose({ delayNode: nodes.delayNode });
        } else {
            console.log("[DelayFxManager] No FeedbackDelay node found to dispose.");
        }
    }
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('delay', delayFxManager); // Используем ID 'delay'
} else {
    console.error("[DelayFxManager] audioConfig or audioConfig.registerManager is not available.");
}