// Файл: app/src/main/assets/js/managers/distortionFxManager.js
const distortionFxManager = {
    isOptional: true, // Инсертные эффекты опциональны

    /**
     * Создает узел Tone.Distortion.
     * @param {object} [initialSettings={}] - Начальные настройки из пресета (секция params эффекта).
     * @returns {object} - Объект { nodes: { distortionNode: Tone.Distortion }, audioInput: Tone.Distortion, audioOutput: Tone.Distortion, error: string | null }
     */
    create(initialSettings = {}) {
        console.log("[DistortionFxManager] Creating Distortion node with settings:", initialSettings);
        let nodes = {
            distortionNode: null
        };
        let audioInput = null;
        let audioOutput = null;
        let error = null;

        try {
            const settings = {
                distortion: initialSettings.distortion ?? 0.4, // Значение искажения
                wet: initialSettings.wet ?? 1.0,             // Wet по умолчанию 1.0 для инсертов
                oversample: initialSettings.oversample || 'none' // 'none', '2x', '4x'
            };

            const distortionNode = new Tone.Distortion(settings);
            nodes.distortionNode = distortionNode;
            audioInput = distortionNode;
            audioOutput = distortionNode;

            // modInputs не обязательны для простых эффектов, но можно добавить для wet/distortion
            // modInputs: {
            //    distortion: distortionNode.distortion, // Это Signal, а не Param
            //    wet: distortionNode.wet
            // }

            console.log("[DistortionFxManager] Distortion node created successfully.");

        } catch (err) {
            console.error("[DistortionFxManager] Error creating Distortion node:", err);
            error = `Failed to create Distortion: ${err.message}`;
            nodes = null;
            audioInput = null;
            audioOutput = null;
        }

        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    /**
     * Обновляет параметры Tone.Distortion.
     * @param {object} nodes - Объект узлов { distortionNode }.
     * @param {object} newSettings - Новые настройки { distortion, wet, oversample }.
     * @returns {boolean} - true при успехе.
     */
    update(nodes, newSettings) {
        if (!nodes || !nodes.distortionNode || !newSettings) {
            console.warn("[DistortionFxManager] Update called with invalid args", { nodes, newSettings });
            return false;
        }
        const distortionNode = nodes.distortionNode;
        console.log("[DistortionFxManager] Updating Distortion with:", newSettings);

        try {
            if (newSettings.distortion !== undefined && typeof distortionNode.distortion === 'number') { // distortion - это просто число
                distortionNode.distortion = Math.max(0, Math.min(1, newSettings.distortion)); // Ограничиваем 0-1
            }
            if (newSettings.wet !== undefined && distortionNode.wet instanceof Tone.Param) {
                distortionNode.wet.rampTo(newSettings.wet, 0.02);
            }
            if (newSettings.oversample !== undefined && ['none', '2x', '4x'].includes(newSettings.oversample)) {
                distortionNode.oversample = newSettings.oversample;
            }
            return true;
        } catch (err) {
            console.error("[DistortionFxManager] Error updating Distortion:", err);
            return false;
        }
    },

    /**
     * Включает/выключает эффект (управляет wet).
     * @param {object} nodes - Узлы компонента { distortionNode }.
     * @param {boolean} isEnabled - Новое состояние.
     * @returns {boolean} - true.
     */
    enable(nodes, isEnabled) {
        if (!nodes || !nodes.distortionNode) {
            console.warn("[DistortionFxManager] Enable called with invalid nodes.");
            return false;
        }
        const distortionNode = nodes.distortionNode;
        console.log(`[DistortionFxManager] Setting enabled to ${isEnabled}`);
        try {
            // Сохраняем предыдущее значение wet, если выключаем
            if (!isEnabled && distortionNode.wet.value > 0) {
                distortionNode._previousWet = distortionNode.wet.value;
            }
            const targetWet = isEnabled ? (distortionNode._previousWet ?? 1.0) : 0;
            distortionNode.wet.rampTo(targetWet, 0.02);
            return true;
        } catch (err) {
            console.error("[DistortionFxManager] Error in enable/disable:", err);
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
     * Освобождает ресурсы.
     */
    dispose(nodes) {
        console.log("[DistortionFxManager] Disposing Distortion node...");
        if (nodes && nodes.distortionNode) {
            blankManager.dispose({ distortionNode: nodes.distortionNode });
        } else {
            console.log("[DistortionFxManager] No distortion node found to dispose.");
        }
    },

    // connectModulator и disconnectModulator можно опустить, если не планируется модуляция параметров дисторшна
    // или использовать реализации из blankManager, если параметры объявлены в modInputs
};

// Регистрация менеджера в audioConfig
if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('distortion', distortionFxManager);
} else {
    console.error("[DistortionFxManager] audioConfig or audioConfig.registerManager is not available.");
}