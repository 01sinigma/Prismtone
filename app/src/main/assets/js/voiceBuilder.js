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
    async buildVoiceChain(presetData) { // <<< Стал async
        console.log("[VoiceBuilder v3 Sampler] Building voice chain with preset:", presetData);
        const components = {};
        const errorState = {};
        const chainOrder = audioConfig.voiceAudioChainOrder;

        if (!chainOrder || chainOrder.length === 0) {
            console.error("[VoiceBuilder v3 Sampler] voiceAudioChainOrder is empty in audioConfig! Cannot build chain.");
            return null;
        }

        // --- Шаг 1: Создание всех компонентов ---
        console.log("[VoiceBuilder v3 Sampler] --- Creating Components ---");
        let componentIdsToCreate = new Set(chainOrder);

        // [Логика -> Выбор Источника] Определяем, какой источник звука использовать.
        const useSampler = presetData.sampler?.enabled === true;

        if (useSampler) {
            componentIdsToCreate.delete('oscillator');
            componentIdsToCreate.add('sampler'); // Ensure sampler is in the set to be created
            console.log("[VoiceBuilder] Sampler mode detected. Oscillator will be skipped. Sampler will be used.");
        } else {
            componentIdsToCreate.delete('sampler');
            // Ensure oscillator is present if it's in the original chainOrder and sampler is not used.
            // If 'oscillator' is not in chainOrder, it won't be added here, respecting the defined chain.
            if (chainOrder.includes('oscillator')) {
                componentIdsToCreate.add('oscillator');
            }
            console.log("[VoiceBuilder] Oscillator mode detected (or sampler disabled). Sampler will be skipped.");
        }
        // console.log for debugging effectiveChainOrder - placed here to see initial decision
        console.log(`[VoiceBuilder] Component IDs to create (after source selection): ${Array.from(componentIdsToCreate).join(', ')}`);

        // Добавляем опциональные компоненты, если они включены в пресете
        if (presetData.pitchEnvelope?.enabled) componentIdsToCreate.add('pitchEnvelope');
        if (presetData.filterEnvelope?.enabled) componentIdsToCreate.add('filterEnvelope');
        if (presetData.lfo1?.enabled) componentIdsToCreate.add('lfo1');
        // Добавить другие LFO (lfo2, etc.) или VoiceFX по аналогии

        // Используем Promise.all для параллельного создания компонентов
        const creationPromises = Array.from(componentIdsToCreate).map(async (componentId) => {
            // Пропускаем создание осциллятора, если используется сэмплер (дополнительная проверка, хотя set должен был это учесть)
            if (useSampler && componentId === 'oscillator') {
                console.log(`[VoiceBuilder v3 Sampler] Skipping oscillator component creation because sampler is active.`);
                return; // Promise разрешится как undefined, отфильтруется позже или обработается
            }
            // Пропускаем создание сэмплера, если он не включен
            if (!useSampler && componentId === 'sampler') {
                console.log(`[VoiceBuilder v3 Sampler] Skipping sampler component creation because it's not enabled.`);
                return;
            }

            const manager = audioConfig.getManager(componentId);
            if (!manager || typeof manager.create !== 'function') {
                console.error(`[VoiceBuilder v4 SamplerUpdate] Manager not found or invalid for component ID: ${componentId}`);
                errorState[componentId] = `Manager not found or invalid for ${componentId}`;
                components[componentId] = { nodes: null, error: errorState[componentId] };
                return; // Важно выйти из map callback, если менеджер не найден
            }

            let componentSettings = presetData[componentId]?.params || presetData[componentId] || {};
            // Убедимся, что componentSettings - это объект, если presetData[componentId] - примитив или отсутствует
            if (typeof componentSettings !== 'object' || componentSettings === null) {
                componentSettings = {};
            }


            if (presetData[componentId]?.hasOwnProperty('enabled')) {
                 componentSettings.enabled = presetData[componentId].enabled;
            }

            // Специальная логика для семплера: передаем все sampler.params
            if (componentId === 'sampler') {
                // initialSettings для samplerManager.create должны содержать instrument, urls, attack, release, curve
                // presetData.sampler.params должен содержать все это.
                if (presetData.sampler && presetData.sampler.params) {
                    componentSettings = { ...presetData.sampler.params }; // Копируем все параметры семплера
                     console.log(`[VoiceBuilder v4 SamplerUpdate] Settings for Sampler:`, componentSettings);
                } else {
                    console.warn(`[VoiceBuilder v4 SamplerUpdate] Sampler component specified, but presetData.sampler.params is missing. Using default/empty settings for sampler.`);
                    componentSettings = {}; // Пустые настройки, если не найдены
                }
            } else if (componentId === 'oscillator' && presetData.portamento?.enabled && presetData.portamento.time !== undefined) {
                componentSettings.portamento = presetData.portamento.time;
            }


            console.log(`[VoiceBuilder v4 SamplerUpdate] Creating component: ${componentId} with settings:`, JSON.parse(JSON.stringify(componentSettings)));
            try {
                // manager.create теперь может быть async
                const result = await manager.create(componentSettings);
                components[componentId] = result;
                errorState[componentId] = result.error;
                if (result.error) {
                    console.error(`[VoiceBuilder v3 Sampler] Error creating component ${componentId}: ${result.error}`);
                } else {
                    console.log(`[VoiceBuilder v3 Sampler] Component ${componentId} created successfully.`);
                }
            } catch (e) {
                console.error(`[VoiceBuilder v3 Sampler] Critical error calling manager.create for ${componentId}:`, e);
                const errorMsg = `Critical error in manager.create for ${componentId}: ${e.message}`;
                components[componentId] = { nodes: null, error: errorMsg };
                errorState[componentId] = errorMsg;
            }
        });

        await Promise.all(creationPromises);

        // Удаляем компоненты, которые могли быть пропущены (их значение будет undefined после map)
        // или если components[componentId] не был установлен из-за раннего return
        for (const componentId of componentIdsToCreate) {
            if (!components[componentId]) {
                 if ((useSampler && componentId === 'oscillator') || (!useSampler && componentId === 'sampler')) {
                    // Это ожидаемо, просто убедимся, что они не вызывают проблем дальше
                 } else if (!errorState[componentId]) { // Если нет ошибки, но компонент отсутствует, это странно
                    console.warn(`[VoiceBuilder v3 Sampler] Component ${componentId} was expected but not created and no error was logged.`)
                 }
            }
        }


        // --- Шаг 2: Соединение аудио-цепочки ---
        console.log("[VoiceBuilder v3 Sampler] --- Connecting Audio Chain ---");
        let previousOutputNode = null;

        // Используем `useSampler` для определения правильного ID источника звука
        // и для корректной итерации по `audioConfig.voiceAudioChainOrder`.
        // `effectiveChainOrder` теперь будет строиться более точно на основе `audioConfig.voiceAudioChainOrder`.

        const originalChainOrder = audioConfig.voiceAudioChainOrder;
        let effectiveChainOrderForConnection = [];

        console.log(`[VoiceBuilder] Original audioConfig.voiceAudioChainOrder: ${originalChainOrder.join(', ')}`);
        console.log(`[VoiceBuilder] useSampler: ${useSampler}`);

        for (const componentIdInOrder of originalChainOrder) {
            let currentComponentIdToProcess = componentIdInOrder;

            if (componentIdInOrder === 'oscillator' && useSampler) {
                // Если в chainOrder стоит 'oscillator', а мы используем семплер,
                // то актуальный ID компонента для обработки - 'sampler'.
                // Также нужно убедиться, что 'sampler' был создан.
                if (components['sampler'] && !components['sampler'].error) {
                    currentComponentIdToProcess = 'sampler';
                    console.log(`[VoiceBuilder] Connecting: Replacing 'oscillator' with 'sampler' in chain for connection.`);
                } else {
                    console.warn(`[VoiceBuilder] Connecting: 'oscillator' in chain, 'useSampler' is true, but 'sampler' component is missing or has error. Skipping this chain link.`);
                    continue;
                }
            } else if (componentIdInOrder === 'sampler' && !useSampler) {
                // Если в chainOrder стоит 'sampler', но мы используем осциллятор,
                // то актуальный ID компонента для обработки - 'oscillator'.
                // Также нужно убедиться, что 'oscillator' был создан.
                if (components['oscillator'] && !components['oscillator'].error) {
                    currentComponentIdToProcess = 'oscillator';
                    console.log(`[VoiceBuilder] Connecting: Replacing 'sampler' with 'oscillator' in chain for connection.`);
                } else {
                    console.warn(`[VoiceBuilder] Connecting: 'sampler' in chain, 'useSampler' is false, but 'oscillator' component is missing or has error. Skipping this chain link.`);
                    continue;
                }
            } else if (componentIdInOrder === 'oscillator' && !useSampler) {
                // Используем осциллятор, и он указан в chainOrder. Убедимся, что он есть.
                if (!components['oscillator'] || components['oscillator'].error) {
                     console.warn(`[VoiceBuilder] Connecting: 'oscillator' in chain, 'useSampler' is false, but 'oscillator' component is missing or has error. Skipping this chain link.`);
                     continue;
                }
            } else if (componentIdInOrder === 'sampler' && useSampler) {
                // Используем сэмплер, и он указан в chainOrder. Убедимся, что он есть.
                 if (!components['sampler'] || components['sampler'].error) {
                     console.warn(`[VoiceBuilder] Connecting: 'sampler' in chain, 'useSampler' is true, but 'sampler' component is missing or has error. Skipping this chain link.`);
                     continue;
                 }
            }


            // Добавляем в список для соединения только если компонент действительно существует и активен
            if (components[currentComponentIdToProcess] && !components[currentComponentIdToProcess].error) {
                // Предотвращаем дублирование, если 'sampler' заменил 'oscillator' и 'sampler' уже был в chain
                if (!effectiveChainOrderForConnection.includes(currentComponentIdToProcess)) {
                    effectiveChainOrderForConnection.push(currentComponentIdToProcess);
                } else if ( (componentIdInOrder === 'oscillator' && currentComponentIdToProcess === 'sampler') ||
                            (componentIdInOrder === 'sampler' && currentComponentIdToProcess === 'oscillator')) {
                    // Это случай подмены, дубликат не нужен, так как он уже был добавлен ранее по своему "родному" id
                } else if (currentComponentIdToProcess === componentIdInOrder) {
                    // Это не подмена, но компонент почему-то уже есть. Этого быть не должно при правильном chainOrder.
                    console.warn(`[VoiceBuilder] Component ${currentComponentIdToProcess} already in effectiveChainOrderForConnection. Original chain might have duplicates or logic error.`);
                }
            } else if (componentIdInOrder === 'outputGain' && (!components['outputGain'] || components['outputGain'].error) ) {
                 console.error(`[VoiceBuilder] CRITICAL: outputGain component '${componentIdInOrder}' is missing or has an error. Audio chain cannot be completed.`);
                 // Это критическая ошибка, дальнейшее соединение бессмысленно.
                 // errorState уже должен содержать информацию об ошибке outputGain.
                 break;
            }
        }

        // Дополнительная отладочная информация о том, что реально будет соединяться
        console.log(`[VoiceBuilder] Effective audio chain for CONNECTION: ${effectiveChainOrderForConnection.join(' -> ')}`);


        for (let i = 0; i < effectiveChainOrderForConnection.length; i++) {
            const componentId = effectiveChainOrderForConnection[i];
            // Эта проверка уже не нужна здесь, так как effectiveChainOrderForConnection строится на основе существующих и не ошибочных компонентов
            // if (useSampler && componentId === 'oscillator') continue;
            // if (!useSampler && componentId === 'sampler') continue;

            const componentData = components[componentId];

            if (!componentData || !componentData.nodes) { // Error for this component already logged during creation.
                console.warn(`[VoiceBuilder v3 Sampler] Skipping connection for component ${componentId} as it has no nodes or data (possibly due to creation error or being skipped).`);
                if (componentData && componentData.error) {
                     console.warn(`[VoiceBuilder v3 Sampler] Error for ${componentId} was: ${componentData.error}`);
                }
                 // If the primary sound source (sampler or oscillator) is missing at the start of the chain, it's critical.
                if (i === 0 && (componentId === (useSampler ? 'sampler' : 'oscillator'))) {
                    console.error(`[VoiceBuilder v3 Sampler] Critical: Main sound source (${componentId}) is missing or failed. Voice will likely be silent.`);
                }
                continue;
            }

            // This check is important: if a component failed but still has some data structure, don't try to use its (potentially null) audio nodes.
            if (componentData.error) {
                console.warn(`[VoiceBuilder v3 Sampler] Skipping connection for component ${componentId} due to earlier error: ${componentData.error}`);
                continue;
            }


            if (previousOutputNode === null) {
                if (componentData.audioOutput) {
                    previousOutputNode = componentData.audioOutput;
                    console.log(`[VoiceBuilder v3 Sampler] Chain starts with output of: ${componentId}`);
                } else {
                    console.warn(`[VoiceBuilder v3 Sampler] First component ${componentId} in chain has no audio output. Chain might be broken.`);
                    if (componentId === (useSampler ? 'sampler' : 'oscillator')) {
                         errorState[componentId] = (errorState[componentId] || "") + " Component is first in chain but has no audioOutput.";
                    }
                }
                continue;
            }

            if (componentData.audioInput) {
                console.log(`[VoiceBuilder v3 Sampler] Connecting output of previous node to input of: ${componentId}`);
                try {
                    previousOutputNode.connect(componentData.audioInput);
                    console.log(`[VoiceBuilder v3 Sampler] Connected: Previous -> ${componentId}.Input`);
                } catch (e) {
                    console.error(`[VoiceBuilder v3 Sampler] Error connecting Previous -> ${componentId}.Input:`, e);
                    errorState[componentId] = (errorState[componentId] || "") + ` Connection error: ${e.message}`;
                    continue;
                }
            } else {
                 console.log(`[VoiceBuilder v3 Sampler] Component ${componentId} has no audio input. Skipping input connection.`);
            }

            if (componentData.audioOutput) {
                previousOutputNode = componentData.audioOutput;
                console.log(`[VoiceBuilder v3 Sampler] Output for next connection is now from: ${componentId}`);
            } else {
                 console.log(`[VoiceBuilder v3 Sampler] Component ${componentId} has no audio output. Previous output node remains unchanged.`);
            }
        }

        // --- Шаг 3: Соединение модуляторов ---
        console.log("[VoiceBuilder v3 Sampler] --- Connecting Modulators ---");
        const modulatorComponentIds = Array.isArray(audioConfig.modulatorComponents) ? audioConfig.modulatorComponents : [];
        if (modulatorComponentIds.length === 0) {
            console.warn("[VoiceBuilder v3 Sampler] audioConfig.modulatorComponents is empty or not an array. No modulators to connect.");
        }

        for (const modId of modulatorComponentIds) {
            const modComp = components[modId];

            if (!presetData[modId]?.enabled) {
                console.log(`[VB3 ConnectMod] ${modId} is not enabled in preset. Skipping connection.`);
                continue;
            }
            if (!modComp) {
                console.warn(`[VB3 ConnectMod] ${modId} component data not found in 'components' object. Skipping connection.`);
                continue;
            }
            if (modComp.error) {
                console.warn(`[VB3 ConnectMod] ${modId} has an error: '${modComp.error}'. Skipping connection.`);
                continue;
            }
             if (!modComp.nodes) { // Added check
                console.warn(`[VB3 ConnectMod] ${modId} component has no nodes. Skipping connection.`);
                continue;
            }

            let modulatorOutputNode = null;
            let expectedModOutputName = 'output';

            if (modId === 'pitchEnvelope') {
                expectedModOutputName = 'pitch';
                modulatorOutputNode = modComp.modOutputs?.pitch;
            } else if (modId === 'filterEnvelope') {
                expectedModOutputName = 'output';
                if (modComp.modOutputs?.output) {
                    modulatorOutputNode = modComp.modOutputs.output;
                } else if (modComp.modOutputs?.amount) {
                     expectedModOutputName = 'amount';
                     modulatorOutputNode = modComp.modOutputs.amount;
                }
            } else if (modId.startsWith('lfo')) {
                expectedModOutputName = 'output';
                modulatorOutputNode = modComp.modOutputs?.output;
            }

            if (!modulatorOutputNode) {
                 console.warn(`[VB3 ConnectMod] ${modId}: Modulator output node '${expectedModOutputName}' not found in modComp.modOutputs. Available: ${modComp.modOutputs ? Object.keys(modComp.modOutputs).join(', ') : 'none'}. Skipping.`);
                 errorState[modId] = (errorState[modId] || "") + ` Modulator output '${expectedModOutputName}' not found;`;
                 continue;
            }

            let targetInfo = null;
            let targetComponentId = null;
            let targetParamName = null;

            if (modId === 'pitchEnvelope') {
                // Pitch envelope should target the active sound source (sampler or oscillator)
                targetComponentId = useSampler ? 'sampler' : 'oscillator';
                // Sampler does not have 'detune'. For simplicity, we might need a different approach or parameter.
                // For now, let's assume if it's a sampler, pitch envelope might not be directly applicable in the same way,
                // or it would require a different parameter on the sampler if supported (e.g., a global pitch shift).
                // This part might need refinement based on Sampler's capabilities for pitch modulation.
                // If Sampler doesn't have a direct equivalent, we might log a warning or skip.
                if (useSampler) {
                    console.warn(`[VB3 ConnectMod] Pitch envelope connection to Sampler's 'detune' is not standard. This might not work as expected or needs a specific sampler parameter.`);
                    // Potentially skip or look for a 'pitch' or similar parameter on the sampler if available.
                    // For now, we'll attempt 'detune' for consistency, but it likely won't work for Sampler.
                    targetParamName = 'detune'; // This will likely fail for sampler, or needs a specific sampler implementation detail.
                                                // A better approach would be to check if components[targetComponentId].modInputs has 'detune'
                } else {
                    targetParamName = 'detune';
                }

            } else if (modId === 'filterEnvelope') {
                targetComponentId = 'filter';
                targetParamName = 'frequency';
            } else if (modId.startsWith('lfo')) {
                const lfoSettings = presetData[modId]?.params;
                if (lfoSettings?.target) {
                    const parts = lfoSettings.target.split('.');
                    if (parts.length === 2) {
                        targetComponentId = parts[0];
                        // If LFO target is 'oscillator' but we are using 'sampler', retarget.
                        if (targetComponentId === 'oscillator' && useSampler) {
                            console.log(`[VB3 ConnectMod] LFO target was 'oscillator', retargeting to 'sampler' as it is active.`);
                            targetComponentId = 'sampler';
                        }
                        targetParamName = parts[1];
                    } else {
                        console.warn(`[VB3 ConnectMod] ${modId}: Invalid target format '${lfoSettings.target}'. Expected 'componentId.paramName'.`);
                        errorState[modId] = (errorState[modId] || "") + ` Invalid LFO target format: ${lfoSettings.target};`;
                        continue;
                    }
                } else {
                    console.warn(`[VB3 ConnectMod] ${modId}: LFO target not specified in preset. Skipping.`);
                    errorState[modId] = (errorState[modId] || "") + ` LFO target not specified;`;
                    continue;
                }
            }

            if (!targetComponentId || !targetParamName) {
                 console.warn(`[VB3 ConnectMod] ${modId}: Target component or parameter name could not be determined. Skipping.`);
                 errorState[modId] = (errorState[modId] || "") + ` Target component/param undetermined;`;
                 continue;
            }

            // If the determined targetComponentId is 'oscillator' but we're using a sampler,
            // and it wasn't already retargeted (like in LFO), then this modulation cannot apply.
            if (targetComponentId === 'oscillator' && useSampler && modId !== 'pitchEnvelope' /* pitchEnvelope handled above */) {
                console.warn(`[VB3 ConnectMod] ${modId} targets 'oscillator', but 'sampler' is active. Modulation skipped for this target.`);
                errorState[modId] = (errorState[modId] || "") + ` Target 'oscillator' inactive (sampler used);`;
                continue;
            }
            // Conversely, if target is 'sampler' but sampler is not in use.
            if (targetComponentId === 'sampler' && !useSampler) {
                 console.warn(`[VB3 ConnectMod] ${modId} targets 'sampler', but 'oscillator' is active. Modulation skipped for this target.`);
                 errorState[modId] = (errorState[modId] || "") + ` Target 'sampler' inactive (oscillator used);`;
                 continue;
            }


            const targetComponentData = components[targetComponentId];
            const targetManager = audioConfig.getManager(targetComponentId);

            targetInfo = {
                comp: targetComponentData,
                param: targetParamName,
                manager: targetManager,
                id: targetComponentId
            };

            if ( targetInfo && targetInfo.comp && !targetInfo.comp.error && targetInfo.comp.nodes && // Added targetInfo.comp.nodes check
                 targetInfo.manager?.connectModulator &&
                 modulatorOutputNode &&
                 targetInfo.comp.modInputs?.[targetInfo.param] )
            {
                console.log(`[VoiceBuilder v3 Sampler] Attempting to connect ${modId} (${expectedModOutputName}) -> ${targetInfo.id}.${targetInfo.param}`);
                if (!targetInfo.manager.connectModulator(targetInfo.comp.nodes, targetInfo.param, modulatorOutputNode)) {
                    const errorMsg = `Failed to connect ${modId} to ${targetInfo.id}.${targetInfo.param}.`;
                    console.error(`[VoiceBuilder v3 Sampler] ${errorMsg}`);
                    errorState[modId] = (errorState[modId] || "") + ` ${errorMsg};`;
                } else {
                    console.log(`[VoiceBuilder v3 Sampler] Successfully connected ${modId} to ${targetInfo.id}.${targetInfo.param}.`);
                }
            } else {
                console.warn(`[VB3 ConnectMod] ${modId} -> ${targetInfo.id}.${targetInfo.param}: Target not found or not connectable. Details:`, {
                    modulatorId: modId,
                    targetComponentId: targetInfo.id,
                    targetParam: targetInfo.param,
                    targetCompExistsAndValid: !!(targetInfo.comp && targetInfo.comp.nodes && !targetInfo.comp.error),
                    targetManagerHasConnectModulator: typeof targetInfo.manager?.connectModulator === 'function',
                    modulatorOutputNodeExists: !!modulatorOutputNode,
                    targetCompModInputsExistsAndHasParam: !!targetInfo.comp?.modInputs?.[targetInfo.param],
                    expectedModOutputName: expectedModOutputName
                });
                errorState[modId] = (errorState[modId] || "") + ` Target ${targetInfo.id}.${targetInfo.param} not connectable;`;
            }
        }

        // --- Финальная проверка ---
        if (!components.outputGain || components.outputGain.error || !components.outputGain.nodes) {
            console.error("[VoiceBuilder v3 Sampler] Critical error: OutputGain component is missing, failed to create, or has no nodes. Voice unusable.");
            // Ensure components created so far are disposed if outputGain fails critically
            await this.disposeComponents(components); // Make sure disposeComponents is async or handles async if managers do
            return null;
        }

        console.log("[VoiceBuilder v3 Sampler] Voice chain build process completed.");
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
        if (!components || !pathString) return null;
        const parts = pathString.split('.');
        let target = null;
        let currentComponentId = null;
        try {
            currentComponentId = parts[0];
            // Handle potential retargeting if oscillator was replaced by sampler
            const activeSourceId = components.sampler?.nodes ? 'sampler' : (components.oscillator?.nodes ? 'oscillator' : null);
            if (currentComponentId === 'oscillator' && activeSourceId === 'sampler') {
                // console.log(`[VB3 findParamByPath] Retargeting path from 'oscillator' to 'sampler'.`);
                currentComponentId = 'sampler';
            }


            const componentData = components[currentComponentId];
            if (!componentData || !componentData.nodes) {
                 // console.warn(`[VB3 findParamByPath] Component ${currentComponentId} or its nodes not found for path '${pathString}'.`);
                 return null;
            }
            target = componentData.nodes;
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (target && typeof target === 'object' && target !== null && target.hasOwnProperty(part)) {
                    target = target[part];
                } else {
                    // console.warn(`[VB3 findParamByPath] Path part '${part}' not found in component ${currentComponentId} for path '${pathString}'.`);
                    target = null;
                    break;
                }
            }
            if (parts.length === 1 && target === componentData.nodes) {
                 console.warn(`[VoiceBuilder v3 Sampler.findParamByPath] Path '${pathString}' points to the component nodes object, not a specific parameter.`);
                 return null; // Or return target if accessing the whole nodes object is intended by a single part path
            }
            return target;
        } catch (e) {
            console.error(`[VoiceBuilder v3 Sampler.findParamByPath] Error accessing path '${pathString}':`, e);
            return null;
        }
    },

    async disposeComponents(components) { // Made async if manager.dispose can be async
        if (!components) return;
        console.log("[VoiceBuilder v3 Sampler] Disposing voice components...");
        const disposePromises = [];

        for (const componentId in components) {
            const componentData = components[componentId];
            // Ensure componentData and componentData.nodes exist before trying to dispose
            if (!componentData || !componentData.nodes) {
                // console.log(`[VB3 Dispose] Skipping disposal for ${componentId}, no data or nodes.`);
                continue;
            }

            const manager = audioConfig.getManager(componentId);
            if (manager && typeof manager.dispose === 'function') {
                try {
                    console.log(`[VoiceBuilder v3 Sampler] Disposing component: ${componentId} using manager.`);
                    const disposeResult = manager.dispose(componentData.nodes);
                    if (disposeResult instanceof Promise) {
                        disposePromises.push(disposeResult.catch(e => console.error(`[VoiceBuilder v3 Sampler] Async error disposing component ${componentId} via manager:`, e)));
                    }
                } catch (e) {
                    console.error(`[VoiceBuilder v3 Sampler] Sync error disposing component ${componentId} via manager:`, e);
                }
            } else if (componentData.nodes) { // Fallback to direct disposal if no manager.dispose
                 console.warn(`[VoiceBuilder v3 Sampler] Manager or dispose method not found for ${componentId}. Attempting direct node disposal.`);
                 for (const nodeKey in componentData.nodes) {
                      const node = componentData.nodes[nodeKey];
                      if (node && typeof node.dispose === 'function') {
                           try {
                                node.dispose();
                                // console.log(`[VB3 Dispose] Directly disposed node ${nodeKey} in ${componentId}`);
                           } catch(e) {
                                console.error(`[VB3 Dispose] Error directly disposing node ${nodeKey} in ${componentId}:`, e);
                           }
                      }
                 }
            }
        }
        await Promise.all(disposePromises);
        console.log("[VoiceBuilder v3 Sampler] Voice components disposal process completed.");
    }
};
