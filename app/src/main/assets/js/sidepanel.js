const sidePanel = {
    panels: {},
    closeButtons: [],
    knobsInitialized: new WeakSet(),

    octaveSlider: null,
    octaveValueDisplay: null,
    octaveDownButton: null,
    octaveUpButton: null,
    scaleSelect: null,
    scaleSelectDisplay: null,
    sizeSlider: null,
    sizeValueDisplay: null,
    sizeDownButton: null,
    sizeUpButton: null,
    sizeMap: [7, 12, 24, 36],

    languageSelect: null,
    themeSelect: null,
    visualizerSelect: null,
    touchEffectSelect: null,
    noteNamesToggle: null,
    linesToggle: null,
    multiTouchToggle: null,
    highlightSharpsFlatsToggle: null,
    padModeSelect: null,
    padModeSelectorDisplay: null,
    modeSpecificControlsContainer: null,

    rocketModeEnableToggle: null,

    smoothingAlphaSlider: null,
    smoothingAlphaValue: null,
    invertPitchAxisToggle: null,
    invertRollAxisToggle: null,
    swapAxesToggle: null,

    vibrationToggle: null,
    vibrationIntensityControls: null,
    vibrationButtons: [],

    init() {
        console.log('[SidePanel.init PadModes] Initializing...');
        this.panels = {
            settings: document.getElementById('settings-panel'),
            tonality: document.getElementById('tonality-panel'),
            effects: document.getElementById('effects-panel'),
            soundLibrary: document.getElementById('sound-library-panel'),
            padModes: document.getElementById('pad-modes-panel'),
            'chord-mode-panel': document.getElementById('chord-mode-panel')
        };

        let allPanelsFound = true;
        for (const id in this.panels) {
            if (!this.panels[id]) {
                console.error(`[SidePanel.init v3] Panel element with ID '${id}' not found!`);
                allPanelsFound = false;
            }
        }
        if (!allPanelsFound) {
             console.error("[SidePanel.init v3] Not all panel elements were found. Functionality might be limited.");
        }

        this.closeButtons = document.querySelectorAll('.close-button');
        if (this.closeButtons.length === 0) {
             console.warn('[SidePanel.init v3] No elements with class "close-button" found.');
        }

        this.octaveSlider = document.getElementById('octave-slider');
        this.octaveValueDisplay = document.getElementById('octave-value');
        this.octaveDownButton = document.getElementById('octave-down');
        this.octaveUpButton = document.getElementById('octave-up');
        this.scaleSelect = document.getElementById('scale-select');
        this.scaleSelectDisplay = document.getElementById('scale-select-display');
        this.sizeSlider = document.getElementById('size-slider');
        this.sizeValueDisplay = document.getElementById('size-value');
        this.sizeDownButton = document.getElementById('size-down');
        this.sizeUpButton = document.getElementById('size-up');

        this.languageSelect = document.getElementById('language-select');
        this.themeSelect = document.getElementById('theme-select');
        this.visualizerSelect = document.getElementById('visualizer-select');
        this.touchEffectSelect = document.getElementById('touch-effect-select');
        this.noteNamesToggle = document.getElementById('show-note-names-toggle');
        this.linesToggle = document.getElementById('show-lines-toggle');
        this.multiTouchToggle = document.getElementById('toggle-multi-touch');

        this.highlightSharpsFlatsToggle = document.getElementById('highlight-sharps-flats-toggle');
        if (!this.highlightSharpsFlatsToggle) console.warn("[SidePanel.init] Highlight Sharps/Flats toggle ('highlight-sharps-flats-toggle') NOT FOUND.");
        else console.log("[SidePanel.init] Found Highlight Sharps/Flats toggle.");

        this.padModeSelect = document.getElementById('pad-mode-select');

        this.masterVolumeCeilingSlider = document.getElementById('master-volume-ceiling-slider');
        this.masterVolumeCeilingValue = document.getElementById('master-volume-ceiling-value');
        this.resetSettingsButton = document.getElementById('reset-settings-button');
        this.restartAudioButton = document.getElementById('restart-audio-button');
        this.reloadAppButton = document.getElementById('reload-app-button');

        this.fxChainSelect = document.getElementById('fx-chain-select');
        this.macroControlsContainer = document.getElementById('macro-controls');
        this.yAxisControlsContainer = document.getElementById('yaxis-controls-container');
        this.yaxisControlTargetDisplay = document.getElementById('yaxis-control-target-display');
        this.resetFxButton = document.getElementById('reset-fx-button');

        this.padModeSelectorDisplay = document.getElementById('pad-mode-selector-display');
        this.modeSpecificControlsContainer = document.getElementById('mode-specific-controls-container');
        if (!this.padModeSelectorDisplay) console.error("[SidePanel.init PadModes] Pad Mode Selector Display not found!");
        if (!this.modeSpecificControlsContainer) console.error("[SidePanel.init PadModes] Mode Specific Controls Container not found!");

        this.rocketModeEnableToggle = document.getElementById('rocket-mode-enable-toggle');

        this.vibrationToggle = document.getElementById('vibration-toggle');
        this.vibrationIntensityControls = document.getElementById('vibration-intensity-controls');
        if (this.vibrationIntensityControls) {
            this.vibrationButtons = this.vibrationIntensityControls.querySelectorAll('button');
        }

        this.smoothingAlphaSlider = document.getElementById('smoothing-alpha-slider');
        this.smoothingAlphaValue = document.getElementById('smoothing-alpha-value');
        this.invertPitchAxisToggle = document.getElementById('invert-pitch-axis-toggle');
        this.invertRollAxisToggle = document.getElementById('invert-roll-axis-toggle');
        this.swapAxesToggle = document.getElementById('swap-axes-toggle');

        if (this.sizeSlider) {
            this.sizeSlider.min = "8";
            this.sizeSlider.max = "36";
            this.sizeSlider.step = "2";
            this.sizeSlider.value = app && app.state ? app.state.zoneCount.toString() : "12";
        }

        this.addEventListeners();
        this.populateStaticSelects();
        this.populatePadModeSelectDisplay();
        console.log('[SidePanel.init PadModes] Initialized successfully.');
    },

    addEventListeners() {
        console.log('[SidePanel.addEventListeners PadModes] Adding event listeners...');
        this.closeButtons.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const panelId = event.currentTarget.dataset.panelId;
                    if (panelId && this.panels[panelId]) {
                        this.hidePanel(panelId);
                    } else {
                        this.hideAllPanels();
                    }
                });
            }
        });

        if (this.octaveSlider) { this.octaveSlider.addEventListener('input', (e) => this.handleOctaveChange(e.target.value)); this.octaveSlider.addEventListener('change', (e) => this.handleOctaveChange(e.target.value, true)); }
        if (this.octaveDownButton) { this.octaveDownButton.addEventListener('click', () => { if(this.octaveSlider) this.handleOctaveChange(parseInt(this.octaveSlider.value) - 1, true); }); }
        if (this.octaveUpButton) { this.octaveUpButton.addEventListener('click', () => { if(this.octaveSlider) this.handleOctaveChange(parseInt(this.octaveSlider.value) + 1, true); }); }
        if (this.scaleSelect) { this.scaleSelect.addEventListener('change', (e) => { app.setScale(e.target.value); }); }
        if (this.scaleSelectDisplay) {
            this.scaleSelectDisplay.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'scale',
                    title: i18n.translate('scale_label', 'Scale'),
                    itemsArray: MusicTheoryService.getAvailableScaleIds().map(id => ({
                        id: id,
                        name: i18n.translate(id, id.charAt(0).toUpperCase() + id.slice(1))
                    })),
                    currentValue: app.state.scale,
                    onSelect: async (selectedScaleId) => {
                        await app.setScale(selectedScaleId);
                        this.updateScaleDisplay(selectedScaleId);
                    }
                });
            });
        }
        if (this.sizeSlider) {
            this.sizeSlider.addEventListener('input', (e) => this.handleSizeChange(e.target.value));
            this.sizeSlider.addEventListener('change', (e) => this.handleSizeChange(e.target.value, true));
        }
        if (this.sizeDownButton) {
            this.sizeDownButton.addEventListener('click', () => {
                if(this.sizeSlider) {
                    const currentValue = parseInt(this.sizeSlider.value, 10);
                    this.handleSizeChange(currentValue - 2, true);
                }
            });
        }
        if (this.sizeUpButton) {
            this.sizeUpButton.addEventListener('click', () => {
                if(this.sizeSlider) {
                    const currentValue = parseInt(this.sizeSlider.value, 10);
                    this.handleSizeChange(currentValue + 2, true);
                }
            });
        }

        if (this.languageSelect) {
            this.languageSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'language',
                    title: i18n.translate('language_label', 'Language'),
                    selectElement: this.languageSelect,
                    currentValue: app.state.language,
                    onSelect: (val) => { app.applyLanguage(val); bridgeFix.callBridge('setLanguage', val); }
                });
            });
        }
        if (this.themeSelect) {
            this.themeSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'theme',
                    title: i18n.translate('theme_label', 'Theme'),
                    selectElement: this.themeSelect,
                    currentValue: app.state.theme,
                    onSelect: (val) => { app.applyTheme(val); bridgeFix.callBridge('setTheme', val); }
                });
            });
        }
        if (this.visualizerSelect) {
            this.visualizerSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'visualizer',
                    title: i18n.translate('visualizer_label', 'Visualizer'),
                    selectElement: this.visualizerSelect,
                    currentValue: app.state.visualizer,
                    onSelect: (val) => { app.applyVisualizer(val); bridgeFix.callBridge('setVisualizer', val); }
                });
            });
        }
        if (this.touchEffectSelect) {
            this.touchEffectSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'touchEffect',
                    title: i18n.translate('touch_effect_label', 'Touch Effect'),
                    selectElement: this.touchEffectSelect,
                    currentValue: app.state.touchEffect,
                    onSelect: (val) => { app.applyTouchEffect(val); }
                });
            });
        }

        if (this.noteNamesToggle) {
            this.noteNamesToggle.addEventListener('change', () => {
                if (app && typeof app.toggleNoteNames === 'function') {
                    app.toggleNoteNames(this.noteNamesToggle.checked);
                }
            });
        }
        if (this.linesToggle) {
            this.linesToggle.addEventListener('change', () => {
                if (app && typeof app.toggleLines === 'function') {
                    app.toggleLines(this.linesToggle.checked);
                }
            });
        }
        if (this.multiTouchToggle) { /* this.multiTouchToggle.addEventListener('change', () => { app.toggleMultiTouch(this.multiTouchToggle.checked); }); */ }

        if (this.highlightSharpsFlatsToggle) {
            this.highlightSharpsFlatsToggle.addEventListener('change', () => {
                if (app && typeof app.toggleHighlightSharpsFlats === 'function') {
                    app.toggleHighlightSharpsFlats(!!this.highlightSharpsFlatsToggle.checked);
                }
            });
        }

        const fxChainSelect = document.getElementById('fx-chain-select');
        if (fxChainSelect) {
            fxChainSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                showCustomSelectorPopover({
                    type: 'fxChain',
                    title: i18n.translate('fx_chain_label', 'FX Chain'),
                    selectElement: fxChainSelect,
                    currentValue: app.state.fxChain,
                    onSelect: (val) => { app.applyFxChain(val); }
                });
            });
        }

        if (this.padModeSelect) {
            this.padModeSelect.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (typeof PadModeManager !== 'undefined' && typeof showCustomSelectorPopover === 'function') {
                    const modeOptions = PadModeManager.getAvailableModeIds().map(modeId => {
                        const strategy = PadModeManager.strategies[modeId];
                        return {
                            id: modeId,
                            name: strategy && typeof strategy.getDisplayName === 'function' ?
                                  strategy.getDisplayName() :
                                  (strategy && typeof strategy.getName === 'function' ?
                                   i18n.translate(`pad_mode_${strategy.getName()}`, strategy.getName()) :
                                   modeId)
                        };
                    });

                    showCustomSelectorPopover({
                        type: 'padMode',
                        title: i18n.translate('pad_mode_label', 'Pad Mode'),
                        itemsArray: modeOptions,
                        currentValue: app.state.padMode,
                        onSelect: (val) => { app.setPadMode(val); }
                    });
                } else {
                    console.warn("[SidePanel] PadModeManager or showCustomSelectorPopover not available for pad mode select.");
                }
            });
        }

        if (this.masterVolumeCeilingSlider) {
            this.masterVolumeCeilingSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (this.masterVolumeCeilingValue) {
                    this.masterVolumeCeilingValue.textContent = `${Math.round(value * 100)}%`;
                }
                app.setMasterVolumeCeiling(value);
            });
        }

        if (this.resetSettingsButton) {
            this.resetSettingsButton.addEventListener('click', () => {
                console.warn("[SidePanel] Reset Settings button clicked. Logic not implemented yet.");
                alert("Reset Settings functionality is not yet implemented.");
            });
        }

        if (this.restartAudioButton) {
            this.restartAudioButton.addEventListener('click', () => {
                app.restartAudioEngine();
            });
        }

        if (this.reloadAppButton) {
            this.reloadAppButton.addEventListener('click', () => {
                app.triggerFullReload();
            });
        }

        if (this.padModeSelectorDisplay) {
            this.padModeSelectorDisplay.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (typeof PadModeManager === 'undefined' || typeof showCustomSelectorPopover !== 'function') {
                    console.error("[SidePanel] PadModeManager or showCustomSelectorPopover not available.");
                    return;
                }
                const availableModeIds = PadModeManager.getAvailableModeIds();
                const modeOptions = availableModeIds.map(modeId => {
                    const strategy = PadModeManager.strategies[modeId];
                    let displayName = modeId;
                    if (strategy && typeof strategy.getDisplayName === 'function') {
                        displayName = strategy.getDisplayName();
                    } else if (strategy && typeof strategy.getName === 'function') {
                        displayName = i18n.translate(`pad_mode_${strategy.getName()}`, strategy.getName());
                    }
                    return { id: modeId, name: displayName };
                });
                showCustomSelectorPopover({
                    type: 'padMode',
                    title: i18n.translate('pad_mode_select_title', 'Select Pad Mode'),
                    itemsArray: modeOptions,
                    currentValue: app.state.padMode,
                    onSelect: (selectedModeId) => {
                        app.setPadMode(selectedModeId);
                    },
                });
            });
            this.padModeSelectorDisplay.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.padModeSelectorDisplay.dispatchEvent(new MouseEvent('mousedown'));
                }
            });
        }

        if (this.rocketModeEnableToggle && this.modeSpecificControlsContainer) {
            this.rocketModeEnableToggle.addEventListener('change', async (e) => {
                const isEnabled = e.target.checked;
                const newMode = isEnabled ? 'rocket' : 'classic';
                if (app && typeof app.setPadMode === 'function') {
                    await app.setPadMode(newMode);
                }
                if (isEnabled && (!this.modeSpecificControlsContainer.hasChildNodes() ||
                    this.modeSpecificControlsContainer.querySelector('p[data-i18n="rocket_mode_settings_placeholder"]'))) {
                    this.displayModeSpecificControls('rocket');
                }
            });
        }

        if (this.vibrationToggle) {
            this.vibrationToggle.addEventListener('change', (e) => {
                app.setVibrationEnabled(e.target.checked);
            });
        }
        if (this.vibrationButtons && this.vibrationButtons.forEach) {
            this.vibrationButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    app.setVibrationIntensity(e.currentTarget.dataset.intensity);
                });
            });
        }

        if (this.smoothingAlphaSlider) {
            this.smoothingAlphaSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (this.smoothingAlphaValue) this.smoothingAlphaValue.textContent = value.toFixed(2);
                if (app && app.state && app.state.sensorSettings) {
                    app.state.sensorSettings.smoothingAlpha = value;
                }
            });
            this.smoothingAlphaSlider.addEventListener('change', (e) => {
                const value = parseFloat(e.target.value);
                if (app && app.state && app.state.sensorSettings) {
                    app.state.sensorSettings.smoothingAlpha = value;
                    if (window.PrismtoneBridge && window.PrismtoneBridge.updateSensorSettings) {
                        window.PrismtoneBridge.updateSensorSettings(JSON.stringify(app.state.sensorSettings));
                    } else if (bridgeFix && bridgeFix.callBridge) {
                        bridgeFix.callBridge('updateSensorSettings', JSON.stringify(app.state.sensorSettings));
                    }
                }
            });
        }
        if (this.invertPitchAxisToggle) {
            this.invertPitchAxisToggle.addEventListener('change', (e) => {
                if (app && app.state && app.state.sensorSettings) {
                    app.state.sensorSettings.invertPitchAxis = e.target.checked;
                    if (window.PrismtoneBridge && window.PrismtoneBridge.updateSensorSettings) {
                        window.PrismtoneBridge.updateSensorSettings(JSON.stringify(app.state.sensorSettings));
                    } else if (bridgeFix && bridgeFix.callBridge) {
                        bridgeFix.callBridge('updateSensorSettings', JSON.stringify(app.state.sensorSettings));
                    }
                }
            });
        }
        if (this.invertRollAxisToggle) {
            this.invertRollAxisToggle.addEventListener('change', (e) => {
                if (app && app.state && app.state.sensorSettings) {
                    app.state.sensorSettings.invertRollAxis = e.target.checked;
                    if (window.PrismtoneBridge && window.PrismtoneBridge.updateSensorSettings) {
                        window.PrismtoneBridge.updateSensorSettings(JSON.stringify(app.state.sensorSettings));
                    } else if (bridgeFix && bridgeFix.callBridge) {
                        bridgeFix.callBridge('updateSensorSettings', JSON.stringify(app.state.sensorSettings));
                    }
                }
            });
        }
        if (this.swapAxesToggle) {
            this.swapAxesToggle.addEventListener('change', (e) => {
                if (app && app.state && app.state.sensorSettings) {
                    app.state.sensorSettings.swapAxes = e.target.checked;
                    if (window.PrismtoneBridge && window.PrismtoneBridge.updateSensorSettings) {
                        window.PrismtoneBridge.updateSensorSettings(JSON.stringify(app.state.sensorSettings));
                    } else if (bridgeFix && bridgeFix.callBridge) {
                        bridgeFix.callBridge('updateSensorSettings', JSON.stringify(app.state.sensorSettings));
                    }
                }
            });
        }

        console.log('[SidePanel.addEventListeners PadModes] Listeners added.');
    },

    async populateStaticSelects() {
        console.log('[SidePanel.populateStaticSelects] Populating static select dropdowns...');
        await this.populateSelectWithOptions(this.languageSelect, 'language', 'name', 'id', app.state.language);
        await this.populateSelectWithOptions(this.themeSelect, 'theme', 'name', 'id', app.state.theme);
        await this.populateSelectWithOptions(this.visualizerSelect, 'visualizer', 'name', 'id', app.state.visualizer);
        await this.populateSelectWithOptions(this.touchEffectSelect, 'touchEffect', 'name', 'id', app.state.touchEffect);
        await this.populateSelectWithOptions(document.getElementById('fx-chain-select'), 'fxChain', 'name', 'id', app.state.fxChain);
        await this.populateSelectWithOptions(this.padModeSelect, 'padMode', 'name', 'id', app.state.padMode);
        this.updateScaleDisplay(app.state.scale);
        console.log('[SidePanel.populateStaticSelects] Select dropdowns populated.');
    },

    async populateSelectWithOptions(selectElement, moduleType, textField, valueField, currentAppStateValue) {
        if (!selectElement) { console.warn(`[SidePanel.populateSelectWithOptions v3] Select element for ${moduleType} not found.`); return; }
        selectElement.innerHTML = '';
        try {
            const modules = await moduleManager.getModules(moduleType);
            if (!Array.isArray(modules)) {
                fxChains.addOptionToSelect(selectElement, '', `Error loading ${moduleType}s`, true); return;
            }
            if (modules.length === 0 && moduleType !== 'touchEffect') {
                 fxChains.addOptionToSelect(selectElement, '', `No ${moduleType}s found`, true); return;
            }

            if (moduleType === 'touchEffect') {
                fxChains.addOptionToSelect(selectElement, 'none', i18n.translate('none_touch_effect', 'None'));
            }

            modules.sort((a, b) => (a[textField] || a[valueField]).localeCompare(b[textField] || b[valueField]));
            modules.forEach(mod => {
                if (mod[valueField] === 'none' && moduleType === 'touchEffect') return;
                fxChains.addOptionToSelect(selectElement, mod[valueField], mod[textField] || mod[valueField]);
            });

             if (currentAppStateValue && selectElement.querySelector(`option[value="${currentAppStateValue}"]`)) {
                 selectElement.value = currentAppStateValue;
             } else if (currentAppStateValue) {
                 console.warn(`[SidePanel.populateSelectWithOptions v3] Initial state value '${currentAppStateValue}' for ${moduleType} not found. Setting to first/default.`);
                 if (moduleType === 'touchEffect' && selectElement.querySelector(`option[value="none"]`)) {
                     selectElement.value = 'none';
                 } else if (selectElement.options.length > 0) {
                    selectElement.selectedIndex = 0;
                 }
             } else if (selectElement.options.length > 0) {
                selectElement.selectedIndex = 0;
             }
        } catch (error) {
            console.error(`[SidePanel.populateSelectWithOptions v3] Error populating ${moduleType} select:`, error);
            fxChains.addOptionToSelect(selectElement, '', `Error loading ${moduleType}s`, true);
        }
    },

    updateTonalityControls(octave, scaleId, zoneCount) {
        if (this.octaveSlider) this.octaveSlider.value = octave;
        if (this.octaveValueDisplay) this.octaveValueDisplay.textContent = octave;
        if (this.scaleSelect && this.scaleSelect.options.length > 0) {
            if (this.scaleSelect.querySelector(`option[value="${scaleId}"]`)) { this.scaleSelect.value = scaleId; }
            else { this.scaleSelect.selectedIndex = 0; }
        }
        this.updateScaleDisplay(scaleId);
        if (this.sizeSlider) this.sizeSlider.value = zoneCount;
        if (this.sizeValueDisplay) this.sizeValueDisplay.textContent = zoneCount;
    },

    populatePadModeSelectDisplay() {
        if (!this.padModeSelectorDisplay || typeof PadModeManager === 'undefined') return;
        const currentModeId = app.state.padMode;
        const strategy = PadModeManager.strategies[currentModeId];
        let displayName = currentModeId;
        if (strategy && typeof strategy.getDisplayName === 'function') {
            displayName = strategy.getDisplayName();
        } else if (strategy && typeof strategy.getName === 'function') {
            displayName = i18n.translate(`pad_mode_${strategy.getName()}`, strategy.getName());
        } else if (typeof i18n !== 'undefined') {
            displayName = i18n.translate(`pad_mode_${currentModeId}`, currentModeId);
        }
        this.padModeSelectorDisplay.textContent = displayName;
    },

    displayModeSpecificControls(modeId) {
        if (!this.modeSpecificControlsContainer || typeof PadModeManager === 'undefined') {
            if (this.modeSpecificControlsContainer) {
                this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('error_loading_mode_settings', 'Error loading mode settings.')}</p>`;
            }
            console.error("[SidePanel.displayModeSpecificControls] Container or PadModeManager not available.");
            return;
        }
        this.modeSpecificControlsContainer.innerHTML = ''; // Очищаем предыдущие настройки

        const strategy = PadModeManager.strategies[modeId];
        if (!strategy || typeof strategy.getModeSpecificControlsConfig !== 'function') {
            this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('error_mode_settings_config_unavailable', 'Settings config unavailable for this mode.')}</p>`;
            return;
        }

        const controlsConfig = strategy.getModeSpecificControlsConfig();
        if (!Array.isArray(controlsConfig) || controlsConfig.length === 0) {
            this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('no_specific_settings_' + modeId, 'No specific settings for this mode.')}</p>`;
            return;
        }

        controlsConfig.forEach(controlConf => {
            const group = document.createElement('div');
            group.className = 'setting-group mode-specific-setting';

            let controlElement;

            const label = document.createElement('label');
            label.textContent = controlConf.labelKey ? i18n.translate(controlConf.labelKey, controlConf.labelDefault || controlConf.name) : (controlConf.labelDefault || controlConf.name);
            if (controlConf.type !== 'toggle') {
                 group.appendChild(label);
            }

            switch (controlConf.type) {
                case 'toggle':
                    group.classList.add('toggle-container');
                    const span = document.createElement('span');
                    span.textContent = label.textContent;
                    group.appendChild(span);
                    const toggleLabel = document.createElement('label');
                    toggleLabel.className = 'toggle';
                    controlElement = document.createElement('input');
                    controlElement.type = 'checkbox';
                    controlElement.checked = controlConf.initialValue === true;
                    const sliderSpan = document.createElement('span');
                    sliderSpan.className = 'toggle-slider';
                    toggleLabel.appendChild(controlElement);
                    toggleLabel.appendChild(sliderSpan);
                    group.appendChild(toggleLabel);
                    break;
                case 'slider':
                    const sliderContainer = document.createElement('div');
                    sliderContainer.className = 'slider-container';
                    controlElement = document.createElement('input');
                    controlElement.type = 'range';
                    controlElement.className = 'slider';
                    controlElement.min = controlConf.min || 0;
                    controlElement.max = controlConf.max || 100;
                    controlElement.step = controlConf.step || 1;
                    controlElement.value = controlConf.initialValue || controlConf.min || 0;
                    const valueDisplay = document.createElement('span');
                    valueDisplay.className = 'slider-value';
                    valueDisplay.textContent = controlElement.value;
                    controlElement.addEventListener('input', (e) => {
                        valueDisplay.textContent = e.target.value;
                        if (typeof app !== 'undefined' && app.setModeSpecificSetting) {
                            app.setModeSpecificSetting(modeId, controlConf.name, parseFloat(e.target.value));
                        } else if (typeof strategy.onSpecificControlChanged === 'function') {
                            strategy.onSpecificControlChanged(controlConf.name, parseFloat(e.target.value));
                        }
                    });
                    sliderContainer.appendChild(controlElement);
                    sliderContainer.appendChild(valueDisplay);
                    group.appendChild(sliderContainer);
                    break;
                case 'select':
                    controlElement = document.createElement('select');
                    controlElement.className = 'dropdown';
                    if (controlConf.options && Array.isArray(controlConf.options)) {
                        controlConf.options.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = typeof opt === 'object' ? opt.value : opt;
                            option.textContent = typeof opt === 'object' ? (opt.labelKey ? i18n.translate(opt.labelKey, opt.label) : opt.label) : opt;
                            controlElement.appendChild(option);
                        });
                    }
                    controlElement.value = controlConf.initialValue;
                    group.appendChild(controlElement);
                    break;
                default:
                    const p = document.createElement('p');
                    p.textContent = `Unsupported control type: ${controlConf.type}`;
                    group.appendChild(p);
            }

            if (controlElement && controlConf.type !== 'slider') {
                 controlElement.dataset.controlName = controlConf.name;
                 controlElement.addEventListener('change', (e) => {
                    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    console.log(`[SidePanel] Mode specific control '${controlConf.name}' for mode '${modeId}' changed to:`, value);
                    if (typeof app !== 'undefined' && app.setModeSpecificSetting) {
                        app.setModeSpecificSetting(modeId, controlConf.name, value);
                    } else if (typeof strategy.onSpecificControlChanged === 'function') {
                        strategy.onSpecificControlChanged(controlConf.name, value);
                    }
                 });
            }
            this.modeSpecificControlsContainer.appendChild(group);
        });
    },

    updateSettingsControls(langId, themeId, vizId, touchEffectId, showNames, showGrid, highlightSharps, currentPadMode, rocketSettings, enableVibration, vibrationIntensity) {
        if (this.languageSelect && this.languageSelect.options.length > 0) { if (this.languageSelect.querySelector(`option[value="${langId}"]`)) this.languageSelect.value = langId; else { this.languageSelect.selectedIndex = 0; } }
        if (this.themeSelect && this.themeSelect.options.length > 0) { if (this.themeSelect.querySelector(`option[value="${themeId}"]`)) this.themeSelect.value = themeId; else { this.themeSelect.selectedIndex = 0; } }
        if (this.visualizerSelect && this.visualizerSelect.options.length > 0) { if (this.visualizerSelect.querySelector(`option[value="${vizId}"]`)) this.visualizerSelect.value = vizId; else { this.visualizerSelect.selectedIndex = 0; } }
        if (this.touchEffectSelect && this.touchEffectSelect.options.length > 0) {
            const targetVal = touchEffectId || 'none';
            if (this.touchEffectSelect.querySelector(`option[value="${targetVal}"]`)) {
                this.touchEffectSelect.value = targetVal;
            } else if (this.touchEffectSelect.querySelector(`option[value="none"]`)) {
                this.touchEffectSelect.value = 'none';
            } else {
                 this.touchEffectSelect.selectedIndex = 0;
            }
        }

        if (this.noteNamesToggle) this.noteNamesToggle.checked = showNames;
        if (this.linesToggle) this.linesToggle.checked = showGrid;
        if (this.highlightSharpsFlatsToggle) this.highlightSharpsFlatsToggle.checked = highlightSharps;

        if (this.vibrationToggle) {
            this.vibrationToggle.checked = enableVibration;
        }
        if (this.vibrationIntensityControls) {
            this.vibrationIntensityControls.classList.toggle('hidden', !enableVibration);
        }
        this.vibrationButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.intensity === vibrationIntensity);
        });

        if (this.padModeSelect && this.padModeSelect.options.length > 0) {
            if (currentPadMode && this.padModeSelect.querySelector(`option[value="${currentPadMode}"]`)) {
                this.padModeSelect.value = currentPadMode;
            } else if (this.padModeSelect.options.length > 0) {
                this.padModeSelect.selectedIndex = 0;
            }
        }
        this.populatePadModeSelectDisplay();
        this.displayModeSpecificControls(currentPadMode);
        console.log(`[SidePanel.updateSettingsControls] Updated UI for ... Vibration: ${enableVibration}, Intensity: ${vibrationIntensity}`);

        if (app && app.state && app.state.sensorSettings) {
            if (this.smoothingAlphaSlider) this.smoothingAlphaSlider.value = app.state.sensorSettings.smoothingAlpha;
            if (this.smoothingAlphaValue) this.smoothingAlphaValue.textContent = parseFloat(app.state.sensorSettings.smoothingAlpha).toFixed(2);
            if (this.invertPitchAxisToggle) this.invertPitchAxisToggle.checked = app.state.sensorSettings.invertPitchAxis;
            if (this.invertRollAxisToggle) this.invertRollAxisToggle.checked = app.state.sensorSettings.invertRollAxis;
            if (this.swapAxesToggle) this.swapAxesToggle.checked = app.state.sensorSettings.swapAxes;
        }
    },

    handleOctaveChange(value, finalChange = false) {
        const newOffset = parseInt(value, 10);
        if (isNaN(newOffset)) return;
        const clampedOffset = Math.max(-7, Math.min(7, newOffset));
        if (this.octaveSlider) this.octaveSlider.value = clampedOffset;
        if (this.octaveValueDisplay) this.octaveValueDisplay.textContent = clampedOffset;
        if (finalChange && clampedOffset !== app.state.octaveOffset) { app.setOctaveOffset(clampedOffset); }
    },

    handleSizeChange(value, finalChange = false) {
        const newSize = parseInt(value, 10);
        if (isNaN(newSize)) return;
        let clampedSize = Math.max(8, Math.min(36, newSize));
        if (clampedSize % 2 !== 0) {
            if (clampedSize === 35) clampedSize = 34;
            else if (clampedSize < 8) clampedSize = 8;
            else clampedSize = Math.round(clampedSize / 2) * 2;
            clampedSize = Math.max(8, Math.min(36, clampedSize));
        }
        if (this.sizeSlider) this.sizeSlider.value = clampedSize;
        if (this.sizeValueDisplay) this.sizeValueDisplay.textContent = clampedSize;
        if (finalChange && clampedSize !== app.state.zoneCount) {
            app.setZoneCount(clampedSize);
        }
    },

    showPanel(panelId) {
        if (panelId !== 'chord-mode-panel') {
            this.hideAllPanels(); 
            if (app.state.padMode === 'chord') {
                app.toggleChordPanel(true);
            }
        }
        
        const panel = this.panels[panelId];
        if (panel) {
            if (panelId === 'chord-mode-panel') {
                app.toggleChordPanel(false);
            }
            panel.classList.add('show');
            if (topbar && typeof topbar.getButtonForPanel === 'function') {
                const button = topbar.getButtonForPanel(panelId);
                if (button) button.classList.add('active');
            }
        }
    },

    hidePanel(panelId) {
        const panel = this.panels[panelId];
        if (panel) {
            panel.classList.remove('show');
            if (topbar && typeof topbar.getButtonForPanel === 'function') {
                const button = topbar.getButtonForPanel(panelId);
                if (button) button.classList.remove('active');
            }
        }
    },

    hideAllPanels(exceptId = null) {
        if (topbar && typeof topbar.deactivateAllButtons === 'function') {
            topbar.deactivateAllButtons();
        }
        for (const id in this.panels) {
            if (id !== exceptId && id !== 'chord-mode-panel' && this.panels[id]) {
                this.hidePanel(id);
            }
        }
    },

    isPanelOpen(panelId) {
        const panel = this.panels[panelId];
        return panel ? panel.classList.contains('show') : false;
    },

    initKnob(knobElement) {
        if (!knobElement || !(knobElement instanceof HTMLElement) || this.knobsInitialized.has(knobElement)) return;
        const paramName = knobElement.dataset.param || 'unknown';
        const dial = knobElement.querySelector('.knob-dial');
        const valueDisplay = knobElement.querySelector('.knob-value');
        if (!dial || !valueDisplay) { return; }

        let isDragging = false, startY = 0, startValueLinear = 0;
        let min = 0, max = 1, step = 0.01, isLog = false;

        try {
            min = parseFloat(knobElement.dataset.min ?? 0);
            max = parseFloat(knobElement.dataset.max ?? 1);
            step = parseFloat(knobElement.dataset.step ?? 0.01);
            isLog = knobElement.dataset.log === 'true';
            if (isNaN(min) || isNaN(max) || isNaN(step)) throw new Error("NaN parsed");
            if (max <= min) { min = 0; max = 1; }
            if (step <= 0) { step = 0.01; }
            if (isLog && min <= 0) { isLog = false; console.warn(`[SidePanel.initKnob] Log scale for ${paramName} disabled due to min <= 0.`); }
        } catch (e) { console.error(`[SidePanel.initKnob] Error parsing data for ${paramName}:`, e); }

        const scaleToValue = (linearValue) => {
            const clampedLinear = Math.max(0, Math.min(1, linearValue));
            if (isLog) return min * Math.pow(max / min, clampedLinear);
            return min + clampedLinear * (max - min);
        };
        const valueToScale = (value) => {
            const clampedValue = Math.max(min, Math.min(max, value));
            if (isLog) {
                if (clampedValue <= min || max <= min) return 0;
                return Math.log(clampedValue / min) / Math.log(max / min);
            }
            if (max - min === 0) return 0;
            return (clampedValue - min) / (max - min);
        };

        const updateKnobUI = (valueToDisplay, triggerChangeEvent = true) => {
            let steppedValue = Math.round(valueToDisplay / step) * step;
            steppedValue = parseFloat(steppedValue.toFixed(5));
            steppedValue = Math.max(min, Math.min(max, steppedValue));

            const linearValue = valueToScale(steppedValue);
            const rotation = linearValue * 270 - 135;
            dial.style.transform = `translateX(-50%) rotate(${rotation}deg)`;

            let displayFormat;
            if (Math.abs(steppedValue) >= 10000 && isLog) displayFormat = (steppedValue / 1000).toFixed(1) + 'k';
            else if (Math.abs(steppedValue) >= 1000) displayFormat = Math.round(steppedValue).toString();
            else if (step >= 1) displayFormat = Math.round(steppedValue).toString();
            else if (step >= 0.1) displayFormat = steppedValue.toFixed(1);
            else if (step >= 0.01) displayFormat = steppedValue.toFixed(2);
            else displayFormat = steppedValue.toFixed(3);
            valueDisplay.textContent = displayFormat;
            knobElement.dataset.currentValue = steppedValue.toString();

            if (triggerChangeEvent) {
                knobElement.dispatchEvent(new CustomEvent('knob-change', { detail: { value: steppedValue }, bubbles: true }));
            }
        };

        const onPointerDown = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            isDragging = true; startY = e.clientY;
            startValueLinear = valueToScale(parseFloat(knobElement.dataset.currentValue ?? knobElement.dataset.default ?? min));
            try { knobElement.setPointerCapture(e.pointerId); } catch (err) {}
            knobElement.style.cursor = 'ns-resize'; document.body.style.cursor = 'ns-resize';
        };
        const onPointerMove = (e) => {
            if (!isDragging || (e.pointerId !== knobElement._capturedPointerId && knobElement._capturedPointerId !== undefined)) return;
            e.preventDefault(); e.stopPropagation();
            const deltaY = startY - e.clientY;
            const sensitivityFactor = knobElement.classList.contains('small') ? 250 : 200;
            let newLinearValue = startValueLinear + (deltaY / sensitivityFactor);
            newLinearValue = Math.max(0, Math.min(1, newLinearValue));
            updateKnobUI(scaleToValue(newLinearValue), true);
        };
        const onPointerUp = (e) => {
            if (!isDragging || (e.pointerId !== knobElement._capturedPointerId && knobElement._capturedPointerId !== undefined)) return;
            e.stopPropagation(); isDragging = false;
            if (knobElement.hasPointerCapture(e.pointerId)) { try { knobElement.releasePointerCapture(e.pointerId); } catch (err) {} }
            knobElement.style.cursor = 'ns-resize'; document.body.style.cursor = '';
            delete knobElement._capturedPointerId;
        };

        knobElement.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointermove', onPointerMove, {passive: false});
        document.addEventListener('pointerup', onPointerUp);
        knobElement.addEventListener('pointercancel', onPointerUp);
        knobElement.addEventListener('gotpointercapture', (e) => { knobElement._capturedPointerId = e.pointerId; });
        knobElement.addEventListener('lostpointercapture', (e) => { if (isDragging && e.pointerId === knobElement._capturedPointerId) { onPointerUp(e); }});

        knobElement.setValue = (value, triggerEvent = true) => { updateKnobUI(value, triggerEvent); };
        knobElement.getValue = () => parseFloat(knobElement.dataset.currentValue ?? min);
        updateKnobUI(parseFloat(knobElement.dataset.default ?? knobElement.dataset.currentValue ?? min), false);
        this.knobsInitialized.add(knobElement);
    },

    setKnobValue(knobElement, value, triggerEvent = false) {
         if (knobElement && typeof knobElement.setValue === 'function') {
             knobElement.setValue(value, triggerEvent);
         }
    },

    getKnobValue(knobElement) {
        if (knobElement && typeof knobElement.getValue === 'function') {
            return knobElement.getValue();
        }
        return knobElement?.dataset?.currentValue ? parseFloat(knobElement.dataset.currentValue) : 0;
    },

    updateScaleDisplay(scaleId) {
        if (this.scaleSelectDisplay && scaleId) {
            const scaleName = i18n.translate(scaleId, scaleId.charAt(0).toUpperCase() + scaleId.slice(1));
            this.scaleSelectDisplay.textContent = scaleName;
            console.log(`[SidePanel] Scale display updated to: ${scaleName} (ID: ${scaleId})`);
        } else if (this.scaleSelectDisplay) {
            this.scaleSelectDisplay.textContent = i18n.translate('select_option', 'Select Scale');
        }
    }
};