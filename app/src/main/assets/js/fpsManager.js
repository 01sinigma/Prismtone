// Файл: assets/js/fpsManager.js
const fpsManager = {
    _targetFps: 60,
    _frameIntervalMs: 1000 / 60,
    _lastFrameTime: 0,
    _animationFrameId: null,
    _drawLoopCallback: null,
    _isActive: false,

    init(drawLoopCallback) {
        if (typeof drawLoopCallback !== 'function') {
            console.error("[FpsManager] drawLoopCallback must be a function.");
            return;
        }
        this._drawLoopCallback = drawLoopCallback;
        console.log("[FpsManager] Initialized.");
    },

    setTargetFps(fps) {
        const target = parseInt(fps, 10);
        if (target > 0) {
            this._targetFps = target;
            this._frameIntervalMs = 1000 / this._targetFps;
            console.log(`[FpsManager] Target FPS set to: ${this._targetFps} (interval: ${this._frameIntervalMs.toFixed(2)}ms)`);
        }
    },

    _loop(timestamp) {
        if (!this._isActive) return;

        this._animationFrameId = requestAnimationFrame(this._loop.bind(this));

        const elapsed = timestamp - this._lastFrameTime;

        if (elapsed >= this._frameIntervalMs) {
            this._lastFrameTime = timestamp - (elapsed % this._frameIntervalMs);
            this._drawLoopCallback(); // Вызываем нашу основную функцию отрисовки
        }
    },

    start() {
        if (this._isActive || !this._drawLoopCallback) return;
        this._isActive = true;
        this._lastFrameTime = performance.now();
        this._animationFrameId = requestAnimationFrame(this._loop.bind(this));
        console.log("[FpsManager] Loop started.");
    },

    stop() {
        if (!this._isActive) return;
        this._isActive = false;
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
        console.log("[FpsManager] Loop stopped.");
    }
}; 