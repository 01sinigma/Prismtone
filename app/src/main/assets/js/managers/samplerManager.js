// Файл: app/src/main/assets/js/managers/samplerManager.js
// ВЕРСИЯ 2.0: Добавлена обработка triggerRelease и улучшен triggerAttack для корректного питч-шифтинга.

const samplerManager = {
    /**
     * Асинхронно создает и загружает экземпляр Tone.Sampler.
     * Автоматически определяет файлы сэмплов в указанной директории инструмента.
     * @param {object} [initialSettings={}] - Начальные настройки из пресета.
     * @returns {Promise<object>} Промис, который разрешается с объектом компонента или ошибкой.
     */
    async create(initialSettings = {}) {
        const { instrument, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler instrument name not provided in preset." };
        }

        const assetPath = `audio/samples/${instrument}`;
        console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

        let fileList = [];
        try {
            if (typeof bridgeFix === 'undefined' || !bridgeFix.callBridge) {
                throw new Error("BridgeFix is not available to list assets.");
            }
            const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
            fileList = JSON.parse(fileListJson);
        } catch (error) {
            console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
            return { nodes: null, error: `Failed to list samples for ${instrument}. Details: ${error.message}` };
        }

        if (!Array.isArray(fileList) || fileList.length === 0) {
            const errorMsg = `No sample files found in folder: ${assetPath}.`;
            console.error(`[SamplerManager] ${errorMsg} Received:`, fileList);
            return { nodes: null, error: errorMsg };
        }

        const urls = {};
        const noteRegex = /([A-Ga-g][#b]?)(\d+)\.(wav|mp3|ogg|m4a|aac)$/i;

        fileList.forEach(file => {
            const match = file.match(noteRegex);
            if (match) {
                const noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                urls[noteName + match[2]] = file;
            }
        });

        if (Object.keys(urls).length === 0) {
             const errorMsg = `No valid note files (e.g., C4.wav) found in ${assetPath}.`;
             console.error(`[SamplerManager] ${errorMsg}`);
             return { nodes: null, error: errorMsg };
        }

        console.log(`[SamplerManager] Generated URL map for Tone.Sampler:`, urls);

        return new Promise((resolve) => {
            const samplerNode = new Tone.Sampler({
                urls: urls,
                baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                // >>> ВАЖНО: Явно передаем параметры атаки и затухания из пресета <<<
                attack: samplerParams.attack,
                release: samplerParams.release,
                curve: samplerParams.curve,
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
                    const errorMsg = `Tone.Sampler failed to load samples for '${instrument}'.`;
                    console.error(`[SamplerManager] ${errorMsg}`, err);
                    resolve({ nodes: null, error: errorMsg });
                }
            });
            // НЕ подключаем к toDestination() здесь, voiceBuilder сделает это правильно.
            // .toDestination(); 
        });
    },

    /**
     * Обновляет параметры существующего сэмплера.
     * @param {object} nodes - Объект с узлом samplerNode.
     * @param {object} newSettings - Новые параметры (attack, release, curve).
     * @returns {boolean}
     */
    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !newSettings) return false;
        try {
            // Используем .set() для безопасного обновления нескольких параметров
            const paramsToUpdate = {};
            if (newSettings.attack !== undefined) paramsToUpdate.attack = newSettings.attack;
            if (newSettings.release !== undefined) paramsToUpdate.release = newSettings.release;
            if (newSettings.curve !== undefined) paramsToUpdate.curve = newSettings.curve;
            
            if (Object.keys(paramsToUpdate).length > 0) {
                nodes.samplerNode.set(paramsToUpdate);
            }
            return true;
        } catch (e) {
            console.error("[SamplerManager] Error updating sampler:", e);
            return false;
        }
    },

    /**
     * Запускает проигрывание ноты.
     * @param {object} nodes - Узлы компонента.
     * @param {string | number} noteOrFreq - Имя ноты (предпочтительно) или частота.
     * @param {Tone.Time} time - Время запуска.
     * @param {number} velocity - Громкость.
     */
    triggerAttack(nodes, noteOrFreq, time = Tone.now(), velocity = 1.0) {
        if (!nodes?.samplerNode) return;
        try {
            // Передача имени ноты (e.g., "C4") заставит Tone.js использовать pitch shifting, а не resampling.
            nodes.samplerNode.triggerAttack(noteOrFreq, time, velocity);
        } catch (e) {
            console.error("[SamplerManager] Error in triggerAttack:", e);
        }
    },

    /**
     * >>> НОВЫЙ МЕТОД <<<
     * Запускает фазу затухания для всех играющих нот сэмплера.
     * @param {object} nodes - Узлы компонента.
     * @param {Tone.Time} time - Время начала затухания.
     */
    triggerRelease(nodes, time = Tone.now()) {
        if (!nodes?.samplerNode) return;
        try {
            nodes.samplerNode.triggerRelease(time);
        } catch (e) {
            console.error("[SamplerManager] Error in triggerRelease:", e);
        }
    },

    dispose(nodes) {
        // Убедимся, что все звуки остановлены перед удалением
        if (nodes?.samplerNode) {
            nodes.samplerNode.releaseAll();
            nodes.samplerNode.dispose();
        }
    },

    connectPeers(nodes, prev, next) { 
        // Сэмплер - это источник звука, у него нет audioInput.
        // Его audioOutput будет подключен voiceBuilder'ом к следующему узлу.
        return true; 
    },
    
    enable(nodes, isEnabled) { return true; }
};

if (typeof audioConfig !== 'undefined') {
    audioConfig.registerManager('sampler', samplerManager);
}