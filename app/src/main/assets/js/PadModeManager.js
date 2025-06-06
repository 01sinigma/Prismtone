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
        // Инициализируем стратегию, если она еще не была инициализирована
        if (!this._initializedStrategies.has(modeId)) {
            if (typeof newStrategy.init === 'function') {
                console.log(`[PadModeManager.setActiveMode] Lazily initializing strategy '${modeId}' with appRef:`, this.appRef);
                newStrategy.init(this.appRef, this.musicTheoryServiceRef, this.harmonicMarkerEngineRef);
                this._initializedStrategies.add(modeId);
            } else {
                console.warn(`[PadModeManager.setActiveMode] Strategy '${modeId}' has no init method.`);
            }
        }
        // Если мы меняем стратегию, деактивируем старую
        if (this.currentStrategy && this.currentStrategy !== newStrategy && typeof this.currentStrategy.onModeDeactivated === 'function') {
            console.log(`[PadModeManager.setActiveMode] Deactivating old strategy: ${this.currentModeId}`);
            await this.currentStrategy.onModeDeactivated(this.appRef.state, this._getServicesBundle(), this._getUiModulesBundle());
            if (this.currentStrategy) this.currentStrategy._isActive = false;
        }
        this.currentModeId = modeId;
        this.currentStrategy = newStrategy;
        console.log(`[PadModeManager] Active mode set to: ${modeId}`);
        if (typeof this.currentStrategy.onModeActivated === 'function') {
            await this.currentStrategy.onModeActivated(this.appRef.state, this._getServicesBundle(), this._getUiModulesBundle());
            if (this.currentStrategy) this.currentStrategy._isActive = true;
        }
        if (this.appRef && typeof this.appRef.updateZoneLayout === 'function') {
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
    async onScaleChanged(newScale) {
        console.log(`[PadModeManager] Notified of scale change: ${newScale}`);
        if (this.currentStrategy && typeof this.currentStrategy.onScaleChanged === 'function') {
            await this.currentStrategy.onScaleChanged(newScale, this.appRef.state, this._getServicesBundle());
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
    }
};