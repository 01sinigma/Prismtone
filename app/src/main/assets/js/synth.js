/**
 * @file synth.js
 * @description
 * This file defines the main audio synthesis engine for Prismtone.
 * It manages a pool of voices, handles note lifecycle (start, update, release),
 * applies sound presets, and manages an FX chain.
 * Key features include:
 * - Polyphonic voice management using `voiceBuilder.js`.
 * - Asynchronous processing of note events via an update queue (`_updateQueue`, `_processUpdateQueue`)
 *   to prevent blocking the main JavaScript thread, ensuring UI responsiveness.
 * - Master volume control with optional polyphony-based volume scaling.
 * - Y-axis modulation પાર્શ્વભૂમિ for dynamic parameter changes based on touch position.
 * - Global effects bus (`fxBus`) with configurable FX chains (delay, reverb, chorus, etc.).
 * - Analyser node for visualizers.
 */

// Файл: app/src/main/assets/js/synth.js
// ВЕРСИЯ С Master Volume Control, Polyphony Scaling И ГИБКИМ Y-Axis (Часть 1 и 2)
// + АСИНХРОННАЯ ОЧЕРЕДЬ ЗАДАЧ

const synth = {
    voices: [],
    voiceState: [],
    effects: {},
    fxBus: null,
    analyser: null,
    masterVolume: null,
    limiter: null,
    isReady: false,
    activeVoices: new Map(), // Map<touchId, { frequency, noteId, voiceIndex, lastY }>
    silentTimeout: null,
    silentCheckInterval: 3000,
    currentFxChainData: null, // Кэш для данных текущей FX-цепочки (для макросов)
    _activeVoiceCountChanged: false, // Новый флаг
    _previousActiveVoiceCount: 0,    // Для отслеживания изменений
    
    // Новые свойства для очереди
    _updateQueue: new Map(), 
    _isProcessingQueue: false,

    config: {
        polyphony: 4, // Было 10. Для теста ASR ошибки уменьшено до 4.
        defaultPreset: { // Расширяем дефолтный пресет
            oscillator: { params: { type: 'triangle' } },
            amplitudeEnv: { params: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.5 } },
            filter: { params: { frequency: 5000, Q: 1, type: 'lowpass' } },
            outputGain: { params: { gain: 0 } }, // gain 0 = тишина по умолчанию
            pitchEnvelope: { enabled: false, params: { amount: 100, attack: 0.1, decay:0.1, sustain:0.5, release: 0.2 } },
            filterEnvelope: { enabled: false, params: { amount: 0, attack: 0.1, decay:0.1, sustain:0.5, release: 0.2 } },
            lfo1: { enabled: false, params: { rate: 5, depth: 0, target: 'filter.frequency', type: 'sine' } },
            portamento: { enabled: false, time: 0.05 },
            yAxisEffectsSendConfig: {
                minOutput: -45, // dB
                maxOutput: 0, // dB
                yThreshold: 0.1,
                curveType: 'exponential',
                curveFactor: 2.0,
                outputType: 'db'
            }
        },
        effectDefinitions: { // Расширяем определения эффектов
            delay: {
                constructor: Tone.FeedbackDelay,
                params: ['delayTime', 'feedback', 'wet'],
                defaults: { delayTime: 0.25, feedback: 0.5, wet: 0 }
            },
            reverb: { // Оставляем JCReverb
                constructor: Tone.JCReverb,
                params: ['roomSize', 'wet'], // JCReverb имеет roomSize, а не decay/preDelay напрямую
                defaults: { roomSize: 0.5, wet: 0 }
            },
            chorus: { // Новый
                constructor: Tone.Chorus,
                params: ['frequency', 'depth', 'delayTime', 'wet'],
                defaults: { frequency: 1.5, depth: 0.7, delayTime: 3.5, wet: 0 }
            },
            distortion: { // Новый
                constructor: Tone.Distortion,
                params: ['distortion', 'wet'], // 'oversample' можно добавить позже
                defaults: { distortion: 0.4, wet: 0 }
            },
            filter: { // Глобальный фильтр, новый
                constructor: Tone.Filter,
                params: ['frequency', 'Q', 'type', 'gain', 'rolloff', 'wet'],
                defaults: { frequency: 1000, Q: 1, type: 'lowpass', gain: 0, rolloff: -12, wet: 1 }
            },
            pingPongDelay: {
                constructor: Tone.PingPongDelay,
                params: ['delayTime', 'feedback', 'wet'], // Основные параметры для управления
                defaults: { delayTime: "8n", feedback: 0.2, wet: 0, maxDelay: 2 } // "8n" - восьмая нота, синхронизируется с темпом
            },
            phaser: {
                constructor: Tone.Phaser,
                params: ['frequency', 'octaves', 'baseFrequency', 'Q', 'wet'],
                defaults: { frequency: 0.5, octaves: 3, baseFrequency: 350, Q: 10, wet: 0 }
            },
            flanger: {
                constructor: Tone.Flanger,
                params: ['delayTime', 'depth', 'feedback', 'frequency', 'wet'],
                defaults: { delayTime: 0.005, depth: 0.5, feedback: 0.1, frequency: 0.5, wet: 0 }
            },
            vibrato: {
                constructor: Tone.Vibrato,
                params: ['frequency', 'depth', 'wet'],
                defaults: { frequency: 5, depth: 0.1, wet: 0 }
            },
            tremolo: {
                constructor: Tone.Tremolo,
                params: ['frequency', 'depth', 'wet', 'type'], // Добавим type
                defaults: { frequency: 10, depth: 0.5, wet: 0, type: 'sine' }
            },
            autoWah: {
                constructor: Tone.AutoWah,
                params: ['baseFrequency', 'octaves', 'sensitivity', 'Q', 'wet'],
                defaults: { baseFrequency: 100, octaves: 6, sensitivity: -10, Q: 2, wet: 0 }
            },
            eq3: {
                constructor: Tone.EQ3,
                params: ['low', 'mid', 'high', 'lowFrequency', 'highFrequency'], // wet не нужен, эквалайзер всегда в цепи
                defaults: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 }
            },
            compressor: {
                constructor: Tone.Compressor,
                params: ['threshold', 'ratio', 'attack', 'release', 'knee'], // wet не нужен, компрессор всегда в цепи
                defaults: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25, knee: 30 }
            },
            pitchShift: {
                constructor: Tone.PitchShift,
                params: ['pitch', 'windowSize', 'wet'],
                defaults: { pitch: 0, windowSize: 0.1, wet: 0 }
            }
        },
        debug: true
    },

    /**
     * Initializes the synthesizer engine.
     * Sets up the master volume, limiter, analyser, and FX bus.
     * Creates a pool of voice objects based on `config.polyphony` and `config.defaultPreset`,
     * using `voiceBuilder.js` for each voice.
     * Initializes global effects defined in `config.effectDefinitions`.
     * Starts a silent notes check interval.
     * Clears and prepares the asynchronous update queue.
     */
    init() {
        console.log('[Synth v8 - AsyncQueue] Initializing...');
        try {
            this.masterVolume = new Tone.Volume(Tone.gainToDb(1.0)).toDestination();
            this.limiter = new Tone.Limiter(-1).connect(this.masterVolume);
            this.analyser = new Tone.Analyser({ type: 'waveform', size: 1024 });
            this.fxBus = new Tone.Channel({ volume: 0, pan: 0, channelCount: 2 }).connect(this.limiter);

            this.voices = [];
            this.voiceState = [];
            const initialPreset = JSON.parse(JSON.stringify(this.config.defaultPreset));

            for (let i = 0; i < this.config.polyphony; i++) {
                const voiceBuildResult = voiceBuilder.buildVoiceChain(initialPreset);
                if (!voiceBuildResult || !voiceBuildResult.components?.outputGain || voiceBuildResult.errorState?.outputGain) {
                    console.error(`[Synth v7] Failed to create initial voice slot ${i}. Errors:`, voiceBuildResult?.errorState);
                    this.voices.push({ components: null, errorState: voiceBuildResult?.errorState || { critical: "Build failed" }, fxSend: null, currentPresetData: null });
                } else {
                    const fxSend = new Tone.Channel({ volume: -Infinity, channelCount: 2 }).connect(this.fxBus);
                    const outputNode = voiceBuildResult.components.outputGain.audioOutput;
                    if (outputNode) {
                        outputNode.fan(fxSend, this.analyser, this.limiter);
                    } else {
                       console.error(`[Synth v7 init] Output node not found for voice ${i}! FX send disabled.`);
                       fxSend.dispose();
                       if(voiceBuildResult.errorState) voiceBuildResult.errorState.outputGain = "Output node missing";
                    }
                    this.voices.push({
                        components: voiceBuildResult.components,
                        errorState: voiceBuildResult.errorState,
                        fxSend: outputNode ? fxSend : null,
                        currentPresetData: JSON.parse(JSON.stringify(initialPreset))
                    });
                }
                this.voiceState.push({ isBusy: false, touchId: null, noteId: null, startTime: 0 });
            }
            console.log(`[Synth v7 init] Initialized ${this.voices.filter(v => v.components).length}/${this.config.polyphony} voice slots.`);

            if (this.analyser && this.limiter && !this.analyser.numberOfOutputs) {
                 try { this.analyser.connect(this.limiter); } catch (e) { console.error("[Synth v7 init] Error connecting analyser (fallback):", e); }
            }

            console.log("[Synth v7 init] Creating global effect instances...");
            this.effects = {};
            const globalEffectOrder = ['delay', 'chorus', 'distortion', 'filter', 'reverb']; // Определяем порядок
            for (const effectName of globalEffectOrder) {
                 const def = this.config.effectDefinitions[effectName];
                 if (def && def.constructor) {
                      try {
                           // Для Tone.Filter и других эффектов, где 'wet' может быть проблемой в конструкторе,
                           // создаем с дефолтами БЕЗ 'wet', а 'wet' устанавливаем отдельно.
                           const constructorParams = { ...def.defaults };
                           delete constructorParams.wet;

                           const effectInstance = new def.constructor(constructorParams);

                           // Устанавливаем wet отдельно, если он есть в Tone.js API узла
                           if (effectInstance.wet && effectInstance.wet instanceof Tone.Param) {
                               effectInstance.wet.value = 0;
                           } else if (effectName === 'filter' && def.defaults.wet === 1) {
                               // Для фильтра, если wet по умолчанию 1, это значит, он должен быть всегда "включен"
                               // и не имеет стандартного .wet параметра для микса.
                               // Его "включенность" регулируется только наличием в цепочке.
                               // Поэтому здесь ничего не делаем с wet для Tone.Filter
                           }

                           this.effects[effectName] = effectInstance;
                           console.log(`[Synth Init FX] Created global effect: ${effectName} (${effectInstance.constructor.name}), initial wet: ${effectInstance.wet ? effectInstance.wet.value.toFixed(2) : 'N/A (no wet param)'}`);
                      } catch (effectError) {
                           console.error(`[Synth v7 init] Failed to create global effect '${effectName}':`, effectError);
                      }
                 } else if (def) { // Если определение есть, но нет конструктора
                     console.warn(`[Synth v7 init] No constructor found for effect definition '${effectName}'. Skipping.`);
                 }
                 // Если def не найден, это нормально, если не все эффекты из списка реализованы
            }

            this.isReady = true;
            console.log('[Synth v7 init] Synth engine marked as READY.');

            this.applyFxChain([]); // Применяем пустую цепочку, чтобы корректно соединить fxBus с limiter
            this.applyMasterVolumeSettings(); // Применяем начальные настройки мастер-громкости
            this.startSilentNotesCheck();
            this._previousActiveVoiceCount = 0;
            this._updateQueue.clear(); // Очистим очередь при инициализации
            this._isProcessingQueue = false;

        } catch (error) {
            console.error('[Synth v7 init] Initialization failed:', error, error.stack);
            this.isReady = false;
        }
    },

    /**
     * Applies master volume settings, including ceiling and polyphony scaling.
     * Reads settings from `app.state` and applies them to `this.masterVolume`.
     */
    applyMasterVolumeSettings() {
        if (!this.isReady || !this.masterVolume || !app || !app.state) {
            console.warn("[Synth applyMasterVolumeSettings] Not ready or masterVolume/app.state missing.");
            return;
        }
        let finalMasterGain = app.state.masterVolumeCeiling ?? 1.0;

        if (app.state.enablePolyphonyVolumeScaling) {
            const numTouches = this.activeVoices.size;
            if (numTouches > 1) { // Уменьшение начинается со второго активного касания
                const reductionFactor = Math.max(0.1, 1.0 - (numTouches - 1) * 0.05);
                finalMasterGain *= reductionFactor;
            }
        }
        // Преобразовать линейный гейн в dB для Tone.Volume
        const finalMasterDb = Tone.gainToDb(Math.max(0.0001, finalMasterGain)); // Предотвращаем -Infinity
        this.masterVolume.volume.value = finalMasterDb; // Используем .value для немедленного применения

        if (this.config.debug) {
            console.log(`[Synth MasterVol] Ceiling: ${app.state.masterVolumeCeiling.toFixed(2)}, PolyScale: ${app.state.enablePolyphonyVolumeScaling}, Touches: ${this.activeVoices.size}, Final Gain: ${finalMasterGain.toFixed(3)} (${finalMasterDb.toFixed(1)}dB)`);
        }
    },

    /**
     * Calculates a generic parameter value based on Y-axis position and a configuration object.
     * Supports linear, exponential, logarithmic, and S-curve mappings.
     * @param {number} yPosition - Normalized Y-axis position (0 to 1).
     * @param {object} config - Configuration object for the calculation.
     * @param {number} [config.minOutput=0] - The minimum output value.
     * @param {number} [config.maxOutput=1] - The maximum output value.
     * @param {number} [config.yThreshold=0.0] - The Y position below which `minOutput` is returned.
     * @param {'linear'|'exponential'|'logarithmic'|'sCurve'} [config.curveType='linear'] - The type of curve to apply.
     * @param {number} [config.curveFactor=1.0] - A factor influencing the shape of the curve.
     * @param {'gain'|'db'} [config.outputType] - Optional. If 'db', -Infinity is used for values below threshold.
     * @returns {number} The calculated parameter value.
     */
    calculateGenericYParameter(yPosition, config) {
        const {
            minOutput = 0,
            maxOutput = 1,
            yThreshold = 0.0,
            curveType = 'linear',
            curveFactor = 1.0,
        } = config || {};

        const yNorm = Math.max(0, Math.min(1, yPosition));

        if (yNorm < yThreshold) {
            return (config?.outputType === 'db') ? -Infinity : minOutput;
        }

        const effectiveY = (yThreshold >= 1.0) ? 0 : (yNorm - yThreshold) / (1.0 - yThreshold);
        let scaledValue;

        switch (curveType) {
            case 'exponential':
                scaledValue = Math.pow(effectiveY, Math.max(0.1, curveFactor));
                break;
            case 'logarithmic':
                scaledValue = 1 - Math.pow(1 - effectiveY, Math.max(0.1, curveFactor));
                break;
            case 'sCurve':
                const k = (curveFactor - 0.1) / (5.0 - 0.1) * 10.0 - 5.0; // Преобразуем 0.1-5 в -5 до 5
                const val = 1 / (1 + Math.exp(-k * (effectiveY - 0.5)));
                const sMin = 1 / (1 + Math.exp(k * 0.5));
                const sMax = 1 / (1 + Math.exp(-k * 0.5));
                if (sMax - sMin !== 0) {
                   scaledValue = (val - sMin) / (sMax - sMin);
                } else {
                   scaledValue = effectiveY;
                }
                break;
            case 'linear':
            default:
                scaledValue = effectiveY;
                break;
        }
        scaledValue = Math.max(0, Math.min(1, scaledValue));
        let finalOutput = minOutput + scaledValue * (maxOutput - minOutput);
        return Math.max(minOutput, Math.min(maxOutput, finalOutput));
    },

    /**
     * Applies a sound preset to all voices in the synth.
     * If `forceRecreation` is true, voices are completely rebuilt. Otherwise, parameters are updated.
     * @param {object} presetData - The sound preset object containing component settings.
     * @param {boolean} [forceRecreation=false] - Whether to force a full recreation of voice components.
     */
    applyPreset(presetData, forceRecreation = false) {
        const t0 = performance.now();
        if (!this.isReady || !presetData) {
            console.warn('[Synth v8 - AsyncQueue] Cannot apply preset. Synth not ready or presetData is null.');
            return;
        }
        if (this.config.debug) console.log('[Synth v8 - AsyncQueue] Applying preset to all voices:', presetData);

        const safePresetData = {};
        const defaultPresetCopy = JSON.parse(JSON.stringify(this.config.defaultPreset));
        for (const compId in defaultPresetCopy) {
            safePresetData[compId] = { ...defaultPresetCopy[compId] };
            if (defaultPresetCopy[compId].params) {
                safePresetData[compId].params = { ...defaultPresetCopy[compId].params };
            }
        }
        for (const compId in presetData) {
            if (!safePresetData[compId]) safePresetData[compId] = {};
            if (presetData[compId].hasOwnProperty('enabled')) {
                safePresetData[compId].enabled = presetData[compId].enabled;
            }
            if (presetData[compId].params) {
                if (!safePresetData[compId].params) safePresetData[compId].params = {};
                safePresetData[compId].params = { ...safePresetData[compId].params, ...presetData[compId].params };
            } else if (typeof presetData[compId] === 'object' && presetData[compId] !== null &&
                       !presetData[compId].hasOwnProperty('enabled') && !presetData[compId].hasOwnProperty('params')) {
                if (!safePresetData[compId].params) safePresetData[compId].params = {};
                safePresetData[compId].params = { ...safePresetData[compId].params, ...presetData[compId] };
            }
        }
        if (presetData.portamento) {
            safePresetData.portamento = { ...defaultPresetCopy.portamento, ...presetData.portamento };
        }

        let t1 = performance.now();
        this.voices.forEach((voiceData, index) => {
            if (!voiceData) return;
            try {
                const oldPresetData = voiceData.currentPresetData || this.config.defaultPreset;
                let needsRecreation = forceRecreation || !voiceData.components;
                let t2 = performance.now();
                // Сравнение типа осциллятора с учетом undefined/null
                // Проверка типа осциллятора теперь делегирована oscillatorManager.update
                // const oldOscType = oldPresetData.oscillator?.params?.type ?? null;
                // const newOscType = safePresetData.oscillator?.params?.type ?? null;
                // if (!needsRecreation && oldOscType !== newOscType) {
                // if (this.config.debug) console.log(`[Synth applyPreset] Reason for recreation: Oscillator type changed ('${oldOscType}' -> '${newOscType}')`);
                // needsRecreation = true;
                // }
                const optionalComponents = ['pitchEnvelope', 'filterEnvelope', 'lfo1'];
                for (const optCompId of optionalComponents) {
                    const oldEnabled = oldPresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                    const newEnabled = safePresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                    if (oldEnabled !== newEnabled) {
                        if (this.config.debug) console.log(`[Synth applyPreset] Reason for recreation: Optional component '${optCompId}' enabled state changed (${oldEnabled} -> ${newEnabled})`);
                        needsRecreation = true;
                        break;
                    }
                }
                if (!needsRecreation) {
                    const oldPortaEnabled = oldPresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    const newPortaEnabled = safePresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    if (oldPortaEnabled !== newPortaEnabled) {
                        if (this.config.debug) console.log(`[Synth applyPreset] Reason for recreation: Portamento enabled state changed (${oldPortaEnabled} -> ${newPortaEnabled})`);
                        needsRecreation = true;
                    }
                }
                let t3 = performance.now();
                if (needsRecreation) {
                    if (this.config.debug) console.log(`[Synth applyPreset] RECREATING voice ${index}.`);
                    if (this.voiceState[index]?.isBusy) { this.triggerRelease(this.voiceState[index].touchId); }
                    voiceBuilder.disposeComponents(voiceData.components);
                    if (voiceData.fxSend) voiceData.fxSend.dispose();

                    const newVoiceBuildResult = voiceBuilder.buildVoiceChain(safePresetData);
                    if (newVoiceBuildResult && newVoiceBuildResult.components?.outputGain && !newVoiceBuildResult.errorState?.outputGain) {
                        const fxSend = new Tone.Channel({ volume: -Infinity, channelCount: 2 }).connect(this.fxBus);
                        const outputNode = newVoiceBuildResult.components.outputGain.audioOutput;
                        if (outputNode) {
                             outputNode.fan(fxSend, this.analyser, this.limiter);
                             this.voices[index] = {
                                 components: newVoiceBuildResult.components,
                                 errorState: newVoiceBuildResult.errorState,
                                 fxSend: fxSend,
                                 currentPresetData: JSON.parse(JSON.stringify(safePresetData))
                             };
                        } else { throw new Error("Output node missing after recreation for voice " + index); }
                    } else {
                        console.error(`[Synth v7 applyPreset] Failed to recreate voice slot ${index}. Errors:`, newVoiceBuildResult?.errorState);
                        this.voices[index] = { components: null, errorState: newVoiceBuildResult?.errorState || { critical: "Recreation failed" }, fxSend: null, currentPresetData: null };
                        this.releaseVoice(index);
                    }
                } else {
                    if (this.config.debug) console.log(`[Synth applyPreset] UPDATING voice ${index} parameters.`);
                    const components = voiceData.components;
                    const errorState = voiceData.errorState || {};
                    for (const componentId in safePresetData) {
                        const manager = audioConfig.getManager(componentId);
                        const compData = components[componentId];
                        const newSettings = safePresetData[componentId];
                        if (!manager || !compData || errorState[componentId]) continue;
                        let paramsToUpdate = null;
                        if (newSettings.params) {
                            paramsToUpdate = { ...newSettings.params };
                        } else if (typeof newSettings === 'object' && newSettings !== null && !newSettings.hasOwnProperty('enabled')) {
                            if (componentId === 'oscillator' || componentId === 'amplitudeEnv' || componentId === 'filter' || componentId === 'outputGain') {
                                paramsToUpdate = { ...newSettings };
                            }
                        }
                        if (componentId === 'oscillator') {
                            if (!paramsToUpdate) paramsToUpdate = {};
                            // Передаем новый тип осциллятора, если он есть в пресете
                            if (newSettings.params && newSettings.params.type) {
                                paramsToUpdate.type = newSettings.params.type;
                            } else if (newSettings.type) { // Если тип указан напрямую в newSettings (менее вероятно для пресетов)
                                paramsToUpdate.type = newSettings.type;
                            }
                            paramsToUpdate.portamento = (safePresetData.portamento?.enabled && safePresetData.portamento.time !== undefined)
                                                      ? safePresetData.portamento.time
                                                      : 0;
                            if (this.config.debug) console.log(`[Synth applyPreset] Updating oscillator for voice ${index} with params:`, JSON.stringify(paramsToUpdate));
                        }
                        if (paramsToUpdate && Object.keys(paramsToUpdate).length > 0 && typeof manager.update === 'function') {
                            // Результат manager.update пока не используется, но может быть использован для флага reconnected
                            if (!manager.update(compData.nodes, paramsToUpdate, components, voiceData.fxSend, this.analyser, this.limiter, safePresetData)) { // Передаем больше контекста менеджеру
                                errorState[componentId] = "Update failed";
                            }
                        }
                    }
                    voiceData.currentPresetData = JSON.parse(JSON.stringify(safePresetData));
                    voiceData.errorState = errorState;
                }
                let t4 = performance.now();
                if (this.config.debug) {
                    console.log(`[Synth.applyPreset] Voice ${index} timings: prep=${(t2-t1).toFixed(2)}ms, checkRecreate=${(t3-t2).toFixed(2)}ms, buildOrUpdate=${(t4-t3).toFixed(2)}ms, totalVoice=${(t4-t1).toFixed(2)}ms`);
                }
            } catch (error) {
                console.error(`[Synth v7 applyPreset] Error applying preset to voice ${index}:`, error, error.stack);
                this.releaseVoice(index);
                if (voiceData) {
                    voiceData.components = null;
                    voiceData.errorState = { critical: `Apply preset failed: ${error.message}` };
                }
            }
        });
        if (this.config.debug) console.log('[Synth v7] Preset applied.');
        const t2 = performance.now();
        const duration = t2 - t0;
        if (duration > 10) {
            console.warn(`[Synth.applyPreset] Long execution: ${duration.toFixed(2)}ms`);
        }
    },

    // ====================================================================
    // === НОВЫЕ ПУБЛИЧНЫЕ МЕТОДЫ: Только добавляют задачи в очередь ===
    // ====================================================================

    /**
     * Public method to start playing a note.
     * Adds a 'start' task to the `_updateQueue` for asynchronous processing.
     * Does not block the main thread.
     * @param {number} frequency - The frequency of the note in Hz.
     * @param {number} velocity - The velocity (amplitude) of the note (0 to 1).
     * @param {number} yPosition - The normalized Y-axis position of the touch (0 to 1), used for modulation.
     * @param {string|number} touchId - A unique identifier for the touch/pointer.
     */
    startNote(frequency, velocity, yPosition, touchId) {
        this._updateQueue.set(touchId, {
            action: 'start',
            frequency,
            velocity,
            yPosition,
            noteId: `${touchId}-${performance.now()}` // Уникальный ID для ноты
        });
        this._processUpdateQueue();
    },

    /**
     * Public method to update parameters of an already playing note.
     * Adds an 'update' task to the `_updateQueue`.
     * @param {number} frequency - The new frequency for the note.
     * @param {number} velocity - The new velocity.
     * @param {number} yPosition - The new Y-axis position.
     * @param {string|number} touchId - The unique identifier for the touch/pointer.
     */
    updateNote(frequency, velocity, yPosition, touchId) {
        const task = this._updateQueue.get(touchId) || { action: 'update', noteId: this.activeVoices.get(touchId)?.noteId };
        if (task.action === 'release') {
            if (this.config.debug) console.warn(`[Synth] Ignoring update for touchId ${touchId} because a release is already queued.`);
            return;
        }
        task.frequency = frequency;
        task.velocity = velocity;
        task.yPosition = yPosition;
        this._updateQueue.set(touchId, task);
        this._processUpdateQueue();
    },

    /**
     * Public method to trigger the release phase of a note.
     * Adds a 'release' task to the `_updateQueue`.
     * @param {string|number} touchId - The unique identifier for the touch/pointer.
     */
    triggerRelease(touchId) {
        const activeNoteId = this.activeVoices.get(touchId)?.noteId;
        this._updateQueue.set(touchId, { action: 'release', noteId: activeNoteId });
        this._processUpdateQueue();
    },

    // ====================================================================
    // === НОВЫЕ ПРИВАТНЫЕ МЕТОДЫ: Обработчик очереди и исполнители ===
    // ====================================================================

    /**
     * Processes tasks from the `_updateQueue` asynchronously using `requestAnimationFrame`.
     * Ensures that synth updates happen smoothly without blocking the UI.
     * Iterates through the `_updateQueue`, calling corresponding `_execute...` methods.
     * @private
     */
    _processUpdateQueue() {
        if (this._isProcessingQueue || this._updateQueue.size === 0) {
            return;
        }
        this._isProcessingQueue = true;

        requestAnimationFrame(() => {
            const tasksToProcess = this._updateQueue;
            this._updateQueue = new Map();

            if (this.config.debug && tasksToProcess.size > 0) {
                console.log(`[Synth Queue] Processing ${tasksToProcess.size} tasks.`);
            }

            tasksToProcess.forEach((task, touchId) => {
                try {
                    switch (task.action) {
                        case 'start':
                            this._executeStartNote(task.frequency, task.velocity, task.yPosition, touchId, task.noteId);
                            break;
                        case 'update':
                            this._executeUpdateNote(task.frequency, task.velocity, task.yPosition, touchId);
                            break;
                        case 'release':
                            this._executeTriggerRelease(touchId);
                            break;
                    }
                } catch (e) {
                    console.error(`[Synth Queue] Error processing task for touchId ${touchId}:`, task, e);
                }
            });

            if (this._activeVoiceCountChanged) {
                this.applyMasterVolumeSettings();
                this._activeVoiceCountChanged = false;
            }

            this._isProcessingQueue = false;

            if (this._updateQueue.size > 0) {
                this._processUpdateQueue();
            }
        });
    },

    /**
     * Executes the logic for starting a new note. Called by `_processUpdateQueue`.
     * Finds a free voice, applies the preset, sets parameters, and triggers the attack phase.
     * Manages `activeVoices` map.
     * @param {number} frequency - The frequency of the note.
     * @param {number} velocity - The velocity of the note.
     * @param {number} yPosition - The Y-axis position for modulation.
     * @param {string|number} touchId - The touch identifier.
     * @param {string} noteId - A unique ID for this specific note instance.
     * @private
     */
    _executeStartNote(frequency, velocity, yPosition, touchId, noteId) {
        if (!this.isReady) return;
        const voiceIndex = this.getFreeVoiceIndex(touchId);
        if (voiceIndex === -1) return;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components || voiceData.errorState?.critical) {
           this.releaseVoice(voiceIndex);
           return;
        }
        const components = voiceData.components;
        const calculatedVolume = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.volume);
        const calculatedSendLevel = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.effects);
        if (this.config.debug) {
            console.log(`>>> EXECUTE START: Freq=${frequency.toFixed(1)}, Touch=${touchId}, Voice=${voiceIndex}, Vol=${calculatedVolume.toFixed(2)}, Send=${calculatedSendLevel.toFixed(1)}dB`);
        }
        audioConfig.getManager('oscillator')?.update(components.oscillator.nodes, { frequency });
        audioConfig.getManager('outputGain')?.update(components.outputGain.nodes, { gain: calculatedVolume });
        if (voiceData.fxSend) voiceData.fxSend.volume.value = calculatedSendLevel;
        audioConfig.getManager('amplitudeEnv')?.triggerAttack(components.amplitudeEnv.nodes, Tone.now(), velocity);
        if (voiceData.currentPresetData?.pitchEnvelope?.enabled) {
            audioConfig.getManager('pitchEnvelope')?.triggerAttack(components.pitchEnvelope.nodes, Tone.now());
        }
        if (voiceData.currentPresetData?.filterEnvelope?.enabled) {
            audioConfig.getManager('filterEnvelope')?.triggerAttack(components.filterEnvelope.nodes, Tone.now());
        }
        if (voiceData.currentPresetData?.lfo1?.enabled) {
            audioConfig.getManager('lfo1')?.enable(components.lfo1.nodes, true, { retrigger: voiceData.currentPresetData.lfo1.params?.retrigger ?? false });
        }
        this.voiceState[voiceIndex] = { isBusy: true, touchId: touchId, noteId: noteId, startTime: Tone.now() };
        this.activeVoices.set(touchId, { frequency, noteId, voiceIndex, lastY: yPosition });
            if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
                this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    /**
     * Executes the logic for updating an existing note. Called by `_processUpdateQueue`.
     * Finds the active voice associated with `touchId` and updates its parameters.
     * @param {number} frequency - The new frequency.
     * @param {number} velocity - The new velocity.
     * @param {number} yPosition - The new Y-axis position.
     * @param {string|number} touchId - The touch identifier.
     * @private
     */
    _executeUpdateNote(frequency, velocity, yPosition, touchId) {
        if (!this.isReady) return;
        const voiceIndex = this.findVoiceIndex(touchId);
        if (voiceIndex === -1) return;

        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components) return;

        const activeVoice = this.activeVoices.get(touchId);

        // >>> ОПТИМИЗАЦИЯ: Проверяем, изменилось ли что-то <<<
        const yChanged = activeVoice && Math.abs(activeVoice.lastY - yPosition) > 0.001; // Порог для Y
        const freqChanged = activeVoice && Math.abs(activeVoice.frequency - frequency) > 0.1; // Порог для частоты (в Гц)

        if (!yChanged && !freqChanged) {
            return; // Ничего не изменилось, выходим
        }
        // --- КОНЕЦ ОПТИМИЗАЦИИ ---

        if (activeVoice) activeVoice.lastY = yPosition;

        const calculatedVolume = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.volume);
        const calculatedSendLevel = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.effects);

        if (freqChanged) { // Обновляем только если изменилось
            audioConfig.getManager('oscillator')?.update(voiceData.components.oscillator.nodes, { frequency });
            if (activeVoice) activeVoice.frequency = frequency;
        }

        // Громкость и посыл на эффекты обновляем, только если изменился Y
        if (yChanged) {
            audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
            if (voiceData.fxSend) {
                // Вместо прямого присвоения используем rampTo для плавности
                voiceData.fxSend.volume.rampTo(calculatedSendLevel, 0.02);
            }
        }
    },

    /**
     * Executes the logic for releasing a note. Called by `_processUpdateQueue`.
     * Finds the active voice and triggers its release phase.
     * Updates `activeVoices` map and `voiceState`.
     * @param {string|number} touchId - The touch identifier.
     * @private
     */
    _executeTriggerRelease(touchId) {
        if (!this.isReady) return;
            const voiceIndex = this.findVoiceIndex(touchId);
        if (voiceIndex === -1) return;
                const voiceData = this.voices[voiceIndex];
                if (voiceData && voiceData.components) {
            audioConfig.getManager('amplitudeEnv')?.triggerRelease(voiceData.components.amplitudeEnv.nodes, Tone.now());
            if (voiceData.currentPresetData?.pitchEnvelope?.enabled) {
                audioConfig.getManager('pitchEnvelope')?.triggerRelease(voiceData.components.pitchEnvelope.nodes, Tone.now());
            }
            if (voiceData.currentPresetData?.filterEnvelope?.enabled) {
                audioConfig.getManager('filterEnvelope')?.triggerRelease(voiceData.components.filterEnvelope.nodes, Tone.now());
                    }
                }
                this.releaseVoice(voiceIndex);
        this.activeVoices.delete(touchId);
        if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
            this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    // ====================================================================
    // === ВСЕ ОСТАЛЬНЫЕ МЕТОДЫ ОСТАЮТСЯ НИЖЕ (applyPreset, getAnalyser, и т.д.) ===
    // ====================================================================

    /**
     * Applies an FX chain to the synthesizer.
     * Connects effects in the specified order to the `fxBus`.
     * @param {Array<object>|object} fullFxChainData - An array of effect objects or a single FX chain object
     *                                                containing the chain configuration and parameters.
     *                                                If an array, it's assumed to be the `chain` property.
     *                                                If an object, it should have a `chain` property.
     *                                                Each effect object in the chain should have `id` and `params`.
     */
    applyFxChain(fullFxChainData) {
        this.currentFxChainData = fullFxChainData ? JSON.parse(JSON.stringify(fullFxChainData)) : null;
        const fxChainSettingsArray = fullFxChainData ? fullFxChainData.effects : [];
        console.log(`[Synth FX ApplyChain] Applying FX Chain. App State ChainID: ${app.state.fxChain}. Received full data: ${!!fullFxChainData}, Effects array length: ${fxChainSettingsArray ? fxChainSettingsArray.length : 'null/undefined'}`);

        if (this.config.debug && fxChainSettingsArray && fxChainSettingsArray.length > 0) {
            console.log('[Synth FX ApplyChain] FX Settings Details (raw array):', fxChainSettingsArray);
            fxChainSettingsArray.forEach((eff, idx) => {
                let paramsString = '[Could not stringify params]';
                try { paramsString = JSON.stringify(eff.params || {}); } catch (e) {}
                console.log(`[Synth FX ApplyChain] Detail for effect ${idx} (type ${eff.type}): enabled=${eff.enabled !== false}, params=${paramsString}, targetWet=${eff.params?.wet ?? (this.config.effectDefinitions[eff.type]?.defaults.wet ?? 0)}`);
            });
        }
        if (!this.isReady) { console.warn("[Synth v7] Cannot apply FX chain, synth not ready."); return; }
        if (this.config.debug) console.log('[Synth v7] Applying FX chain settings to global effects:', fxChainSettingsArray);

        // Отсоединяем всё от fxBus и эффекты друг от друга
        this.fxBus.disconnect();
        Object.values(this.effects).forEach(effect => { if(effect && typeof effect.disconnect === 'function') effect.disconnect(); });

        // Сброс параметров эффектов к их дефолтам (особенно wet=0)
        for (const effectName in this.effects) {
            const effectInstance = this.effects[effectName];
            const def = this.config.effectDefinitions[effectName];
            if (effectInstance && def && def.defaults) {
                try {
                    effectInstance.set({ ...def.defaults, wet: 0 });
                } catch (e) { console.warn(`[Synth v7] Could not reset effect '${effectName}' to defaults:`, e); }
            }
        }

        const activeEffectNodes = [];
        if (Array.isArray(fxChainSettingsArray)) {
            fxChainSettingsArray.forEach(fxSetting => {
                const effectName = fxSetting.type;
                const effectInstance = this.effects[effectName];
                const definition = this.config.effectDefinitions[effectName];

                if (effectInstance && definition) {
                    let paramsToApply = { ...(fxSetting.params || {}) };
                    if (fxSetting.enabled !== false) {
                        if (!paramsToApply.hasOwnProperty('wet')) {
                            if (effectName !== 'filter') {
                                paramsToApply.wet = 0;
                                console.log(`[Synth FX ApplyChain] Effect '${effectName}' enabled, 'wet' not in params, defaulted to 0.`);
                            } else {
                                if (paramsToApply.hasOwnProperty('wet')) {
                                    console.warn(`[Synth FX ApplyChain] 'wet' parameter found for Tone.Filter in chain, but Tone.Filter does not use it directly. Params:`, paramsToApply);
                                }
                            }
                        }
                    }
                    if (this.config.debug) console.log(`[Synth FX ApplyChain] Configuring effect '${effectName}'. Enabled: ${fxSetting.enabled !== false}. Final Params:`, JSON.parse(JSON.stringify(paramsToApply)));
                    if (effectName === 'reverb' && paramsToApply.hasOwnProperty('decay')) {
                        const decay = paramsToApply.decay;
                        paramsToApply.roomSize = Math.max(0.01, Math.min(0.99, 0.01 + (Math.max(0.1, Math.min(10, decay)) / 10) * 0.98));
                        delete paramsToApply.decay;
                        if (paramsToApply.hasOwnProperty('preDelay')) {
                            console.warn(`[Synth applyFxChain] 'preDelay' param for Reverb (JCReverb) is ignored.`);
                            delete paramsToApply.preDelay;
                        }
                    }
                    try {
                        if (Object.keys(paramsToApply).length > 0) {
                            effectInstance.set(paramsToApply);
                        }
                        if (fxSetting.enabled !== false) {
                            if (effectName !== 'filter' && paramsToApply.wet > 0) {
                                activeEffectNodes.push(effectInstance);
                            } else if (effectName === 'filter') {
                                activeEffectNodes.push(effectInstance);
                            }
                        } else {
                            if (this.config.debug) console.log(`[Synth v7] Effect '${effectName}' is disabled in chain.`);
                        }
                    } catch (e) {
                        console.warn(`[Synth v7] Could not apply settings to global effect '${effectName}':`, e, paramsToApply);
                    }
                } else {
                    console.warn(`[Synth v7] Effect type '${effectName}' not found in global effects or definitions.`);
                }
            });
        } else {
            console.warn("[Synth v7] applyFxChain received invalid settings format (expected array):", fxChainSettingsArray);
        }

        // Соединяем активные эффекты в цепочку
        try {
            if (activeEffectNodes.length > 0) {
                this.fxBus.chain(...activeEffectNodes, this.limiter);
                console.log('[Synth FX ApplyChain] FX Bus Chaining Complete. Active effect nodes connected:', activeEffectNodes.map(n => n.constructor.name).join(', '));
            } else {
                this.fxBus.connect(this.limiter); // Если нет эффектов, fxBus идет напрямую в лимитер
                if (this.config.debug) console.log('[Synth v7] No active global effects. FX Bus connected to limiter.');
            }
        } catch (chainError) {
            console.error('[Synth v7] Error chaining global effects:', chainError);
            try { this.fxBus.connect(this.limiter); } catch(e){} // Fallback
        }

        if (this.config.debug) console.log('[Synth v7] FX chain applied.');
        this.updateAllActiveVoiceSendLevels();

        if (typeof fxChains !== 'undefined' && typeof fxChains.updateMacroKnobsFromChain === 'function') {
            fxChains.updateMacroKnobsFromChain(this.currentFxChainData);
        }
    },

    /**
     * Returns the analyser node for use by visualizers.
     * @returns {Tone.Analyser|null} The analyser node or null if not ready.
     */
    getAnalyser() { return this.analyser; },

    /**
     * Retrieves the current settings of all active global effects.
     * Useful for saving the current FX state or for UI display.
     * @returns {object} An object where keys are effect names and values are their current parameters.
     */
    getCurrentFxSettings() {
        const settings = [];
        if (!this.isReady) return settings;
        // Используем порядок из effectDefinitions или заданный массив, чтобы гарантировать порядок
        const globalEffectOrder = Object.keys(this.config.effectDefinitions); // Или ваш массив ['delay', 'reverb', ...]

        for (const effectName of globalEffectOrder) {
            if (this.effects[effectName] && this.config.effectDefinitions[effectName]) {
                const effect = this.effects[effectName];
                const def = this.config.effectDefinitions[effectName];
                const effectSetting = { type: effectName, params: {} };

                def.params.forEach(paramName => {
                    try {
                        let currentValue = (effect[paramName] instanceof Tone.Param || effect[paramName] instanceof Tone.Signal)
                                          ? effect[paramName].value
                                          : effect[paramName];
                        if (typeof currentValue === 'number') {
                            effectSetting.params[paramName] = parseFloat(currentValue.toFixed(4));
                        } else {
                            effectSetting.params[paramName] = currentValue; // Для нечисловых (напр. oversample)
                        }
                    } catch (e) {
                        effectSetting.params[paramName] = def.defaults[paramName]; // Fallback
                    }
                });

                // Wet параметр
                if (effect.wet instanceof Tone.Param) {
                    effectSetting.wet = parseFloat(effect.wet.value.toFixed(4));
                } else if (effect.wet !== undefined) { // Для случаев, когда wet не Param (хотя обычно это так)
                    effectSetting.wet = effect.wet;
                }
                settings.push(effectSetting);
            }
        }
        return settings;
    },
    getFreeVoiceIndex(touchId) {
        if (!this.isReady) return -1;
        let freeVoiceIndex = -1;
        let oldestVoiceIndex = -1;
        let oldestTime = Infinity;
        for (let i = 0; i < this.config.polyphony; i++) {
            if (!this.voiceState[i]?.isBusy && this.voices[i]?.components && !this.voices[i]?.errorState?.critical) {
                if (this.voiceState[i].startTime < oldestTime) {
                    oldestTime = this.voiceState[i].startTime;
                    oldestVoiceIndex = i;
                }
            }
        }
        if (oldestVoiceIndex !== -1) {
            freeVoiceIndex = oldestVoiceIndex;
        }
        return freeVoiceIndex;
    },
    findVoiceIndex(touchId) {
        if (!this.isReady) return -1;
        for (let i = 0; i < this.config.polyphony; i++) {
            if (this.voiceState[i].isBusy && this.voiceState[i].touchId === touchId) {
                return i;
            }
        }
        return -1;
    },
    releaseVoice(voiceIndex) {
        if (voiceIndex >= 0 && voiceIndex < this.config.polyphony && this.voiceState[voiceIndex]) {
            this.voiceState[voiceIndex].isBusy = false;
            this.voiceState[voiceIndex].touchId = null;
            this.voiceState[voiceIndex].noteId = null;
            this.voiceState[voiceIndex].startTime = 0;

            const voiceData = this.voices[voiceIndex];
            try {
                // Плавное затухание outputGain через rampTo
                if (voiceData?.components?.outputGain?.nodes?.gainNode) {
                    voiceData.components.outputGain.nodes.gainNode.gain.cancelScheduledValues(Tone.now());
                    voiceData.components.outputGain.nodes.gainNode.gain.rampTo(0, 0.05);
                }
                // Плавное затухание fxSend
                if (voiceData?.fxSend?.volume) {
                    voiceData.fxSend.volume.cancelScheduledValues(Tone.now());
                    voiceData.fxSend.volume.rampTo(-Infinity, 0.05);
                }
                // Останавливаем LFO, если был активен
                const lfoManager = audioConfig.getManager('lfo1');
                if (lfoManager && voiceData?.components?.lfo1 && !voiceData.errorState?.lfo1) {
                    lfoManager.enable(voiceData.components.lfo1.nodes, false);
                }
            } catch(e) {
                console.error(`[Synth v7] Error ramping gain/send/lfo for voice ${voiceIndex}:`, e);
            }
        }
    },
    startSilentNotesCheck() {
        if (this.silentTimeout) clearTimeout(this.silentTimeout);
        this.silentTimeout = setTimeout(() => {
            if (!this.isReady) return;
            const now = Tone.now();
            let releasedCount = 0;
            this.activeVoices.forEach((voiceInfo, touchId) => {
                const voiceState = this.voiceState[voiceInfo.voiceIndex];
                if (voiceState && voiceState.isBusy) {
                    const components = this.voices[voiceInfo.voiceIndex]?.components;
                    if (components?.amplitudeEnv?.node) {
                        // Проверяем, действительно ли огибающая достигла 0 или очень близкого значения
                        const currentEnvValue = components.amplitudeEnv.node.value;
                        if (currentEnvValue < 0.001) { // Пороговое значение для "тишины"
                             console.warn(`[Synth SilentCheck] Voice ${voiceInfo.voiceIndex} (touch ${touchId}, note ${voiceInfo.noteId}) detected as silent by envelope. Forcing release.`);
                             this.triggerRelease(touchId); // Используем новую triggerRelease, которая поставит в очередь
                             releasedCount++;
                        }
                    }
                }
            });
            if (releasedCount > 0 && this.config.debug) {
                console.log(`[Synth SilentCheck] Released ${releasedCount} stuck/silent notes.`);
            }
            this.startSilentNotesCheck(); // Перезапускаем таймер
         }, this.silentCheckInterval);
    },
    updateAllActiveVoiceMainLevels() {
        if (!this.isReady || !app || !app.state) return;
        const yAxisVolConfig = app.state.yAxisControls.volume;
        this.activeVoices.forEach((voiceInfo) => {
            const voiceIndex = voiceInfo.voiceIndex;
            const voiceData = this.voices[voiceIndex];
            if (voiceData && voiceData.components?.outputGain && !voiceData.errorState?.outputGain) {
                const yPosition = voiceInfo.lastY ?? 0.5; // Используем последнее известное Y
                const calculatedVolume = this.calculateGenericYParameter(yPosition, yAxisVolConfig);
                const outputGainManager = audioConfig.getManager('outputGain');
                if (outputGainManager && typeof outputGainManager.update === 'function') { // Проверка на существование update
                    outputGainManager.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
                }
            }
        });
    },
    updateActiveVoicesParameter(paramPath, value) {
        if (!this.isReady) return;
        const pathParts = paramPath.split('.');
        if (pathParts.length < 2) {
            console.warn(`[Synth v7] Invalid paramPath for updateActiveVoicesParameter: ${paramPath}`);
            return;
        }
        const componentId = pathParts[0];
        const manager = audioConfig.getManager(componentId);
        if (!manager || typeof manager.update !== 'function') {
            console.warn(`[Synth v7] No valid manager or update function for componentId: ${componentId}`);
            return;
        }

        const settingsUpdate = {};
        let currentLevel = settingsUpdate;
        for(let i = 1; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!currentLevel[part]) currentLevel[part] = {};
            currentLevel = currentLevel[part];
        }
        currentLevel[pathParts[pathParts.length - 1]] = value;

        this.activeVoices.forEach(voiceInfo => {
            const voiceIndex = voiceInfo.voiceIndex;
            const voiceData = this.voices[voiceIndex];
            if (voiceData && voiceData.components && voiceData.components[componentId] && !(voiceData.errorState && voiceData.errorState[componentId])) {
                try {
                    if (!manager.update(voiceData.components[componentId].nodes, settingsUpdate)) {
                        if (voiceData.errorState) voiceData.errorState[componentId] = "Update failed during active voice update";
                    }
                } catch (e) {
                    if (voiceData.errorState) voiceData.errorState[componentId] = `Update error during active voice update: ${e.message}`;
                    console.error(`[Synth v7] Error updating param ${paramPath} for active voice ${voiceIndex}:`, e);
                }
            }
        });

        // Обновляем кэш пресета для всех голосов, чтобы при следующей смене пресета не было сюрпризов
        this.voices.forEach((voiceData) => {
            if (voiceData && voiceData.currentPresetData) {
                try {
                    let current = voiceData.currentPresetData;
                    if (!current[componentId]) current[componentId] = { params: {} };
                    if (!current[componentId].params) current[componentId].params = {};

                    let targetParams = current[componentId].params;
                    let currentLevelParams = targetParams;
                    for(let i = 1; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        if (!currentLevelParams[part]) currentLevelParams[part] = {};
                        currentLevelParams = currentLevelParams[part];
                    }
                    currentLevelParams[pathParts[pathParts.length - 1]] = value;

                    // Синхронизация Q и resonance, если это фильтр
                    if (componentId === 'filter' && targetParams) {
                        if (paramPath === 'filter.Q') targetParams.resonance = value;
                        if (paramPath === 'filter.resonance') targetParams.Q = value;
                    }
                } catch (e) {
                    console.error("[Synth v7] Error updating voice presetData cache during active voice update:", e);
                }
            }
        });
    },
    stopAllNotes() {
        if (!this.isReady) return;
        const activeTouchIds = [...this.activeVoices.keys()];
        activeTouchIds.forEach(touchId => {
            this.triggerRelease(touchId); // triggerRelease уже вызывает applyMasterVolumeSettings
        });
        // Убедимся, что все голоса действительно освобождены
        this.voiceState.forEach((state, index) => {
            if (state?.isBusy) {
                this.releaseVoice(index);
            }
        });
        this.activeVoices.clear();
        this.applyMasterVolumeSettings(); // Финальный вызов на случай, если activeVoices уже был пуст
    },
    forceStopAllNotes() {
        console.warn('[Synth v7] Force releasing ALL notes (soft attempt first)...');
        this.activeVoices.forEach((voiceInfo, touchId) => {
            const voiceIndex = this.findVoiceIndex(touchId);
            if (voiceIndex !== -1) {
                console.log(`[Synth ForceStop] Soft releasing voice ${voiceIndex} for touch ${touchId}`);
                const voiceData = this.voices[voiceIndex];
                if (voiceData && voiceData.components) {
                    const ampEnvManager = audioConfig.getManager('amplitudeEnv');
                    if (ampEnvManager && voiceData.components.amplitudeEnv) {
                        ampEnvManager.triggerRelease(voiceData.components.amplitudeEnv.nodes, Tone.now());
                    }
                    const pitchEnvManager = audioConfig.getManager('pitchEnvelope');
                    if (pitchEnvManager && voiceData.components.pitchEnvelope && voiceData.currentPresetData?.pitchEnvelope?.enabled) {
                        pitchEnvManager.triggerRelease(voiceData.components.pitchEnvelope.nodes, Tone.now());
                    }
                    const filterEnvManager = audioConfig.getManager('filterEnvelope');
                    if (filterEnvManager && voiceData.components.filterEnvelope && voiceData.currentPresetData?.filterEnvelope?.enabled) {
                        filterEnvManager.triggerRelease(voiceData.components.filterEnvelope.nodes, Tone.now());
                    }
                }
                this.releaseVoice(voiceIndex);
            }
        });
        this.activeVoices.clear();
        this.applyMasterVolumeSettings();
        console.log('[Synth v7] All notes soft-released.');
        setTimeout(() => {
            let stillBusy = false;
            this.voiceState.forEach((state, index) => {
                if (state.isBusy) {
                    console.error(`[Synth ForceStop] Voice ${index} STILL BUSY after soft release! Disposing components.`);
                    if (this.voices[index] && this.voices[index].components) {
                        voiceBuilder.disposeComponents(this.voices[index].components);
                        this.voices[index].components = null;
                        this.voices[index].errorState = { critical: "Hard force stopped" };
                    }
                    this.releaseVoice(index);
                    stillBusy = true;
                }
            });
            if (stillBusy) this.applyMasterVolumeSettings();
        }, 1000);
    },
    updateAllActiveVoiceSendLevels() {
        if (!this.isReady || !app || !app.state) return;
        const yAxisFxConfig = app.state.yAxisControls.effects;
        const lastY = (typeof pad !== 'undefined' && typeof pad.getLastYPosition === 'function') ? pad.getLastYPosition() : 0.5; // Дефолтное значение, если pad не доступен

        // Рассчитываем уровень посыла для текущей Y позиции
        const calculatedSendLevel = this.calculateGenericYParameter(lastY, yAxisFxConfig);

        this.activeVoices.forEach((voiceInfo) => {
            const voiceIndex = voiceInfo.voiceIndex;
            const voiceData = this.voices[voiceIndex];
            if (voiceData && voiceData.components?.outputGain && !voiceData.errorState?.outputGain) {
                const yPosForVoice = voiceInfo.lastY ?? lastY; // Используем Y голоса, если есть, иначе общий
                const individualSendLevel = this.calculateGenericYParameter(yPosForVoice, yAxisFxConfig);

                if (this.voices[voiceIndex]?.fxSend?.volume) {
                    this.voices[voiceIndex].fxSend.volume.rampTo(individualSendLevel, 0.05);
                }
            }
        });
    },
    async setMacro(macroName, value) {
        if (this.config.debug) console.log(`[Synth FX Macro] setMacro called with Name: '${macroName}', Value: ${value.toFixed(3)}. CurrentChainID: ${this.currentChainId}`);
        if (!this.currentFxChainData || !this.currentFxChainData.macroMappings) {
            if (this.config.debug && this.currentChainId) console.warn(`[Synth FX Macro] No macroMappings in currentFxChainData ('${this.currentChainId}') or data is null.`);
            return;
        }
        const mappings = this.currentFxChainData.macroMappings[macroName];
        if (!mappings || !Array.isArray(mappings)) {
            if(this.config.debug) console.warn(`[Synth FX Macro] No valid mapping array found for macro: '${macroName}' in chain '${this.currentChainId}'. Mappings object:`, this.currentFxChainData.macroMappings);
            return;
        }

        mappings.forEach(mapping => {
            const { effect: effectType, param: paramName, range, curve } = mapping;
            const effectInstance = this.effects[effectType];

            // >>> ДОБАВИТЬ ПРОВЕРКУ ЗДЕСЬ <<<
            const definition = this.config.effectDefinitions[effectType];
            if (!effectInstance || !definition) {
                if (this.config.debug) console.warn(`[Synth FX Macro] Effect instance or definition for '${effectType}' not found for macro '${macroName}'.`);
                return; // Пропустить этот маппинг
            }

            // Проверяем существование параметра как собственного свойства или как Tone.Param
            // Обратите внимание, что effectInstance[paramName] может быть undefined, если свойство не существует.
            const targetParam = effectInstance[paramName];
            let paramExists = effectInstance.hasOwnProperty(paramName) || (targetParam instanceof Tone.Param);

            // Для некоторых параметров Tone.js (например, 'frequency' в LFO или 'playbackRate' в Player)
            // они могут быть объектами Signal, но не Param. Их нужно обрабатывать через .value
            // JCReverb.roomSize - это не Param, а обычное число.
            // Distortion.distortion - тоже обычное число.
            // Chorus.frequency, Chorus.depth - это Param.

            if (!paramExists) {
                 // Попытка проверить, есть ли такой параметр в def.params для эффекта, если он не Tone.Param
                 // const definition = this.config.effectDefinitions[effectType]; // Уже определено выше
                 if (definition && definition.params && definition.params.includes(paramName)) {
                     paramExists = true; // Параметр описан, будем считать, что он есть, даже если не Tone.Param
                 } else {
                    if (this.config.debug) console.warn(`[Synth FX Macro] Parameter '${paramName}' not found or not applicable on effect '${effectType}' for macro '${macroName}'.`);
                    return;
                 }
            }

            let normalizedValue = value;

            // Логику для "curve" пока оставляем для будущего, если понадобится сложная нелинейная обработка
            // самого значения ручки 0-1 перед применением к диапазону.
            // const minRange = range[0];
            // const maxRange = range[1];
            // if (curve === 'logarithmic' && minRange > 0 && maxRange > 0 && minRange < maxRange) {
            //    targetValue = minRange * Math.pow(maxRange / minRange, normalizedValue);
            // } else if (curve === 'exponential' && minRange >= 0 && maxRange >= 0 && minRange < maxRange) {
            //    targetValue = minRange + (maxRange - minRange) * Math.pow(normalizedValue, 2); // Пример простой экспоненты
            // } else {
            //    targetValue = minRange + normalizedValue * (maxRange - minRange);
            // }

            const targetValue = range[0] + normalizedValue * (range[1] - range[0]);

            if (targetParam instanceof Tone.Param) {
                targetParam.rampTo(targetValue, 0.05);
                if (this.config.debug) console.log(`[Synth FX Macro] Ramping param '${effectType}.${paramName}' to ${targetValue.toFixed(3)} for macro '${macroName}'.`);
            } else if (targetParam instanceof Tone.Signal) { // Обработка для Tone.Signal
                targetParam.rampTo(targetValue, 0.05);
                if (this.config.debug) console.log(`[Synth FX Macro] Ramping signal '${effectType}.${paramName}' to ${targetValue.toFixed(3)} for macro '${macroName}'.`);
            } else if (effectInstance.hasOwnProperty(paramName) || (definition && definition.params && definition.params.includes(paramName))) {
                // Если это не Tone.Param и не Tone.Signal, но свойство существует или описано в defs
                effectInstance[paramName] = targetValue;
                if (this.config.debug) console.log(`[Synth FX Macro] Setting param '${effectType}.${paramName}' to ${targetValue.toFixed(3)} for macro '${macroName}'.`);
            } else {
                 // Эта ветка по идее не должна сработать из-за проверок выше, но на всякий случай
                 if (this.config.debug) console.warn(`[Synth FX Macro] Parameter '${paramName}' could not be set on effect '${effectType}' for macro '${macroName}'.`);
            }
        });
    },
};
