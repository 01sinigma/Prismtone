// Файл: app/src/main/assets/js/soundpresets.js
// Manages the Sound Library Panel UI (Preset Grid ONLY)
const soundPresets = {
    panelElement: null,
    presetGridElement: null,
    currentPresetId: null,
    userPresetPrefix: 'user_',

    init() {
        console.log('[SoundPresets v3] Initializing (Grid + Colors Mode)...'); // Версия лога
        this.panelElement = document.getElementById('sound-library-panel');
        if (!this.panelElement) {
            console.error("[SoundPresets v3] Panel element (#sound-library-panel) not found!");
            return;
        }

        this.presetGridElement = document.getElementById('preset-grid');
        if (!this.presetGridElement) {
            console.error("[SoundPresets v3] Preset grid element (#preset-grid) not found!");
            return;
        }

        this.addEventListeners();
        this.populatePresetGrid(); // Заполняем сетку при инициализации

        console.log('[SoundPresets v3] Initialized successfully (Grid + Colors Mode).');
    },

    addEventListeners() { // Без изменений по сравнению с v2
        console.log('[SoundPresets v3] Adding event listeners (Grid Mode)...');
        if (this.presetGridElement) {
            this.presetGridElement.addEventListener('click', (e) => {
                const cube = e.target.closest('.preset-cube');
                if (cube && cube.dataset.presetId) {
                    const presetId = cube.dataset.presetId;
                    this.handlePresetSelection(presetId);
                }
            });
        } else {
            console.warn("[SoundPresets v3] Preset grid element not found for listener.");
        }
        console.log('[SoundPresets v3] Event listeners added (Grid Mode).');
    },

    handlePresetSelection(presetId) { // Без изменений по сравнению с v2
        if (presetId && presetId !== this.currentPresetId) {
            console.log(`[SoundPresets v3] Preset selected: ${presetId}`);
            app.applySoundPreset(presetId); // app вызовет updateActivePresetCube
        } else if (!presetId) {
            console.warn("[SoundPresets v3] Invalid presetId received from click event.");
        } else {
            // console.log(`[SoundPresets v3] Preset ${presetId} already active.`); // Менее подробный лог
        }
    },

    async populatePresetGrid() { // <-- ОБНОВЛЕНО: Добавлено применение цветов
        console.log('[SoundPresets v3] Populating preset grid...');
        if (!this.presetGridElement) {
            console.error('[SoundPresets v3] Preset grid element is null!');
            return;
        }
        this.presetGridElement.innerHTML = ''; // Очищаем сетку

        try {
            const presets = await moduleManager.getModules('soundpreset', true);

            if (!presets || presets.length === 0) {
                console.warn('[SoundPresets v3] No sound presets found.');
                this.presetGridElement.innerHTML = `<div class="preset-cube disabled">${i18n.translate('no_presets_found', 'No presets found.')}</div>`;
                return;
            }

            console.log(`[SoundPresets v3] Found ${presets.length} presets.`);
            presets.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

            presets.forEach(preset => {
                const cube = document.createElement('div');
                cube.className = 'preset-cube';
                cube.dataset.presetId = preset.id;
                cube.textContent = preset.name || preset.id;
                cube.title = preset.name || preset.id;

                // --- НОВОЕ: Применение цветов ---
                const presetColors = preset.data?.data?.colors; // Получаем объект colors
                if (presetColors && typeof presetColors === 'object') {
                    // Пример: Устанавливаем основной цвет фона
                    if (presetColors.primary) {
                        cube.style.backgroundColor = presetColors.primary;
                    }
                    // Пример: Устанавливаем цвет текста
                    if (presetColors.text) {
                        cube.style.color = presetColors.text;
                    }
                    // Пример: Устанавливаем цвет границы (если нужно)
                    if (presetColors.secondary) {
                        cube.style.borderColor = presetColors.secondary;
                    }
                    // Альтернатива: Использовать CSS переменные для большей гибкости
                    // if (presetColors.primary) cube.style.setProperty('--preset-bg-color', presetColors.primary);
                    // if (presetColors.text) cube.style.setProperty('--preset-text-color', presetColors.text);
                } else {
                    // Используем дефолтные стили из CSS, если цвета не заданы
                    // console.warn(`[SoundPresets v3] No colors found for preset: ${preset.id}`);
                }
                // --- КОНЕЦ НОВОГО ---

                this.presetGridElement.appendChild(cube);
            });

            this.updateActivePresetCube(app.state.soundPreset);

        } catch (error) {
            console.error('[SoundPresets v3] Error populating preset grid:', error, error.stack);
            this.presetGridElement.innerHTML = `<div class="preset-cube disabled">${i18n.translate('error_loading_presets', 'Error loading presets.')}</div>`;
        }
    },

    updateActivePresetCube(presetId) { // Без изменений по сравнению с v2
        this.currentPresetId = presetId;
        // console.log(`[SoundPresets v3] Updating active preset cube UI to: ${presetId}`); // Менее подробный лог
        if (!this.presetGridElement) return;

        const cubes = this.presetGridElement.querySelectorAll('.preset-cube');
        let found = false;
        cubes.forEach(cube => {
            const isActive = cube.dataset.presetId === presetId;
            cube.classList.toggle('active', isActive);
            if (cube.textContent.endsWith('*')) { // Убираем звездочку модификации (если была)
                 cube.textContent = cube.textContent.slice(0, -1);
            }
            if (isActive) found = true;
        });

        if (!found && presetId && cubes.length > 0) {
            console.warn(`[SoundPresets v3] Preset ID "${presetId}" not found in grid.`);
        }
    },

}; // Конец объекта soundPresets