// Файл: app/src/main/assets/js/managers/oscillatorManager.js
// ВЕРСИЯ V3: Тестирование Tone.Oscillator для sine, ограничение FatOsc, исправление rampTo

const oscillatorManager = {
    create(initialSettings = { type: 'triangle' }) {
        const t0 = performance.now();
        console.log("[OscillatorManager] create() called with:", initialSettings);
        let nodes = {
            oscillatorNode: null,
            oscillatorType: initialSettings.type || 'triangle'
        };
        let audioOutput = null;
        let modInputs = {};
        let error = null;
        try {
            const oscType = nodes.oscillatorType;
            const phase = initialSettings.phase ?? 0;
            const detune = 0;
            const portamentoTime = initialSettings.portamento ?? 0;
            let oscNode;
            let t_type_start, t_type_end;
            if (oscType === 'sine') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.Oscillator (sine)", {phase, detune, portamentoTime});
                oscNode = new Tone.Oscillator({
                    type: 'sine',
                    frequency: 440,
                    detune: detune,
                    phase: phase,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.Oscillator (sine) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (["square", "sawtooth", "triangle"].includes(oscType)) {
                t_type_start = performance.now();
                console.log(`[OscillatorManager] Creating Tone.OmniOscillator (${oscType})`, {phase, detune, portamentoTime});
                oscNode = new Tone.OmniOscillator({
                    type: oscType,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.OmniOscillator (${oscType}) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (oscType === 'pwm') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.PWMOscillator", {modulationFrequency: initialSettings.modulationFrequency, phase, detune, portamentoTime});
                oscNode = new Tone.PWMOscillator({
                    modulationFrequency: initialSettings.modulationFrequency ?? 0.5,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.PWMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.modulationFrequency) modInputs.modulationFrequency = oscNode.modulationFrequency;
            } else if (oscType === 'pulse') {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.PulseOscillator", {width: initialSettings.width, phase, detune, portamentoTime});
                oscNode = new Tone.PulseOscillator({
                    width: initialSettings.width ?? 0.5,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.PulseOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.width) modInputs.width = oscNode.width;
            } else if (oscType.startsWith('fat')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.FatOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(3).toLowerCase();
                const maxFatCount = 5;
                const currentCount = initialSettings.count ?? 3;
                const safeCount = Math.max(1, Math.min(currentCount, maxFatCount));
                oscNode = new Tone.FatOscillator({
                    type: baseType,
                    count: safeCount,
                    spread: initialSettings.spread ?? 20,
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.FatOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else if (oscType.startsWith('am')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.AMOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(2).toLowerCase();
                oscNode = new Tone.AMOscillator({
                    type: baseType,
                    harmonicity: initialSettings.harmonicity ?? 1,
                    modulationType: initialSettings.modulationType ?? 'square',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.AMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.harmonicity) modInputs.harmonicity = oscNode.harmonicity;
            } else if (oscType.startsWith('fm')) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.FMOscillator", {oscType, initialSettings});
                const baseType = oscType.substring(2).toLowerCase();
                oscNode = new Tone.FMOscillator({
                    type: baseType,
                    harmonicity: initialSettings.harmonicity ?? 1,
                    modulationIndex: initialSettings.modulationIndex ?? 10,
                    modulationType: initialSettings.modulationType ?? 'square',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.FMOscillator created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
                if (oscNode.harmonicity) modInputs.harmonicity = oscNode.harmonicity;
                if (oscNode.modulationIndex) modInputs.modulationIndex = oscNode.modulationIndex;
            } else if (["white", "pink", "brown"].includes(oscType)) {
                t_type_start = performance.now();
                console.log("[OscillatorManager] Creating Tone.Noise", {oscType});
                oscNode = new Tone.Noise(oscType).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.Noise (${oscType}) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            } else {
                t_type_start = performance.now();
                console.warn(`[OscillatorManager] Unsupported type: ${oscType}. Using triangle (OmniOscillator).`);
                nodes.oscillatorType = 'triangle';
                oscNode = new Tone.OmniOscillator({
                    type: 'triangle',
                    phase: phase,
                    detune: detune,
                    portamento: portamentoTime
                }).start();
                t_type_end = performance.now();
                console.log(`[OscillatorManager] Tone.OmniOscillator (triangle fallback) created in ${(t_type_end-t_type_start).toFixed(2)}ms`);
            }
            nodes.oscillatorNode = oscNode;
            audioOutput = oscNode;
            if (oscNode.frequency && (oscNode.frequency instanceof Tone.Param || oscNode.frequency instanceof Tone.Signal)) {
                modInputs.frequency = oscNode.frequency;
            }
            if (oscNode.detune && (oscNode.detune instanceof Tone.Param || oscNode.detune instanceof Tone.Signal)) {
                modInputs.detune = oscNode.detune;
            }
            console.log("[OscillatorManager] create() finished. Node type:", oscNode.constructor.name);
        } catch (err) {
            console.error("[OscillatorManager] Error in create():", err, err.stack);
            error = `Failed to create oscillator: ${err.message}`;
            nodes = null;
            audioOutput = null;
            modInputs = {};
        }
        const t1 = performance.now();
        console.log(`[OscillatorManager] create() duration: ${(t1-t0).toFixed(2)}ms`);
        return { nodes, audioInput: null, audioOutput, modInputs, modOutputs: {}, error };
    },
    update(nodes, newSettings) {
        const t0 = performance.now();
        console.log("[OscillatorManager] update() called with:", JSON.stringify(newSettings, null, 2));
        if (!nodes?.oscillatorNode || !newSettings) {
            console.warn("[OscillatorManager] Update called with invalid args", JSON.parse(JSON.stringify({ nodes, newSettings })));
            return false;
        }
        const oscNode = nodes.oscillatorNode;
        const oscType = nodes.oscillatorType;
        try {
            // Логируем состояние перед изменением
            console.log("[OscillatorManager] update() oscNode state before:", {
                frequency: oscNode.frequency?.value,
                detune: oscNode.detune?.value,
                phase: oscNode.phase,
                portamento: oscNode.portamento,
                type: oscNode.type,
                count: oscNode.count,
                spread: oscNode.spread,
                width: oscNode.width?.value,
                modulationFrequency: oscNode.modulationFrequency?.value,
                harmonicity: oscNode.harmonicity?.value,
                modulationIndex: oscNode.modulationIndex?.value,
                modulationType: oscNode.modulationType
            });
            let t_param_start, t_param_end;
            if (newSettings.frequency !== undefined && oscNode.frequency && (oscNode.frequency instanceof Tone.Param || oscNode.frequency instanceof Tone.Signal)) {
                if (oscNode.frequency.cancelScheduledValues) oscNode.frequency.cancelScheduledValues(Tone.now());
                t_param_start = performance.now();
                oscNode.frequency.value = newSettings.frequency;
                t_param_end = performance.now();
                console.log(`[OscillatorManager] frequency.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
            }
            if (newSettings.detune !== undefined && oscNode.detune && (oscNode.detune instanceof Tone.Param || oscNode.detune instanceof Tone.Signal)) {
                if (oscNode.detune.cancelScheduledValues) oscNode.detune.cancelScheduledValues(Tone.now());
                t_param_start = performance.now();
                oscNode.detune.value = newSettings.detune;
                t_param_end = performance.now();
                console.log(`[OscillatorManager] detune.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
            }
            if (newSettings.phase !== undefined && oscNode.hasOwnProperty('phase') && typeof oscNode.phase === 'number') {
                t_param_start = performance.now();
                oscNode.phase = newSettings.phase;
                t_param_end = performance.now();
                console.log(`[OscillatorManager] phase set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
            }
            if (newSettings.portamento !== undefined && oscNode.hasOwnProperty('portamento') && typeof oscNode.portamento === 'number') {
                t_param_start = performance.now();
                oscNode.portamento = newSettings.portamento;
                t_param_end = performance.now();
                console.log(`[OscillatorManager] portamento set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
            }
            switch (oscType) {
                case 'pwm':
                    if (newSettings.modulationFrequency !== undefined && oscNode.modulationFrequency && (oscNode.modulationFrequency instanceof Tone.Param || oscNode.modulationFrequency instanceof Tone.Signal)) {
                        if (oscNode.modulationFrequency.cancelScheduledValues) oscNode.modulationFrequency.cancelScheduledValues(Tone.now());
                        t_param_start = performance.now();
                        oscNode.modulationFrequency.value = newSettings.modulationFrequency;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] modulationFrequency.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    break;
                case 'pulse':
                    if (newSettings.width !== undefined && oscNode.width && (oscNode.width instanceof Tone.Param || oscNode.width instanceof Tone.Signal)) {
                        if (oscNode.width.cancelScheduledValues) oscNode.width.cancelScheduledValues(Tone.now());
                        t_param_start = performance.now();
                        oscNode.width.value = newSettings.width;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] width.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    break;
                case 'fatsine': case 'fatsquare': case 'fatsawtooth': case 'fattriangle':
                    if (newSettings.count !== undefined && oscNode.hasOwnProperty('count') && typeof oscNode.count === 'number') {
                        t_param_start = performance.now();
                        const maxFatCount = 5;
                        const newCount = Math.max(1, Math.min(parseInt(newSettings.count, 10), maxFatCount));
                        if (parseInt(newSettings.count, 10) > maxFatCount) {
                            console.warn(`[OscillatorManager] FatOscillator count (${newSettings.count}) exceeded max (${maxFatCount}). Clamped to ${newCount}.`);
                        }
                        oscNode.count = newCount;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] count set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    if (newSettings.spread !== undefined && oscNode.hasOwnProperty('spread') && typeof oscNode.spread === 'number') {
                        t_param_start = performance.now();
                        oscNode.spread = newSettings.spread;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] spread set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    break;
                case 'amtriangle': case 'amsine': case 'amsquare': case 'amsawtooth':
                    if (newSettings.harmonicity !== undefined && oscNode.harmonicity && (oscNode.harmonicity instanceof Tone.Param || oscNode.harmonicity instanceof Tone.Signal)) {
                        if (oscNode.harmonicity.cancelScheduledValues) oscNode.harmonicity.cancelScheduledValues(Tone.now());
                        t_param_start = performance.now();
                        oscNode.harmonicity.value = newSettings.harmonicity;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] harmonicity.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    if (newSettings.modulationType !== undefined && oscNode.hasOwnProperty('modulationType')) {
                        t_param_start = performance.now();
                        oscNode.modulationType = newSettings.modulationType;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] modulationType set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    break;
                case 'fmtriangle': case 'fmsine': case 'fmsquare': case 'fmsawtooth':
                    if (newSettings.harmonicity !== undefined && oscNode.harmonicity && (oscNode.harmonicity instanceof Tone.Param || oscNode.harmonicity instanceof Tone.Signal)) {
                        if (oscNode.harmonicity.cancelScheduledValues) oscNode.harmonicity.cancelScheduledValues(Tone.now());
                        t_param_start = performance.now();
                        oscNode.harmonicity.value = newSettings.harmonicity;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] harmonicity.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    if (newSettings.modulationIndex !== undefined && oscNode.modulationIndex && (oscNode.modulationIndex instanceof Tone.Param || oscNode.modulationIndex instanceof Tone.Signal)) {
                        if (oscNode.modulationIndex.cancelScheduledValues) oscNode.modulationIndex.cancelScheduledValues(Tone.now());
                        t_param_start = performance.now();
                        oscNode.modulationIndex.value = newSettings.modulationIndex;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] modulationIndex.value set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    if (newSettings.modulationType !== undefined && oscNode.hasOwnProperty('modulationType')) {
                        t_param_start = performance.now();
                        oscNode.modulationType = newSettings.modulationType;
                        t_param_end = performance.now();
                        console.log(`[OscillatorManager] modulationType set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
                    }
                    break;
            }
            if (newSettings.type !== undefined && oscNode.hasOwnProperty('type')) {
                t_param_start = performance.now();
                oscNode.type = newSettings.type;
                t_param_end = performance.now();
                console.log(`[OscillatorManager] type set in ${(t_param_end-t_param_start).toFixed(2)}ms`);
            }
            console.log("[OscillatorManager] update() finished.");
            const t1 = performance.now();
            console.log(`[OscillatorManager] update() duration: ${(t1-t0).toFixed(2)}ms`);
            return true;
        } catch (err) {
            console.error("[OscillatorManager] Error in update():", err);
            return false;
        }
    },
    dispose(nodes) {
        const t0 = performance.now();
        console.log("[OscillatorManager] dispose() called");
        if (nodes?.oscillatorNode) {
            try {
                nodes.oscillatorNode.disconnect();
                nodes.oscillatorNode.dispose();
                console.log("[OscillatorManager] Oscillator node disposed.");
            } catch (e) {
                console.warn("[OscillatorManager] Error disposing oscillator node:", e);
            }
        }
        const t1 = performance.now();
        console.log(`[OscillatorManager] dispose() duration: ${(t1-t0).toFixed(2)}ms`);
    },
    connectPeers(nodes, prevOutputNode, nextInputNode) {
        return true;
    },
    enable(nodes, isEnabled) {
        return true;
    },
    connectModulator(nodes, targetParamPath, sourceNode) {
        return true;
    },
    disconnectModulator(nodes, targetParamPath, sourceNode) {
        return true;
    }
};

if (typeof audioConfig !== 'undefined' && typeof audioConfig.registerManager === 'function') {
    audioConfig.registerManager('oscillator', oscillatorManager);
} else {
    console.error("[OscillatorManager] audioConfig or audioConfig.registerManager is not available.");
}
