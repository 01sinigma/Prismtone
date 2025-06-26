// Файл: app/src/main/assets/js/PadModeManager.js
// Управляет различными режимами работы XY-пэда
// (Код идентичен тому, что был предоставлен в вашем запросе, Шаг 2.2)

// eslint-disable-next-line no-unused-vars
const PadModeManager = {
    strategies: {},
    currentStrategy: null,
    currentModeId: null,
    appRef: null,
    musicTheoryServiceRef: null,
    harmonicMarkerEngineRef: null,
    _initializedStrategies: new Set(), // Храним ID уже инициализированных стратегий

    init(appReference, musicTheoryServiceInstance, harmonicMarkerEngineInstance) {
        console.log("[PadModeManager.init] Received appReference:", appReference);
        if (!appReference || !musicTheoryServiceInstance || !harmonicMarkerEngineInstance) {
            console.error("[PadModeManager.init] App reference, MusicTheoryService or HarmonicMarkerEngine instance not provided!");
            return false;
        }
        this.appRef = appReference;
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.harmonicMarkerEngineRef = harmonicMarkerEngineInstance;
        this._initializedStrategies.clear();
        console.log("[PadModeManager v1.1 - Delayed Strategy Init] Initialized.");
        return true;
    },
    registerStrategy(strategy) {
        if (strategy && typeof strategy.getName === 'function') {
            const modeId = strategy.getName();
            if (this.strategies[modeId]) {
                console.warn(`[PadModeManager] Strategy for mode ID "${modeId}" is being overwritten.`);
            }
            this.strategies[modeId] = strategy;
            console.log(`[PadModeManager] Registered strategy: ${modeId}. Init will be deferred.`);
            // НЕ ВЫЗЫВАЕМ strategy.init() ЗДЕСЬ
        } else {
            console.error("[PadModeManager] Invalid strategy provided for registration:", strategy);
        }
    },
    async setActiveMode(modeId) {
        if (!this.strategies[modeId]) {
            console.error(`[PadModeManager] Strategy for mode ID "${modeId}" not found.`);
            return false;
        }

        const newStrategy = this.strategies[modeId];
        const oldStrategy = this.currentStrategy;

        // 1. Ленивая инициализация: если стратегия используется впервые, инициализируем ее.
        console.log('[PadModeManager.setActiveMode] Setting mode to:', modeId);
        console.log('[PadModeManager.setActiveMode] Found newStrategy ' + modeId + '. isStandardLayout:', newStrategy.isStandardLayout, 'getZoneLayoutOptions type:', typeof newStrategy.getZoneLayoutOptions);

        if (!this._initializedStrategies.has(modeId)) {
            if (typeof newStrategy.init === 'function') {
                console.log(`[PadModeManager.setActiveMode] LAZILY INITIALIZING '${modeId}' with appReference type:`, typeof this.appRef);
                // Передаем все необходимые зависимости
                newStrategy.init(this.appRef, this.musicTheoryServiceRef, this.harmonicMarkerEngineRef);
                this._initializedStrategies.add(modeId);
                newStrategy.isInitialized = true; // Explicitly mark as initialized
                console.log('[PadModeManager.setActiveMode] After lazy init for ' + modeId + ': isStandardLayout:', newStrategy.isStandardLayout, 'getZoneLayoutOptions type:', typeof newStrategy.getZoneLayoutOptions, 'appRef exists:', !!newStrategy.appRef, '_padContext exists:', !!newStrategy._padContext);
            }
        } else if (newStrategy.isInitialized && typeof newStrategy.updatePadContext === 'function') {
            // Если стратегия уже инициализирована и имеет метод updatePadContext, вызываем его
            console.log('[PadModeManager.setActiveMode] Strategy ' + modeId + ' already initialized. Calling updatePadContext.');
            if (this.appRef && this.appRef.state && this.appRef.state.padContext) {
                newStrategy.updatePadContext(this.appRef.state.padContext);
            } else {
                console.error('[PadModeManager.setActiveMode] Cannot call updatePadContext for ' + modeId + ': appRef or padContext is missing.');
            }
        } else {
            console.log('[PadModeManager.setActiveMode] Strategy ' + modeId + ' already initialized but no updatePadContext method, or no init method found initially.');
        }

        // 2. ДОЖИДАЕМСЯ деактивации СТАРОЙ стратегии, если она была.
        // Это важно, чтобы она успела очистить свои таймеры, слушатели или состояние.
        if (oldStrategy && oldStrategy !== newStrategy && typeof oldStrategy.onModeDeactivated === 'function') {
            console.log(`[PadModeManager] Deactivating old strategy: ${this.currentModeId}`);
            await oldStrategy.onModeDeactivated();
            oldStrategy._isActive = false;
        }

        // 3. Устанавливаем новую стратегию как текущую
        this.currentModeId = modeId;
        this.currentStrategy = newStrategy;
        console.log(`[PadModeManager] Active mode set to: ${modeId}`);

        // 4. ДОЖИДАЕМСЯ активации НОВОЙ стратегии.
        // Она может асинхронно загружать данные или настраивать свое состояние.
        if (typeof this.currentStrategy.onModeActivated === 'function') {
            await this.currentStrategy.onModeActivated();
            this.currentStrategy._isActive = true;
        }
        
        // 5. И ТОЛЬКО ПОСЛЕ ПОЛНОЙ активации новой стратегии, мы просим app перерисовать зоны.
        if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
            console.log("[PadModeManager] Requesting zone layout update from app...");
            await this.appRef.updateZoneLayout();
        }
        
        return true;
    },
    getCurrentStrategy() {
        return this.currentStrategy;
    },
    getCurrentModeId() {
        return this.currentModeId;
    },
    _getServicesBundle() {
        return { musicTheoryService: this.musicTheoryServiceRef };
    },
    _getUiModulesBundle() {
        return { sidePanel: typeof sidePanel !== 'undefined' ? sidePanel : null };
    },
    async onTonicChanged(newTonic) {
        console.log(`[PadModeManager] Notified of tonic change: ${newTonic}`);
        if (this.currentStrategy && typeof this.currentStrategy.onTonicChanged === 'function') {
            await this.currentStrategy.onTonicChanged(newTonic, this.appRef.state, this._getServicesBundle());
        }
        if (this.appRef && typeof this.appRef.updateZones === 'function') {
            await this.appRef.updateZones();
        }
    },

    async onChordChanged(newChord) {
        console.log(`[PadModeManager] Notified of chord change: ${newChord}`);
        if (this.currentStrategy && typeof this.currentStrategy.onChordChanged === 'function') {
            await this.currentStrategy.onChordChanged(newChord, this.appRef.state, this._getServicesBundle());
        }
        if (this.appRef && typeof this.appRef.updateZones === 'function') {
            await this.appRef.updateZones();
        }
    },
    getAvailableModeIds() {
        return Object.keys(this.strategies);
    },
    /**
     * Совместимость: activateMode(modeName, initialPadLayout, services)
     * Делегирует на setActiveMode, игнорируя дополнительные параметры для совместимости с простыми стратегиями.
     */
    async activateMode(modeName, initialPadLayout, services) {
        // Для совместимости: просто вызываем setActiveMode
        return await this.setActiveMode(modeName);
    },

    /**
     * Совместимость: getAvailableModes()
     * Возвращает массив { name, displayName } для всех зарегистрированных стратегий.
     */
    getAvailableModes() {
        return Object.values(this.strategies).map(s => ({
            name: s.getName(),
            displayName: typeof s.getDisplayName === 'function' ? s.getDisplayName() : s.getName()
        }));
    }
};