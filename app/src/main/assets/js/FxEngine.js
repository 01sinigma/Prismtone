// app/src/main/assets/js/FxEngine.js
const FxEngine = {
    effects: {}, // Экземпляры Tone.js эффектов { effectId: Tone.EffectNode }
    effectDefinitions: {}, // Описания эффектов { effectId: { constructor, params, defaults } }
    fxBusInput: null,    // Входной узел для FX-шины (например, Tone.Channel из synth.js)
    fxBusOutput: null,   // Выходной узел FX-шины (для подключения к мастер-лимитеру в synth.js)
    currentChainId: null,
    currentChainData: null, // Данные текущей активной цепочки
    isReady: false,

    // Константы для имен эффектов, чтобы избежать опечаток
    EFFECT_TYPES: {
        DELAY: 'delay',
        REVERB: 'reverb',
        CHORUS: 'chorus',
        DISTORTION: 'distortion',
        FILTER: 'filter',
        // Добавьте другие типы эффектов, которые у вас есть
    },

    async init(fxBusInput, fxBusOutput) {
        console.log("[FxEngine] Initializing...");
        if (!fxBusInput || !fxBusOutput) {
            console.error("[FxEngine] fxBusInput или fxBusOutput не предоставлены!");
            this.isReady = false;
            return;
        }
        this.fxBusInput = fxBusInput;
        this.fxBusOutput = fxBusOutput;

        // --- Вариант 1: Жестко закодированные определения эффектов (как было в synth.config) ---
        this.effectDefinitions = {
            [this.EFFECT_TYPES.DELAY]: {
                constructor: Tone.FeedbackDelay,
                params: ['delayTime', 'feedback', 'wet'],
                defaults: { delayTime: 0.25, feedback: 0.5, wet: 0, maxDelay: 1 }
            },
            [this.EFFECT_TYPES.REVERB]: {
                constructor: Tone.JCReverb, // Или Tone.Reverb, если он есть и настроен
                params: ['roomSize', 'wet'],
                defaults: { roomSize: 0.5, wet: 0 }
            },
            [this.EFFECT_TYPES.CHORUS]: {
                constructor: Tone.Chorus,
                params: ['frequency', 'depth', 'delayTime', 'wet'],
                defaults: { frequency: 1.5, depth: 0.7, delayTime: 3.5, wet: 0 }
            },
            [this.EFFECT_TYPES.DISTORTION]: {
                constructor: Tone.Distortion,
                params: ['distortion', 'wet', 'oversample'],
                defaults: { distortion: 0.4, wet: 0, oversample: 'none' }
            },
            [this.EFFECT_TYPES.FILTER]: {
                constructor: Tone.Filter,
                params: ['frequency', 'Q', 'type', 'gain', 'rolloff', 'wet'],
                defaults: { frequency: 20000, Q: 1, type: 'lowpass', gain: 0, rolloff: -12, wet: 1 } // wet: 1 для фильтра может быть логично, если он всегда "включен"
            }
            // Добавьте другие эффекты
        };
        console.log("[FxEngine] Effect definitions (hardcoded):", this.effectDefinitions);

        // --- Вариант 2: Динамическая загрузка определений эффектов из modules/effect/*.json ---
        // (Раскомментируйте этот блок и закомментируйте Вариант 1, если хотите это использовать)
        /*
        this.effectDefinitions = {};
        const effectModules = await moduleManager.getModules('effect', true);
        if (effectModules && effectModules.length > 0) {
            effectModules.forEach(effModule => {
                if (effModule && effModule.id && effModule.data?.data?.parameters) {
                    let constructorFunc = null;
                    if (effModule.id === this.EFFECT_TYPES.DELAY && Tone.FeedbackDelay) constructorFunc = Tone.FeedbackDelay;
                    else if (effModule.id === this.EFFECT_TYPES.REVERB && Tone.JCReverb) constructorFunc = Tone.JCReverb;
                    // ... и так далее для других эффектов ...
                    else if (effModule.id === this.EFFECT_TYPES.FILTER && Tone.Filter) constructorFunc = Tone.Filter;


                    if (constructorFunc) {
                        const defaultParams = {};
                        effModule.data.data.parameters.forEach(param => {
                            if (param.name && param.default !== undefined) {
                                defaultParams[param.name] = param.default;
                            }
                        });
                        this.effectDefinitions[effModule.id] = {
                            constructor: constructorFunc,
                            params: effModule.data.data.parameters.map(p => p.name),
                            defaults: defaultParams
                        };
                        console.log(`[FxEngine] Dynamically added effect definition for: ${effModule.id}`);
                    } else {
                         console.warn(`[FxEngine] No Tone.js constructor found for effect module ID: ${effModule.id}`);
                    }
                }
            });
        } else {
            console.warn("[FxEngine] No 'effect' modules found to build dynamic effectDefinitions.");
        }
        */
        // --- Конец Варианта 2 ---

        this._createAllEffectInstances();
        this.isReady = true;
        console.log("[FxEngine] Initialized. Effects created (inactive).");
        await this.applyFxChainById(app.state.fxChain); // Применяем начальную цепочку
    },

    _createAllEffectInstances() {
        console.log("[FxEngine] Creating all effect instances...");
        this.effects = {};
        for (const effectId in this.effectDefinitions) {
            const def = this.effectDefinitions[effectId];
            if (def && def.constructor) {
                try {
                    // Создаем эффект с параметрами по умолчанию и wet = 0 (выключен)
                    const instance = new def.constructor({ ...def.defaults, wet: 0 });
                    this.effects[effectId] = instance;
                    console.log(`[FxEngine] Created instance for effect: ${effectId}`);
                } catch (e) {
                    console.error(`[FxEngine] Failed to create instance for effect ${effectId}:`, e);
                }
            }
        }
    },

    _disconnectAllEffects() {
        if (this.fxBusInput) {
            try {
                this.fxBusInput.disconnect(); // Отсоединяем вход FX-шины от всего
            } catch (e) { console.warn("[FxEngine] Error disconnecting fxBusInput:", e); }
        }
        for (const effectId in this.effects) {
            const effectInstance = this.effects[effectId];
            if (effectInstance && typeof effectInstance.disconnect === 'function') {
                try {
                    effectInstance.disconnect();
                } catch (e) { /* Игнорируем, если уже отсоединен */ }
            }
        }
        console.log("[FxEngine] All effects disconnected from bus and each other.");
    },

    _resetEffectParamsToDefaults() {
        console.log("[FxEngine] Resetting effect parameters to defaults (wet=0)...");
        for (const effectId in this.effects) {
            const effectInstance = this.effects[effectId];
            const def = this.effectDefinitions[effectId];
            if (effectInstance && def && def.defaults) {
                try {
                    // Устанавливаем параметры по умолчанию, включая wet: 0
                    const resetSettings = { ...def.defaults, wet: 0 };
                    if (typeof effectInstance.set === 'function') {
                        effectInstance.set(resetSettings);
                    } else { // Фоллбэк, если set не доступен (маловероятно для Tone.Effect)
                        for (const param in resetSettings) {
                            if (effectInstance[param] && (effectInstance[param] instanceof Tone.Param || effectInstance[param] instanceof Tone.Signal)) {
                                effectInstance[param].value = resetSettings[param];
                            } else if (effectInstance.hasOwnProperty(param)) {
                                effectInstance[param] = resetSettings[param];
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[FxEngine] Could not reset effect '${effectId}' to defaults:`, e);
                }
            }
        }
    },

    async applyFxChainById(chainId) {
        console.log(`[FxEngine] Attempting to apply FX Chain by ID: ${chainId}`);
        if (!this.isReady) {
            console.warn("[FxEngine] Not ready, cannot apply FX chain.");
            return;
        }
        this.currentChainId = chainId;

        if (!chainId) { // Если chainId null или пустой, применяем "никакую" цепочку
            console.log("[FxEngine] Applying 'None' FX Chain (direct connection).");
            this._disconnectAllEffects();
            this._resetEffectParamsToDefaults(); // Сбрасываем параметры на всякий случай
            if (this.fxBusInput && this.fxBusOutput) {
                try {
                    this.fxBusInput.connect(this.fxBusOutput);
                    console.log("[FxEngine] fxBusInput connected directly to fxBusOutput.");
                } catch (e) { console.error("[FxEngine] Error connecting fxBusInput directly to fxBusOutput:", e); }
            }
            this.currentChainData = null;
            if (typeof fxChains !== 'undefined' && typeof fxChains.updateMacroKnobsFromChain === 'function') {
                fxChains.updateMacroKnobsFromChain(null);
            }
            return;
        }

        const chainModule = await moduleManager.getModule(chainId);
        if (!chainModule || !chainModule.data || !chainModule.data.data) {
            console.error(`[FxEngine] FX Chain module data not found for ID: ${chainId}. Applying 'None' chain.`);
            await this.applyFxChainById(null); // Рекурсивный вызов для сброса
            return;
        }

        this.currentChainData = chainModule.data.data;
        const fxChainSettings = this.currentChainData.effects || []; // Это массив объектов эффектов
        console.log(`[FxEngine] Applying FX chain '${chainId}' with settings:`, JSON.parse(JSON.stringify(fxChainSettings)));

        this._disconnectAllEffects();
        this._resetEffectParamsToDefaults(); // Сначала сбрасываем все эффекты

        const activeEffectInstances = [];
        if (Array.isArray(fxChainSettings)) {
            fxChainSettings.forEach(fxSetting => {
                const effectType = fxSetting.type; // e.g., "delay"
                const effectInstance = this.effects[effectType];
                const definition = this.effectDefinitions[effectType];

                if (effectInstance && definition) {
                    if (fxSetting.enabled !== false) { // Если enabled не false, считаем true
                        const paramsToApply = { ...(fxSetting.params || {}) };
                        // Применяем wet из params, если есть, иначе из definition.defaults (но мы уже сбросили на 0)
                        // Если в fxSetting.params есть wet, он будет использован.
                        // Если его нет, wet останется 0 после _resetEffectParamsToDefaults, что означает "выключен".
                        // Если мы хотим, чтобы enabled=true всегда означало какой-то ненулевой wet,
                        // то нужно добавить логику, например:
                        // if (!paramsToApply.hasOwnProperty('wet')) {
                        //    paramsToApply.wet = definition.defaults.wet !== 0 ? definition.defaults.wet : 0.3; // Пример дефолтного wet
                        // }

                        console.log(`[FxEngine] Configuring effect '${effectType}' with params:`, paramsToApply);
                        try {
                            if (typeof effectInstance.set === 'function') {
                                effectInstance.set(paramsToApply);
                            } else { // Fallback
                                for (const paramName in paramsToApply) {
                                    if (effectInstance[paramName] && (effectInstance[paramName] instanceof Tone.Param || effectInstance[paramName] instanceof Tone.Signal)) {
                                        effectInstance[paramName].value = paramsToApply[paramName];
                                    } else if (effectInstance.hasOwnProperty(paramName)) {
                                        effectInstance[paramName] = paramsToApply[paramName];
                                    }
                                }
                            }
                            activeEffectInstances.push(effectInstance);
                        } catch (e) {
                            console.error(`[FxEngine] Error applying params to effect '${effectType}':`, e, paramsToApply);
                        }
                    } else {
                        console.log(`[FxEngine] Effect '${effectType}' is disabled in chain '${chainId}'.`);
                    }
                } else {
                    console.warn(`[FxEngine] Effect type '${effectType}' in chain '${chainId}' not found or no definition.`);
                }
            });
        }

        // Соединяем активные эффекты и FX шину
        try {
            if (activeEffectInstances.length > 0) {
                this.fxBusInput.chain(...activeEffectInstances, this.fxBusOutput);
                console.log("[FxEngine] Effects chained successfully:", activeEffectInstances.map(inst => inst.constructor.name));
            } else {
                this.fxBusInput.connect(this.fxBusOutput); // Если нет активных эффектов
                console.log("[FxEngine] No active effects, fxBusInput connected directly to fxBusOutput.");
            }
        } catch (chainError) {
            console.error('[FxEngine] Error chaining effects:', chainError);
            try { this.fxBusInput.connect(this.fxBusOutput); } catch (e) {} // Fallback
        }

        // Обновляем UI макро-контроллеров
        if (typeof fxChains !== 'undefined' && typeof fxChains.updateMacroKnobsFromChain === 'function') {
            fxChains.updateMacroKnobsFromChain(this.currentChainData);
        }
    },

    setMacro(macroId, value) {
        if (!this.isReady || !this.currentChainData || !this.currentChainData.macroMappings) {
            // console.warn("[FxEngine] Cannot set macro: Not ready or no current chain/mappings.");
            return;
        }

        const macroLabels = ['Space', 'Time', 'Motion', 'Tone', 'Drive']; // Соответствует data-param на ручках
        const macroIndex = parseInt(macroId.replace('macro', ''), 10) - 1;
        const macroName = macroLabels[macroIndex];

        if (!macroName || !this.currentChainData.macroMappings[macroName]) {
            // console.warn(`[FxEngine] No mapping found for macro: ${macroName} (ID: ${macroId})`);
            return;
        }

        const mappings = this.currentChainData.macroMappings[macroName];
        if (!Array.isArray(mappings)) return;

        mappings.forEach(mapping => {
            const { effect: effectType, param: paramName, range, curve = 'linear' } = mapping;
            if (!effectType || !paramName || !range || range.length !== 2) {
                console.warn(`[FxEngine] Invalid mapping for ${macroName}:`, mapping);
                return;
            }

            const effectInstance = this.effects[effectType];
            const definition = this.effectDefinitions[effectType];
            if (!effectInstance || !definition) {
                console.warn(`[FxEngine] Effect instance or definition for '${effectType}' not found for macro.`);
                return;
            }

            const [min, max] = range;
            let targetValue;
            // TODO: Реализовать разные кривые, если нужно (пока только linear)
            targetValue = min + value * (max - min);

            let actualParamToSet = paramName;
            let actualValueToSet = targetValue;

            if (effectType === this.EFFECT_TYPES.REVERB && paramName === 'decay') {
                actualParamToSet = 'roomSize'; // JCReverb
                actualValueToSet = Math.max(0.001, Math.min(0.999, 0.1 + (targetValue / 10) * 0.85));
            }

            try {
                let targetParam = effectInstance[actualParamToSet];
                if (targetParam instanceof Tone.Param || targetParam instanceof Tone.Signal) {
                    targetParam.rampTo(actualValueToSet, 0.05);
                } else if (effectInstance.hasOwnProperty(actualParamToSet)) {
                    effectInstance[actualParamToSet] = actualValueToSet;
                } else {
                    console.warn(`[FxEngine] Parameter '${actualParamToSet}' not found on effect '${effectType}'.`);
                }
            } catch (e) {
                console.warn(`[FxEngine] Failed to update ${effectType}.${actualParamToSet}:`, e);
            }
        });
    }
};