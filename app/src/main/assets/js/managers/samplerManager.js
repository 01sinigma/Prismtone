const samplerManager = {
    async create(settings = {}) {
        console.log("[SamplerManager] Creating sampler with settings:", settings);
        let nodes = { samplerNode: null };
        let error = null;

        if (!settings.instrument || !settings.urls) {
            error = "Sampler settings must include 'instrument' and 'urls'.";
            console.error(`[SamplerManager] ${error}`);
            return { nodes: null, error };
        }

        try {
            // Возвращаем Promise, который разрешится, когда сэмплер будет готов
            return new Promise((resolve) => {
                const sampler = new Tone.Sampler({
                    urls: settings.urls,
                    baseUrl: `https://appassets.androidplatform.net/assets/audio/samples/${settings.instrument}/`,
                    attack: settings.attack,
                    release: settings.release,
                    curve: settings.curve,
                    onload: () => {
                        console.log(`[SamplerManager] Sampler for '${settings.instrument}' loaded successfully.`);
                        nodes.samplerNode = sampler;
                        resolve({
                            nodes,
                            audioInput: null, // Сэмплер - источник, а не процессор
                            audioOutput: sampler,
                            modInputs: {}, // Пока не модулируем параметры сэмплера
                            modOutputs: {},
                            error: null
                        });
                    },
                    onerror: (err) => {
                        error = `Failed to load samples for instrument '${settings.instrument}': ${err}`;
                        console.error(`[SamplerManager] ${error}`);
                        resolve({ nodes: null, error });
                    }
                });
            });
        } catch (err) {
            error = `Error creating Tone.Sampler: ${err.message}`;
            console.error(`[SamplerManager] ${error}`);
            return { nodes: null, error };
        }
    },

    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !newSettings) return false;
        try {
            nodes.samplerNode.set({
                attack: newSettings.attack,
                release: newSettings.release,
                curve: newSettings.curve
            });
            return true;
        } catch (e) {
            console.error("[SamplerManager] Error updating sampler:", e);
            return false;
        }
    },

    triggerAttack(nodes, frequency, time, velocity) {
        nodes?.samplerNode?.triggerAttack(frequency, time, velocity);
    },

    triggerRelease(nodes, frequency, time) {
        nodes?.samplerNode?.triggerRelease(frequency, time);
    },

    dispose(nodes) {
        nodes?.samplerNode?.dispose();
    },

    // ... прочие методы-заглушки (connectPeers, enable, etc.) ...
    connectPeers(nodes, prev, next) { return true; },
    enable(nodes, isEnabled) { return true; }
};

if (typeof audioConfig !== 'undefined') {
    audioConfig.registerManager('sampler', samplerManager);
}
