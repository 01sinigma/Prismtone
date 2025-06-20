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
            }
            // Можно добавить Phaser, Flanger и т.д. позже
        },
        debug: true
    },

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
                const oldOscType = oldPresetData.oscillator?.params?.type ?? null;
                const newOscType = safePresetData.oscillator?.params?.type ?? null;
                if (!needsRecreation && oldOscType !== newOscType) {
                    if (this.config.debug) console.log(`[Synth applyPreset] Reason for recreation: Oscillator type changed ('${oldOscType}' -> '${newOscType}')`);
                    needsRecreation = true;
                }
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
                            paramsToUpdate.portamento = (safePresetData.portamento?.enabled && safePresetData.portamento.time !== undefined)
                                                      ? safePresetData.portamento.time
                                                      : 0;
                            if (this.config.debug) console.log(`[Synth applyPreset] Updating oscillator for voice ${index} with portamento: ${paramsToUpdate.portamento}`);
                        }
                        if (paramsToUpdate && Object.keys(paramsToUpdate).length > 0 && typeof manager.update === 'function') {
                            if (!manager.update(compData.nodes, paramsToUpdate)) {
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

    triggerRelease(touchId) {
        const activeNoteId = this.activeVoices.get(touchId)?.noteId;
        this._updateQueue.set(touchId, { action: 'release', noteId: activeNoteId });
        this._processUpdateQueue();
    },

    // ====================================================================
    // === НОВЫЕ ПРИВАТНЫЕ МЕТОДЫ: Обработчик очереди и исполнители ===
    // ====================================================================

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

    _executeUpdateNote(frequency, velocity, yPosition, touchId) {
        if (!this.isReady) return;
        const voiceIndex = this.findVoiceIndex(touchId);
        if (voiceIndex === -1) return;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components) return;
        const activeVoice = this.activeVoices.get(touchId);
        if (activeVoice && activeVoice.lastY === yPosition && activeVoice.frequency === frequency) {
            return;
        }
        if (activeVoice) activeVoice.lastY = yPosition;
        const calculatedVolume = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.volume);
        const calculatedSendLevel = this.calculateGenericYParameter(yPosition, app.state.yAxisControls.effects);
        if (activeVoice && activeVoice.frequency !== frequency) {
            audioConfig.getManager('oscillator')?.update(voiceData.components.oscillator.nodes, { frequency });
            activeVoice.frequency = frequency;
        }
        audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
        if (voiceData.fxSend) {
            voiceData.fxSend.volume.value = calculatedSendLevel;
        }
    },

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

    getAnalyser() { return this.analyser; },
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
        // ... остальная логика применения маппингов ...
    },
};
