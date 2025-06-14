// Файл: app/src/main/assets/js/voiceBuilder.js
// Отвечает за построение цепочки аудио-узлов для одного голоса синтезатора,
// используя менеджеры компонентов из audioConfig.
// ВЕРСИЯ С ДОБАВЛЕНИЕМ LFO, FilterEnvelope, Portamento

const voiceBuilder = {

    /**
     * Строит полную аудио-цепочку для одного голоса на основе пресета.
     * Использует менеджеры компонентов для создания и соединения узлов.
     * @param {object} presetData - Полные данные пресета (включая вложенные объекты для компонентов).
     * @returns {{ components: object, errorState: object } | null} - Объект с компонентами и их состоянием ошибки, или null при критической ошибке.
     *         `components` = { oscillator: { nodes, ... }, amplitudeEnv: { nodes, ... }, ... }
     *         `errorState` = { oscillator: null | string, amplitudeEnv: null | string, ... }
     */
    buildVoiceChain(presetData) {
        console.log("[VoiceBuilder v2] Building voice chain with preset:", presetData);
        const components = {};
        const errorState = {};
        const chainOrder = audioConfig.voiceAudioChainOrder;

        if (!chainOrder || chainOrder.length === 0) {
            console.error("[VoiceBuilder v2] voiceAudioChainOrder is empty in audioConfig! Cannot build chain.");
            return null;
        }

        // --- Шаг 1: Создание всех компонентов ---
        console.log("[VoiceBuilder v2] --- Creating Components ---");
        const componentIdsToCreate = new Set(chainOrder);

        // Добавляем опциональные компоненты, если они включены в пресете
        if (presetData.pitchEnvelope?.enabled) componentIdsToCreate.add('pitchEnvelope');
        if (presetData.filterEnvelope?.enabled) componentIdsToCreate.add('filterEnvelope'); // Новый
        if (presetData.lfo1?.enabled) componentIdsToCreate.add('lfo1'); // Новый (пример ID)
        // Добавить другие LFO (lfo2, etc.) или VoiceFX по аналогии

        for (const componentId of componentIdsToCreate) {
            const manager = audioConfig.getManager(componentId);
            if (componentId === 'filterEnvelope') {
                console.log(`[VoiceBuilder DEBUG] Attempting to create 'filterEnvelope'. Manager found: ${!!manager}, manager.create is func: ${typeof manager?.create === 'function'}`);
                console.log(`[VoiceBuilder DEBUG] Settings for 'filterEnvelope':`, JSON.parse(JSON.stringify(presetData[componentId]?.params || presetData[componentId] || {})));
            }
            if (!manager || typeof manager.create !== 'function') {
                console.error(`[VoiceBuilder v2] Manager not found or invalid for component ID: ${componentId}`);
                errorState[componentId] = `Manager not found or invalid for ${componentId}`;
                components[componentId] = { nodes: null, error: errorState[componentId] };
                continue;
            }

            const componentSettings = presetData[componentId]?.params || presetData[componentId] || {};
            if (presetData[componentId]?.hasOwnProperty('enabled')) {
                 componentSettings.enabled = presetData[componentId].enabled;
            }
            // Специальная обработка для Portamento (если он часть oscillator)
            if (componentId === 'oscillator' && presetData.portamento?.enabled && presetData.portamento.time !== undefined) {
                componentSettings.portamento = presetData.portamento.time;
            }


            console.log(`[VoiceBuilder v2] Creating component: ${componentId} with settings:`, componentSettings);
            try {
                const result = manager.create(componentSettings);
                components[componentId] = result;
                errorState[componentId] = result.error;
                if (componentId === 'filterEnvelope') {
                    // Безопасное логирование результата создания компонента
                    if (components[componentId]) {
                        const compResult = components[componentId];
                        console.log(`[VoiceBuilder DEBUG] Result for '${componentId}': error='${compResult.error}', hasNodes=${!!compResult.nodes}, hasModOutputs=${!!compResult.modOutputs}, modOutputsKeys=${compResult.modOutputs ? Object.keys(compResult.modOutputs).join(',') : 'N/A'}`);
                    } else {
                        console.warn(`[VoiceBuilder DEBUG] Component '${componentId}' was null/undefined after create attempt.`);
                    }
                }
                if (result.error) {
                    console.error(`[VoiceBuilder v2] Error creating component ${componentId}: ${result.error}`);
                } else {
                    console.log(`[VoiceBuilder v2] Component ${componentId} created successfully.`);
                }
            } catch (e) {
                console.error(`[VoiceBuilder v2] Critical error calling manager.create for ${componentId}:`, e);
                const errorMsg = `Critical error in manager.create for ${componentId}: ${e.message}`;
                components[componentId] = { nodes: null, error: errorMsg };
                errorState[componentId] = errorMsg;
            }
        }

        // --- Шаг 2: Соединение аудио-цепочки ---
        console.log("[VoiceBuilder v2] --- Connecting Audio Chain ---");
        let previousOutputNode = null;

        for (let i = 0; i < chainOrder.length; i++) {
            const componentId = chainOrder[i];
            const componentData = components[componentId];
            const manager = audioConfig.getManager(componentId);

            if (!componentData || componentData.error || !componentData.nodes) {
                console.warn(`[VoiceBuilder v2] Skipping connection for broken/missing component: ${componentId}`);
                continue;
            }

            if (previousOutputNode === null) {
                if (componentData.audioOutput) {
                    previousOutputNode = componentData.audioOutput;
                    console.log(`[VoiceBuilder v2] Chain starts with output of: ${componentId}`);
                } else {
                    console.warn(`[VoiceBuilder v2] First component ${componentId} has no audio output. Chain might be broken.`);
                }
                continue;
            }

            if (componentData.audioInput) {
                console.log(`[VoiceBuilder v2] Connecting output of previous node to input of: ${componentId}`);
                // Для основной цепочки используем прямое соединение, менеджер connectPeers здесь не нужен
                // менеджер connectPeers используется для внутренних соединений компонента, если они есть.
                try {
                    previousOutputNode.connect(componentData.audioInput);
                    console.log(`[VoiceBuilder v2] Connected: Previous -> ${componentId}.Input`);
                } catch (e) {
                    console.error(`[VoiceBuilder v2] Error connecting Previous -> ${componentId}.Input:`, e);
                    errorState[componentId] = `Connection error: ${e.message}`;
                    continue;
                }
            } else {
                 console.log(`[VoiceBuilder v2] Component ${componentId} has no audio input. Skipping input connection.`);
            }

            if (componentData.audioOutput) {
                previousOutputNode = componentData.audioOutput;
                console.log(`[VoiceBuilder v2] Output for next connection is now from: ${componentId}`);
            } else {
                 console.log(`[VoiceBuilder v2] Component ${componentId} has no audio output. Previous output remains.`);
            }
        }

        // --- Шаг 3: Соединение модуляторов ---
        console.log("[VoiceBuilder v2] --- Connecting Modulators ---");

        for (const modId of audioConfig.modulatorComponents) {
            const modComp = components[modId];
            if (!presetData[modId]?.enabled || !modComp || modComp.error) {
                console.warn(`[VB ConnectMod] ${modId} is not enabled or has error. Skipping connection.`);
                continue;
            }
            // Определяем целевой компонент и параметр для подключения
            let targetInfo = null;
            if (modId === 'pitchEnvelope') {
                targetInfo = { comp: components['oscillator'], param: 'detune', manager: audioConfig.getManager('oscillator') };
            } else if (modId === 'filterEnvelope') {
                targetInfo = { comp: components['filter'], param: 'frequency', manager: audioConfig.getManager('filter') };
            } else if (modId === 'lfo1') {
                const lfoSettings = presetData.lfo1?.params;
                if (lfoSettings?.target) {
                    const [targetComponentId, targetParamName] = lfoSettings.target.split('.');
                    targetInfo = { comp: components[targetComponentId], param: targetParamName, manager: audioConfig.getManager(targetComponentId) };
                }
            }
            if (targetInfo && targetInfo.comp && !targetInfo.comp.error && targetInfo.manager?.connectModulator && modComp.modOutputs?.output && targetInfo.comp.modInputs?.[targetInfo.param]) {
                console.log(`[VoiceBuilder v2] Attempting to connect ${modId} -> ${targetInfo.comp ? targetInfo.comp : 'UNKNOWN'}.${targetInfo.param}`);
                if (!targetInfo.manager.connectModulator(targetInfo.comp.nodes, targetInfo.param, modComp.modOutputs.output)) {
                    console.error(`[VoiceBuilder v2] Failed to connect ${modId} to ${targetInfo.comp ? targetInfo.comp : 'UNKNOWN'}.${targetInfo.param}.`);
                    errorState[modId] = (errorState[modId] || "") + ` Failed to connect to ${targetInfo.comp ? targetInfo.comp : 'UNKNOWN'}.${targetInfo.param};`;
                }
            } else {
                console.warn(`[VB ConnectMod] ${modId} target not found or not connectable.`);
            }
        }

        // --- Финальная проверка ---
        if (!components.outputGain || components.outputGain.error) {
            console.error("[VoiceBuilder v2] Critical error: OutputGain component is missing or failed to create. Voice unusable.");
            this.disposeComponents(components);
            return null;
        }

        console.log("[VoiceBuilder v2] Voice chain build process completed.");
        return { components, errorState };
    },

    findParamByPath(components, pathString) {
        // ... (без изменений) ...
        if (!components || !pathString) return null;
        const parts = pathString.split('.');
        let target = null;
        let currentComponentId = null;
        try {
            currentComponentId = parts[0];
            const componentData = components[currentComponentId];
            if (!componentData || !componentData.nodes) return null;
            target = componentData.nodes;
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (target && target.hasOwnProperty(part)) {
                    target = target[part];
                } else {
                    target = null;
                    break;
                }
            }
            if (parts.length === 1 && target === componentData.nodes) {
                 console.warn(`[VoiceBuilder v2.findParamByPath] Path '${pathString}' points to the component nodes object, not a specific parameter.`);
                 return null;
            }
            return target;
        } catch (e) {
            console.error(`[VoiceBuilder v2.findParamByPath] Error accessing path '${pathString}':`, e);
            return null;
        }
    },

    disposeComponents(components) {
        // ... (без изменений) ...
        if (!components) return;
        console.log("[VoiceBuilder v2] Disposing voice components...");
        for (const componentId in components) {
            const componentData = components[componentId];
            const manager = audioConfig.getManager(componentId);
            if (manager && typeof manager.dispose === 'function' && componentData && componentData.nodes) {
                try {
                    console.log(`[VoiceBuilder v2] Disposing component: ${componentId}`);
                    manager.dispose(componentData.nodes);
                } catch (e) {
                    console.error(`[VoiceBuilder v2] Error disposing component ${componentId}:`, e);
                }
            } else if (componentData && componentData.nodes) {
                 console.warn(`[VoiceBuilder v2] Cannot dispose component ${componentId}: Manager or dispose method not found.`);
                 for (const nodeKey in componentData.nodes) {
                      const node = componentData.nodes[nodeKey];
                      if (node && typeof node.dispose === 'function') {
                           try { node.dispose(); } catch(e) {}
                      }
                 }
            }
        }
        console.log("[VoiceBuilder v2] Voice components disposal complete.");
    }
};
