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
    // === НОВОЕ: Ссылка на переключатель Polyphony Volume Scaling ===
    enablePolyphonyScalingToggle: null,
    // ============================================================
    // === НОВОЕ: Ссылка на переключатель Highlight Sharps/Flats ===
    highlightSharpsFlatsToggle: null,
    // ============================================================
    padModeSelect: null,
    padModeSelectorDisplay: null,       // Для отображения выбранного режима
    modeSpecificControlsContainer: null, // Контейнер для настроек режима

    // === Rocket Mode UI ===
    rocketModeEnableToggle: null,
    // ...

    init() {
        console.log('[SidePanel.init PadModes] Initializing...');
        this.panels = {
            settings: document.getElementById('settings-panel'),
            tonality: document.getElementById('tonality-panel'),
            effects: document.getElementById('effects-panel'),
            soundLibrary: document.getElementById('sound-library-panel'),
            padModes: document.getElementById('pad-modes-panel') // Новая панель
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
        // === ИНИЦИАЛИЗАЦИЯ ПЕРЕКЛЮЧАТЕЛЯ ===
        console.log('[SidePanel.init] Attempting to get element by ID: enable-polyphony-volume-scaling-toggle', document.getElementById('enable-polyphony-volume-scaling-toggle'));
        this.enablePolyphonyScalingToggle = document.getElementById('enable-polyphony-volume-scaling-toggle');
        if (!this.enablePolyphonyScalingToggle) console.warn("[SidePanel.init] Enable Polyphony Scaling toggle ('enable-polyphony-volume-scaling-toggle') NOT FOUND.");
        else console.log("[SidePanel.init] Found Enable Polyphony Scaling toggle.");
        // ===================================

        // === ИНИЦИАЛИЗАЦИЯ НОВОГО ПЕРЕКЛЮЧАТЕЛЯ Highlight Sharps/Flats ===
        console.log('[SidePanel.init] Attempting to get element by ID: highlight-sharps-flats-toggle', document.getElementById('highlight-sharps-flats-toggle'));
        this.highlightSharpsFlatsToggle = document.getElementById('highlight-sharps-flats-toggle');
        if (!this.highlightSharpsFlatsToggle) console.warn("[SidePanel.init] Highlight Sharps/Flats toggle ('highlight-sharps-flats-toggle') NOT FOUND.");
        else console.log("[SidePanel.init] Found Highlight Sharps/Flats toggle.");
        // ==============================================================

        this.padModeSelect = document.getElementById('pad-mode-select');

        this.masterVolumeCeilingSlider = document.getElementById('master-volume-ceiling-slider');
        this.masterVolumeCeilingValue = document.getElementById('master-volume-ceiling-value');
        this.enablePolyphonyVolumeScalingToggle = document.getElementById('enable-polyphony-volume-scaling-toggle');
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

        // === Rocket Mode UI ===
        this.rocketModeEnableToggle = document.getElementById('rocket-mode-enable-toggle');
        // ...

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
        if (this.multiTouchToggle) { /* this.multiTouchToggle.addEventListener('change', () => { app.toggleMultiTouch(this.multiTouchToggle.checked); }); */ } // Мультитач пока disabled

        // === ОБРАБОТЧИК ДЛЯ Polyphony Volume Scaling Toggle ===
        if (this.enablePolyphonyScalingToggle) {
            this.enablePolyphonyScalingToggle.addEventListener('change', () => {
                if (app && typeof app.setEnablePolyphonyVolumeScaling === 'function') {
                    app.setEnablePolyphonyVolumeScaling(this.enablePolyphonyScalingToggle.checked);
                }
            });
        } else { console.warn("[SidePanel.addEventListeners v3] Enable Polyphony Scaling toggle not found."); }
        // ====================================================

        // === ОБРАБОТЧИК ДЛЯ Highlight Sharps/Flats Toggle ===
        if (this.highlightSharpsFlatsToggle) {
            this.highlightSharpsFlatsToggle.addEventListener('change', () => {
                if (app && typeof app.toggleHighlightSharpsFlats === 'function') {
                    app.toggleHighlightSharpsFlats(!!this.highlightSharpsFlatsToggle.checked);
                }
            });
        } else { console.warn("[SidePanel.addEventListeners v3] Highlight Sharps/Flats toggle not found."); }
        // ====================================================

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

        // === Rocket Mode UI ===
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
        // ...

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
            this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('error_loading_mode_settings', 'Error loading mode settings.')}</p>`;
            return;
        }
        this.modeSpecificControlsContainer.innerHTML = '';
        const strategy = PadModeManager.strategies[modeId];
        if (!strategy || typeof strategy.getModeSpecificControlsConfig !== 'function') {
            this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('error_loading_mode_settings', 'Error loading mode settings config.')}</p>`;
            return;
        }
        const controlsConfig = strategy.getModeSpecificControlsConfig();
        if (!Array.isArray(controlsConfig) || controlsConfig.length === 0) {
            this.modeSpecificControlsContainer.innerHTML = `<p class="no-controls-message">${i18n.translate('no_specific_settings_' + modeId, 'No specific settings for this mode.')}</p>`;
            return;
        }
        // Группировка по секциям
        const controlSections = { general: [], phases: [], harmonicLogic: [], interactiveBehavior: [] };
        controlsConfig.forEach(config => {
            if (["intensity", "visualTheme"].includes(config.name)) controlSections.general.push(config);
            else if (config.name.includes('Phase') || config.name.includes('Duration')) controlSections.phases.push(config);
            else if (["harmonicKeyDisplay","markerLogicMode", "displayMarkers", "markerStyle", "markerColorScheme", "tonalTonic"].some(n => config.name.startsWith(n))) controlSections.harmonicLogic.push(config);
            else controlSections.interactiveBehavior.push(config);
        });
        const createSection = (titleKey, titleDefault, configs) => {
            if (configs.length === 0) return;
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'setting-group mode-section';
            const titleH5 = document.createElement('h5');
            titleH5.textContent = i18n.translate(titleKey, titleDefault);
            sectionDiv.appendChild(titleH5);
            configs.forEach(config => {
                const controlDiv = document.createElement('div');
                controlDiv.className = config.type === 'toggle' ? 'toggle-container' : 'setting-item mode-control-item';
                let labelElement;
                const controlId = `rocket-control-${config.name.replace('.', '-')}`;
                if (config.type !== 'toggle') {
                    labelElement = document.createElement('label');
                    labelElement.htmlFor = controlId;
                    labelElement.textContent = i18n.translate(config.labelKey, config.labelDefault || config.name);
                    // Tooltip для label
                    if (config.description) {
                        labelElement.title = config.description;
                        labelElement.classList.add('has-tooltip');
                    }
                    controlDiv.appendChild(labelElement);
                }
                let controlInputElement;
                const currentValue = (app.state.rocketModeSettings && app.state.rocketModeSettings.hasOwnProperty(config.name))
                    ? app.state.rocketModeSettings[config.name]
                    : config.default;
                let currentDisplayMarkerValue = null;
                if (config.name.startsWith("displayMarkers.")) {
                    const subKey = config.name.split('.')[1];
                    if (app.state.rocketModeSettings && app.state.rocketModeSettings.displayMarkers) {
                        currentDisplayMarkerValue = app.state.rocketModeSettings.displayMarkers[subKey] !== undefined
                            ? app.state.rocketModeSettings.displayMarkers[subKey]
                            : config.default;
                    } else {
                        currentDisplayMarkerValue = config.default;
                    }
                }
                switch (config.type) {
                    case 'toggle':
                        const spanLabel = document.createElement('span');
                        spanLabel.textContent = i18n.translate(config.labelKey, config.labelDefault || config.name);
                        // Tooltip для toggle
                        if (config.description) {
                            spanLabel.title = config.description;
                            spanLabel.classList.add('has-tooltip');
                        }
                        controlDiv.appendChild(spanLabel);
                        const toggleLabel = document.createElement('label');
                        toggleLabel.className = 'toggle';
                        controlInputElement = document.createElement('input');
                        controlInputElement.type = 'checkbox';
                        controlInputElement.id = controlId;
                        controlInputElement.checked = config.name.startsWith("displayMarkers.") ? currentDisplayMarkerValue : currentValue;
                        const sliderSpan = document.createElement('span');
                        sliderSpan.className = 'toggle-slider';
                        toggleLabel.appendChild(controlInputElement);
                        toggleLabel.appendChild(sliderSpan);
                        controlDiv.appendChild(toggleLabel);
                        break;
                    case 'select':
                        controlInputElement = document.createElement('div');
                        controlInputElement.id = controlId;
                        controlInputElement.className = 'dropdown-display';
                        controlInputElement.tabIndex = 0;
                        controlInputElement.setAttribute('role', 'combobox');
                        const selectedOption = config.options.find(opt => opt.id === currentValue);
                        controlInputElement.textContent = selectedOption
                            ? (selectedOption.labelKey ? i18n.translate(selectedOption.labelKey, selectedOption.name) : selectedOption.name)
                            : currentValue;
                        controlDiv.appendChild(controlInputElement);
                        break;
                    case 'knob':
                        const knobContainer = document.createElement('div');
                        knobContainer.className = 'knob-container small-knob-container';
                        controlInputElement = document.createElement('div');
                        controlInputElement.className = 'knob small';
                        controlInputElement.id = controlId;
                        Object.assign(controlInputElement.dataset, {
                            param: config.name, min: config.min, max: config.max, step: config.step, default: currentValue
                        });
                        if (config.logScale) controlInputElement.dataset.log = 'true';
                        controlInputElement.innerHTML = `<div class="knob-dial"></div><span class="knob-value">${currentValue}</span>`;
                        knobContainer.appendChild(controlInputElement);
                        const knobLabel = document.createElement('label');
                        knobLabel.className = 'knob-sub-label';
                        knobLabel.textContent = i18n.translate(config.labelKey, config.labelDefault || config.name);
                        knobContainer.appendChild(knobLabel);
                        controlDiv.appendChild(knobContainer);
                        this.initKnob(controlInputElement);
                        break;
                    case 'display':
                        controlInputElement = document.createElement('span');
                        controlInputElement.id = controlId;
                        controlInputElement.className = 'display-value';
                        if (typeof config.getValue === 'function') {
                            controlInputElement.textContent = config.getValue();
                        } else {
                            controlInputElement.textContent = currentValue;
                        }
                        controlDiv.appendChild(controlInputElement);
                        break;
                }
                if (controlInputElement) {
                    const eventType = (config.type === 'toggle' || config.type === 'text') ? 'change' :
                                      (config.type === 'knob') ? 'knob-change' : null;
                    if (eventType) {
                        controlInputElement.addEventListener(eventType, (e) => {
                            const val = (config.type === 'toggle') ? e.target.checked :
                                        (config.type === 'knob') ? e.detail.value : e.target.value;
                            app.setModeSpecificSetting('rocket', config.name, val);
                        });
                    } else if (config.type === 'select') {
                        controlInputElement.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            const currentValFromState = config.name.startsWith("displayMarkers.")
                                ? app.state.rocketModeSettings.displayMarkers[config.name.split('.')[1]]
                                : app.state.rocketModeSettings[config.name];
                            showCustomSelectorPopover({
                                type: `rocket_${config.name.replace('.', '_')}`,
                                title: i18n.translate(config.labelKey, config.labelDefault || config.name),
                                itemsArray: config.options.map(opt => ({
                                    id: opt.id,
                                    name: opt.labelKey ? i18n.translate(opt.labelKey, opt.name) : opt.name
                                })),
                                currentValue: currentValFromState,
                                onSelect: (selectedValue) => {
                                    app.setModeSpecificSetting('rocket', config.name, selectedValue);
                                    const selOpt = config.options.find(o => o.id === selectedValue);
                                    controlInputElement.textContent = selOpt
                                        ? (selOpt.labelKey ? i18n.translate(selOpt.labelKey, selOpt.name) : selOpt.name)
                                        : selectedValue;
                                }
                            });
                        });
                        controlInputElement.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                controlInputElement.dispatchEvent(new MouseEvent('mousedown'));
                            }
                        });
                    }
                }
                sectionDiv.appendChild(controlDiv);
            });
            this.modeSpecificControlsContainer.appendChild(sectionDiv);
        };
        createSection('rocket_section_general', 'General', controlSections.general);
        createSection('rocket_section_phases', 'Phases', controlSections.phases);
        createSection('rocket_section_harmonic_logic', 'Harmonic Logic', controlSections.harmonicLogic);
        createSection('rocket_section_interactive_behavior', 'Interactive Behavior', controlSections.interactiveBehavior);

        if (modeId === 'rocket') {
            // === Кнопки ручного перехода фаз ===
            const appState = app.state;
            const rocketSettings = appState.rocketModeSettings;
            const manualAllowed = !rocketSettings.autoPhases || rocketSettings.phaseTransitionMode === 'manual';
            const phases = [
                { id: 'ignition', label: i18n.translate('rocket_phase_ignition', 'Ignition') },
                { id: 'lift-off', label: i18n.translate('rocket_phase_lift_off', 'Lift-off') },
                { id: 'burst', label: i18n.translate('rocket_phase_burst', 'Burst') }
            ];
            const btnGroup = document.createElement('div');
            btnGroup.className = 'rocket-phase-buttons-group';
            phases.forEach(phase => {
                const btn = document.createElement('button');
                btn.textContent = phase.label;
                btn.className = 'action-button';
                btn.disabled = !manualAllowed;
                if (appState.rocketModePhase === phase.id) btn.classList.add('active');
                btn.addEventListener('click', () => app.manualSetRocketPhase(phase.id));
                btnGroup.appendChild(btn);
            });
            this.modeSpecificControlsContainer.appendChild(btnGroup);
        }
    },

    updateSettingsControls(langId, themeId, vizId, touchEffectId, showNames, showGrid, enablePolyScaling, highlightSharps, currentPadMode) {
        if (this.languageSelect && this.languageSelect.options.length > 0) { if (this.languageSelect.querySelector(`option[value="${langId}"]`)) this.languageSelect.value = langId; else { this.languageSelect.selectedIndex = 0; } }
        if (this.themeSelect && this.themeSelect.options.length > 0) { if (this.themeSelect.querySelector(`option[value="${themeId}"]`)) this.themeSelect.value = themeId; else { this.themeSelect.selectedIndex = 0; } }
        if (this.visualizerSelect && this.visualizerSelect.options.length > 0) { if (this.visualizerSelect.querySelector(`option[value="${vizId}"]`)) this.visualizerSelect.value = vizId; else { this.visualizerSelect.selectedIndex = 0; } }
        if (this.touchEffectSelect && this.touchEffectSelect.options.length > 0) {
            const targetVal = touchEffectId || 'none';
            if (this.touchEffectSelect.querySelector(`option[value="${targetVal}"]`)) {
                this.touchEffectSelect.value = targetVal;
            } else {
                console.warn(`[SidePanel.updateSettingsControls v3] Touch Effect ID '${targetVal}' not found.`);
                if (this.touchEffectSelect.querySelector(`option[value="none"]`)) {
                    this.touchEffectSelect.value = 'none';
                } else {
                     this.touchEffectSelect.selectedIndex = 0;
                }
            }
        }

        if (this.noteNamesToggle) this.noteNamesToggle.checked = showNames;
        if (this.linesToggle) this.linesToggle.checked = showGrid;
        if (this.highlightSharpsFlatsToggle) this.highlightSharpsFlatsToggle.checked = highlightSharps;

        if (this.enablePolyphonyScalingToggle) this.enablePolyphonyScalingToggle.checked = enablePolyScaling;

        if (this.padModeSelect && this.padModeSelect.options.length > 0) {
            if (currentPadMode && this.padModeSelect.querySelector(`option[value="${currentPadMode}"]`)) {
                this.padModeSelect.value = currentPadMode;
            } else if (this.padModeSelect.options.length > 0) {
                this.padModeSelect.selectedIndex = 0;
            }
        }
        this.populatePadModeSelectDisplay();
        this.displayModeSpecificControls(currentPadMode);
        console.log(`[SidePanel.updateSettingsControls] Updated UI for Language: ${langId}, Theme: ${themeId}, Viz: ${vizId}, Effect: ${touchEffectId}, Names: ${showNames}, Lines: ${showGrid}, PolyScaling: ${enablePolyScaling}, SharpsFlats: ${highlightSharps}, PadMode: ${currentPadMode}`);
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
        this.hideAllPanels(panelId);
        const panel = this.panels[panelId];
        if (panel) {
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
            if (id !== exceptId && this.panels[id]) {
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