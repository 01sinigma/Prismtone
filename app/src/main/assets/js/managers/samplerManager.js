// Файл: app/src/main/assets/js/managers/samplerManager.js
const samplerManager = {
    // [Контекст -> Кэширование] Кэш для хранения уже загруженных экземпляров Tone.Sampler.
    // Ключ - имя инструмента (папки). Это предотвратит повторную загрузку семплов при
    // переключении между пресетами, использующими один и тот же инструмент.
    _samplerCache: new Map(),

    /**
     * Асинхронно создает и загружает экземпляр Tone.Sampler.
     * @param {object} initialSettings - Настройки из пресета.
     * @param {string} initialSettings.instrument - Имя папки с семплами.
     * @returns {Promise<object>} Объект, соответствующий стандартному интерфейсу менеджера.
     */
    async create(initialSettings = {}) {
        const { instrument, ...samplerParams } = initialSettings;
        if (!instrument) {
            return { nodes: null, error: "Sampler 'instrument' name not provided in preset." };
        }

        if (this._samplerCache.has(instrument)) {
            console.log(`[SamplerManager] Using cached Tone.Sampler for instrument: ${instrument}`);
            const cachedSampler = this._samplerCache.get(instrument);
            // Обновляем параметры для кэшированного семплера, если они отличаются
            this.update({ samplerNode: cachedSampler }, samplerParams);
            return {
                nodes: { samplerNode: cachedSampler },
                audioInput: null,
                audioOutput: cachedSampler,
                // MODIFIED: Added standard modInputs for pitch. Prevents errors in voiceBuilder when attempting to connect pitch modulators.
                // Actual pitch modulation of a playing sample (like oscillator detune) is not standardly supported by Tone.Sampler this way.
                modInputs: { 'detune': null, 'frequency': null, 'pitch': null },
                modOutputs: {},
                error: null
            };
        }

        const assetPath = `audio/samples/${instrument}`;
        console.log(`[SamplerManager] Loading instrument: ${instrument} from path: ${assetPath}`);

        let fileList = [];
        try {
            // [Связь -> Native] Запрашиваем список файлов сэмплов у нативной части.
            const fileListJson = await bridgeFix.callBridge('getAssetList', assetPath);
            if (fileListJson) {
                fileList = JSON.parse(fileListJson);
            } else {
                throw new Error("Bridge returned null or undefined asset list.");
            }
        } catch (error) {
            console.error(`[SamplerManager] Error getting asset list for ${instrument}:`, error);
            return { nodes: null, error: `Failed to list samples for ${instrument}. Details: ${error.message}` };
        }

        if (!fileList || fileList.length === 0) {
            return { nodes: null, error: `No sample files found in folder: ${assetPath}` };
        }

        // [Логика -> Tone.js] Преобразуем список файлов в формат, понятный Tone.Sampler.
        // Имя файла (без расширения) должно быть названием ноты, например "C4.wav" -> "C4".
        const urls = {};
        const noteRegex = /([A-Ga-g][#b]?)(\d+)\./i;
        fileList.forEach(file => {
            const match = file.match(noteRegex);
            if (match) {
                const noteName = match[1].toUpperCase() + match[2];
                urls[noteName] = file;
            }
        });
        // console.log for debugging urls
        console.log(`[SamplerManager] URLs for Tone.Sampler: ${JSON.stringify(urls)}`);

        if (Object.keys(urls).length === 0) {
             return { nodes: null, error: `No valid note files (e.g., C4.wav) found in ${assetPath}` };
        }

        return new Promise((resolve) => {
            try {
                const samplerNode = new Tone.Sampler({
                    urls: urls,
                    baseUrl: `https://appassets.androidplatform.net/assets/${assetPath}/`,
                    ...samplerParams, // Применяем остальные параметры (attack, release, curve)
                    onload: () => {
                        console.log(`[SamplerManager] Sampler for '${instrument}' loaded successfully.`);
                        this._samplerCache.set(instrument, samplerNode); // Кэшируем успешный результат
                        resolve({
                            nodes: { samplerNode: samplerNode },
                            audioInput: null,
                            audioOutput: samplerNode,
                            // MODIFIED: Added standard modInputs for pitch. Prevents errors in voiceBuilder when attempting to connect pitch modulators.
                            // Actual pitch modulation of a playing sample (like oscillator detune) is not standardly supported by Tone.Sampler this way.
                            modInputs: { 'detune': null, 'frequency': null, 'pitch': null },
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
                console.error(`[SamplerManager] Error instantiating Tone.Sampler:`, err);
                resolve({ nodes: null, error: `Tone.Sampler instantiation error: ${err.message}` });
            }
        });
    },

    /**
     * Обновляет параметры существующего экземпляра Tone.Sampler.
     * @param {object} nodes - Объект узлов, содержащий `samplerNode`.
     * @param {object} newSettings - Новые настройки (attack, release, curve).
     * @returns {boolean} true в случае успеха.
     */
    update(nodes, newSettings) {
        if (!nodes?.samplerNode || !newSettings) return false;
        try {
            // [Связь -> Tone.js] Используем set для одновременного обновления параметров.
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
     * Триггерит атаку ноты на семплере.
     * @param {object} nodes - Узлы.
     * @param {string|number} frequency - Частота или имя ноты.
     * @param {Tone.Time} time - Время для запуска.
     * @param {number} velocity - Громкость (0-1).
     */
    triggerAttack(nodes, frequency, time, velocity) {
        nodes?.samplerNode?.triggerAttack(frequency, time, velocity);
    },

    /**
     * Триггерит затухание ноты.
     * @param {object} nodes - Узлы.
     * @param {string|number} frequency - Частота или имя ноты.
     * @param {Tone.Time} time - Время для затухания.
     */
    triggerRelease(nodes, frequency, time) {
        nodes?.samplerNode?.triggerRelease(frequency, time);
    },

    /**
     * Реализует плавное скольжение (legato).
     * @param {object} nodes - Узлы.
     * @param {string|number} oldFrequency - Старая нота для остановки.
     * @param {string|number} newFrequency - Новая нота для запуска.
     * @param {Tone.Time} time - Время.
     * @param {number} velocity - Громкость.
     */
    setNote(nodes, oldFrequency, newFrequency, time, velocity) {
        // [Логика -> Legato] Сначала останавливаем старую ноту, затем сразу запускаем новую.
        // Tone.Sampler автоматически сделает это без щелчка.
        nodes?.samplerNode?.triggerRelease(oldFrequency, time);
        nodes?.samplerNode?.triggerAttack(newFrequency, time, velocity);
    },

    dispose(nodes) {
        // Важно! Не удаляем из кэша. dispose вызывается для голоса,
        // но сам инструмент может использоваться другими голосами.
        // Очистка кэша должна происходить при смене пресета, если это необходимо.
        // В данной реализации мы кэшируем навсегда.
    },

    connectPeers(nodes, prevOutputNode, nextInputNode) {
        // Семплер - источник звука, у него нет audioInput.
        // Его audioOutput будет подключен дальше в voiceBuilder.
        return true;
    },

    /**
     * Handles connection of modulators. For samplers, pitch modulation is logged as not supported.
     * @param {object} nodes - The sampler's nodes.
     * @param {string} paramName - The target parameter name on the sampler (e.g., 'detune', 'pitch').
     * @param {Tone.AudioNode} modulatorOutputNode - The output node of the modulator.
     * @returns {boolean} True if handled (even if not supported), false otherwise.
     */
    connectModulator(nodes, paramName, modulatorOutputNode) {
        const supportedPitchParams = ['detune', 'frequency', 'pitch'];
        if (supportedPitchParams.includes(paramName)) {
            // Pitch modulation of a playing sample (like oscillator detune via LFO or PitchEnvelope)
            // is not standardly supported by Tone.Sampler by connecting to a 'detune' or 'pitch' param.
            // Tone.Sampler changes pitch by re-triggering with a different note.
            console.warn(`[SamplerManager] Modulation of '${paramName}' for sampler is not supported in a way that affects playing notes. Pitch envelope or LFO targeting pitch will be connected but likely have no audible real-time effect on existing notes.`);
            return true; // Return true to indicate the connection attempt is "handled" (i.e., acknowledged and intentionally not actioned for real-time pitch change),
                         // preventing voiceBuilder from logging an error for an unhandled modulator connection.
        }
        // For any other future parameters that might become modulatable on the sampler,
        // this default indicates they are not handled by this manager.
        // console.log(`[SamplerManager] connectModulator called for param '${paramName}', not a pitch-related param or not supported for sampler.`);
        return false;
    },

    enable(nodes, isEnabled) { return true; }
};

// Регистрация в audioConfig
if (typeof audioConfig !== 'undefined') {
    audioConfig.registerManager('sampler', samplerManager);
}
