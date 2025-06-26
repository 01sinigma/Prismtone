/**
 * @file voiceBuilder.js
 * @description
 * This module is responsible for constructing and managing the audio node chain for a single
 * synthesizer voice. It uses component managers defined in `audioConfig.js` to create,
 * connect, and configure individual audio components (like oscillators, envelopes, filters)
 * based on a given sound preset.
 * Key functions include:
 * - `buildVoiceChain`: Dynamically assembles a voice from various audio components based on a preset.
 * - `findParamByPath`: A utility to locate a specific Tone.js parameter within the constructed voice chain using a path string.
 * - `disposeComponents`: Properly disposes of all Tone.js nodes within a voice chain to free up resources.
 */

// Файл: app/src/main/assets/js/voiceBuilder.js
// Отвечает за построение цепочки аудио-узлов для одного голоса синтезатора,
// используя менеджеры компонентов из audioConfig.
// ВЕРСИЯ С ДОБАВЛЕНИЕМ LFO, FilterEnvelope, Portamento

const voiceBuilder = {

    /**
     * Builds a complete audio chain for a single synthesizer voice based on the provided preset data.
     * It iterates through component managers defined in `audioConfig` to create and initialize
     * each audio node (e.g., oscillator, amplitude envelope, filter, LFOs, pitch/filter envelopes).
     * It then connects these nodes in the order specified by `audioConfig.voiceAudioChainOrder`
     * and connects any active modulators (like LFOs or envelopes) to their target parameters.
     *
     * @param {object} presetData - The sound preset object. This object should contain settings for each
     *                              component (e.g., `presetData.oscillator`, `presetData.amplitudeEnv`).
     *                              It should also include `enabled` flags for optional components like
     *                              `pitchEnvelope`, `filterEnvelope`, and LFOs.
     * @returns {{ components: object, errorState: object } | null} 
     *          An object containing two properties:
     *          - `components`: An object where keys are component IDs (e.g., 'oscillator') and values are
     *                          the result from the component manager's `create` method (usually including
     *                          `nodes`, `audioInput`, `audioOutput`, `modOutputs`, and `error` properties).
     *          - `errorState`: An object where keys are component IDs and values are error messages (string)
     *                          if an error occurred during that component's creation or connection, otherwise null.
     *          Returns `null` if a critical error occurs that prevents voice creation (e.g., `voiceAudioChainOrder` is missing
     *          or the essential `outputGain` component cannot be created).
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
        let componentIdsToCreate = new Set(chainOrder);

        // Определяем, используется ли сэмплер
        const useSampler = presetData.sampler?.enabled;

        if (useSampler) {
            // Если сэмплер включен, удаляем осциллятор из списка создаваемых компонентов
            // и добавляем сэмплер, если его еще нет в chainOrder (хотя по логике он должен там быть)
            componentIdsToCreate.delete('oscillator');
            if (!componentIdsToCreate.has('sampler')) { // Убедимся, что сэмплер будет создан
                 if (chainOrder.includes('sampler')) { // Если sampler в chainOrder, добавляем его
                    componentIdsToCreate.add('sampler');
                 } else {
                     // Если sampler не в chainOrder, но включен, это может быть ошибкой конфигурации.
                     // Но для надежности добавим его в начало списка создаваемых компонентов,
                     // предполагая, что он является источником звука.
                     // Или можно выдать ошибку/предупреждение.
                     console.warn("[VoiceBuilder v2] Sampler enabled in preset but not found in voiceAudioChainOrder. Adding it to components to create.");
                     const tempSet = new Set(['sampler']);
                     componentIdsToCreate.forEach(id => tempSet.add(id));
                     componentIdsToCreate = tempSet;
                 }
            }
            console.log("[VoiceBuilder v2] Sampler is enabled. 'oscillator' will be skipped. 'sampler' will be created.");
        } else {
            // Если сэмплер не используется, убеждаемся, что осциллятор будет создан (если он в chainOrder)
            // и сэмплер не будет создан, даже если он случайно попал в chainOrder.
            componentIdsToCreate.delete('sampler');
            if (chainOrder.includes('oscillator') && !componentIdsToCreate.has('oscillator')) {
                componentIdsToCreate.add('oscillator');
            }
            console.log("[VoiceBuilder v2] Sampler is not enabled. 'oscillator' will be created (if in chain). 'sampler' will be skipped.");
        }


        // Добавляем опциональные компоненты, если они включены в пресете
        if (presetData.pitchEnvelope?.enabled) componentIdsToCreate.add('pitchEnvelope');
        if (presetData.filterEnvelope?.enabled) componentIdsToCreate.add('filterEnvelope');
        if (presetData.lfo1?.enabled) componentIdsToCreate.add('lfo1');
        // Добавить другие LFO (lfo2, etc.) или VoiceFX по аналогии

        for (const componentId of componentIdsToCreate) {
            // Пропускаем создание осциллятора, если используется сэмплер
            if (useSampler && componentId === 'oscillator') {
                console.log(`[VoiceBuilder v2] Skipping oscillator component creation because sampler is active.`);
                continue;
            }
            // Пропускаем создание сэмплера, если он не включен
            if (!useSampler && componentId === 'sampler') {
                console.log(`[VoiceBuilder v2] Skipping sampler component creation because it's not enabled.`);
                continue;
            }

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
        // Используем динамический chainOrder в зависимости от того, используется сэмплер или осциллятор
        const currentChainOrder = useSampler
            ? chainOrder.map(id => id === 'oscillator' ? 'sampler' : id).filter(id => id !== 'oscillator' || !chainOrder.includes('sampler') ) // заменяем осциллятор на сэмплер
            : chainOrder.filter(id => id !== 'sampler'); // удаляем сэмплер, если он не используется

        // Убедимся, что если sampler используется, он есть в currentChainOrder, а oscillator - нет.
        // И наоборот.
        if (useSampler) {
            if (!currentChainOrder.includes('sampler') && chainOrder.includes('sampler')) { // если sampler был в оригинальном chainOrder
                // Пытаемся вставить sampler на место oscillator, если oscillator был, или в начало
                const oscIndex = chainOrder.indexOf('oscillator');
                if (oscIndex !== -1) {
                     const tempOrder = [...chainOrder];
                     tempOrder.splice(oscIndex, 1, 'sampler'); // Заменяем
                     currentChainOrder = tempOrder.filter(id => id !== 'oscillator' || id === 'sampler'); // Удаляем дубликаты oscillator
                } else if (!currentChainOrder.includes('sampler')) { // Если sampler не был добавлен и oscillator тоже не был
                     currentChainOrder.unshift('sampler'); // Добавляем в начало как источник
                }
            }
             // Удаляем oscillator, если он все еще там
            const oscIdx = currentChainOrder.indexOf('oscillator');
            if (oscIdx !== -1) currentChainOrder.splice(oscIdx, 1);

        } else {
            const samplerIdx = currentChainOrder.indexOf('sampler');
            if (samplerIdx !== -1) currentChainOrder.splice(samplerIdx, 1);
            if (!currentChainOrder.includes('oscillator') && chainOrder.includes('oscillator')) {
                 currentChainOrder.unshift('oscillator'); // Восстанавливаем осциллятор, если он был в chainOrder
            }
        }
        // Очистка от дубликатов, если они появились
        // currentChainOrder = [...new Set(currentChainOrder)];


        console.log("[VoiceBuilder v2] Effective audio chain order:", currentChainOrder);


        for (let i = 0; i < currentChainOrder.length; i++) {
            const componentId = currentChainOrder[i];
            const componentData = components[componentId];
            // const manager = audioConfig.getManager(componentId); // manager не используется в этой секции

            if (!componentData || componentData.error || !componentData.nodes) {
                console.warn(`[VoiceBuilder v2] Skipping connection for broken/missing component: ${componentId}`);
                if (componentId === (useSampler ? 'sampler' : 'oscillator') && i === 0) {
                     console.error(`[VoiceBuilder v2] Critical: Main sound source (${componentId}) is broken or missing. Voice will likely be silent.`);
                     // Можно установить флаг ошибки для всей цепочки
                }
                continue;
            }

            if (previousOutputNode === null) { // Первый активный компонент в цепочке
                if (componentData.audioOutput) {
                    previousOutputNode = componentData.audioOutput;
                    console.log(`[VoiceBuilder v2] Chain starts with output of: ${componentId}`);
                } else {
                     // Если первый компонент (осциллятор/сэмплер) не имеет аудио выхода, это проблема.
                    console.warn(`[VoiceBuilder v2] First component ${componentId} in chain has no audio output. Chain might be broken.`);
                    if (componentId === (useSampler ? 'sampler' : 'oscillator')) {
                         errorState[componentId] = (errorState[componentId] || "") + " Component is first in chain but has no audioOutput.";
                    }
                }
                continue;
            }

            // Последующие компоненты в цепочке
            if (componentData.audioInput) {
                console.log(`[VoiceBuilder v2] Connecting output of previous node to input of: ${componentId}`);
                try {
                    previousOutputNode.connect(componentData.audioInput);
                    console.log(`[VoiceBuilder v2] Connected: Previous -> ${componentId}.Input`);
                } catch (e) {
                    console.error(`[VoiceBuilder v2] Error connecting Previous -> ${componentId}.Input:`, e);
                    errorState[componentId] = (errorState[componentId] || "") + ` Connection error: ${e.message}`;
                    continue; // Пропускаем обновление previousOutputNode, если соединение не удалось
                }
            } else {
                 console.log(`[VoiceBuilder v2] Component ${componentId} has no audio input. Skipping input connection.`);
            }

            // Обновляем previousOutputNode, если текущий компонент имеет аудио выход
            // Это важно, чтобы следующий компонент подключался к выходу текущего,
            // а не к выходу предыдущего, если у текущего нет собственного audioInput, но есть audioOutput (например, FX Send)
            if (componentData.audioOutput) {
                previousOutputNode = componentData.audioOutput;
                console.log(`[VoiceBuilder v2] Output for next connection is now from: ${componentId}`);
            } else {
                 console.log(`[VoiceBuilder v2] Component ${componentId} has no audio output. Previous output node remains unchanged.`);
            }
        }

        // --- Шаг 3: Соединение модуляторов ---
        console.log("[VoiceBuilder v2] --- Connecting Modulators ---");

        // Убедимся, что audioConfig.modulatorComponents существует и является массивом
        const modulatorComponentIds = Array.isArray(audioConfig.modulatorComponents) ? audioConfig.modulatorComponents : [];
        if (modulatorComponentIds.length === 0) {
            console.warn("[VoiceBuilder v2] audioConfig.modulatorComponents is empty or not an array. No modulators to connect.");
        }

        for (const modId of modulatorComponentIds) {
            const modComp = components[modId];

            if (!presetData[modId]?.enabled) {
                console.log(`[VB ConnectMod] ${modId} is not enabled in preset. Skipping connection.`);
                continue;
            }
            if (!modComp) {
                console.warn(`[VB ConnectMod] ${modId} component data not found in 'components' object. Skipping connection.`);
                continue;
            }
            if (modComp.error) {
                console.warn(`[VB ConnectMod] ${modId} has an error: '${modComp.error}'. Skipping connection.`);
                continue;
            }

            let modulatorOutputNode = null;
            let expectedModOutputName = 'output'; // Стандартное имя

            if (modId === 'pitchEnvelope') {
                expectedModOutputName = 'pitch';
                if (modComp.modOutputs?.pitch) {
                    modulatorOutputNode = modComp.modOutputs.pitch;
                }
            } else if (modId === 'filterEnvelope') { // Пример, если filterEnvelope использует 'output'
                expectedModOutputName = 'output'; // или другое специфичное имя, если есть
                if (modComp.modOutputs?.output) { // Предполагаем 'output'
                    modulatorOutputNode = modComp.modOutputs.output;
                } else if (modComp.modOutputs?.amount) { // Альтернативное имя, если используется
                     expectedModOutputName = 'amount';
                     modulatorOutputNode = modComp.modOutputs.amount;
                }
            } else if (modId.startsWith('lfo')) { // Для lfo1, lfo2 и т.д.
                expectedModOutputName = 'output'; // Обычно LFO выдают 'output'
                if (modComp.modOutputs?.output) {
                    modulatorOutputNode = modComp.modOutputs.output;
                }
            }
            // Добавьте другие else if для других модуляторов со специфичными именами выходов

            if (!modulatorOutputNode) {
                 console.warn(`[VB ConnectMod] ${modId}: Modulator output node '${expectedModOutputName}' not found in modComp.modOutputs. Available: ${modComp.modOutputs ? Object.keys(modComp.modOutputs).join(', ') : 'none'}. Skipping.`);
                 errorState[modId] = (errorState[modId] || "") + ` Modulator output '${expectedModOutputName}' not found;`;
                 continue;
            }

            // Определяем целевой компонент и параметр для подключения
            let targetInfo = null;
            let targetComponentId = null;
            let targetParamName = null;

            if (modId === 'pitchEnvelope') {
                targetComponentId = 'oscillator';
                targetParamName = 'detune'; // Или 'frequency', в зависимости от предпочтений
            } else if (modId === 'filterEnvelope') {
                targetComponentId = 'filter';
                targetParamName = 'frequency'; // Обычно модулирует частоту среза фильтра
            } else if (modId.startsWith('lfo')) { // lfo1, lfo2 etc.
                const lfoSettings = presetData[modId]?.params;
                if (lfoSettings?.target) {
                    const parts = lfoSettings.target.split('.');
                    if (parts.length === 2) {
                        targetComponentId = parts[0];
                        targetParamName = parts[1];
                    } else {
                        console.warn(`[VB ConnectMod] ${modId}: Invalid target format '${lfoSettings.target}'. Expected 'componentId.paramName'.`);
                        errorState[modId] = (errorState[modId] || "") + ` Invalid LFO target format: ${lfoSettings.target};`;
                        continue;
                    }
                } else {
                    console.warn(`[VB ConnectMod] ${modId}: LFO target not specified in preset. Skipping.`);
                    errorState[modId] = (errorState[modId] || "") + ` LFO target not specified;`;
                    continue;
                }
            }
            // Добавьте другие else if для других типов модуляторов

            if (!targetComponentId || !targetParamName) {
                 console.warn(`[VB ConnectMod] ${modId}: Target component or parameter name could not be determined. Skipping.`);
                 errorState[modId] = (errorState[modId] || "") + ` Target component/param undetermined;`;
                 continue;
            }

            const targetComponentData = components[targetComponentId];
            const targetManager = audioConfig.getManager(targetComponentId);

            targetInfo = {
                comp: targetComponentData,
                param: targetParamName,
                manager: targetManager,
                id: targetComponentId // Для логирования
            };


            if ( targetInfo && targetInfo.comp && !targetInfo.comp.error &&
                 targetInfo.manager?.connectModulator &&
                 modulatorOutputNode && // Уже проверено выше, но для полноты
                 targetInfo.comp.modInputs?.[targetInfo.param] )
            {
                console.log(`[VoiceBuilder v2] Attempting to connect ${modId} (${expectedModOutputName}) -> ${targetInfo.id}.${targetInfo.param}`);
                if (!targetInfo.manager.connectModulator(targetInfo.comp.nodes, targetInfo.param, modulatorOutputNode)) {
                    const errorMsg = `Failed to connect ${modId} to ${targetInfo.id}.${targetInfo.param}.`;
                    console.error(`[VoiceBuilder v2] ${errorMsg}`);
                    errorState[modId] = (errorState[modId] || "") + ` ${errorMsg};`;
                } else {
                    console.log(`[VoiceBuilder v2] Successfully connected ${modId} to ${targetInfo.id}.${targetInfo.param}.`);
                }
            } else {
                console.warn(`[VB ConnectMod] ${modId} -> ${targetInfo.id}.${targetInfo.param}: Target not found or not connectable. Details:`, {
                    modulatorId: modId,
                    targetComponentId: targetInfo.id,
                    targetParam: targetInfo.param,
                    targetCompExists: !!targetInfo.comp,
                    targetCompError: targetInfo.comp?.error,
                    targetManagerHasConnectModulator: typeof targetInfo.manager?.connectModulator === 'function',
                    modulatorOutputNodeExists: !!modulatorOutputNode,
                    targetCompModInputsExistsAndHasParam: !!targetInfo.comp?.modInputs?.[targetInfo.param],
                    expectedModOutputName: expectedModOutputName
                });
                errorState[modId] = (errorState[modId] || "") + ` Target ${targetInfo.id}.${targetInfo.param} not connectable;`;
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

    /**
     * Finds a specific Tone.js parameter object within a built voice's components using a path string.
     * For example, `findParamByPath(components, 'filter.frequency')` would attempt to return the `frequency`
     * parameter object of the `filter` component's main Tone.js node.
     *
     * @param {object} components - The `components` object returned by `buildVoiceChain`.
     * @param {string} pathString - A dot-separated string representing the path to the parameter
     *                            (e.g., 'oscillator.detune', 'filter.Q', 'lfo1.frequency').
     *                            The first part is the component ID, subsequent parts navigate through the component's `nodes` object.
     * @returns {Tone.Param | any | null} The Tone.js parameter object (or any other property found at the path),
     *                                   or `null` if the path is invalid, the component/node doesn't exist,
     *                                   or the property is not found.
     */
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

    /**
     * Disposes of all Tone.js nodes within the provided components object.
     * This is crucial for freeing up audio resources when a voice is no longer needed.
     * It iterates through each component, retrieves its manager from `audioConfig`,
     * and calls the manager's `dispose` method if available. If a manager or its `dispose` method
     * is not found, it attempts to call `dispose()` on individual nodes within `componentData.nodes` directly.
     *
     * @param {object} components - The `components` object returned by `buildVoiceChain`,
     *                              containing the audio nodes to be disposed.
     */
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
