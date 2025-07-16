// [Файл]: app/src/main/assets/js/managers/samplerManager.js
// [Контекст -> Цель] Новый менеджер для полной инкапсуляции логики работы с семплерами (Tone.Sampler).
// [ИЗМЕНЕНО] Теперь менеджер создает стандартный узел громкости (outputGain) для каждого семплера,
// чтобы унифицировать его аудио-цепочку с другими типами звуков (например, осцилляторами).

const samplerManager = {
    // [Контекст -> Производительность] Кэш для хранения уже загруженных и готовых к использованию узлов.
    // [Связь -> synth.js] Ключ - имя инструмента (папки), значение - Promise, который разрешается в объект с узлами.
    _samplerCache: new Map(),

    /**
     * Асинхронно создает (или достает из кэша) и загружает экземпляр Tone.Sampler,
     * а также создает для него выделенный узел громкости (outputGain).
     * @param {object} initialSettings - Настройки из пресета, например { instrument: 'piano', attack: 0.01, release: 1.2, volume: -6 }
     * @returns {Promise<object>} Объект, соответствующий стандартному интерфейсу менеджера.
     */
    async create(initialSettings = {}) {
        // [ИЗМЕНЕНО] Извлекаем 'volume' для отдельной обработки, остальное идет в семплер.
        const { instrument, volume, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler 'instrument' name not provided in preset." };
        }

        if (this._samplerCache.has(instrument)) {
            console.log(`[SamplerManager] Using cached nodes for instrument: ${instrument}`);
            try {
                // Promise в кэше уже содержит готовый объект { samplerNode, outputGain }
                const cachedNodes = await this._samplerCache.get(instrument);
                // [ИЗМЕНЕНО] Применяем АКТУАЛЬНЫЕ параметры к кэшированным узлам.
                this.update(cachedNodes, { volume, ...samplerParams });
                return {
                    nodes: cachedNodes,
                    audioInput: null, // Семплер не имеет аудио входа
                    audioOutput: cachedNodes.outputGain, // Выход теперь - наш узел громкости
                    error: null
                };
            } catch (error) {
                 console.error(`[SamplerManager] Cached sampler promise for '${instrument}' rejected. Removing from cache.`, error);
                 this._samplerCache.delete(instrument);
                 // Продолжаем, чтобы попытаться загрузить снова.
            }
        }
        
        const loadingPromise = new Promise(async (resolve, reject) => {
            const assetPath = `audio/samples/${instrument}`;
            console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

            let fileList;
            try {
                const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
                fileList = JSON.parse(fileListJson || "[]");
            } catch (error) {
                console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
                return reject(new Error(`Failed to list samples for ${instrument}.`));
            }

            if (fileList.length === 0) {
                return reject(new Error(`No sample files found in folder: ${assetPath}`));
            }

            const urls = {};
            const noteRegex = /([A-Ga-g][#b]?)(\d+)\./i;
            fileList.forEach(file => {
                const match = file.match(noteRegex);
                if (match) {
                    const noteName = match[1].charAt(0).toUpperCase() + match[1].slice(1) + match[2];
                    urls[noteName] = file;
                }
            });

            if (Object.keys(urls).length === 0) {
                 return reject(new Error(`No valid note files (e.g., C4.wav) found in ${assetPath}`));
            }

            try {
                // [ИЗМЕНЕНО] Создаем два узла: семплер и его выходную громкость.
                const outputGain = new Tone.Volume(volume ?? 0); // Используем громкость из пресета, или 0dB по умолчанию.
                
                const samplerNode = new Tone.Sampler({
                    urls: urls,
                    baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                    ...samplerParams, // attack, release, curve и т.д.
                    // ВАЖНО: параметр 'volume' НЕ передается в new Tone.Sampler.
                    // Его собственная громкость остается 0dB (максимум).
                    onload: () => {
                        console.log(`[SamplerManager] Sampler for '${instrument}' loaded successfully.`);
                        samplerNode.connect(outputGain); // Соединяем семплер с нашим узлом громкости
                        resolve({ samplerNode, outputGain }); // Разрешаем Promise объектом с двумя узлами
                    },
                    onerror: (err) => {
                        console.error(`[SamplerManager] Tone.Sampler failed to load samples for '${instrument}':`, err);
                        reject(new Error(`Tone.Sampler load error for '${instrument}'.`));
                    }
                });
            } catch (err) {
                console.error(`[SamplerManager] Error instantiating Tone.Sampler for '${instrument}':`, err);
                reject(new Error(`Tone.Sampler instantiation error: ${err.message}`));
            }
        });

        this._samplerCache.set(instrument, loadingPromise);

        try {
            const loadedNodes = await loadingPromise; // loadedNodes будет { samplerNode, outputGain }
            return {
                nodes: loadedNodes,
                audioInput: null, // Семплер - источник, входа нет
                audioOutput: loadedNodes.outputGain, // Главный выход - наш узел громкости
                error: null
            };
        } catch (error) {
            this._samplerCache.delete(instrument);
            return { nodes: null, error: error.message };
        }
    },

    /**
     * Обновляет параметры семплера и его узла громкости.
     */
    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !nodes?.outputGain || !newSettings) return false;
        try {
            // [ИЗМЕНЕНО] Обновляем параметры самого семплера (огибающая и т.д.)
            const samplerUpdatableParams = {};
            if (newSettings.attack !== undefined) samplerUpdatableParams.attack = newSettings.attack;
            if (newSettings.release !== undefined) samplerUpdatableParams.release = newSettings.release;
            if (newSettings.curve !== undefined) samplerUpdatableParams.curve = newSettings.curve;
            nodes.samplerNode.set(samplerUpdatableParams);

            // [ИЗМЕНЕНО] Отдельно обновляем громкость на нашем узле outputGain.
            if (newSettings.volume !== undefined) {
                 nodes.outputGain.volume.value = newSettings.volume;
            }
            
            return true;
        } catch (e) {
            console.error("[SamplerManager] Error updating sampler nodes:", e);
            return false;
        }
    },
    
    // Методы для управления проигрыванием нот остаются без изменений,
    // так как они по-прежнему должны работать напрямую с `samplerNode`.

    /**
     * Запускает проигрывание ноты.
     */
    triggerAttack(nodes, frequency, time, velocity) {
        nodes?.samplerNode?.triggerAttack(frequency, time, velocity);
    },

    /**
     * Запускает затухание ноты.
     */
    triggerRelease(nodes, frequency, time) {
        if (!nodes?.samplerNode || frequency === undefined) return;
        nodes.samplerNode.triggerRelease(frequency, time);
    },
    
    /**
     * Реализует плавное скольжение (legato), останавливая старую ноту и запуская новую.
     */
    setNote(nodes, oldFrequency, newFrequency, time, velocity) {
        this.triggerRelease(nodes, oldFrequency, time);
        this.triggerAttack(nodes, newFrequency, time, velocity);
    },
    
    /**
     * Освобождает ресурсы голоса.
     * Важно! Мы не удаляем семплер из кэша, так как он может использоваться другими голосами.
     */
    dispose(nodes) {
        // Ничего не делаем с самими узлами (samplerNode, outputGain), они кэшированы.
        // Очистка кэша - это отдельная, более глобальная задача (например, при нехватке памяти).
    },

    // Методы-заглушки для соответствия интерфейсу менеджера
    connectPeers: (nodes, prev, next) => true,
    enable: (nodes, isEnabled) => true,
    connectModulator: (nodes, paramName, modNode) => true
};

// Регистрация в audioConfig
if (typeof audioConfig !== 'undefined') {
    audioConfig.registerManager('sampler', samplerManager);
}