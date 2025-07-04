const samplerManager = {
    // manager.create теперь async, так как обращается к bridge
    async create(initialSettings = {}) {
        const { instrument, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler instrument name not provided in preset." };
        }

        const assetPath = `audio/samples/${instrument}`;
        console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

        let fileList = [];
        try {
            // Ensure bridgeFix is available, otherwise log an error and return.
            if (typeof bridgeFix === 'undefined' || !bridgeFix.callBridge) {
                console.error("[SamplerManager] bridgeFix is not available. Cannot list assets.");
                return { nodes: null, error: "Bridge for listing assets is not available." };
            }
            const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
            if (fileListJson) {
                fileList = JSON.parse(fileListJson);
            } else {
                // callBridge might return null or undefined if the native method doesn't exist or fails before returning
                console.error(`[SamplerManager] Received null or undefined from getAssetList for ${instrument}.`);
                return { nodes: null, error: `Failed to list samples for ${instrument} (bridge communication error).` };
            }
        } catch (error) {
            console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
            return { nodes: null, error: `Failed to list samples for ${instrument}. Details: ${error.message}` };
        }

        if (!Array.isArray(fileList) || fileList.length === 0) {
            console.error(`[SamplerManager] No sample files found or invalid list for folder: ${assetPath}. Received:`, fileList);
            return { nodes: null, error: `No sample files found in folder: ${assetPath}` };
        }

        const urls = {};
        const noteRegex = /([A-Ga-g][#b]?)(\d+)\.(wav|mp3|ogg|m4a|aac)$/i; // Added more extensions, case-insensitive

        fileList.forEach(file => {
            const match = file.match(noteRegex);
            if (match) {
                let noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(); // e.g. C, F#, Db
                // Ensure sharp is '#' and flat is 'b'
                noteName = noteName.replace("S", "#").replace("s", "#");
                // Standardize note name, e.g., Db instead of c# for some conventions if necessary, though Tone.js handles scientific notation.
                // For simplicity, we'll use what's in the filename directly after capitalization.
                urls[noteName + match[2]] = file; // Example "C4", "F#5"
            }
        });

        if (Object.keys(urls).length === 0) {
             console.error(`[SamplerManager] No valid note files (e.g., C4.wav) found in ${assetPath} after parsing ${fileList.length} files.`);
             return { nodes: null, error: `No valid note files (e.g., C4.wav) found in ${assetPath}` };
        }

        console.log(`[SamplerManager] Generated URL map for Tone.Sampler:`, urls);

        // Возвращаем Promise, который разрешится, когда сэмплер будет загружен
        return new Promise((resolve) => {
            const samplerNode = new Tone.Sampler({
                urls: urls,
                baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                ...samplerParams, // Применяем остальные параметры из пресета (attack, release)
                onload: () => {
                    console.log(`[SamplerManager] Sampler for '${instrument}' loaded successfully.`);
                    resolve({
                        nodes: { samplerNode },
                        audioInput: null,
                        audioOutput: samplerNode,
                        modInputs: {},
                        modOutputs: {},
                        error: null
                    });
                },
                onerror: (err) => {
                    console.error(`[SamplerManager] Error loading Tone.Sampler for '${instrument}':`, err);
                    resolve({ nodes: null, error: `Tone.Sampler failed to load samples for '${instrument}'.` });
                }
            }).toDestination(); // Важно подключить к выходу
        });
    },

    // Методы update, dispose, triggerAttack, triggerRelease остаются как в вашем плане,
    // но убедимся, что они работают с `nodes.samplerNode`.

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
