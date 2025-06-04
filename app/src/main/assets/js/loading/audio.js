// Файл: app/src/main/assets/js/loading/audio.js
// Управляет звуками и музыкой на экране загрузки (с обработкой ошибок загрузки и логами)

const loadingAudio = {
    sfxPlayers: null,
    musicPlayer: null,
    isLoadedPromise: null,
    isInitialized: false,
    contextStarted: false,
    loadAttempted: false,

    init(audioUrls) {
        if (this.loadAttempted) {
            console.warn("LoadingAudio: Init already attempted.");
            return this.isLoadedPromise || Promise.resolve(false);
        }
        console.log("LoadingAudio: Initializing and attempting to load audio...");
        this.loadAttempted = true;

        if (typeof Tone === 'undefined' || !Tone.Players || !Tone.Player) {
            console.error("LoadingAudio: Tone.js or required components not available!");
            this.isInitialized = false;
            this.isLoadedPromise = Promise.resolve(false);
            return this.isLoadedPromise;
        }

        const sfxUrls = {
            stars_warp: audioUrls.stars_warp,
            logo_reveal: audioUrls.logo_reveal,
            transition_burst: audioUrls.transition_burst
        };
        const musicUrl = audioUrls.idle_loop;

        this.isLoadedPromise = new Promise(async (resolve) => {
            let sfxSuccess = false;
            let musicSuccess = false;

            try {
                this.sfxPlayers = new Tone.Players(sfxUrls).toDestination();
                await Promise.race([
                    Tone.loaded(),
                    new Promise(res => setTimeout(res, 5000))
                ]);
                sfxSuccess = Object.keys(sfxUrls).every(key => this.sfxPlayers.has(key) && this.sfxPlayers.player(key)?.loaded);
                if (sfxSuccess) {
                    console.log("LoadingAudio: SFX loaded successfully.");
                } else {
                    console.warn("LoadingAudio: Failed to load some or all SFX.");
                    Object.keys(sfxUrls).forEach(key => {
                        if (!this.sfxPlayers.has(key) || !this.sfxPlayers.player(key)?.loaded) {
                            console.warn(` - SFX '${key}' failed to load or player missing.`);
                        }
                    });
                }

                if (musicUrl) {
                    this.musicPlayer = new Tone.Player(musicUrl).toDestination();
                    this.musicPlayer.loop = true;
                    this.musicPlayer.fadeIn = 0.5;
                    this.musicPlayer.fadeOut = 0.5;
                    await Promise.race([
                        new Promise(res => { if(this.musicPlayer) this.musicPlayer.buffer.onload = res; else res(); }), // Проверка на null
                        new Promise(res => setTimeout(res, 5000))
                    ]);
                    musicSuccess = this.musicPlayer?.loaded ?? false; // Проверка на null
                    if (musicSuccess) {
                        console.log("LoadingAudio: Background music loaded successfully.");
                    } else {
                        console.warn("LoadingAudio: Failed to load background music.");
                    }
                } else {
                    console.log("LoadingAudio: No background music URL provided.");
                    musicSuccess = true;
                }

            } catch (error) {
                console.error("LoadingAudio: Error during player creation or loading:", error);
                sfxSuccess = false;
                musicSuccess = false;
            }

            this.isInitialized = !!(this.sfxPlayers || this.musicPlayer);
            console.log(`LoadingAudio: Initialization attempt finished. Initialized: ${this.isInitialized}, SFX Loaded: ${sfxSuccess}, Music Loaded: ${musicSuccess}`);
            resolve(this.isInitialized && (sfxSuccess || musicSuccess)); // Разрешаем true только если хоть что-то загрузилось
        });

        return this.isLoadedPromise;
    },

    playSFX(name) {
        this.ensureContextStarted();

        if (!this.isInitialized || !this.sfxPlayers) {
            console.warn(`LoadingAudio: Cannot play SFX '${name}', not initialized or sfxPlayers missing.`);
            return;
        }
        const player = this.sfxPlayers.has(name) ? this.sfxPlayers.player(name) : null;

        if (player && player.loaded) {
            try {
                console.log(`LoadingAudio: Playing SFX '${name}' (State: ${player.state})`);
                player.start(Tone.now());
            } catch (error) {
                console.error(`LoadingAudio: Error starting SFX '${name}':`, error);
            }
        } else if (player && !player.loaded) {
             console.warn(`LoadingAudio: SFX player for '${name}' exists but is not loaded.`);
        } else {
            console.warn(`LoadingAudio: SFX player for '${name}' not found.`);
        }
    },

    startMusicLoop() {
        this.ensureContextStarted();
        if (!this.isInitialized || !this.musicPlayer) {
            console.warn("LoadingAudio: Cannot start music loop, not initialized or musicPlayer missing.");
            return;
        }
        if (this.musicPlayer.loaded && this.musicPlayer.state !== 'started') {
            try {
                // --- ЛОГ ---
                console.log("LoadingAudio: Starting background music loop.");
                this.musicPlayer.start(Tone.now(), 0);
            } catch (error) {
                console.error("LoadingAudio: Error starting music loop:", error);
            }
        } else if (!this.musicPlayer.loaded) {
             console.warn("LoadingAudio: Music player not loaded yet, cannot start loop.");
        } else {
             console.log("LoadingAudio: Music loop already started or player not ready.");
        }
    },

    stopMusicLoop(fadeOutTime = 0.5) {
        if (!this.isInitialized || !this.musicPlayer || this.musicPlayer.state !== 'started') {
            // --- ЛОГ ---
            // console.log(`LoadingAudio: Music loop already stopped or not ready (State: ${this.musicPlayer?.state})`);
            return;
        }
        try {
            // --- ЛОГ ---
            console.log(`LoadingAudio: Stopping background music loop with fade out: ${fadeOutTime}s (Current state: ${this.musicPlayer.state})`);
            this.musicPlayer.volume.rampTo(-Infinity, fadeOutTime);
            this.musicPlayer.stop(Tone.now() + fadeOutTime);
            setTimeout(() => {
                if (this.musicPlayer) {
                    this.musicPlayer.volume.value = 0;
                    // --- ЛОГ ---
                    console.log(`LoadingAudio: Music player stopped (State after stop: ${this.musicPlayer.state})`);
                }
            }, (fadeOutTime + 0.1) * 1000);
        } catch (error) {
            console.error("LoadingAudio: Error stopping music loop:", error);
        }
    },

    async ensureContextStarted() {
        if (this.contextStarted || typeof Tone === 'undefined' || !Tone.context || Tone.context.state === 'running') {
            if (Tone.context && Tone.context.state === 'running') this.contextStarted = true;
            return;
        }
        if (Tone.context.state !== 'suspended') {
             return;
        }
        try {
            console.log("LoadingAudio: Attempting to start Tone.js context...");
            await Tone.start();
            if (Tone.context.state === 'running') {
                console.log("LoadingAudio: Tone.js context started successfully.");
                this.contextStarted = true;
            } else {
                 console.warn("LoadingAudio: Tone.start() completed but context state is:", Tone.context.state);
            }
        } catch (error) {
            // console.error("LoadingAudio: Failed to start Tone.js context:", error);
        }
    },

    dispose() {
        console.log("LoadingAudio: Disposing audio resources...");
        if (this.sfxPlayers) {
            try {
                this.sfxPlayers.dispose();
            } catch (e) { console.error("LoadingAudio: Error disposing sfxPlayers:", e); }
            this.sfxPlayers = null;
        }
        if (this.musicPlayer) {
            try {
                // --- ЛОГ ---
                console.log(`LoadingAudio: Disposing music player (State: ${this.musicPlayer.state})`);
                if (this.musicPlayer.state === 'started') {
                    this.musicPlayer.stop(Tone.now()); // Мгновенная остановка перед dispose
                }
                this.musicPlayer.dispose();
            } catch (e) { console.error("LoadingAudio: Error disposing musicPlayer:", e); }
            this.musicPlayer = null;
        }
        this.isInitialized = false;
        this.isLoadedPromise = null;
        this.contextStarted = false;
        this.loadAttempted = false;
        console.log("LoadingAudio: Disposed.");
    }
};