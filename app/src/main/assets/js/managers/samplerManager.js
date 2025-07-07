// Файл: app/src/main/assets/js/managers/samplerManager.js

const samplerManager = {
    _samplerCache: new Map(), // Кэш для хранения загруженных экземпляров Tone.Sampler

    /**
     * Асинхронно создает и загружает экземпляр Tone.Sampler.
     * @param {object} initialSettings - Настройки из пресета, например { instrument: 'piano', attack: 0.01, release: 1.2 }
     * @returns {Promise<object>} Объект, соответствующий стандартному интерфейсу менеджера.
     */
    async create(initialSettings = {}) {
        const { instrument, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler 'instrument' name not provided in preset." };
        }

        // 1. Проверяем кэш
        if (this._samplerCache.has(instrument)) {
            console.log(`[SamplerManager] Using cached Tone.Sampler for instrument: ${instrument}`);
            const cachedSampler = this._samplerCache.get(instrument);
            // Важно обновить параметры attack/release для кэшированного семплера
            this.update({ samplerNode: cachedSampler }, samplerParams);
            return {
                nodes: { samplerNode: cachedSampler },
                audioInput: null,
                audioOutput: cachedSampler,
                modInputs: {}, // У семплера нет стандартных входов для модуляции
                modOutputs: {},
                error: null
            };
        }

        // 2. Если в кэше нет, загружаем семплы
        const assetPath = `audio/samples/${instrument}`;
        console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

        let fileList;
        try {
            const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
            fileList = JSON.parse(fileListJson || "[]");
        } catch (error) {
            console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
            return { nodes: null, error: `Failed to list samples for ${instrument}.` };
        }

        if (fileList.length === 0) {
            return { nodes: null, error: `No sample files found in folder: ${assetPath}` };
        }

        // 3. Формируем объект `urls` для Tone.Sampler
        // Ключ должен быть названием ноты (C4, F#5), значение - именем файла.
        const urls = {};
        // Регулярное выражение для извлечения ноты в научном формате (например, C#4, Ab3)
        const noteRegex = /([A-Ga-g][#b]?)(\d+)\./i;
        fileList.forEach(file => {
            const match = file.match(noteRegex);
            if (match) {
                // match[1] -> "C#", match[2] -> "4"
                const noteName = match[1].toUpperCase() + match[2];
                urls[noteName] = file;
            }
        });

        // Дебаг-лог, который показывает реальное содержимое объекта, а не "[object Object]"
        console.log(`[SamplerManager] URLs for Tone.Sampler for '${instrument}':`, urls);

        if (Object.keys(urls).length === 0) {
             return { nodes: null, error: `No valid note files (e.g., C4.wav) found in ${assetPath}` };
        }

        // 4. Создаем и загружаем Tone.Sampler
        return new Promise((resolve) => {
            try {
                const samplerNode = new Tone.Sampler({
                    urls: urls,
                    baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                    attack: samplerParams.attack,
                    release: samplerParams.release,
                    curve: samplerParams.curve,
                    onload: () => {
                        console.log(`[SamplerManager] Sampler for '${instrument}' loaded successfully.`);
                        this._samplerCache.set(instrument, samplerNode); // Кэшируем после успешной загрузки
                        resolve({
                            nodes: { samplerNode: samplerNode },
                            audioInput: null,
                            audioOutput: samplerNode,
                            modInputs: {},
                            modOutputs: {},
                            error: null
                        });
                    },
                    onerror: (err) => {
                        console.error(`[SamplerManager] Tone.Sampler failed to load samples for '${instrument}':`, err);
                        resolve({ nodes: null, error: `Tone.Sampler load error for '${instrument}'.` });
                    }
                });
            } catch (err) {
                console.error(`[SamplerManager] Error instantiating Tone.Sampler for '${instrument}':`, err);
                resolve({ nodes: null, error: `Tone.Sampler instantiation error: ${err.message}` });
            }
        });
    },

    /**
     * Обновляет параметры существующего экземпляра Tone.Sampler.
     */
    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !newSettings) return false;
        try {
            // Используем `set` для атомарного обновления параметров.
            // Tone.js достаточно умен, чтобы применить только то, что передано.
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

    /**
     * Запускает проигрывание ноты.
     * @param {object} nodes - Узлы.
     * @param {string|number} frequency - Частота или имя ноты (например, "C#4").
     * @param {Tone.Time} time - Время для запуска.
     * @param {number} velocity - Громкость (0-1).
     */
    triggerAttack(nodes, frequency, time, velocity) {
        nodes?.samplerNode?.triggerAttack(frequency, time, velocity);
    },

    /**
     * Запускает затухание ноты.
     * @param {object} nodes - Узлы.
     * @param {string|number} frequency - Частота или имя ноты.
     * @param {Tone.Time} time - Время для начала затухания.
     */
    triggerRelease(nodes, frequency, time) {
        nodes?.samplerNode?.triggerRelease(frequency, time);
    },

    /**
     * Реализует плавное скольжение (legato), останавливая старую ноту и запуская новую.
     */
    setNote(nodes, oldFrequency, newFrequency, time, velocity) {
        // Эта комбинация обеспечивает плавный переход, так как Tone.Sampler
        // может обрабатывать это без щелчков.
        nodes?.samplerNode?.triggerRelease(oldFrequency, time);
        nodes?.samplerNode?.triggerAttack(newFrequency, time, velocity);
    },

    /**
     * Освобождает ресурсы голоса.
     * Важно! Мы не удаляем семплер из кэша, так как он может использоваться другими голосами.
     */
    dispose(nodes) {
        // Ничего не делаем с самим семплером, он кэширован.
        // Очистка кэша - это отдельная, более глобальная задача.
    },

    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Источник звука, не имеет входа. Выход будет подключен в voiceBuilder.
        return true;
    },

    // Для совместимости с voiceBuilder, который может пытаться подключить модуляторы
    connectModulator(nodes, paramName, modulatorOutputNode) {
        console.warn(`[SamplerManager] Modulation of '${paramName}' is not supported for Sampler.`);
        return true; // Возвращаем true, чтобы не вызывать ошибку в voiceBuilder
    },

    enable(nodes, isEnabled) { return true; }
};

// Регистрация в audioConfig
if (typeof audioConfig !== 'undefined') {
    audioConfig.registerManager('sampler', samplerManager);
}