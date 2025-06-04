// Файл: app/src/main/assets/js/managers/chorusFxManager.js
const chorusFxManager = {
    create(initialSettings = {}) {
        console.log("[ChorusFxManager] Creating Chorus node with settings:", initialSettings);
        let nodes = { chorusNode: null };
        let audioInput = null;
        let audioOutput = null;
        let error = null;

        try {
            const settings = {
                frequency: initialSettings.frequency ?? 1.5,
                depth: initialSettings.depth ?? 0.7,
                delayTime: initialSettings.delayTime ?? 3.5,
                wet: initialSettings.wet ?? 0.0,
                type: initialSettings.type || 'sine', // Tone.Chorus поддерживает тип LFO
                spread: initialSettings.spread || 180 // Для стереоэффекта
            };
            nodes.chorusNode = new Tone.Chorus(settings).start(); // Запускаем LFO хоруса
            audioInput = nodes.chorusNode;
            audioOutput = nodes.chorusNode;
            console.log("[ChorusFxManager] Chorus node created successfully.");
        } catch (err) {
            console.error("[ChorusFxManager] Error creating Chorus node:", err);
            error = `Failed to create Chorus: ${err.message}`;
            nodes = null;
        }
        return { nodes, audioInput, audioOutput, modInputs: {}, modOutputs: {}, error };
    },

    update(nodes, newSettings) {
        if (!nodes?.chorusNode || !newSettings) return false;
        const chorusNode = nodes.chorusNode;
        console.log("[ChorusFxManager] Updating Chorus with:", newSettings);
        try {
            if (newSettings.frequency !== undefined && chorusNode.frequency instanceof Tone.Param) chorusNode.frequency.rampTo(newSettings.frequency, 0.02);
            if (newSettings.depth !== undefined && chorusNode.depth instanceof Tone.Param) chorusNode.depth.rampTo(newSettings.depth, 0.02);
            if (newSettings.delayTime !== undefined && typeof chorusNode.delayTime === 'number') chorusNode.delayTime = newSettings.delayTime; // delayTime - не Param
            if (newSettings.wet !== undefined && chorusNode.wet instanceof Tone.Param) chorusNode.wet.rampTo(newSettings.wet, 0.02);
            if (newSettings.type !== undefined) chorusNode.type = newSettings.type;
            if (newSettings.spread !== undefined) chorusNode.spread = newSettings.spread;
            return true;
        } catch (err) {
            console.error("[ChorusFxManager] Error updating Chorus:", err);
            return false;
        }
    },

    enable(nodes, isEnabled) {
        if (!nodes?.chorusNode) return false;
        const chorusNode = nodes.chorusNode;
        console.log(`[ChorusFxManager] Setting enabled to ${isEnabled}`);
        try {
            if (!isEnabled && chorusNode.wet.value > 0) chorusNode._previousWet = chorusNode.wet.value;
            const targetWet = isEnabled ? (chorusNode._previousWet ?? 0.5) : 0; // Дефолтный wet 0.5 при включении, если не было сохранено
            chorusNode.wet.rampTo(targetWet, 0.02);
            // LFO хоруса стартует в create, останавливать его не нужно, wet=0 достаточно
            return true;
        } catch (err) { return false; }
    },

    connectPeers(nodes, prev, next) { return blankManager.connectPeers(nodes, prev, next); },
    dispose(nodes) {
        if (nodes?.chorusNode) {
            nodes.chorusNode.stop(); // Останавливаем LFO перед удалением
            blankManager.dispose({ chorusNode: nodes.chorusNode });
        }
    }
    // connectModulator и disconnectModulator можно наследовать от blankManager или реализовать если нужно
};

if (typeof audioConfig !== 'undefined' && audioConfig.registerManager) {
    audioConfig.registerManager('chorus', chorusFxManager);
} else {
    console.error("[ChorusFxManager] audioConfig or registerManager missing.");
}