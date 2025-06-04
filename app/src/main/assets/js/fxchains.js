// Файл: app/src/main/assets/js/fxchains.js
const fxChains = {
    panelElement: null,
    chainSelectElement: null,
    resetButton: null,
    macroControlsContainer: null,
    currentChainId: null,
    userChainPrefix: 'user_',
    macroKnobs: {},

    // === ОБНОВЛЕННАЯ СТРУКТУРА для Части 2 ===
    yAxisControlsElements: {
        volume_minOutputKnob: null,
        volume_maxOutputKnob: null,
        volume_yThresholdKnob: null,
        volume_curveTypeSelect: null,
        volume_curveFactorKnob: null,

        effects_minOutputKnob: null,
        effects_maxOutputKnob: null,
        effects_yThresholdKnob: null,
        effects_curveTypeSelect: null,
        effects_curveFactorKnob: null,
    },
    // =========================================
    masterVolumeCeilingKnob: null,

    init() {
        console.log('[FxChains v5 - YAxisFlex] Initializing...');
        this.panelElement = document.getElementById('effects-panel');
        if (!this.panelElement) { console.error("[FxChains v5] Effects panel element not found!"); return; }

        this.chainSelectElement = document.getElementById('fx-chain-select');
        this.resetButton = document.getElementById('reset-fx-button');
        this.macroControlsContainer = document.getElementById('macro-controls');

        const yAxisContainer = this.panelElement.querySelector('.y-axis-controls');
        if (yAxisContainer) {
            console.log("[FxChains v5] Initializing Y-Axis controls...");
            // === ИНИЦИАЛИЗАЦИЯ НОВЫХ ЭЛЕМЕНТОВ Y-Axis ===
            this.yAxisControlsElements.volume_minOutputKnob = yAxisContainer.querySelector('.knob[data-param="volume_minOutput"]');
            this.yAxisControlsElements.volume_maxOutputKnob = yAxisContainer.querySelector('.knob[data-param="volume_maxOutput"]');
            this.yAxisControlsElements.volume_yThresholdKnob = yAxisContainer.querySelector('.knob[data-param="volume_yThreshold"]');
            this.yAxisControlsElements.volume_curveTypeSelect = document.getElementById('volume_curveType-select');
            this.yAxisControlsElements.volume_curveFactorKnob = yAxisContainer.querySelector('.knob[data-param="volume_curveFactor"]');

            this.yAxisControlsElements.effects_minOutputKnob = yAxisContainer.querySelector('.knob[data-param="effects_minOutput"]');
            this.yAxisControlsElements.effects_maxOutputKnob = yAxisContainer.querySelector('.knob[data-param="effects_maxOutput"]');
            this.yAxisControlsElements.effects_yThresholdKnob = yAxisContainer.querySelector('.knob[data-param="effects_yThreshold"]');
            this.yAxisControlsElements.effects_curveTypeSelect = document.getElementById('effects_curveType-select');
            this.yAxisControlsElements.effects_curveFactorKnob = yAxisContainer.querySelector('.knob[data-param="effects_curveFactor"]');
            // ===========================================

            for (const key in this.yAxisControlsElements) {
                const element = this.yAxisControlsElements[key];
                if (element && element.classList?.contains('knob')) {
                    sidePanel.initKnob(element);
                } else if (!element && key.endsWith('Knob')) {
                     console.error(`[FxChains v5] Y-Axis knob element not found for: ${key}`);
                } else if (!element && key.endsWith('Select')) {
                     console.error(`[FxChains v5] Y-Axis select element not found for: ${key}`);
                }
            }
        } else {
            console.error("[FxChains v5] Could not find .y-axis-controls container!");
        }

        this.macroKnobs = {};
        const macroUIMap = { 'macro1': 'Space', 'macro2': 'Time', 'macro3': 'Motion', 'macro4': 'Tone', 'macro5': 'Drive' };
        if (this.macroControlsContainer) {
            this.macroControlsContainer.querySelectorAll('.knob').forEach(knob => {
                const dataParam = knob.dataset.param;
                const macroKeyName = macroUIMap[dataParam];
                if (macroKeyName) {
                    this.macroKnobs[macroKeyName] = knob;
                    sidePanel.initKnob(knob);
                } else {
                    console.warn(`[FxChains Init] No UI mapping found for knob with data-param: ${dataParam}`);
                }
            });
        }

        const masterOutputContainer = this.panelElement.querySelector('.master-output-controls');
        if (masterOutputContainer) {
            this.masterVolumeCeilingKnob = masterOutputContainer.querySelector('.knob[data-param="masterVolumeCeiling"]');
            if (this.masterVolumeCeilingKnob) {
                sidePanel.initKnob(this.masterVolumeCeilingKnob);
            } else {
                console.error("[FxChains v5] Master Volume Ceiling knob element not found!");
            }
        } else {
            console.error("[FxChains v5] Master Output controls container not found!");
        }

        this.addEventListeners();
        this.populateFxChainList();

        console.log('[FxChains v5] Initialized successfully.');
    },

    addEventListeners() {
        console.log('[FxChains v5] Adding event listeners...');

        if (this.chainSelectElement) {
            this.chainSelectElement.addEventListener('change', async (e) => {
                const chainId = e.target.value;
                await app.applyFxChain(chainId || null); // applyFxChain обновит yAxisControls и вызовет updateYAxisControlsUI
                const chainModule = chainId ? await moduleManager.getModule(chainId) : null;
                this.updateMacroKnobsFromChain(chainModule?.data?.data);
                // this.updateYAxisControlsUI(app.state.yAxisControls); // Уже вызывается в applyFxChain
            });
        }

        if (this.resetButton) {
            this.resetButton.addEventListener('click', async () => {
                await app.applyFxChain(null); // Это сбросит yAxisControls в app.state к дефолтам
                this.updateMacroKnobsFromChain(null);
                // this.updateYAxisControlsUI(app.state.yAxisControls); // Уже вызывается в applyFxChain
            });
        }

        // === ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ Y-Axis ===
        for (const key in this.yAxisControlsElements) {
             const element = this.yAxisControlsElements[key];
             if (element) {
                 const parts = key.split('_'); // e.g., "volume_minOutputKnob" -> ["volume", "minOutputKnob"]
                 const group = parts[0]; // "volume" or "effects"
                 let paramName = parts[1];
                 if (paramName.endsWith('Knob')) paramName = paramName.slice(0, -4);
                 else if (paramName.endsWith('Select')) paramName = paramName.slice(0, -6);

                 if (!paramName) {
                     console.warn("[FxChains v5] Could not determine param name for Y-Axis element:", key);
                     continue;
                 }

                 // === ДЕБАУНС ДЛЯ knob-change ===
                 if (element.classList?.contains('knob')) {
                     let debounceTimer = null;
                     let lastValue = undefined;
                     element.addEventListener('knob-change', (e) => {
                         const value = e.detail.value;
                         if (value === lastValue) return;
                         lastValue = value;
                         if (debounceTimer) clearTimeout(debounceTimer);
                         debounceTimer = setTimeout(() => {
                             app.setYAxisControl(group, paramName, value);
                             debounceTimer = null;
                         }, 40);
                     });
                 } else if (element.tagName === 'SELECT') {
                     element.addEventListener('change', (e) => {
                         app.setYAxisControl(group, paramName, e.target.value);
                     });
                 }
             }
        }
        // =====================================

        for (const uiMacroName in this.macroKnobs) {
            const knob = this.macroKnobs[uiMacroName];
            knob.addEventListener('knob-change', (e) => {
                this.handleMacroKnobChange(uiMacroName, e.detail.value);
            });
        }

        if (this.masterVolumeCeilingKnob) {
            this.masterVolumeCeilingKnob.addEventListener('knob-change', (e) => {
                if (app && typeof app.setMasterVolumeCeiling === 'function') {
                    app.setMasterVolumeCeiling(e.detail.value);
                }
            });
        }
        console.log('[FxChains v5] Event listeners added.');
    },

    handleMacroKnobChange(macroKeyInUI, value) {
        if (typeof synth !== 'undefined' && typeof synth.setMacro === 'function') {
            console.log(`[FxChains UpdateKnobs] Applying macro '${macroKeyInUI}' value ${value} after knob change.`);
            synth.setMacro(macroKeyInUI, value);
        }
    },

    updateMacroKnobsFromChain(fxChainData) {
        const macroDefaults = fxChainData?.macroDefaults || {};
        console.log(`[FxChains updateMacroKnobs] Received fxChainData.macroDefaults:`, JSON.parse(JSON.stringify(macroDefaults)));
        for (const uiMacroName in this.macroKnobs) {
            const knob = this.macroKnobs[uiMacroName];
            const defaultValue = macroDefaults.hasOwnProperty(uiMacroName) ? macroDefaults[uiMacroName] : 0.5;
            console.log(`[FxChains updateMacroKnobs] For UI Macro '${uiMacroName}', default value: ${defaultValue}`);
            sidePanel.setKnobValue(knob, defaultValue, false);
            if (typeof synth !== 'undefined' && typeof synth.setMacro === 'function') {
                console.log(`[FxChains updateMacroKnobs] Applying default for '${uiMacroName}' (${defaultValue}) to synth.`);
                synth.setMacro(uiMacroName, defaultValue);
            }
        }
    },

    async populateFxChainList() {
        // ... (без изменений)
        if (!this.chainSelectElement) return;
        this.chainSelectElement.innerHTML = '';
        this.addOptionToSelect(this.chainSelectElement, '', i18n.translate('none_fxchain', '-- None --'));
        try {
            const chains = await moduleManager.getModules('fxchain', true);
            if (!chains || chains.length === 0) return;
            chains.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
            chains.forEach(chain => {
                this.addOptionToSelect(this.chainSelectElement, chain.id, chain.name || chain.id);
            });
            this.updateActiveChain(app.state.fxChain);
        } catch (error) {
            this.addOptionToSelect(this.chainSelectElement, '', i18n.translate('error_loading_fxchains', 'Error loading chains'), true);
        }
    },

    addOptionToSelect(selectElement, value, text, disabled = false) {
        // ... (без изменений)
        if (!selectElement) return;
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.disabled = disabled;
        selectElement.appendChild(option);
    },

    updateActiveChain(chainId) {
        // ... (без изменений)
        this.currentChainId = chainId;
        if (this.chainSelectElement) {
            this.chainSelectElement.value = chainId ?? '';
            if (this.chainSelectElement.value !== (chainId ?? '')) {
                 this.chainSelectElement.value = '';
                 this.currentChainId = null;
            }
        }
    },

    // === ОБНОВЛЕНА ФУНКЦИЯ для новой структуры yAxisControls ===
    updateYAxisControlsUI(yAxisSettings) {
        if (!yAxisSettings || !yAxisSettings.volume || !yAxisSettings.effects) {
            console.warn("[FxChains v5] Cannot update Y-Axis UI, invalid settings provided:", yAxisSettings);
            return;
        }
        console.log('[FxChains.updateYAxisControlsUI] Updating UI with settings:', JSON.parse(JSON.stringify(yAxisSettings)));

        const vol = yAxisSettings.volume;
        const fx = yAxisSettings.effects;

        // Volume Group
        if (this.yAxisControlsElements.volume_minOutputKnob) sidePanel.setKnobValue(this.yAxisControlsElements.volume_minOutputKnob, vol.minOutput ?? 0.0, false);
        if (this.yAxisControlsElements.volume_maxOutputKnob) sidePanel.setKnobValue(this.yAxisControlsElements.volume_maxOutputKnob, vol.maxOutput ?? 1.0, false);
        if (this.yAxisControlsElements.volume_yThresholdKnob) sidePanel.setKnobValue(this.yAxisControlsElements.volume_yThresholdKnob, vol.yThreshold ?? 0.0, false);
        if (this.yAxisControlsElements.volume_curveTypeSelect) this.yAxisControlsElements.volume_curveTypeSelect.value = vol.curveType || 'linear';
        if (this.yAxisControlsElements.volume_curveFactorKnob) sidePanel.setKnobValue(this.yAxisControlsElements.volume_curveFactorKnob, vol.curveFactor ?? 1.0, false);

        // Effects Group
        if (this.yAxisControlsElements.effects_minOutputKnob) {
            console.log(`[FxChains.updateYAxisControlsUI] Setting effects_minOutputKnob to: ${fx.minOutput ?? -60}`);
            sidePanel.setKnobValue(this.yAxisControlsElements.effects_minOutputKnob, fx.minOutput ?? -60, false);
        }
        if (this.yAxisControlsElements.effects_maxOutputKnob) {
            console.log(`[FxChains.updateYAxisControlsUI] Setting effects_maxOutputKnob to: ${fx.maxOutput ?? 0}`);
            sidePanel.setKnobValue(this.yAxisControlsElements.effects_maxOutputKnob, fx.maxOutput ?? 0, false);
        }
        if (this.yAxisControlsElements.effects_yThresholdKnob) {
            console.log(`[FxChains.updateYAxisControlsUI] Setting effects_yThresholdKnob to: ${fx.yThreshold ?? 0.1}`);
            sidePanel.setKnobValue(this.yAxisControlsElements.effects_yThresholdKnob, fx.yThreshold ?? 0.1, false);
        }
        if (this.yAxisControlsElements.effects_curveTypeSelect) {
            console.log(`[FxChains.updateYAxisControlsUI] Setting effects_curveTypeSelect to: ${fx.curveType || 'exponential'}`);
            this.yAxisControlsElements.effects_curveTypeSelect.value = fx.curveType || 'exponential';
        }
        if (this.yAxisControlsElements.effects_curveFactorKnob) {
            console.log(`[FxChains.updateYAxisControlsUI] Setting effects_curveFactorKnob to: ${fx.curveFactor ?? 2.0}`);
            sidePanel.setKnobValue(this.yAxisControlsElements.effects_curveFactorKnob, fx.curveFactor ?? 2.0, false);
        }
        console.log('[FxChains.updateYAxisControlsUI] UI update complete.');
    },
    // =======================================================

    updateMasterOutputControlsUI(masterVolumeCeilingValue) {
        if (this.masterVolumeCeilingKnob) {
            const value = masterVolumeCeilingValue ?? 1.0;
            sidePanel.setKnobValue(this.masterVolumeCeilingKnob, value, false);
        }
    }
};