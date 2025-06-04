// Файл: app/src/main/assets/js/managers/delayFxManager.js
const delayFxManager = {
    /**
     * Создает узел Tone.FeedbackDelay.
     * @param {object} [initialSettings={}] - Начальные настройки (delayTime, feedback, wet).
     * @returns {object} - { nodes: { delayNode: Tone.FeedbackDelay }, audioInput, audioOutput, error }
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
     * Обновляет параметры FeedbackDelay.
     * @param {object} nodes - Объект узлов { delayNode }.
     * @param {object} newSettings - Новые настройки { delayTime, feedback, wet }.
     * @returns {boolean} - true при успехе.
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
     * Соединяет эффект с соседями по цепочке.
     */
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Используем стандартную реализацию blankManager
        return blankManager.connectPeers(nodes, prevOutputNode, nextInputNode);
    },

    /**
     * Включает/выключает эффект (через параметр wet).
     * @param {object} nodes - Узлы компонента { delayNode }.
     * @param {boolean} isEnabled - Новое состояние.
     * @returns {boolean} - true при успехе.
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
     * Подключение модулятора (если нужно для дилея, например, модуляция delayTime).
     */
    connectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.connectModulator(nodes, targetParamPath, sourceNode);
    },

    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return blankManager.disconnectModulator(nodes, targetParamPath, sourceNode);
    },

    /**
     * Уничтожает узел дилея.
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