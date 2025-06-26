const drumPadManager = {
    players: null,
    isLoaded: false,

    async init(kitName = '808_kit') {
        const assetPath = `audio/samples/${kitName}`;
        let fileList = [];

        try {
            // 1. Получаем список сэмплов через Bridge (как в samplerManager)
            console.log(`[DrumPadManager] Attempting to get asset list for path: ${assetPath}`);
            const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
            if (fileListJson) {
                fileList = JSON.parse(fileListJson);
                console.log(`[DrumPadManager] Received file list from bridge:`, fileList);
            } else {
                console.warn(`[DrumPadManager] bridgeFix.callBridge('getAssetList') returned null or undefined for ${assetPath}.`);
                fileList = []; // Ensure fileList is an array
            }
        } catch (error) {
            console.error(`[DrumPadManager] Error calling bridgeFix.callBridge('getAssetList') for ${assetPath}:`, error);
            fileList = []; // Ensure fileList is an array on error
        }

        if (!Array.isArray(fileList) || fileList.length === 0) {
            console.warn(`[DrumPadManager] Failed to get asset list from bridge or list is empty for '${kitName}'. Using fallback list.`);
            // TODO: This is a workaround. 'getAssetList' bridge function needs to be implemented and reliable.
            fileList = ['kick.wav', 'snare.wav', 'hihat_closed.wav', 'hihat_open.wav', 'clap.wav', 'tom1.wav'];
        }

        const urls = {};
        fileList.forEach(file => {
            // Ensure file is a string and has an extension
            if (typeof file === 'string' && file.includes('.')) {
                const soundName = file.substring(0, file.lastIndexOf('.'));
                urls[soundName] = file;
            } else {
                console.warn(`[DrumPadManager] Invalid file name in list: ${file}`);
            }
        });

        if (Object.keys(urls).length === 0) {
            console.error(`[DrumPadManager] No valid sound URLs could be constructed for kit '${kitName}'. Cannot load Tone.Players.`);
            this.isLoaded = false;
            return Promise.resolve(false); // Or reject, depending on desired error handling
        }

        console.log(`[DrumPadManager] Loading kit '${kitName}' with sounds:`, Object.keys(urls));

        return new Promise((resolve) => {
            this.players = new Tone.Players({
                urls,
                baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                onload: () => {
                    this.isLoaded = true;
                    console.log(`[DrumPadManager] Kit '${kitName}' loaded.`);
                    resolve(true);
                },
                onerror: (err) => {
                    console.error(`[DrumPadManager] Error loading kit:`, err);
                    resolve(false);
                }
            }).toDestination(); // Сразу подключаем к выходу
        });
    },

    triggerSound(soundName) {
        if (!this.isLoaded || !this.players.has(soundName)) {
            console.warn(`[DrumPadManager] Sound '${soundName}' not loaded or not found.`);
            return;
        }
        this.players.player(soundName).start();
    },

    dispose() {
        this.players?.dispose();
        this.isLoaded = false;
        console.log("[DrumPadManager] Disposed players.");
    }
};
