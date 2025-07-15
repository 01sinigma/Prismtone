// [Файл]: app/src/main/assets/js/managers/samplerManager.js
// [Контекст -> Цель] Новый менеджер для полной инкапсуляции логики работы с семплерами (Tone.Sampler).
// [Связь -> Модульность] Реализует стандартный интерфейс, что позволяет synth.js и voiceBuilder.js
// работать с ним так же, как с oscillatorManager, ничего не зная о его внутренней реализации.

const samplerManager = {
    // [Контекст -> Производительность] Кэш для хранения уже загруженных экземпляров Tone.Sampler.
    // [Связь -> synth.js] Ключ - имя инструмента (папки), значение - Promise, который разрешается в Tone.Sampler.
    // Использование Promise позволяет избежать гонок при одновременном запросе одного и того же инструмента.
    _samplerCache: new Map(),

    /**
     * Асинхронно создает (или достает из кэша) и загружает экземпляр Tone.Sampler.
     * @param {object} initialSettings - Настройки из пресета, например { instrument: 'piano', attack: 0.01, release: 1.2, volume: -6 }
     * @returns {Promise<object>} Объект, соответствующий стандартному интерфейсу менеджера.
     */
    async create(initialSettings = {}) {
        const { instrument, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler 'instrument' name not provided in preset." };
        }

        // [Контекст -> Производительность] Проверяем кэш перед выполнением дорогостоящих операций.
        if (this._samplerCache.has(instrument)) {
            console.log(`[SamplerManager] Using cached Tone.Sampler for instrument: ${instrument}`);
            try {
                const cachedSampler = await this._samplerCache.get(instrument);
                // [Связь -> JSON] Применяем актуальные параметры из нового пресета к кэшированному семплеру.
                this.update({ samplerNode: cachedSampler }, samplerParams);
                return {
                    nodes: { samplerNode: cachedSampler },
                    audioInput: null,
                    audioOutput: cachedSampler,
                    error: null
                };
            } catch (error) {
                 console.error(`[SamplerManager] Cached sampler promise for '${instrument}' rejected. Removing from cache.`, error);
                 this._samplerCache.delete(instrument);
                 // Продолжаем выполнение, чтобы попытаться загрузить снова.
            }
        }
        
        // [Контекст -> Асинхронность] Создаем и сохраняем Promise в кэш СРАЗУ,
        // чтобы последующие вызовы для того же инструмента ждали этот же Promise.
        const loadingPromise = new Promise(async (resolve, reject) => {
            const assetPath = `audio/samples/${instrument}`;
            console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

            let fileList;
            try {
                // [Связь -> PrismtoneBridge] Запрашиваем список файлов семплов у нативной части.
                const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
                fileList = JSON.parse(fileListJson || "[]");
            } catch (error) {
                console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
                reject(new Error(`Failed to list samples for ${instrument}.`));
                return;
            }

            if (fileList.length === 0) {
                reject(new Error(`No sample files found in folder: ${assetPath}`));
                return;
            }

            // [Контекст -> Tone.Sampler] Формируем объект `urls` в формате, который ожидает Tone.Sampler.
            // Ключ - название ноты (C4, F#5), значение - имя файла.
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
                 reject(new Error(`No valid note files (e.g., C4.wav) found in ${assetPath}`));
                 return;
            }

            // [Связь -> Tone.js] Создаем и загружаем Tone.Sampler.
            try {
                const samplerNode = new Tone.Sampler({
                    urls: urls,
                    baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                    // [ИЗМЕНЕНО] Применяем все параметры, включая volume
                    ...samplerParams,
                    onload: () => {
                        console.log(`[SamplerManager] Sampler for '${instrument}' loaded successfully.`);
                        resolve(samplerNode);
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
            const loadedSamplerNode = await loadingPromise;
            return {
                nodes: { samplerNode: loadedSamplerNode },
                audioInput: null,
                audioOutput: loadedSamplerNode,
                error: null
            };
        } catch (error) {
            this._samplerCache.delete(instrument); // Удаляем неудавшийся Promise из кэша
            return { nodes: null, error: error.message };
        }
    },

    /**
     * Обновляет параметры существующего экземпляра Tone.Sampler.
     */
    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !newSettings) return false;
        try {
            // [ИЗМЕНЕНО] Используем .set() для обновления нескольких параметров, включая volume
            const updatableParams = {};
            if (newSettings.attack !== undefined) updatableParams.attack = newSettings.attack;
            if (newSettings.release !== undefined) updatableParams.release = newSettings.release;
            if (newSettings.curve !== undefined) updatableParams.curve = newSettings.curve;
            // Громкость является свойством .volume типа Signal, поэтому обновляем его .value
            if (newSettings.volume !== undefined) {
                 nodes.samplerNode.volume.value = newSettings.volume;
            }
            
            nodes.samplerNode.set(updatableParams);
            
            return true;
        } catch (e) {
            console.error("[SamplerManager] Error updating sampler:", e);
            return false;
        }
    },

    /**
     * Запускает проигрывание ноты.
     */
    triggerAttack(nodes, frequency, time, velocity) {
        // [Связь -> Tone.Sampler] Вызываем нативный метод triggerAttack.
        nodes?.samplerNode?.triggerAttack(frequency, time, velocity);
    },

    /**
     * Запускает затухание ноты.
     */
    triggerRelease(nodes, frequency, time) {
        // [Связь -> Tone.Sampler] Вызываем нативный метод triggerRelease для конкретной ноты.
        if (!nodes?.samplerNode || frequency === undefined) return;
        nodes.samplerNode.triggerRelease(frequency, time);
    },
    
    /**
     * Реализует плавное скольжение (legato), останавливая старую ноту и запуская новую.
     * @param {object} nodes - Узлы семплера.
     * @param {string|number} oldFrequency - Частота или имя ноты, которую нужно остановить.
     * @param {string|number} newFrequency - Частота или имя новой ноты для запуска.
     * @param {Tone.Time} time - Время для этого действия.
     * @param {number} velocity - Громкость (0-1).
     */
    setNote(nodes, oldFrequency, newFrequency, time, velocity) {
        // [Контекст -> Архитектура] Реализуем паттерн "Trigger-Release-Then-Attack".
        this.triggerRelease(nodes, oldFrequency, time);
        this.triggerAttack(nodes, newFrequency, time, velocity);
    },
    
    /**
     * Освобождает ресурсы голоса.
     * Важно! Мы не удаляем семплер из кэша, так как он может использоваться другими голосами.
     */
    dispose(nodes) {
        // Ничего не делаем с самим семплером (nodes.samplerNode), он кэширован.
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