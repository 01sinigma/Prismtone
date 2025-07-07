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
    
    // === НОВЫЕ СВОЙСТВА ДЛЯ ОЧЕРЕДИ (согласно заданию) ===
    _updateQueue: new Map(), // Map<touchId, { action, ...data }>
    _isProcessingQueue: false,
    // _previousActiveVoiceCount: 0, // Already exists
    // _activeVoiceCountChanged: false, // Already exists

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
    async init() { // <<< Made async
        console.log('[Synth v8.0 - AsyncQueue] Initializing...'); // Updated log message
        try {
            this.masterVolume = new Tone.Volume(Tone.gainToDb(1.0)).toDestination();
            this.limiter = new Tone.Limiter(-1).connect(this.masterVolume);
            this.analyser = new Tone.Analyser({ type: 'waveform', size: 1024 });
            this.fxBus = new Tone.Channel({ volume: 0, pan: 0, channelCount: 2 }).connect(this.limiter);

            this.voices = [];
            this.voiceState = [];
            const initialPreset = JSON.parse(JSON.stringify(this.config.defaultPreset));

            for (let i = 0; i < this.config.polyphony; i++) {
                // voiceBuilder.buildVoiceChain is now async
                const voiceBuildResult = await voiceBuilder.buildVoiceChain(initialPreset);
                if (!voiceBuildResult || !voiceBuildResult.components?.outputGain || voiceBuildResult.errorState?.outputGain) {
                    console.error(`[Synth v8.0 - AsyncQueue] Failed to create initial voice slot ${i}. Errors:`, voiceBuildResult?.errorState);
                    this.voices.push({ components: null, errorState: voiceBuildResult?.errorState || { critical: "Build failed" }, fxSend: null, currentPresetData: null });
                } else {
                    const fxSend = new Tone.Channel({ volume: -Infinity, channelCount: 2 }).connect(this.fxBus);
                    const outputNode = voiceBuildResult.components.outputGain.audioOutput;
                    if (outputNode) {
                        outputNode.fan(fxSend, this.analyser, this.limiter);
                    } else {
                       console.error(`[Synth v8.0 - AsyncQueue init] Output node not found for voice ${i}! FX send disabled.`);
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
            console.log(`[Synth v8.0 - AsyncQueue init] Initialized ${this.voices.filter(v => v.components).length}/${this.config.polyphony} voice slots.`);

            if (this.analyser && this.limiter && !this.analyser.numberOfOutputs) {
                 try { this.analyser.connect(this.limiter); } catch (e) { console.error("[Synth v8.0 - AsyncQueue init] Error connecting analyser (fallback):", e); }
            }

            console.log("[Synth v8.0 - AsyncQueue init] Creating global effect instances...");
            this.effects = {};
            const globalEffectOrder = ['delay', 'chorus', 'distortion', 'filter', 'reverb']; // Определяем порядок
            for (const effectName of globalEffectOrder) {
                 const def = this.config.effectDefinitions[effectName];
                 if (def && def.constructor) {
                      try {
                           const constructorParams = { ...def.defaults };
                           delete constructorParams.wet;
                           const effectInstance = new def.constructor(constructorParams);
                           if (effectInstance.wet && effectInstance.wet instanceof Tone.Param) {
                               effectInstance.wet.value = 0;
                           } else if (effectName === 'filter' && def.defaults.wet === 1) {
                               // No specific wet handling for Tone.Filter here.
                           }
                           this.effects[effectName] = effectInstance;
                           console.log(`[Synth AsyncQueue Init FX] Created global effect: ${effectName} (${effectInstance.constructor.name}), initial wet: ${effectInstance.wet ? effectInstance.wet.value.toFixed(2) : 'N/A (no wet param)'}`);
                      } catch (effectError) {
                           console.error(`[Synth v8.0 - AsyncQueue init] Failed to create global effect '${effectName}':`, effectError);
                      }
                 } else if (def) {
                     console.warn(`[Synth v8.0 - AsyncQueue init] No constructor found for effect definition '${effectName}'. Skipping.`);
                 }
            }

            this.isReady = true;
            console.log('[Synth v8.0 - AsyncQueue init] Synth engine marked as READY.');

            this.applyFxChain([]);
            this.applyMasterVolumeSettings();
            this.startSilentNotesCheck();

            // === Инициализация свойств очереди согласно заданию ===
            this._updateQueue.clear();
            this._isProcessingQueue = false;
            this._previousActiveVoiceCount = this.activeVoices.size; // Initialize with current count
            this._activeVoiceCountChanged = false;
            // console.log('[Synth v8.0 - AsyncQueue] Initialized.'); // Already logged at the start of init

        } catch (error) {
            console.error('[Synth v8.0 - AsyncQueue init] Initialization failed:', error, error.stack);
            this.isReady = false;
        }
    },

    applyMasterVolumeSettings() {
        if (!this.isReady || !this.masterVolume || !app || !app.state) {
            // console.warn("[Synth AsyncQueue applyMasterVolumeSettings] Not ready or masterVolume/app.state missing."); // Too noisy
            return;
        }
        let finalMasterGain = app.state.masterVolumeCeiling ?? 1.0;

        if (app.state.enablePolyphonyVolumeScaling) {
            const numTouches = this.activeVoices.size;
            if (numTouches > 1) {
                const reductionFactor = Math.max(0.1, 1.0 - (numTouches - 1) * 0.05);
                finalMasterGain *= reductionFactor;
            }
        }
        const finalMasterDb = Tone.gainToDb(Math.max(0.0001, finalMasterGain));
        this.masterVolume.volume.value = finalMasterDb;

        // if (this.config.debug) { // Too noisy for regular operation
        //     console.log(`[Synth AsyncQueue MasterVol] Ceiling: ${app.state.masterVolumeCeiling.toFixed(2)}, PolyScale: ${app.state.enablePolyphonyVolumeScaling}, Touches: ${this.activeVoices.size}, Final Gain: ${finalMasterGain.toFixed(3)} (${finalMasterDb.toFixed(1)}dB)`);
        // }
    },

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
            case 'exponential': scaledValue = Math.pow(effectiveY, Math.max(0.1, curveFactor)); break;
            case 'logarithmic': scaledValue = 1 - Math.pow(1 - effectiveY, Math.max(0.1, curveFactor)); break;
            case 'sCurve':
                const k = (curveFactor - 0.1) / (5.0 - 0.1) * 10.0 - 5.0;
                const val = 1 / (1 + Math.exp(-k * (effectiveY - 0.5)));
                const sMin = 1 / (1 + Math.exp(k * 0.5));
                const sMax = 1 / (1 + Math.exp(-k * 0.5));
                scaledValue = (sMax - sMin !== 0) ? (val - sMin) / (sMax - sMin) : effectiveY;
                break;
            default: scaledValue = effectiveY; break;
        }
        scaledValue = Math.max(0, Math.min(1, scaledValue));
        let finalOutput = minOutput + scaledValue * (maxOutput - minOutput);
        return Math.max(minOutput, Math.min(maxOutput, finalOutput));
    },

    async applyPreset(presetData, forceRecreation = false) { // <<< Made async
        const t0 = performance.now();
        if (!this.isReady || !presetData) {
            console.warn('[Synth v8.0 - AsyncQueue] Cannot apply preset. Synth not ready or presetData is null.');
            return;
        }
        if (this.config.debug) console.log('[Synth v8.0 - AsyncQueue] Applying preset to all voices:', presetData);

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

        // Determine if sampler is being enabled/disabled, which forces recreation
        const isSamplerBeingToggled = (voiceData) => {
            const oldUsesSampler = voiceData?.currentPresetData?.sampler?.enabled === true;
            const newUsesSampler = safePresetData.sampler?.enabled === true;
            return oldUsesSampler !== newUsesSampler;
        };


        // Use a for...of loop to allow await inside for sequential processing of voices
        for (let index = 0; index < this.voices.length; index++) {
            const voiceData = this.voices[index];
            if (!voiceData) continue;

            try {
                const oldPresetData = voiceData.currentPresetData || this.config.defaultPreset;
                let needsRecreation = forceRecreation || !voiceData.components || isSamplerBeingToggled(voiceData);

                const optionalComponents = ['pitchEnvelope', 'filterEnvelope', 'lfo1']; // Add other optional components here
                if (!needsRecreation) { // Only check these if not already needing recreation
                    for (const optCompId of optionalComponents) {
                        const oldEnabled = oldPresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                        const newEnabled = safePresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                        if (oldEnabled !== newEnabled) {
                            if (this.config.debug) console.log(`[Synth AsyncQueue applyPreset] Reason for recreation: Optional component '${optCompId}' enabled state changed (${oldEnabled} -> ${newEnabled})`);
                            needsRecreation = true;
                            break;
                        }
                    }
                }
                if (!needsRecreation) {
                    const oldPortaEnabled = oldPresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    const newPortaEnabled = safePresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    if (oldPortaEnabled !== newPortaEnabled) {
                        if (this.config.debug) console.log(`[Synth AsyncQueue applyPreset] Reason for recreation: Portamento enabled state changed (${oldPortaEnabled} -> ${newPortaEnabled})`);
                        needsRecreation = true;
                    }
                }

                if (needsRecreation) {
                    if (this.config.debug) console.log(`[Synth AsyncQueue applyPreset] RECREATING voice ${index}.`);

                    // Use the new triggerRelease that adds to queue
                    if (this.voiceState[index]?.isBusy && this.voiceState[index].touchId !== null) {
                         this.triggerRelease(this.voiceState[index].touchId);
                    }


                    // voiceBuilder.disposeComponents can be async now
                    await voiceBuilder.disposeComponents(voiceData.components);
                    if (voiceData.fxSend) voiceData.fxSend.dispose();

                    // voiceBuilder.buildVoiceChain is now async
                    const newVoiceBuildResult = await voiceBuilder.buildVoiceChain(safePresetData);
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
                        console.error(`[Synth v8.0 - AsyncQueue applyPreset] Failed to recreate voice slot ${index}. Errors:`, newVoiceBuildResult?.errorState);
                        this.voices[index] = { components: null, errorState: newVoiceBuildResult?.errorState || { critical: "Recreation failed" }, fxSend: null, currentPresetData: null };
                        this.releaseVoice(index); // Ensure voice state is cleared
                    }
                } else {
                    if (this.config.debug) console.log(`[Synth AsyncQueue applyPreset] UPDATING voice ${index} parameters.`);
                    const components = voiceData.components;
                    const errorState = voiceData.errorState || {};
                    for (const componentId in safePresetData) {
                        const manager = audioConfig.getManager(componentId);
                        const compData = components[componentId];
                        const newSettings = safePresetData[componentId];

                        // Skip update if manager/component data is missing, or if there's an existing error for the component
                        if (!manager || !compData || errorState[componentId]) continue;
                        // Skip if component is sampler but preset uses oscillator, or vice-versa
                        if ((componentId === 'sampler' && safePresetData.oscillator?.enabled) || (componentId === 'oscillator' && safePresetData.sampler?.enabled)) continue;


                        let paramsToUpdate = null;
                        if (newSettings.params) {
                            paramsToUpdate = { ...newSettings.params };
                        } else if (typeof newSettings === 'object' && newSettings !== null && !newSettings.hasOwnProperty('enabled')) {
                             // Fallback for components that might not have a nested 'params' object in the preset
                            if (['oscillator', 'amplitudeEnv', 'filter', 'outputGain', 'sampler'].includes(componentId)) {
                                paramsToUpdate = { ...newSettings };
                            }
                        }

                        const currentSourceIsSampler = voiceData.currentPresetData?.sampler?.enabled === true;
                        const targetSourceType = currentSourceIsSampler ? 'sampler' : 'oscillator';

                        if (componentId === targetSourceType) { // Only update parameters for the active source type
                            if (!paramsToUpdate) paramsToUpdate = {};
                            if (targetSourceType === 'oscillator') {
                                if (newSettings.params && newSettings.params.type) {
                                    paramsToUpdate.type = newSettings.params.type;
                                } else if (newSettings.type) {
                                    paramsToUpdate.type = newSettings.type;
                                }
                                paramsToUpdate.portamento = (safePresetData.portamento?.enabled && safePresetData.portamento.time !== undefined)
                                                          ? safePresetData.portamento.time
                                                          : 0;
                            }
                             // For sampler, params like attack/release might be directly in newSettings or newSettings.params
                            if (targetSourceType === 'sampler') {
                                // Example: if sampler params are attack, release, curve from sampler.json
                                if (newSettings.params?.attack !== undefined) paramsToUpdate.attack = newSettings.params.attack;
                                if (newSettings.params?.release !== undefined) paramsToUpdate.release = newSettings.params.release;
                                if (newSettings.params?.curve !== undefined) paramsToUpdate.curve = newSettings.params.curve;
                                // ... any other sampler-specific params
                            }
                            if (this.config.debug && Object.keys(paramsToUpdate).length > 0) {
                                console.log(`[Synth AsyncQueue applyPreset] Updating ${targetSourceType} for voice ${index} with params:`, JSON.stringify(paramsToUpdate));
                            }
                        } else if (componentId !== 'oscillator' && componentId !== 'sampler') { // For other components (envelopes, filters etc.)
                           // Standard parameter update logic
                        }


                        if (paramsToUpdate && Object.keys(paramsToUpdate).length > 0 && typeof manager.update === 'function') {
                            if (!manager.update(compData.nodes, paramsToUpdate, components, voiceData.fxSend, this.analyser, this.limiter, safePresetData)) {
                                errorState[componentId] = "Update failed";
                            }
                        }
                    }
                    voiceData.currentPresetData = JSON.parse(JSON.stringify(safePresetData));
                    voiceData.errorState = errorState;
                }
            } catch (error) {
                console.error(`[Synth v8.0 - AsyncQueue applyPreset] Error applying preset to voice ${index}:`, error, error.stack);
                this.releaseVoice(index); // Ensure voice state is cleared
                if (voiceData) { // Check if voiceData is not null
                    voiceData.components = null; // Mark components as null
                    voiceData.errorState = { critical: `Apply preset failed: ${error.message}` };
                }
            }
        } // End of forEach loop for voices
        if (this.config.debug) console.log('[Synth v8.0 - AsyncQueue] Preset applied to all voices.');
        const t_end = performance.now();
        const duration = t_end - t0;
        if (duration > 20) { // Increased threshold slightly due to async operations
            console.warn(`[Synth.applyPreset] Long execution: ${duration.toFixed(2)}ms`);
        }
    },

    // ====================================================================
    // === НОВЫЕ ПУБЛИЧНЫЕ МЕТОДЫ: Только добавляют задачи в очередь (согласно заданию) ===
    // ====================================================================

    startNote(frequency, velocity, yPosition, touchId) {
        // Мгновенно добавляем/обновляем задачу в очереди.
        // Перезапись задачи для того же touchId - это норма, мы всегда хотим выполнять последнее действие.
        this._updateQueue.set(touchId, {
            action: 'start',
            frequency,
            velocity,
            yPosition,
            noteId: `${touchId}-${performance.now()}` // Уникальный ID для конкретной ноты
        });
        this._requestQueueProcessing();
    },

    updateNote(frequency, velocity, yPosition, touchId) {
        // Не добавляем новую задачу, если последняя была 'release'.
        const existingTask = this._updateQueue.get(touchId);
        if (existingTask && existingTask.action === 'release') {
            if (this.config.debug) console.warn(`[Synth AsyncQueue] Ignoring update for touchId ${touchId} because a release is already queued.`);
            return;
        }

        const task = existingTask || { action: 'update', noteId: this.activeVoices.get(touchId)?.noteId };

        // Обновляем данные задачи
        task.action = 'update'; // Если это было 'start', меняем на 'update'
        task.frequency = frequency;
        task.velocity = velocity;
        task.yPosition = yPosition;

        this._updateQueue.set(touchId, task);
        this._requestQueueProcessing();
    },

    triggerRelease(touchId) {
        const activeNoteId = this.activeVoices.get(touchId)?.noteId;
        this._updateQueue.set(touchId, { action: 'release', noteId: activeNoteId });
        this._requestQueueProcessing();
    },

    // ====================================================================
    // === НОВЫЕ ПРИВАТНЫЕ МЕТОДЫ: Обработчик очереди и исполнители (согласно заданию) ===
    // ====================================================================

    _requestQueueProcessing() {
        // Existing _processUpdateQueue in the file already uses requestAnimationFrame.
        // This new method ensures it's only called if not already processing.
        if (!this._isProcessingQueue) {
            this._isProcessingQueue = true; // Set flag before calling, _processUpdateQueue will reset it
            // The existing _processUpdateQueue already handles the requestAnimationFrame logic.
            // We just need to call it.
            // However, the provided new _processUpdateQueue is slightly different, let's use that one.
            requestAnimationFrame(() => this._processUpdateQueueInternal()); // Renamed to avoid conflict with existing
        }
    },

    _processUpdateQueueInternal() { // Renamed from _processUpdateQueue to avoid conflict with existing
        if (this._updateQueue.size === 0) {
            this._isProcessingQueue = false;
            return;
        }

        const tasksToProcess = new Map(this._updateQueue); // Process a copy
        this._updateQueue.clear(); // Очищаем очередь для следующего кадра

        if (this.config.debug && tasksToProcess.size > 0) {
             // console.log(`[Synth AsyncQueue] Processing ${tasksToProcess.size} tasks.`); // Can be noisy
        }

        tasksToProcess.forEach((task, touchId) => {
            try {
                switch (task.action) {
                    case 'start':
                        // Call the existing _executeStartNote, which was the original startNote
                        this._executeStartNote(task.frequency, task.velocity, task.yPosition, touchId, task.noteId);
                        break;
                    case 'update':
                        // Call the existing _executeUpdateNote
                        this._executeUpdateNote(task.frequency, task.velocity, task.yPosition, touchId);
                        break;
                    case 'release':
                        // Call the existing _executeTriggerRelease
                        this._executeTriggerRelease(touchId);
                        break;
                }
            } catch (e) {
                console.error(`[Synth AsyncQueue] Error processing task for touchId ${touchId}:`, task, e);
            }
        });

        // Применяем глобальные изменения, если они были
        if (this._activeVoiceCountChanged) {
            this.applyMasterVolumeSettings();
            this._activeVoiceCountChanged = false; // Reset flag
        }

        this._isProcessingQueue = false;

        // Если за время обработки в очередь попали новые задачи, снова планируем обработку
        if (this._updateQueue.size > 0) {
            this._requestQueueProcessing();
        }
    },

    // The existing methods _executeStartNote, _executeUpdateNote, _executeTriggerRelease
    // are already present from a previous refactor. We need to ensure their logic
    // correctly updates _activeVoiceCountChanged and _previousActiveVoiceCount as per the new spec.

    _executeStartNote(frequency, velocity, yPosition, touchId, noteId) {
        if (!this.isReady) return;
        const voiceIndex = this.getFreeVoiceIndex(touchId);
        if (voiceIndex === -1) {
            // console.warn(`[Synth AsyncQueue] No free voice for touchId ${touchId}`); // Can be noisy
            return;
        }
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components || voiceData.errorState?.critical) {
           console.warn(`[Synth AsyncQueue] Voice ${voiceIndex} not usable (no components or critical error). Releasing.`);
           this.releaseVoice(voiceIndex);
           return;
        }
        const components = voiceData.components;
        // Ensure app.state.yAxisControls is defined before accessing its properties
        const yAxisControls = app?.state?.yAxisControls;
        const calculatedVolume = yAxisControls?.volume ? this.calculateGenericYParameter(yPosition, yAxisControls.volume) : 0.7; // Default if undefined
        const calculatedSendLevel = yAxisControls?.effects ? this.calculateGenericYParameter(yPosition, yAxisControls.effects) : -Infinity; // Default if undefined


        if (this.config.debug) {
            console.log(`>>> EXECUTE START (AsyncQueue): Freq=${frequency.toFixed(1)}, Touch=${touchId}, Voice=${voiceIndex}, Vol=${calculatedVolume.toFixed(2)}, Send=${calculatedSendLevel.toFixed(1)}dB, NoteID=${noteId}`);
        }

        const currentPreset = voiceData.currentPresetData || this.config.defaultPreset;
        const useSampler = currentPreset.sampler?.enabled === true;
        const soundSourceId = useSampler ? 'sampler' : 'oscillator';
        const soundSourceManager = audioConfig.getManager(soundSourceId);
        // Corrected: Access components using voiceData.components, not directly components
        const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;

        // Debug log as per plan
        console.log(`[Synth._executeStartNote] useSampler: ${useSampler}, soundSourceId: ${soundSourceId}, manager: ${soundSourceManager ? 'found' : 'NOT FOUND'}, nodes: ${soundSourceNodes ? 'found' : 'NOT FOUND'}`);

        if (soundSourceManager && soundSourceNodes) {
            if (useSampler) {
                // [Связь -> Sampler] Используем triggerAttack семплера
                soundSourceManager.triggerAttack(soundSourceNodes, frequency, Tone.now(), velocity);
                 if (this.config.debug) console.log(`[Synth AsyncQueue] Sampler triggered for voice ${voiceIndex}`);
            } else {
                // [Связь -> Oscillator] Старая логика для осциллятора
                soundSourceManager.update(soundSourceNodes, { frequency });
                 if (this.config.debug) console.log(`[Synth AsyncQueue] Oscillator freq updated for voice ${voiceIndex}`);
            }
        } else {
            console.error(`[Synth._executeStartNote] Sound source manager or nodes not found for ${soundSourceId}. Cannot start note.`); // Enhanced error message
            this.releaseVoice(voiceIndex);
            return;
        }

        audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume }); // Corrected: voiceData.components
        if (voiceData.fxSend) voiceData.fxSend.volume.value = calculatedSendLevel;

        if (components.amplitudeEnv?.nodes) {
            audioConfig.getManager('amplitudeEnv')?.triggerAttack(components.amplitudeEnv.nodes, Tone.now(), velocity);
        } else {
            console.warn(`[Synth AsyncQueue] Amplitude envelope nodes not found for voice ${voiceIndex}. Note might not sound correctly.`);
        }

        if (currentPreset.pitchEnvelope?.enabled && components.pitchEnvelope?.nodes) {
            audioConfig.getManager('pitchEnvelope')?.triggerAttack(components.pitchEnvelope.nodes, Tone.now());
        }
        if (currentPreset.filterEnvelope?.enabled && components.filterEnvelope?.nodes) {
            audioConfig.getManager('filterEnvelope')?.triggerAttack(components.filterEnvelope.nodes, Tone.now());
        }
        if (currentPreset.lfo1?.enabled && components.lfo1?.nodes) {
            audioConfig.getManager('lfo1')?.enable(components.lfo1.nodes, true, { retrigger: currentPreset.lfo1.params?.retrigger ?? false });
        }

        this.voiceState[voiceIndex] = { isBusy: true, touchId: touchId, noteId: noteId, startTime: Tone.now() };
        this.activeVoices.set(touchId, { frequency, noteId, voiceIndex, lastY: yPosition });

        // === Update voice count flags (as per new spec) ===
        if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
            this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    _executeUpdateNote(frequency, velocity, yPosition, touchId) {
        if (!this.isReady) return;
        const activeVoiceDetails = this.activeVoices.get(touchId);
        if (!activeVoiceDetails) return;

        const voiceIndex = activeVoiceDetails.voiceIndex;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components) return;

        const yChanged = Math.abs(activeVoiceDetails.lastY - yPosition) > 0.001;
        const freqChanged = Math.abs(activeVoiceDetails.frequency - frequency) > 0.1;

        if (!yChanged && !freqChanged) {
            return;
        }
        if (this.config.debug && (yChanged || freqChanged)) {
            // console.log(`>>> EXECUTE UPDATE (AsyncQueue): Touch=${touchId}, Voice=${voiceIndex}, NewFreq=${frequency.toFixed(1)}, NewY=${yPosition.toFixed(2)}`); // Can be noisy
        }

        activeVoiceDetails.lastY = yPosition;

        const currentPreset = voiceData.currentPresetData || this.config.defaultPreset;
        const useSampler = currentPreset.sampler?.enabled === true;
        // Debug log as per plan (similar to _executeStartNote)
        console.log(`[Synth._executeUpdateNote] useSampler: ${useSampler}`);

        if (freqChanged) {
            const soundSourceId = useSampler ? 'sampler' : 'oscillator';
            const soundSourceManager = audioConfig.getManager(soundSourceId);
            const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;

            console.log(`[Synth._executeUpdateNote] soundSourceId: ${soundSourceId}, manager: ${soundSourceManager ? 'found' : 'NOT FOUND'}, nodes: ${soundSourceNodes ? 'found' : 'NOT FOUND'}`);


            if (soundSourceManager && soundSourceNodes) {
                if (useSampler) {
                    // [Связь -> Sampler] Вызываем setNote для легато
                    const oldFrequency = activeVoiceDetails.frequency;
                    // Ensure 'sampler' manager and its nodes are correctly referenced
                    const samplerManagerInstance = audioConfig.getManager('sampler');
                    const samplerNodesInstance = voiceData.components.sampler?.nodes;
                    if (samplerManagerInstance && samplerNodesInstance) {
                        samplerManagerInstance.setNote(samplerNodesInstance, oldFrequency, frequency, Tone.now(), velocity);
                         if (this.config.debug) console.log(`[Synth AsyncQueue] Sampler setNote called for voice ${voiceIndex}: ${oldFrequency} -> ${frequency}`);
                    } else {
                        console.warn(`[Synth AsyncQueue] Sampler manager or nodes not found for setNote on voice ${voiceIndex}.`);
                    }
                } else {
                    // [Связь -> Oscillator] Старая логика
                    soundSourceManager.update(soundSourceNodes, { frequency });
                     if (this.config.debug) console.log(`[Synth AsyncQueue] Oscillator frequency updated for voice ${voiceIndex} to ${frequency}`);
                }
            } else {
                 console.warn(`[Synth AsyncQueue] Sound source manager or nodes for '${soundSourceId}' not found during updateNote for voice ${voiceIndex}. Freq not changed.`);
            }
            activeVoiceDetails.frequency = frequency;
        }

        if (yChanged) {
            // Ensure app.state.yAxisControls is defined
            const yAxisControls = app?.state?.yAxisControls;
            const calculatedVolume = yAxisControls?.volume ? this.calculateGenericYParameter(yPosition, yAxisControls.volume) : 0.7;
            const calculatedSendLevel = yAxisControls?.effects ? this.calculateGenericYParameter(yPosition, yAxisControls.effects) : -Infinity;

            audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
            if (voiceData.fxSend) {
                voiceData.fxSend.volume.rampTo(calculatedSendLevel, 0.02);
            }
        }
        // Note: _executeUpdateNote in the spec does not change _activeVoiceCountChanged or _previousActiveVoiceCount
        // This seems correct as the number of active voices doesn't change on update.
    },

    _executeTriggerRelease(touchId) {
        if (!this.isReady) return;
        const activeVoiceDetails = this.activeVoices.get(touchId);
        if (!activeVoiceDetails) return;

        const voiceIndex = activeVoiceDetails.voiceIndex;
        const voiceData = this.voices[voiceIndex];

        if (this.config.debug) {
            console.log(`>>> EXECUTE RELEASE (AsyncQueue): Touch=${touchId}, Voice=${voiceIndex}, NoteID=${activeVoiceDetails.noteId}`);
        }

        if (voiceData && voiceData.components) {
            const currentPreset = voiceData.currentPresetData || this.config.defaultPreset;
            const useSampler = currentPreset.sampler?.enabled === true;
            const soundSourceId = useSampler ? 'sampler' : 'oscillator';
            const soundSourceManager = audioConfig.getManager(soundSourceId);
            const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;

            // Debug log as per plan
            console.log(`[Synth._executeTriggerRelease] useSampler: ${useSampler}, soundSourceId: ${soundSourceId}, manager: ${soundSourceManager ? 'found' : 'NOT FOUND'}, nodes: ${soundSourceNodes ? 'found' : 'NOT FOUND'}`);

            if (useSampler) {
                // [Связь -> Sampler] Вызываем triggerRelease у семплера
                const noteToRelease = this.activeVoices.get(touchId)?.frequency; // Or activeVoiceDetails.frequency
                if (noteToRelease && soundSourceManager && soundSourceNodes) { // Ensure manager and nodes are valid
                    soundSourceManager.triggerRelease(soundSourceNodes, noteToRelease, Tone.now());
                    if (this.config.debug) console.log(`[Synth AsyncQueue] Sampler triggerRelease called for voice ${voiceIndex}, note: ${noteToRelease}`);
                } else {
                     console.warn(`[Synth AsyncQueue] Could not trigger release on sampler for voice ${voiceIndex}. Note: ${noteToRelease}, Manager: ${!!soundSourceManager}, Nodes: ${!!soundSourceNodes}`);
                }
            }
            // The original plan says:
            // "Важно! Для семплера мы не вызываем `releaseVoice` сразу, т.к. `triggerRelease`
            // использует встроенную огибающую. `releaseVoice` вызывается по окончанию затухания.
            // Для унификации, оставляем существующую логику с вызовом `releaseVoice` в конце,
            // но `samplerManager.triggerRelease` инициирует затухание в Tone.Sampler."
            // The current code structure calls releaseVoice() unconditionally after this block.
            // Amplitude envelope release is still essential for non-sampler sounds and for consistency if sampler's own envelope is minimal.
            // If sampler has its own full envelope, amplitudeEnv might not be strictly needed FOR THE SAMPLER ITSELF,
            // but synth structure uses it.

            if (voiceData.components.amplitudeEnv?.nodes) {
                 audioConfig.getManager('amplitudeEnv')?.triggerRelease(voiceData.components.amplitudeEnv.nodes, Tone.now());
            }

            if (currentPreset.pitchEnvelope?.enabled && voiceData.components.pitchEnvelope?.nodes) {
                audioConfig.getManager('pitchEnvelope')?.triggerRelease(voiceData.components.pitchEnvelope.nodes, Tone.now());
            }
            if (currentPreset.filterEnvelope?.enabled && voiceData.components.filterEnvelope?.nodes) {
                audioConfig.getManager('filterEnvelope')?.triggerRelease(voiceData.components.filterEnvelope.nodes, Tone.now());
            }
        }
        this.releaseVoice(voiceIndex);
        this.activeVoices.delete(touchId);

        // === Update voice count flags (as per new spec) ===
        if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
            this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    // Remove the old _processUpdateQueue as it's replaced by _processUpdateQueueInternal
    // The old startNote, updateNote, triggerRelease are now the primary public methods.

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

        // 1. Поиск полностью свободного голоса
        let availableVoiceIndex = -1;
        // oldestFreeTime была неиспользуемой, удалена.

        for (let i = 0; i < this.config.polyphony; i++) {
            if (!this.voiceState[i]?.isBusy && this.voices[i]?.components && !this.voices[i]?.errorState?.critical) {
                // Просто берем первый найденный свободный и пригодный голос.
                availableVoiceIndex = i;
                break;
            }
        }

        if (availableVoiceIndex !== -1) {
            if (this.config.debug) console.log(`[Synth.getFreeVoiceIndex] Found completely free voice: ${availableVoiceIndex}`);
            return availableVoiceIndex;
        }

        // 2. Если нет свободных - реализуем Voice Stealing (ищем самый старый занятый голос)
        if (this.config.debug) console.log(`[Synth.getFreeVoiceIndex] No completely free voice. Attempting voice stealing.`);

        let oldestBusyVoiceIndex = -1;
        let oldestBusyStartTime = Infinity;

        for (let i = 0; i < this.config.polyphony; i++) {
            // Ищем среди занятых и пригодных для использования голосов
            if (this.voiceState[i]?.isBusy && this.voices[i]?.components && !this.voices[i]?.errorState?.critical) {
                if (this.voiceState[i].startTime < oldestBusyStartTime) {
                    oldestBusyStartTime = this.voiceState[i].startTime;
                    oldestBusyVoiceIndex = i;
                }
            }
        }

        if (oldestBusyVoiceIndex !== -1) {
            const touchIdToSteal = this.voiceState[oldestBusyVoiceIndex].touchId;
            if (this.config.debug) {
                console.warn(`[Synth.getFreeVoiceIndex] STEALING voice: ${oldestBusyVoiceIndex} (touchId: ${touchIdToSteal}, startTime: ${oldestBusyStartTime}) for new touchId: ${touchId}`);
            }
            if (touchIdToSteal !== null) { // Убедимся, что у голоса есть touchId для корректного release
                this.triggerRelease(touchIdToSteal); // Ставим задачу на release в очередь
                // Важно: triggerRelease асинхронен через очередь.
                // _executeTriggerRelease в итоге вызовет this.releaseVoice(oldestBusyVoiceIndex)
                // и this.activeVoices.delete(touchIdToSteal).
                // Голос будет помечен как isBusy=false в releaseVoice.
                // Мы немедленно возвращаем этот индекс, _executeStartNote его использует.
                // Это общепринятый подход в voice stealing. Tone.js должен справиться
                // с быстрым release предыдущей ноты и attack новой на том же "железе".
            } else {
                 // Если у самого старого занятого голоса нет touchId (маловероятно, но возможно при ошибке)
                 // то просто освобождаем его состояние принудительно, чтобы он мог быть переиспользован.
                 console.warn(`[Synth.getFreeVoiceIndex] Stolen voice ${oldestBusyVoiceIndex} had null touchId. Forcing release of voice state.`);
                 this.releaseVoice(oldestBusyVoiceIndex); // Очищает voiceState[i].isBusy = false;
            }
            return oldestBusyVoiceIndex;
        }

        // Если не найдено ни свободных, ни подходящих для "кражи" (например, все голоса с ошибками)
        if (this.config.debug) console.error(`[Synth.getFreeVoiceIndex] No free voices and no stealable voices found. This shouldn't happen if polyphony > 0.`);
        return -1;
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
