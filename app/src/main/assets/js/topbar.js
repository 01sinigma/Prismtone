// Файл: app/src/main/assets/js/topbar.js
const topbar = {
    buttons: {
        menu: null,
        soundLibrary: null,
        tonality: null,
        effects: null,
        reloadApp: null,
        padModes: null // НОВАЯ КНОПКА
    },
    isReloadingAppFlag: false, // Используем другое имя для флага, чтобы не конфликтовать с app

    init() {
        console.log('[Topbar.init PadModes] Initializing...');
        this.buttons.menu = document.getElementById('menu-button');
        this.buttons.soundLibrary = document.getElementById('sound-library-button');
        this.buttons.tonality = document.getElementById('tonality-button');
        this.buttons.effects = document.getElementById('effects-button');
        this.buttons.reloadApp = document.getElementById('reload-app-button'); // ID из HTML
        this.buttons.padModes = document.getElementById('pad-modes-button'); // Инициализация новой кнопки

        if (!this.buttons.padModes) console.warn("[Topbar.init PadModes] Pad Modes button ('pad-modes-button') not found.");
        if (!this.buttons.reloadApp) console.warn("[Topbar.init ReloadLogic] Reload App button ('reload-app-button') not found.");
        if (!this.buttons.menu) console.warn("[Topbar.init] Menu button not found.");
        if (!this.buttons.soundLibrary) console.warn("[Topbar.init] Sound Library button not found.");
        if (!this.buttons.tonality) console.warn("[Topbar.init] Tonality button not found.");
        if (!this.buttons.effects) console.warn("[Topbar.init] Effects button not found.");
        if (!this.buttons.restart) console.warn("[Topbar.init] Restart Audio button not found.");

        this.addEventListeners();
        console.log('[Topbar.init PadModes] Initialized successfully.');
    },

    addEventListeners() {
        console.log('[Topbar.addEventListeners PadModes] Adding listeners...');

        const addPanelToggleListener = (button, panelId) => {
            if (button) {
                button.addEventListener('click', () => {
                    if (this.isReloadingAppFlag) return; // Не даем открывать панели во время перезагрузки
                    console.log(`[Topbar] Button for panel '${panelId}' clicked.`);
                    if (typeof sidePanel !== 'undefined' && sidePanel.isPanelOpen) {
                        if (sidePanel.isPanelOpen(panelId)) {
                            sidePanel.hidePanel(panelId);
                        } else {
                            sidePanel.showPanel(panelId);
                        }
                    } else {
                        console.error("[Topbar] sidePanel or sidePanel.isPanelOpen is not available!");
                    }
                });
            }
        };

        addPanelToggleListener(this.buttons.menu, 'settings');
        addPanelToggleListener(this.buttons.soundLibrary, 'soundLibrary');
        addPanelToggleListener(this.buttons.tonality, 'tonality');
        addPanelToggleListener(this.buttons.effects, 'effects');
        addPanelToggleListener(this.buttons.padModes, 'padModes'); // Добавляем обработчик для новой кнопки
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        if (this.buttons.reloadApp) {
            this.buttons.reloadApp.addEventListener('click', async () => {
                if (this.isReloadingAppFlag) return;

                this.isReloadingAppFlag = true;
                this.buttons.reloadApp.disabled = true;
                this.buttons.reloadApp.classList.add('reloading'); // Для CSS анимации

                const icon = this.buttons.reloadApp.querySelector('.restart-icon');
                if (icon) {
                    icon.style.animation = 'none';
                    // eslint-disable-next-line no-unused-expressions
                    icon.offsetHeight;
                    icon.style.animation = 'spinReload 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards'; // Убедитесь, что имя анимации 'spinReload'
                }

                console.log("[Topbar] Reload App button clicked. Calling app.triggerFullReload().");
                if (typeof app !== 'undefined' && typeof app.triggerFullReload === 'function') {
                    // Не нужно try-catch здесь, если app.triggerFullReload уже обрабатывает ошибки
                    app.triggerFullReload();
                    // После этого страница перезагрузится, сброс isReloadingAppFlag не нужен
                } else {
                    console.error("[Topbar] app или app.triggerFullReload не доступна!");
                    this.isReloadingAppFlag = false; // Сброс, если функция не найдена
                    this.buttons.reloadApp.disabled = false;
                    this.buttons.reloadApp.classList.remove('reloading');
                    if (icon) icon.style.animation = 'none';
                }
            });
        }
        console.log('[Topbar.addEventListeners PadModes] Listeners added.');
    },

    /**
     * Updates the visual state of the record button.
     * @param {boolean} isRecording - True if recording is active.
     */
    updateRecordButton(isRecording) {
        if (!this.buttons.restart) {
            console.warn("[Topbar.updateRecordButton] Restart Audio button not found.");
            return;
        }
        console.log(`[Topbar.updateRecordButton] Setting recording state to: ${isRecording}`);
        try {
            if (isRecording) {
                this.buttons.restart.classList.add('recording');
                this.buttons.restart.textContent = '■';
                const titleText = (typeof i18n !== 'undefined')
                    ? i18n.translate('stop_recording_button', 'Stop Recording')
                    : 'Stop Recording';
                this.buttons.restart.title = titleText;
                this.buttons.restart.setAttribute('aria-label', titleText);
            } else {
                this.buttons.restart.classList.remove('recording');
                this.buttons.restart.textContent = '●';
                 const titleText = (typeof i18n !== 'undefined')
                    ? i18n.translate('record_button', 'Record')
                    : 'Record';
                this.buttons.restart.title = titleText;
                 this.buttons.restart.setAttribute('aria-label', titleText);
            }
        } catch (error) {
            console.error("[Topbar.updateRecordButton] Error updating record button:", error);
        }
    },

    /**
     * Returns the corresponding topbar button element for a given panel ID.
     * @param {string} panelId - The ID of the panel ('settings', 'soundLibrary', 'tonality', 'effects').
     * @returns {HTMLElement | null} - The button element or null if not found.
     */
    getButtonForPanel(panelId) {
        switch (panelId) {
            case 'settings': return this.buttons.menu;
            case 'soundLibrary': return this.buttons.soundLibrary;
            case 'tonality': return this.buttons.tonality;
            case 'effects': return this.buttons.effects;
            case 'padModes': return this.buttons.padModes; // Возвращаем новую кнопку
            default:
                return null;
        }
    },

     deactivateAllButtons() {
         for (const key in this.buttons) {
             if (key !== 'reloadApp' && this.buttons[key] && this.buttons[key].classList.contains('topbar-button')) {
                 this.buttons[key].classList.remove('active');
             }
         }
     }
};