
const synth = {
    voices: [],
    voiceState: [],
    effects: {},
    fxBus: null,
    analyser: null,
    masterVolume: null,
    limiter: null,
    isReady: false,
    activeVoices: new Map(),
    silentTimeout: null,
    silentCheckInterval: 3000,
    currentFxChainData: null,
    _activeVoiceCountChanged: false,
    _previousActiveVoiceCount: 0,
    _updateQueue: new Map(),
    _isProcessingQueue: false,

    config: {
        polyphony: 4,
        defaultPreset: {
            oscillator: { params: { type: 'triangle' } },
            amplitudeEnv: { params: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.5 } },
            filter: { params: { frequency: 5000, Q: 1, type: 'lowpass' } },
            outputGain: { params: { gain: 0 } },
            pitchEnvelope: { enabled: false, params: { amount: 100, attack: 0.1, decay:0.1, sustain:0.5, release: 0.2 } },
            filterEnvelope: { enabled: false, params: { amount: 0, attack: 0.1, decay:0.1, sustain:0.5, release: 0.2 } },
            lfo1: { enabled: false, params: { rate: 5, depth: 0, target: 'filter.frequency', type: 'sine' } },
            portamento: { enabled: false, time: 0.05 },
            yAxisEffectsSendConfig: {
                minOutput: -45,
                maxOutput: 0,
                yThreshold: 0.1,
                curveType: 'exponential',
                curveFactor: 2.0,
                outputType: 'db'
            }
        },
        effectDefinitions: {
            delay: { constructor: Tone.FeedbackDelay, params: ['delayTime', 'feedback', 'wet'], defaults: { delayTime: 0.25, feedback: 0.5, wet: 0 } },
            reverb: { constructor: Tone.JCReverb, params: ['roomSize', 'wet'], defaults: { roomSize: 0.5, wet: 0 } },
            chorus: { constructor: Tone.Chorus, params: ['frequency', 'depth', 'delayTime', 'wet'], defaults: { frequency: 1.5, depth: 0.7, delayTime: 3.5, wet: 0 } },
            distortion: { constructor: Tone.Distortion, params: ['distortion', 'wet'], defaults: { distortion: 0.4, wet: 0 } },
            filter: { constructor: Tone.Filter, params: ['frequency', 'Q', 'type', 'gain', 'rolloff', 'wet'], defaults: { frequency: 1000, Q: 1, type: 'lowpass', gain: 0, rolloff: -12, wet: 1 } },
            pingPongDelay: { constructor: Tone.PingPongDelay, params: ['delayTime', 'feedback', 'wet'], defaults: { delayTime: "8n", feedback: 0.2, wet: 0, maxDelay: 2 } },
            phaser: { constructor: Tone.Phaser, params: ['frequency', 'octaves', 'baseFrequency', 'Q', 'wet'], defaults: { frequency: 0.5, octaves: 3, baseFrequency: 350, Q: 10, wet: 0 } },
            flanger: { constructor: Tone.Flanger, params: ['delayTime', 'depth', 'feedback', 'frequency', 'wet'], defaults: { delayTime: 0.005, depth: 0.5, feedback: 0.1, frequency: 0.5, wet: 0 } },
            vibrato: { constructor: Tone.Vibrato, params: ['frequency', 'depth', 'wet'], defaults: { frequency: 5, depth: 0.1, wet: 0 } },
            tremolo: { constructor: Tone.Tremolo, params: ['frequency', 'depth', 'wet', 'type'], defaults: { frequency: 10, depth: 0.5, wet: 0, type: 'sine' } },
            autoWah: { constructor: Tone.AutoWah, params: ['baseFrequency', 'octaves', 'sensitivity', 'Q', 'wet'], defaults: { baseFrequency: 100, octaves: 6, sensitivity: -10, Q: 2, wet: 0 } },
            eq3: { constructor: Tone.EQ3, params: ['low', 'mid', 'high', 'lowFrequency', 'highFrequency'], defaults: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 } },
            compressor: { constructor: Tone.Compressor, params: ['threshold', 'ratio', 'attack', 'release', 'knee'], defaults: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25, knee: 30 } },
            pitchShift: { constructor: Tone.PitchShift, params: ['pitch', 'windowSize', 'wet'], defaults: { pitch: 0, windowSize: 0.1, wet: 0 } }
        },
        debug: true
    },

    async init() {
        console.log('[Synth Refactor] Initializing with Limiter-based dynamics...');

        // [Контекст -> Архитектура] Создаем цепочку: Лимитер -> Мастер-Громкость -> Выход.
        this.masterVolume = new Tone.Volume(0).toDestination(); // Громкость по умолчанию 0 дБ.

        // [Связь -> Tone.js] Конфигурируем лимитер. Порог -0.1 dB.
        this.limiter = new Tone.Limiter(-0.1).connect(this.masterVolume);

        this.analyser = new Tone.Analyser({ type: 'waveform', size: 1024 });
        this.fxBus = new Tone.Channel({ volume: 0 }).connect(this.limiter); // Шина эффектов идет В ЛИМИТЕР.

        this.voices = [];
        this.voiceState = [];
        const initialPreset = JSON.parse(JSON.stringify(this.config.defaultPreset));

        for (let i = 0; i < this.config.polyphony; i++) {
            const voiceBuildResult = await voiceBuilder.buildVoiceChain(initialPreset);
            if (!voiceBuildResult || !voiceBuildResult.components?.outputGain || voiceBuildResult.errorState?.outputGain) {
                console.error(`[Synth Refactor] Failed to create initial voice slot ${i}.`, voiceBuildResult?.errorState);
                this.voices.push({ components: null, errorState: voiceBuildResult?.errorState || { critical: "Build failed" }, fxSend: null, currentPresetData: null });
            } else {
                const fxSend = new Tone.Channel({ volume: -Infinity, channelCount: 2 }).connect(this.fxBus);
                const outputNode = voiceBuildResult.components.outputGain.audioOutput;
                if (outputNode) {
                    // [Контекст -> Аудио-роутинг] Все голоса теперь идут в лимитер.
                    outputNode.fan(fxSend, this.analyser, this.limiter);
                } else {
                   console.error(`[Synth Refactor init] Output node not found for voice ${i}!`);
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
        console.log(`[Synth Refactor init] Initialized ${this.voices.filter(v => v.components).length}/${this.config.polyphony} voice slots.`);

        if (this.analyser && this.limiter && !this.analyser.numberOfOutputs) {
             try { this.analyser.connect(this.limiter); } catch (e) { console.error("[Synth Refactor init] Error connecting analyser (fallback):", e); }
        }

        console.log("[Synth Refactor init] Creating global effect instances...");
        this.effects = {};
        const globalEffectOrder = ['delay', 'chorus', 'distortion', 'filter', 'reverb'];
        for (const effectName of globalEffectOrder) {
             const def = this.config.effectDefinitions[effectName];
             if (def && def.constructor) {
                  try {
                       const constructorParams = { ...def.defaults };
                       delete constructorParams.wet;
                       const effectInstance = new def.constructor(constructorParams);
                       if (effectInstance.wet && effectInstance.wet instanceof Tone.Param) {
                           effectInstance.wet.value = 0;
                       }
                       this.effects[effectName] = effectInstance;
                  } catch (effectError) {
                       console.error(`[Synth Refactor init] Failed to create global effect '${effectName}':`, effectError);
                  }
             }
        }

        this.isReady = true;
        console.log('[Synth Refactor init] Synth engine marked as READY.');
        this.applyFxChain([]);
        this.applyMasterVolumeSettings();
        this.startSilentNotesCheck();
        this._updateQueue.clear();
        this._isProcessingQueue = false;
        this._previousActiveVoiceCount = this.activeVoices.size;
        this._activeVoiceCountChanged = false;
    },

    applyMasterVolumeSettings() {
        if (!this.isReady || !this.masterVolume || !app || !app.state) {
            return;
        }
        const userVolumeGain = app.state.masterVolumeCeiling ?? 1.0;
        const finalMasterDb = Tone.gainToDb(userVolumeGain);
        this.masterVolume.volume.value = finalMasterDb;

        if (this.config.debug) {
            console.log(`[Synth Volume] Master volume set to: ${finalMasterDb.toFixed(1)}dB`);
        }
    },

    calculateGenericYParameter(yPosition, config) {
        const { minOutput = 0, maxOutput = 1, yThreshold = 0.0, curveType = 'linear', curveFactor = 1.0, } = config || {};
        const yNorm = Math.max(0, Math.min(1, yPosition));
        if (yNorm < yThreshold) return (config?.outputType === 'db') ? -Infinity : minOutput;
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

    async applyPreset(presetData, forceRecreation = false) {
        const t0 = performance.now();
        if (!this.isReady || !presetData) return;
        if (this.config.debug) console.log('[Synth] Applying preset:', presetData);

        const safePresetData = {};
        const defaultPresetCopy = JSON.parse(JSON.stringify(this.config.defaultPreset));
        for (const compId in defaultPresetCopy) {
            safePresetData[compId] = { ...defaultPresetCopy[compId], params: { ...defaultPresetCopy[compId].params } };
        }
        for (const compId in presetData) {
            if (!safePresetData[compId]) safePresetData[compId] = {};
            if (presetData[compId].hasOwnProperty('enabled')) safePresetData[compId].enabled = presetData[compId].enabled;
            if (presetData[compId].params) {
                if (!safePresetData[compId].params) safePresetData[compId].params = {};
                safePresetData[compId].params = { ...safePresetData[compId].params, ...presetData[compId].params };
            } else if (typeof presetData[compId] === 'object' && presetData[compId] !== null && !presetData[compId].hasOwnProperty('enabled') && !presetData[compId].hasOwnProperty('params')) {
                if (!safePresetData[compId].params) safePresetData[compId].params = {};
                safePresetData[compId].params = { ...safePresetData[compId].params, ...presetData[compId] };
            }
        }
        if (presetData.portamento) safePresetData.portamento = { ...defaultPresetCopy.portamento, ...presetData.portamento };

        for (let index = 0; index < this.voices.length; index++) {
            const voiceData = this.voices[index];
            if (!voiceData) continue;
            try {
                const oldPresetData = voiceData.currentPresetData || this.config.defaultPreset;
                let needsRecreation = forceRecreation || !voiceData.components;
                const optionalComponents = ['pitchEnvelope', 'filterEnvelope', 'lfo1'];
                if (!needsRecreation) {
                    for (const optCompId of optionalComponents) {
                        const oldEnabled = oldPresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                        const newEnabled = safePresetData[optCompId]?.enabled ?? (this.config.defaultPreset[optCompId]?.enabled ?? false);
                        if (oldEnabled !== newEnabled) { needsRecreation = true; break; }
                    }
                }
                if (!needsRecreation) {
                    const oldPortaEnabled = oldPresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    const newPortaEnabled = safePresetData.portamento?.enabled ?? (this.config.defaultPreset.portamento?.enabled ?? false);
                    if (oldPortaEnabled !== newPortaEnabled) needsRecreation = true;
                }
                if (!needsRecreation) {
                    const oldUsesSampler = oldPresetData?.sampler?.enabled === true;
                    const newUsesSampler = safePresetData.sampler?.enabled === true;
                    if (oldUsesSampler !== newUsesSampler) { needsRecreation = true; }
                    else if (newUsesSampler && oldUsesSampler) {
                        const oldInstrument = oldPresetData.sampler?.params?.instrument;
                        const newInstrument = safePresetData.sampler?.params?.instrument;
                        if (oldInstrument !== newInstrument) needsRecreation = true;
                    }
                }

                if (needsRecreation) {
                    if (this.voiceState[index]?.isBusy && this.voiceState[index].touchId !== null) this.triggerRelease(this.voiceState[index].touchId);
                    await voiceBuilder.disposeComponents(voiceData.components);
                    if (voiceData.fxSend) voiceData.fxSend.dispose();
                    const newVoiceBuildResult = await voiceBuilder.buildVoiceChain(safePresetData);
                    if (newVoiceBuildResult && newVoiceBuildResult.components?.outputGain && !newVoiceBuildResult.errorState?.outputGain) {
                        const fxSend = new Tone.Channel({ volume: -Infinity, channelCount: 2 }).connect(this.fxBus);
                        const outputNode = newVoiceBuildResult.components.outputGain.audioOutput;
                        if (outputNode) {
                             outputNode.fan(fxSend, this.analyser, this.limiter);
                             this.voices[index] = { components: newVoiceBuildResult.components, errorState: newVoiceBuildResult.errorState, fxSend: fxSend, currentPresetData: JSON.parse(JSON.stringify(safePresetData)) };
                        } else { throw new Error("Output node missing after recreation for voice " + index); }
                    } else {
                        this.voices[index] = { components: null, errorState: newVoiceBuildResult?.errorState || { critical: "Recreation failed" }, fxSend: null, currentPresetData: null };
                        this.releaseVoice(index);
                    }
                } else {
                    const components = voiceData.components;
                    const errorState = voiceData.errorState || {};
                    for (const componentId in safePresetData) {
                        const manager = audioConfig.getManager(componentId);
                        const compData = components[componentId];
                        const newSettings = safePresetData[componentId];
                        if (!manager || !compData || errorState[componentId]) continue;
                        if ((componentId === 'sampler' && safePresetData.oscillator?.enabled) || (componentId === 'oscillator' && safePresetData.sampler?.enabled)) continue;
                        let paramsToUpdate = newSettings.params ? { ...newSettings.params } : (typeof newSettings === 'object' && newSettings !== null && !newSettings.hasOwnProperty('enabled') && ['oscillator', 'amplitudeEnv', 'filter', 'outputGain', 'sampler'].includes(componentId) ? { ...newSettings } : null);
                        const currentSourceIsSampler = voiceData.currentPresetData?.sampler?.enabled === true;
                        const targetSourceType = currentSourceIsSampler ? 'sampler' : 'oscillator';
                        if (componentId === targetSourceType) {
                            if (!paramsToUpdate) paramsToUpdate = {};
                            if (targetSourceType === 'oscillator') {
                                if (newSettings.params?.type) paramsToUpdate.type = newSettings.params.type;
                                else if (newSettings.type) paramsToUpdate.type = newSettings.type;
                                paramsToUpdate.portamento = (safePresetData.portamento?.enabled && safePresetData.portamento.time !== undefined) ? safePresetData.portamento.time : 0;
                            }
                            if (targetSourceType === 'sampler') {
                                if (newSettings.params?.attack !== undefined) paramsToUpdate.attack = newSettings.params.attack;
                                if (newSettings.params?.release !== undefined) paramsToUpdate.release = newSettings.params.release;
                                if (newSettings.params?.curve !== undefined) paramsToUpdate.curve = newSettings.params.curve;
                            }
                        }
                        if (paramsToUpdate && Object.keys(paramsToUpdate).length > 0 && typeof manager.update === 'function') {
                            if (!manager.update(compData.nodes, paramsToUpdate, components, voiceData.fxSend, this.analyser, this.limiter, safePresetData)) errorState[componentId] = "Update failed";
                        }
                    }
                    voiceData.currentPresetData = JSON.parse(JSON.stringify(safePresetData));
                    voiceData.errorState = errorState;
                }
            } catch (error) {
                console.error(`[Synth] Error applying preset to voice ${index}:`, error, error.stack);
                this.releaseVoice(index);
                if (voiceData) { voiceData.components = null; voiceData.errorState = { critical: `Apply preset failed: ${error.message}` }; }
            }
        }
        const duration = performance.now() - t0;
        if (duration > 20) console.warn(`[Synth.applyPreset] Long execution: ${duration.toFixed(2)}ms`);
    },

    startNote(frequency, velocity, yPosition, touchId) {
        this._updateQueue.set(touchId, { action: 'start', frequency, velocity, yPosition, noteId: `${touchId}-${performance.now()}` });
        this._requestQueueProcessing();
    },

    updateNote(frequency, velocity, yPosition, touchId) {
        const existingTask = this._updateQueue.get(touchId);
        if (existingTask?.action === 'release') return;
        const task = existingTask || { action: 'update', noteId: this.activeVoices.get(touchId)?.noteId };
        task.action = 'update';
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

    _requestQueueProcessing() {
        if (!this._isProcessingQueue) {
            this._isProcessingQueue = true;
            requestAnimationFrame(() => this._processUpdateQueueInternal());
        }
    },

    _processUpdateQueueInternal() {
        if (this._updateQueue.size === 0) {
            this._isProcessingQueue = false;
            return;
        }
        const tasksToProcess = new Map(this._updateQueue);
        this._updateQueue.clear();
        tasksToProcess.forEach((task, touchId) => {
            try {
                switch (task.action) {
                    case 'start': this._executeStartNote(task.frequency, task.velocity, task.yPosition, touchId, task.noteId); break;
                    case 'update': this._executeUpdateNote(task.frequency, task.velocity, task.yPosition, touchId); break;
                    case 'set_note': this._executeSetNote(task.oldFrequency, task.newFrequency, task.velocity, task.yPosition, touchId); break;
                    case 'release': this._executeTriggerRelease(touchId); break;
                }
            } catch (e) { console.error(`[Synth Queue] Error processing task for touchId ${touchId}:`, task, e); }
        });
        if (this._activeVoiceCountChanged) {
            // NOTE: applyMasterVolumeSettings is now empty of polyphony scaling logic, so this call is less critical but kept for structure
            this.applyMasterVolumeSettings();
            this._activeVoiceCountChanged = false;
        }
        this._isProcessingQueue = false;
        if (this._updateQueue.size > 0) this._requestQueueProcessing();
    },

    _executeStartNote(frequency, velocity, yPosition, touchId, noteId) {
        if (!this.isReady) return;
        const voiceIndex = this.getFreeVoiceIndex(touchId);
        if (voiceIndex === -1) return;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components || voiceData.errorState?.critical) { this.releaseVoice(voiceIndex); return; }
        const components = voiceData.components;
        const yAxisControls = app?.state?.yAxisControls;
        const calculatedVolume = yAxisControls?.volume ? this.calculateGenericYParameter(yPosition, yAxisControls.volume) : 0.7;
        const calculatedSendLevel = yAxisControls?.effects ? this.calculateGenericYParameter(yPosition, yAxisControls.effects) : -Infinity;
        const currentPreset = voiceData.currentPresetData || this.config.defaultPreset;
        const useSampler = currentPreset.sampler?.enabled === true;
        const soundSourceId = useSampler ? 'sampler' : 'oscillator';
        const soundSourceManager = audioConfig.getManager(soundSourceId);
        const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;
        if (soundSourceManager && soundSourceNodes) {
            if (useSampler) {
                soundSourceManager.triggerAttack(soundSourceNodes, frequency, Tone.now(), velocity);
            } else {
                soundSourceManager.update(soundSourceNodes, { frequency });
            }
        } else { this.releaseVoice(voiceIndex); return; }
        audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
        if (voiceData.fxSend) voiceData.fxSend.volume.value = calculatedSendLevel;
        if (components.amplitudeEnv?.nodes) audioConfig.getManager('amplitudeEnv')?.triggerAttack(components.amplitudeEnv.nodes, Tone.now(), velocity);
        if (currentPreset.pitchEnvelope?.enabled && components.pitchEnvelope?.nodes) audioConfig.getManager('pitchEnvelope')?.triggerAttack(components.pitchEnvelope.nodes, Tone.now());
        if (currentPreset.filterEnvelope?.enabled && components.filterEnvelope?.nodes) audioConfig.getManager('filterEnvelope')?.triggerAttack(components.filterEnvelope.nodes, Tone.now());
        if (currentPreset.lfo1?.enabled && components.lfo1?.nodes) audioConfig.getManager('lfo1')?.enable(components.lfo1.nodes, true, { retrigger: currentPreset.lfo1.params?.retrigger ?? false });
        this.voiceState[voiceIndex] = { isBusy: true, touchId: touchId, noteId: noteId, startTime: Tone.now() };
        this.activeVoices.set(touchId, { frequency, noteId, voiceIndex, lastY: yPosition });
        if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
            this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    setNote(oldFrequency, newFrequency, velocity, yPosition, touchId) {
        this._updateQueue.set(touchId, { action: 'set_note', oldFrequency, newFrequency, velocity, yPosition });
        this._requestQueueProcessing();
    },

    _executeUpdateNote(frequency, velocity, yPosition, touchId) {
        if (!this.isReady) return;
        const activeVoiceDetails = this.activeVoices.get(touchId);
        if (!activeVoiceDetails) return;
        const voiceIndex = activeVoiceDetails.voiceIndex;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components) return;
        const freqChanged = Math.abs(activeVoiceDetails.frequency - frequency) > 0.1;
        const yChanged = Math.abs(activeVoiceDetails.lastY - yPosition) > 0.001;
        if (freqChanged) {
            this._executeSetNote(activeVoiceDetails.frequency, frequency, velocity, yPosition, touchId);
        } else if (yChanged) {
            activeVoiceDetails.lastY = yPosition;
            const yAxisControls = app?.state?.yAxisControls;
            const calculatedVolume = yAxisControls?.volume ? this.calculateGenericYParameter(yPosition, yAxisControls.volume) : 0.7;
            const calculatedSendLevel = yAxisControls?.effects ? this.calculateGenericYParameter(yPosition, yAxisControls.effects) : -Infinity;
            audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
            if (voiceData.fxSend) voiceData.fxSend.volume.rampTo(calculatedSendLevel, 0.02);
        }
    },

    _executeSetNote(oldFrequency, newFrequency, velocity, yPosition, touchId) {
        const activeVoiceDetails = this.activeVoices.get(touchId);
        if (!activeVoiceDetails) { this._executeStartNote(newFrequency, velocity, yPosition, touchId, `${touchId}-${performance.now()}`); return; }
        const voiceIndex = activeVoiceDetails.voiceIndex;
        const voiceData = this.voices[voiceIndex];
        if (!voiceData || !voiceData.components) return;
        const useSampler = voiceData.currentPresetData?.sampler?.enabled === true;
        const soundSourceId = useSampler ? 'sampler' : 'oscillator';
        const soundSourceManager = audioConfig.getManager(soundSourceId);
        const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;
        if (soundSourceManager && soundSourceNodes) {
            if (useSampler) { if (typeof soundSourceManager.setNote === 'function') soundSourceManager.setNote(soundSourceNodes, oldFrequency, newFrequency, Tone.now(), velocity); }
            else { if (typeof soundSourceManager.setNote === 'function') soundSourceManager.setNote(soundSourceNodes, newFrequency, undefined, velocity); else soundSourceManager.update(soundSourceNodes, { frequency: newFrequency }); }
        }
        this.activeVoices.set(touchId, { ...activeVoiceDetails, frequency: newFrequency, lastY: yPosition });
        const yAxisControls = app?.state?.yAxisControls;
        const calculatedVolume = yAxisControls?.volume ? this.calculateGenericYParameter(yPosition, yAxisControls.volume) : 0.7;
        const calculatedSendLevel = yAxisControls?.effects ? this.calculateGenericYParameter(yPosition, yAxisControls.effects) : -Infinity;
        audioConfig.getManager('outputGain')?.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
        if (voiceData.fxSend) voiceData.fxSend.volume.rampTo(calculatedSendLevel, 0.02);
    },

    _executeTriggerRelease(touchId) {
        if (!this.isReady) return;
        const activeVoiceDetails = this.activeVoices.get(touchId);
        if (!activeVoiceDetails) return;
        const voiceIndex = activeVoiceDetails.voiceIndex;
        const voiceData = this.voices[voiceIndex];
        if (voiceData && voiceData.components) {
            const currentPreset = voiceData.currentPresetData || this.config.defaultPreset;
            const useSampler = currentPreset.sampler?.enabled === true;
            const soundSourceId = useSampler ? 'sampler' : 'oscillator';
            const soundSourceManager = audioConfig.getManager(soundSourceId);
            const soundSourceNodes = voiceData.components[soundSourceId]?.nodes;
            if (useSampler) {
                const noteToRelease = this.activeVoices.get(touchId)?.frequency;
                if (noteToRelease && soundSourceManager && soundSourceNodes) soundSourceManager.triggerRelease(soundSourceNodes, noteToRelease, Tone.now());
            }
            if (voiceData.components.amplitudeEnv?.nodes) audioConfig.getManager('amplitudeEnv')?.triggerRelease(voiceData.components.amplitudeEnv.nodes, Tone.now());
            if (currentPreset.pitchEnvelope?.enabled && voiceData.components.pitchEnvelope?.nodes) audioConfig.getManager('pitchEnvelope')?.triggerRelease(voiceData.components.pitchEnvelope.nodes, Tone.now());
            if (currentPreset.filterEnvelope?.enabled && voiceData.components.filterEnvelope?.nodes) audioConfig.getManager('filterEnvelope')?.triggerRelease(voiceData.components.filterEnvelope.nodes, Tone.now());
        }
        this.releaseVoice(voiceIndex);
        this.activeVoices.delete(touchId);
        if (this.activeVoices.size !== this._previousActiveVoiceCount) {
            this._activeVoiceCountChanged = true;
            this._previousActiveVoiceCount = this.activeVoices.size;
        }
    },

    applyFxChain(fullFxChainData) {
        this.currentFxChainData = fullFxChainData ? JSON.parse(JSON.stringify(fullFxChainData)) : null;
        const fxChainSettingsArray = fullFxChainData?.effects || [];
        if (!this.isReady) return;
        this.fxBus.disconnect();
        Object.values(this.effects).forEach(effect => { if(effect && typeof effect.disconnect === 'function') effect.disconnect(); });
        for (const effectName in this.effects) {
            const effectInstance = this.effects[effectName];
            const def = this.config.effectDefinitions[effectName];
            if (effectInstance && def?.defaults) try { effectInstance.set({ ...def.defaults, wet: 0 }); } catch (e) { console.warn(`Could not reset effect '${effectName}'`, e); }
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
                        if (!paramsToApply.hasOwnProperty('wet') && effectName !== 'filter') paramsToApply.wet = 0;
                    }
                    if (effectName === 'reverb' && paramsToApply.hasOwnProperty('decay')) {
                        paramsToApply.roomSize = Math.max(0.01, Math.min(0.99, 0.01 + (Math.max(0.1, Math.min(10, paramsToApply.decay)) / 10) * 0.98));
                        delete paramsToApply.decay;
                        if (paramsToApply.hasOwnProperty('preDelay')) delete paramsToApply.preDelay;
                    }
                    try {
                        if (Object.keys(paramsToApply).length > 0) effectInstance.set(paramsToApply);
                        if (fxSetting.enabled !== false) {
                            if (effectName !== 'filter' && paramsToApply.wet > 0) activeEffectNodes.push(effectInstance);
                            else if (effectName === 'filter') activeEffectNodes.push(effectInstance);
                        }
                    } catch (e) { console.warn(`Could not apply settings to '${effectName}'`, e, paramsToApply); }
                }
            });
        }
        try {
            if (activeEffectNodes.length > 0) this.fxBus.chain(...activeEffectNodes, this.limiter);
            else this.fxBus.connect(this.limiter);
        } catch (chainError) {
            console.error('Error chaining effects:', chainError);
            try { this.fxBus.connect(this.limiter); } catch(e){}
        }
        this.updateAllActiveVoiceSendLevels();
        if (typeof fxChains !== 'undefined' && typeof fxChains.updateMacroKnobsFromChain === 'function') fxChains.updateMacroKnobsFromChain(this.currentFxChainData);
    },

    getAnalyser() { return this.analyser; },

    getCurrentFxSettings() {
        const settings = [];
        if (!this.isReady) return settings;
        const globalEffectOrder = Object.keys(this.config.effectDefinitions);
        for (const effectName of globalEffectOrder) {
            if (this.effects[effectName] && this.config.effectDefinitions[effectName]) {
                const effect = this.effects[effectName];
                const def = this.config.effectDefinitions[effectName];
                const effectSetting = { type: effectName, params: {} };
                def.params.forEach(paramName => {
                    try {
                        let currentValue = (effect[paramName] instanceof Tone.Param || effect[paramName] instanceof Tone.Signal) ? effect[paramName].value : effect[paramName];
                        effectSetting.params[paramName] = typeof currentValue === 'number' ? parseFloat(currentValue.toFixed(4)) : currentValue;
                    } catch (e) { effectSetting.params[paramName] = def.defaults[paramName]; }
                });
                if (effect.wet instanceof Tone.Param) effectSetting.wet = parseFloat(effect.wet.value.toFixed(4));
                else if (effect.wet !== undefined) effectSetting.wet = effect.wet;
                settings.push(effectSetting);
            }
        }
        return settings;
    },

    getFreeVoiceIndex(newTouchId) {
        if (!this.isReady) return -1;
        for (let i = 0; i < this.config.polyphony; i++) {
            if (!this.voiceState[i]?.isBusy && this.voices[i]?.components) return i;
        }
        let oldestVoiceIndex = -1;
        let oldestTime = Infinity;
        for (let i = 0; i < this.config.polyphony; i++) {
            if (this.voiceState[i]?.isBusy && this.voiceState[i].startTime < oldestTime) {
                oldestTime = this.voiceState[i].startTime;
                oldestVoiceIndex = i;
            }
        }
        if (oldestVoiceIndex !== -1) {
            const oldTouchId = this.voiceState[oldestVoiceIndex].touchId;
            if (oldTouchId !== null) this.triggerRelease(oldTouchId);
            return oldestVoiceIndex;
        }
        return -1;
    },

    findVoiceIndex(touchId) {
        if (!this.isReady) return -1;
        for (let i = 0; i < this.config.polyphony; i++) {
            if (this.voiceState[i].isBusy && this.voiceState[i].touchId === touchId) return i;
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
                if (voiceData?.components?.outputGain?.nodes?.gainNode) {
                    voiceData.components.outputGain.nodes.gainNode.gain.cancelScheduledValues(Tone.now());
                    voiceData.components.outputGain.nodes.gainNode.gain.rampTo(0, 0.05);
                }
                if (voiceData?.fxSend?.volume) {
                    voiceData.fxSend.volume.cancelScheduledValues(Tone.now());
                    voiceData.fxSend.volume.rampTo(-Infinity, 0.05);
                }
                const lfoManager = audioConfig.getManager('lfo1');
                if (lfoManager && voiceData?.components?.lfo1 && !voiceData.errorState?.lfo1) lfoManager.enable(voiceData.components.lfo1.nodes, false);
            } catch(e) { console.error(`Error ramping gain/send for voice ${voiceIndex}:`, e); }
        }
    },

    startSilentNotesCheck() {
        if (this.silentTimeout) clearTimeout(this.silentTimeout);
        this.silentTimeout = setTimeout(() => {
            if (!this.isReady) return;
            this.activeVoices.forEach((voiceInfo, touchId) => {
                const voiceState = this.voiceState[voiceInfo.voiceIndex];
                if (voiceState?.isBusy) {
                    const components = this.voices[voiceInfo.voiceIndex]?.components;
                    if (components?.amplitudeEnv?.node?.value < 0.001) {
                         this.triggerRelease(touchId);
                    }
                }
            });
            this.startSilentNotesCheck();
         }, this.silentCheckInterval);
    },

    updateAllActiveVoiceMainLevels() {
        if (!this.isReady || !app || !app.state) return;
        const yAxisVolConfig = app.state.yAxisControls.volume;
        this.activeVoices.forEach((voiceInfo) => {
            const voiceData = this.voices[voiceInfo.voiceIndex];
            if (voiceData?.components?.outputGain && !voiceData.errorState?.outputGain) {
                const yPosition = voiceInfo.lastY ?? 0.5;
                const calculatedVolume = this.calculateGenericYParameter(yPosition, yAxisVolConfig);
                const outputGainManager = audioConfig.getManager('outputGain');
                if (outputGainManager?.update) outputGainManager.update(voiceData.components.outputGain.nodes, { gain: calculatedVolume });
            }
        });
    },

    updateActiveVoicesParameter(paramPath, value) {
        if (!this.isReady) return;
        const pathParts = paramPath.split('.');
        if (pathParts.length < 2) return;
        const componentId = pathParts[0];
        const manager = audioConfig.getManager(componentId);
        if (!manager?.update) return;
        const settingsUpdate = {};
        let currentLevel = settingsUpdate;
        for(let i = 1; i < pathParts.length - 1; i++) {
            currentLevel = currentLevel[pathParts[i]] = {};
        }
        currentLevel[pathParts[pathParts.length - 1]] = value;
        this.activeVoices.forEach(voiceInfo => {
            const voiceData = this.voices[voiceInfo.voiceIndex];
            if (voiceData?.components?.[componentId] && !voiceData.errorState?.[componentId]) {
                try {
                    if (!manager.update(voiceData.components[componentId].nodes, settingsUpdate)) if (voiceData.errorState) voiceData.errorState[componentId] = "Update failed";
                } catch (e) { if (voiceData.errorState) voiceData.errorState[componentId] = `Update error: ${e.message}`; }
            }
        });
        this.voices.forEach((voiceData) => {
            if (voiceData?.currentPresetData) {
                try {
                    let current = voiceData.currentPresetData;
                    if (!current[componentId]) current[componentId] = { params: {} };
                    if (!current[componentId].params) current[componentId].params = {};
                    let targetParams = current[componentId].params;
                    let currentLevelParams = targetParams;
                    for(let i = 1; i < pathParts.length - 1; i++) currentLevelParams = currentLevelParams[pathParts[i]] = currentLevelParams[pathParts[i]] || {};
                    currentLevelParams[pathParts[pathParts.length - 1]] = value;
                    if (componentId === 'filter' && targetParams) {
                        if (paramPath === 'filter.Q') targetParams.resonance = value;
                        if (paramPath === 'filter.resonance') targetParams.Q = value;
                    }
                } catch (e) { console.error("Error updating voice presetData cache:", e); }
            }
        });
    },

    stopAllNotes() {
        if (!this.isReady) return;
        [...this.activeVoices.keys()].forEach(touchId => this.triggerRelease(touchId));
        this.voiceState.forEach((state, index) => { if (state?.isBusy) this.releaseVoice(index); });
        this.activeVoices.clear();
        this.applyMasterVolumeSettings();
    },

    forceStopAllNotes() {
        this.activeVoices.forEach((voiceInfo, touchId) => {
            const voiceIndex = this.findVoiceIndex(touchId);
            if (voiceIndex !== -1) {
                const voiceData = this.voices[voiceIndex];
                if (voiceData?.components) {
                    audioConfig.getManager('amplitudeEnv')?.triggerRelease(voiceData.components.amplitudeEnv.nodes, Tone.now());
                    if (voiceData.currentPresetData?.pitchEnvelope?.enabled) audioConfig.getManager('pitchEnvelope')?.triggerRelease(voiceData.components.pitchEnvelope.nodes, Tone.now());
                    if (voiceData.currentPresetData?.filterEnvelope?.enabled) audioConfig.getManager('filterEnvelope')?.triggerRelease(voiceData.components.filterEnvelope.nodes, Tone.now());
                }
                this.releaseVoice(voiceIndex);
            }
        });
        this.activeVoices.clear();
        this.applyMasterVolumeSettings();
        setTimeout(() => {
            this.voiceState.forEach((state, index) => {
                if (state.isBusy) {
                    if (this.voices[index]?.components) {
                        voiceBuilder.disposeComponents(this.voices[index].components);
                        this.voices[index].components = null;
                        this.voices[index].errorState = { critical: "Hard force stopped" };
                    }
                    this.releaseVoice(index);
                }
            });
        }, 1000);
    },

    updateAllActiveVoiceSendLevels() {
        if (!this.isReady || !app || !app.state) return;
        const yAxisFxConfig = app.state.yAxisControls.effects;
        const lastY = (typeof pad !== 'undefined' && typeof pad.getLastYPosition === 'function') ? pad.getLastYPosition() : 0.5;
        this.activeVoices.forEach((voiceInfo) => {
            const voiceData = this.voices[voiceInfo.voiceIndex];
            if (voiceData?.components?.outputGain && !voiceData.errorState?.outputGain) {
                const yPosForVoice = voiceInfo.lastY ?? lastY;
                const individualSendLevel = this.calculateGenericYParameter(yPosForVoice, yAxisFxConfig);
                if (this.voices[voiceInfo.voiceIndex]?.fxSend?.volume) this.voices[voiceInfo.voiceIndex].fxSend.volume.rampTo(individualSendLevel, 0.05);
            }
        });
    },

    async setMacro(macroName, value) {
        if (!this.currentFxChainData?.macroMappings) return;
        const mappings = this.currentFxChainData.macroMappings[macroName];
        if (!mappings || !Array.isArray(mappings)) return;
        mappings.forEach(mapping => {
            const { effect: effectType, param: paramName, range } = mapping;
            const effectInstance = this.effects[effectType];
            const definition = this.config.effectDefinitions[effectType];
            if (!effectInstance || !definition) return;
            const targetParam = effectInstance[paramName];
            let paramExists = effectInstance.hasOwnProperty(paramName) || (targetParam instanceof Tone.Param);
            if (!paramExists && definition?.params?.includes(paramName)) paramExists = true;
            if (!paramExists) return;
            const targetValue = range[0] + value * (range[1] - range[0]);
            if (targetParam instanceof Tone.Param || targetParam instanceof Tone.Signal) {
                targetParam.rampTo(targetValue, 0.05);
            } else if (effectInstance.hasOwnProperty(paramName) || definition?.params?.includes(paramName)) {
                effectInstance[paramName] = targetValue;
            }
        });
    },
};
