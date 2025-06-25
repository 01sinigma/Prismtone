// Файл: app/src/main/assets/js/visualizers/CrystalGrottoRenderer.js
// Версия включает Этапы 1, 2, 3, 4 и 5 (Продвинутые касания)

class CrystalGrottoRenderer {
    constructor() {
        this.ctx = null; this.canvas = null; this.settings = {}; this.themeColors = {};
        this.globalVisualizerRef = null; this.analyserNodeRef = null;

        this.crystals = [];
        this.accelerometerData = { x: 0, y: 0, z: 0, prevMagnitude: 0, lastX: 0, lastY: 0, lastZ: 0 };
        this.shakeEndTime = 0; this.blickAnimationOffset = 0;

        this.particles = []; this.particlePool = [];
        this.touchCores = new Map(); // Для Этапа 5

        // Новые свойства для V2
        this.phantomLights = [];
        this.lastTouchPoint = null;
        this.activeHarmonicLinks = [];
        this.lowFrequencyEnergy = 0;
        this.backgroundVibrationOffset = { x: 0, y: 0 };
        this.currentTouchedCrystal = null; // Для отслеживания заряжаемого кристалла
        this.lastTouchDownTime = 0; // Для резонансного каскада
        this.crystalsForEnergyPropagation = []; // V2: Очередь для механики передачи энергии
        this.nextWaveFrontId = 0; // V2: Для ID волн энергии


        this.configDefaults = {
            backgroundColor: "rgba(15, 15, 25, 1)",
            maxCrystalGroups: 10, maxCrystalsPerGroup: 2, minCrystalSize: 25, maxCrystalSize: 70,
            crystalBaseColors: [
                "rgba(255, 80, 80, 0.45)","rgba(255, 170, 80, 0.45)","rgba(255, 255, 80, 0.45)",
                "rgba(80, 255, 80, 0.45)","rgba(80, 200, 255, 0.45)","rgba(80, 80, 255, 0.45)",
                "rgba(220, 80, 255, 0.45)"
            ],
            crystalSideMin: 4, crystalSideMax: 7,
            crystalInitialEnergy: 0.35, crystalMaxEnergy: 1.0, crystalEnergyDecayRate: 0.0007,
            crystalGrowthSpeed: 0.02, crystalMinSizeFactor: 0.1, crystalAspectRatioVariation: 0.5,
            pulsationSpeedMin: 0.025, pulsationSpeedMax: 0.06,
            crystalLife: { // Параметры жизненного цикла
                enabled: true,
                baseLifeMs: 20000, // Среднее время жизни кристалла в мс
                lifeVariationMs: 10000, // Разброс времени жизни
                decayStartThreshold: 0.1, // Начинает затухать, когда жизнь < порога (0-1)
                decayDurationMs: 2000, // Длительность фазы затухания (уменьшение размера, альфы)
                particleSpawnOnDeath: {
                    enabled: true, count: 15, minSize: 0.5, maxSize: 1.8, minSpeed: 0.3, maxSpeed: 1.5,
                    lifeMs: 1000, type: 'crystal_fragment' // Цвет будет взят из кристалла
                }
            },
            soundReactions: { /* ... existing ... */
                enableFrequencyBands: true,
                bands: [
                    { name: "bass", minHz: 0, maxHz: 200, colorIndices: [0,5,6], energyBoost: 0.15, pulsationAmount: 1.25, brightnessBoost:0.18, activationThreshold: 0.28 },
                    { name: "mid", minHz: 201, maxHz: 1500, colorIndices: [1,2,3], energyBoost: 0.11, pulsationAmount: 1.05, brightnessBoost:0.12, activationThreshold: 0.22 },
                    { name: "high", minHz: 1501, maxHz: 8000, colorIndices: [4], energyBoost: 0.09, pulsationAmount: 0.95, brightnessBoost:0.1, activationThreshold: 0.18 }
                ],
                overallLoudnessEffect: {
                    energyThreshold: 0.6, shakeIntensity: 1.8, shakeDurationMs: 130,
                    particleSpawn: { count: 10, minSize:0.9, maxSize:2.5, minSpeed: 0.7, maxSpeed: 3.0, lifeMs: 750, color: "rgba(255,255,230,0.65)", type: 'spark' }
                },
                energyToBrightnessFactor: 0.75, minBrightnessFromEnergy: 0.18
            },
            accelerometerBlick: { /* ... existing ... */
                enabled: true, lineWidth: 1.8, lineColor: "rgba(255,255,255,0.45)",
                shadowColor: "rgba(255,255,255,0.65)", shadowBlur: 9, sensitivity: 0.045,
                segmentCount: 2, segmentLengthFactor: 0.45, animationSpeed: 0.035, alignmentThreshold: 0.35
            },
            accelerometerDust: { /* ... existing ... */
                enabled: true, shakeThreshold: 0.35,
                particleSpawn: {
                    count: 6, minSize: 0.35, maxSize: 1.4, minSpeed: 0.06, maxSpeed: 0.55,
                    lifeMs: 2600, color: "rgba(190,190,170,0.12)", type: 'dust_fall'
                }
            },
            touchReactions: { /* ... existing ... */
                coreSettings: {
                    maxEnergy: 1.0, energyGainRate: 0.025, energyDrainRate: 0.008,
                    minSize: 4, maxSizeFromEnergy: 25, auraColor: "rgba(220, 220, 255, 0.08)",
                    defaultCoreColor: "rgba(200, 200, 255, 0.7)"
                },
                releaseEffect: {
                    particleSpawn: {
                        countFactor: 18, minSpeed: 0.6, maxSpeed: 3.5, lifeMs: 650, type: 'touch_spark'
                    },
                    lightFlashRadiusFactor: 80, lightFlashDurationMs: 180
                },
                crystalCharge: { energyBoostFactor: 0.06, maxChargeEffectRadius: 20 },
                swipeTrail: {
                    enabled: true, maxLength: 25, minDistance: 6, lineWidth: 2.5, color: "rgba(200, 200, 255, 0.25)"
                },
                multiTouchLink: {
                    enabled: true, lineWidth: 1.2, color: "rgba(190, 190, 230, 0.18)",
                    pulseSpeed: 0.025, pulseAmplitude: 0.25
                }
            },
            visualPolish: { // Новая секция для полировки
                crystalAmbientGlow: { // Влияние кристаллов друг на друга
                    enabled: true,
                    influenceRadiusFactor: 2.5, // Радиус влияния = crystal.currentSize * factor
                    maxBrightnessBoost: 0.05,    // Макс. добавочная яркость соседям
                    energyThreshold: 0.5        // Только кристаллы с энергией выше этой светят на соседей
                },
                crystalGrowthAnimation: {
                    pulsateEnabled: true, // Легкая пульсация во время роста
                    pulsateSpeed: 0.1,
                    pulsateAmplitude: 0.05 // % от currentSize
                }
            },
            fadeEffectSpeed: 0.15,
            particleSystem: { /* ... existing ... */
                poolSize: 250,
                backgroundDust: { count: 70, minSize:0.3, maxSize:1.2, minSpeed:0.03, maxSpeed:0.15, baseColor:"rgba(210,210,230,0.08)", lifeMinMs:8000, lifeMaxMs:20000, type:'bg_dust'},
                particleGravity: 0.005, particleWindFactor: 0.25,
                attractionToBrightCrystals: { enabled:true, forceFactor:0.025, energyThreshold:0.55, maxDistanceFactor:7 }
            },
            // V2 Default Configs
            resonance: {
                showHarmonicLinks: true,
                linkMinWidth: 0.7,
                linkMaxWidth: 2.2,
                harmonicLinkJitter: 0.6,
                maxHarmonicLinksPerCrystal: 3,
                maxSimultaneousHarmonicLinks: 40,
                energyTransfer: {
                  show: true,
                  speed: 0.75,
                  decay: 0.96,
                  maxAffectedNeighbors: 3,
                  initialVisualEnergy: 1.0
                }
            },
            backgroundVibration: {
                enabled: true,
                lowFrequencyThreshold: 0.65,
                waveIntensity: 0.04,
                waveSpeed": 0.12
            },
            // lightEcho is part of touchReactions, so its defaults should be there.
            // Added it to touchReactions.lightEcho in a previous step's JSON, ensure it's in defaults here too.
        };
         // Ensure touchReactions.lightEcho default exists
        if (!this.configDefaults.touchReactions.lightEcho) {
            this.configDefaults.touchReactions.lightEcho = {
                enabled: true,
                trailLength: 12,
                minDistance: 12,
                initialIntensity": 0.75,
                decayRate: 0.06,
                interactionRadius": 140
            };
        }
        if (!this.configDefaults.touchReactions.chargeRate) { // from earlier JSON update
             this.configDefaults.touchReactions.chargeRate = 0.02;
        }
        if (!this.configDefaults.touchReactions.resonantCascadeHoldTime) { // from earlier JSON update
             this.configDefaults.touchReactions.resonantCascadeHoldTime = 1500;
        }

        this.config = JSON.parse(JSON.stringify(this.configDefaults)); // Deep copy
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if(!ctx || !canvas) return;
        this.ctx = ctx; this.canvas = canvas; this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef; this.analyserNodeRef = analyserNodeRef;
        this.settings = initialSettings || {};
        this._applyConfig();
        this._initParticlePool();
        this._initCrystals(); // This now calls _initializeHarmonicLinks and _cacheNearbyCrystals internally at the end
        this._initBackgroundDust();
        const deviceTilt = globalVisualizerRef?.lastDeviceTilt || {pitch:0,roll:0,alpha:0}; // Get initial tilt if available
        this.accelerometerData.lastX = deviceTilt.roll/90; this.accelerometerData.lastY = deviceTilt.pitch/90; this.accelerometerData.lastZ = (deviceTilt.alpha||0)/90;
        console.log("[CrystalGrottoRenderer] Initialized. Version 2.0 (Harmonic Resonance). Config:", this.config);
    }

    _applyConfig() {
        // Start with a deep copy of defaults
        this.config = JSON.parse(JSON.stringify(this.configDefaults));

        // Define keys that require deep merging for their sub-properties
        const deepMergeConfig = {
            soundReactions: { bands: true, overallLoudnessEffect: { particleSpawn: true } },
            particleSystem: { backgroundDust: true, attractionToBrightCrystals: true },
            accelerometerBlick: true, // Simple object, shallow merge of its properties is fine
            accelerometerDust: { particleSpawn: true },
            touchReactions: {
                coreSettings: true,
                releaseEffect: { particleSpawn: true },
                crystalCharge: true,
                swipeTrail: true,
                multiTouchLink: true,
                // V2 additions:
                lightEcho: true
            },
            visualPolish: { crystalAmbientGlow: true, crystalGrowthAnimation: true },
            // V2 additions:
            resonance: {
                energyTransfer: true
            },
            backgroundVibration: true
        };

        for (const key in this.configDefaults) {
            if (this.settings.hasOwnProperty(key)) {
                const userSetting = this.settings[key];
                const defaultConfigValue = this.configDefaults[key];

                if (typeof defaultConfigValue === 'object' && defaultConfigValue !== null && !Array.isArray(defaultConfigValue)) {
                    // This is an object, potentially needing a deep merge
                    if (deepMergeConfig[key]) {
                        this.config[key] = { ...defaultConfigValue }; // Start with default for this key
                        for (const subKey in defaultConfigValue) {
                            if (userSetting.hasOwnProperty(subKey)) {
                                const userSubSetting = userSetting[subKey];
                                const defaultSubConfigValue = defaultConfigValue[subKey];

                                // Check if this subKey itself needs a deep merge (e.g., particleSpawn)
                                if (typeof defaultSubConfigValue === 'object' && defaultSubConfigValue !== null && !Array.isArray(defaultSubConfigValue) &&
                                    deepMergeConfig[key] !== true && deepMergeConfig[key][subKey] && typeof deepMergeConfig[key][subKey] === 'object' ) {
                                     this.config[key][subKey] = { ...defaultSubConfigValue, ...userSubSetting };
                                } else if (deepMergeConfig[key] === true || (deepMergeConfig[key] && deepMergeConfig[key][subKey] === true)) {
                                    // Shallow merge for sub-properties if the parent key or subKey is marked for simple deep merge
                                     if (typeof defaultSubConfigValue === 'object' && defaultSubConfigValue !== null && !Array.isArray(defaultSubConfigValue) &&
                                         typeof userSubSetting === 'object' && userSubSetting !== null && !Array.isArray(userSubSetting)) {
                                        this.config[key][subKey] = { ...defaultSubConfigValue, ...userSubSetting };
                                    } else {
                                        this.config[key][subKey] = userSubSetting; // Direct assignment for primitives or arrays
                                    }
                                } else if (key === 'soundReactions' && subKey === 'bands' && Array.isArray(userSubSetting)) {
                                    // Special case for soundReactions.bands as it's an array of objects
                                    this.config[key][subKey] = JSON.parse(JSON.stringify(userSubSetting));
                                }
                                else {
                                    this.config[key][subKey] = userSubSetting; // Direct assignment
                                }
                            }
                        }
                    } else {
                        // Not in deepMergeConfig, but still an object, so shallow merge
                        this.config[key] = { ...defaultConfigValue, ...userSetting };
                    }
                } else {
                    // Primitive type or array, direct assignment
                    this.config[key] = userSetting;
                }
            }
        }
        // Ensure new V2 config objects exist if not in defaults (e.g., if loading an older config)
        if (!this.config.resonance) this.config.resonance = JSON.parse(JSON.stringify(this.configDefaults.resonance || { showHarmonicLinks: false, energyTransfer: {} }));
        if (!this.config.backgroundVibration) this.config.backgroundVibration = JSON.parse(JSON.stringify(this.configDefaults.backgroundVibration || { enabled: false }));
        if (!this.config.touchReactions.lightEcho) this.config.touchReactions.lightEcho = JSON.parse(JSON.stringify(this.configDefaults.touchReactions.lightEcho || { enabled: false }));
    }

    _initParticlePool() { /* ... (Этап 2) ... */
        this.particlePool = []; this.particles = [];
        for (let i = 0; i < this.config.particleSystem.poolSize; i++) {
            this.particlePool.push({ active: false, x:0,y:0,vx:0,vy:0,size:1,color:'rgba(255,255,255,0.1)',life:0,decayRate:0.01,type:'dust'});
        }
    }
    _spawnParticle(options) { /* ... (Этап 2) ... */
        const p = this.particlePool.find(particle => !particle.active);
        if (p) {
            p.active = true; p.x = options.x || 0; p.y = options.y || 0; p.vx = options.vx || 0; p.vy = options.vy || 0;
            p.size = options.size || 1; p.color = options.color || 'rgba(255,255,255,0.1)';
            p.life = options.life || 1; p.decayRate = options.decayRate || 0.01; p.type = options.type || 'dust';
            this.particles.push(p);
        }
    }
    _initBackgroundDust() { /* ... (Этап 2) ... */
        const dustConfig = this.config.particleSystem.backgroundDust;
        for (let i = 0; i < dustConfig.count; i++) {
            const lifeMs = dustConfig.lifeMinMs + Math.random() * (dustConfig.lifeMaxMs - dustConfig.lifeMinMs);
            this._spawnParticle({
                x:Math.random()*this.canvas.width, y:Math.random()*this.canvas.height,
                vx:(Math.random()-0.5)*(dustConfig.maxSpeed-dustConfig.minSpeed)+dustConfig.minSpeed*Math.sign(Math.random()-0.5),
                vy:(Math.random()-0.5)*(dustConfig.maxSpeed-dustConfig.minSpeed)+dustConfig.minSpeed*Math.sign(Math.random()-0.5),
                size:dustConfig.minSize+Math.random()*(dustConfig.maxSize-dustConfig.minSize),
                color:dustConfig.baseColor, life:1.0, decayRate:1/(lifeMs/(1000/60)), type:dustConfig.type
            });
        }
    }
    _initCrystals() {
        this.crystals = [];
        // const lifeConf = this.config.crystalLife; // lifeConf is defined but not used, can be removed if not planned for V2 life cycle
        for (let i = 0; i < this.config.maxCrystalGroups; i++) {
            const groupX = Math.random()*this.canvas.width; const groupY = Math.random()*this.canvas.height;
            const numInGroup = 1 + Math.floor(Math.random()*(this.config.maxCrystalsPerGroup-1)+1);
            const baseClr = this.config.crystalBaseColors[Math.floor(Math.random()*this.config.crystalBaseColors.length)];
            for (let j=0; j<numInGroup; j++) {
                const maxSize = this.config.minCrystalSize+Math.random()*(this.config.maxCrystalSize-this.config.minCrystalSize);
                const currentSize = maxSize*this.config.crystalMinSizeFactor; // Start small
                const aspect = 1+(Math.random()-0.5)*2*this.config.crystalAspectRatioVariation;
                this.crystals.push({
                    id:`C${Date.now()}${i}${j}${Math.random().toString(36).substring(2,5)}`, // More unique ID
                    x:groupX+(Math.random()-0.5)*maxSize, y:groupY+(Math.random()-0.5)*maxSize,
                    maxSize:maxSize, currentSize:currentSize, aspectRatio:aspect, angle:Math.random()*Math.PI*2,
                    sides:this.config.crystalSideMin+Math.floor(Math.random()*(this.config.crystalSideMax-this.config.crystalSideMin+1)),
                    baseColor:baseClr, color:baseClr,
                    energy:this.config.crystalInitialEnergy, // General energy from sound/effects
                    chargeEnergy: 0, // Energy specifically from touch charging
                    isCharged: false, // Flag for being charged by touch
                    visualEnergy: 0, // For wave propagation effect
                    harmonicLinks: [], // IDs of harmonically linked crystals
                    nearbyCrystals: [], // Cached nearby crystal IDs for energy transfer
                    state:'growing', // existing states: growing, idle, decaying, destroyed
                    pulsation:0, pulsationSpeed:this.config.pulsationSpeedMin+Math.random()*(this.config.pulsationSpeedMax-this.config.pulsationSpeedMin),
                    // life related properties from existing implementation if crystalLife is enabled
                    lifeSpan: (this.config.crystalLife && this.config.crystalLife.enabled) ? (this.config.crystalLife.baseLifeMs + (Math.random() - 0.5) * 2 * this.config.crystalLife.lifeVariationMs) : Infinity,
                    birthTime: Date.now(),
                    decayStartTime: Infinity,
                    decayEndTime: Infinity,
                    lastChargeInteractionTime: 0, // For resonant cascade logic
                    lastCascadeTime: 0 // V2: For resonant cascade cooldown
                });
            }
        }
        this._initializeHarmonicLinks(); // V2 - Call after all crystals are created
        this._cacheNearbyCrystals();   // V2 - Call after all crystals are created
    }

    _initializeHarmonicLinks() {
        if (!this.config.resonance || !this.config.resonance.showHarmonicLinks || this.crystals.length < 2) return;
        const { maxHarmonicLinksPerCrystal } = this.config.resonance;

        this.crystals.forEach(crystal => {
            const potentialLinks = this.crystals.filter(other => other.id !== crystal.id);
            potentialLinks.sort(() => 0.5 - Math.random()); // Shuffle

            for (let i = 0; i < Math.min(potentialLinks.length, maxHarmonicLinksPerCrystal); i++) {
                // Avoid duplicate links (A-B is same as B-A for drawing, but store one way for simplicity)
                // Or ensure symmetric linking if needed by specific logic later
                const targetCrystal = potentialLinks[i];
                if (!crystal.harmonicLinks.includes(targetCrystal.id)) {
                     crystal.harmonicLinks.push(targetCrystal.id);
                }
                // If symmetric linking is desired:
                // if (!targetCrystal.harmonicLinks.includes(crystal.id)) {
                //    targetCrystal.harmonicLinks.push(crystal.id);
                // }
            }
        });
    }

    _cacheNearbyCrystals() {
        if (!this.config.resonance || !this.config.resonance.energyTransfer || !this.config.resonance.energyTransfer.show || this.crystals.length < 2) return;
        const { maxAffectedNeighbors } = this.config.resonance.energyTransfer;
        const searchRadiusFactor = 5; // How far to look for neighbors, relative to crystal size. Might need adjustment.

        this.crystals.forEach(crystal => {
            const neighbors = [];
            this.crystals.forEach(other => {
                if (crystal.id === other.id) return;
                const distSq = (crystal.x - other.x)**2 + (crystal.y - other.y)**2;
                // Consider a reasonable search radius, e.g., N times average crystal size
                // For now, just sort by distance and take top N.
                neighbors.push({ id: other.id, distSq: distSq });
            });

            neighbors.sort((a,b) => a.distSq - b.distSq);
            crystal.nearbyCrystals = neighbors.slice(0, maxAffectedNeighbors).map(n => n.id);
        });
    }

    _getCrystalPoints(crystal) { /* ... (Этап 1) ... */
        const points = []; const rX = crystal.currentSize/2; const rY = crystal.currentSize/2*crystal.aspectRatio;
        for(let i=0;i<crystal.sides;i++){const a=crystal.angle+(i/crystal.sides)*Math.PI*2;points.push({x:crystal.x+Math.cos(a)*rX,y:crystal.y+Math.sin(a)*rY});}
        return points;
    }
    _adjustColorAlpha(rgbaColor, newAlpha) { /* ... (Этап 2) ... */
        if (!rgbaColor || typeof rgbaColor !== 'string') return `rgba(128,128,128,${newAlpha})`;
        const parts = rgbaColor.match(/[\d\.]+/g);
        if (parts && parts.length >= 3) { return `rgba(${parts[0]},${parts[1]},${parts[2]},${newAlpha})`;}
        return `rgba(128,128,128,${newAlpha})`;
    }
    onResize() { if(!this.canvas)return; this._initCrystals(); this._initBackgroundDust(); }
    onThemeChange(themeColors) { /* ... (Этап 1, использует this.configDefaults) ... */
        this.themeColors = themeColors;
        if(this.themeColors.background && this.configDefaults.backgroundColor!==this.themeColors.background){if(this.settings.backgroundColor===undefined)this.config.backgroundColor=this.themeColors.background;}
    }
    _getNoteFromFrequency(frequency) { /* ... (Этап 1, упрощенно) ... */
        if(frequency>250&&frequency<270)return 0; if(frequency>280&&frequency<310)return 2; return -1;
    }

    // --- Этап 5: Логика TouchCore ---
    _updateTouchCores(activeTouchStates, now) {
        const coreConf = this.config.touchReactions.coreSettings;
        const activeIds = new Set();

        activeTouchStates.forEach(touch => {
            activeIds.add(touch.id);
            let core = this.touchCores.get(touch.id);
            const touchX = touch.x * this.canvas.width;
            const touchY = (1 - touch.y) * this.canvas.height;
            let interactingCrystal = null;

            if (!core) {
                core = {
                    id: touch.id, x: touchX, y: touchY,
                    startX: touchX, startY: touchY,
                    energy: 0, startTime: now, lastTime: now,
                    isActive: true, color: coreConf.defaultCoreColor,
                    trail: []
                };
                this.touchCores.set(touch.id, core);
                this.lastTouchDownTime = now; // V2: Record time for resonant cascade
                this.lastTouchPoint = { x: touchX, y: touchY }; // V2: Init for LightEcho

                // V2: Check if touch starts on a crystal
                this.crystals.forEach(crystal => {
                    if (crystal.state === 'growing' || crystal.state === 'decaying' || crystal.state === 'destroyed') return;
                    const distToCrystal = Math.hypot(crystal.x - touchX, crystal.y - touchY);
                    if (distToCrystal < crystal.currentSize / 2) {
                        this.currentTouchedCrystal = crystal;
                        interactingCrystal = crystal;
                    }
                });

            } else {
                core.isActive = true;
                core.lastTime = now;
                if (this.config.touchReactions.swipeTrail.enabled) {
                    const lastTrailPoint = core.trail.length > 0 ? core.trail[core.trail.length - 1] : { x: core.x, y: core.y };
                    const distSinceLast = Math.hypot(touchX - lastTrailPoint.x, touchY - lastTrailPoint.y);
                    if (distSinceLast > this.config.touchReactions.swipeTrail.minDistance) {
                        core.trail.push({ x: touchX, y: touchY });
                        if (core.trail.length > this.config.touchReactions.swipeTrail.maxLength) {
                            core.trail.shift();
                        }
                    }
                }
                core.x = touchX; core.y = touchY;

                // V2: Light Echo logic
                const lightEchoConf = this.config.touchReactions.lightEcho;
                if (lightEchoConf && lightEchoConf.enabled && this.lastTouchPoint) {
                    const distSinceLastPhantom = Math.hypot(touchX - this.lastTouchPoint.x, touchY - this.lastTouchPoint.y);
                    if (distSinceLastPhantom > lightEchoConf.minDistance) {
                        const maxAgeMs = 2000; // Phantom lights live for 2 seconds
                        this.phantomLights.push({
                            x: touchX, y: touchY,
                            intensity: lightEchoConf.initialIntensity,
                            age: 0,
                            maxAge: maxAgeMs / (1000/60), // Max age in frames
                            decayRate: lightEchoConf.decayRate
                        });
                        this.lastTouchPoint = { x: touchX, y: touchY };
                        if (this.phantomLights.length > lightEchoConf.trailLength) {
                            this.phantomLights.shift();
                        }
                    }
                }


                // V2: Update which crystal is being touched if finger moves
                this.currentTouchedCrystal = null;
                this.crystals.forEach(crystal => {
                    if (crystal.state === 'growing' || crystal.state === 'decaying' || crystal.state === 'destroyed') return;
                    const distToCrystal = Math.hypot(crystal.x - touchX, crystal.y - touchY);
                    if (distToCrystal < crystal.currentSize / 2) {
                        this.currentTouchedCrystal = crystal;
                        interactingCrystal = crystal;
                    }
                });
            }

            core.energy = Math.min(coreConf.maxEnergy, core.energy + coreConf.energyGainRate);

            // V2: Crystal Charging Logic (replaces the old crystalCharge section)
            if (this.currentTouchedCrystal && this.currentTouchedCrystal.state !== 'growing' && this.currentTouchedCrystal.state !== 'decaying') {
                const chargeSettings = this.config.touchReactions; // Contains chargeRate
                this.currentTouchedCrystal.chargeEnergy = Math.min(1.0, this.currentTouchedCrystal.chargeEnergy + chargeSettings.chargeRate);
                this.currentTouchedCrystal.isCharged = true;
                this.currentTouchedCrystal.lastChargeInteractionTime = now;
                core.color = this.currentTouchedCrystal.baseColor; // Core takes on crystal color

                // V2: Resonant Cascade Check
                const cascadeConfig = this.config.touchReactions;
                if (this.currentTouchedCrystal.chargeEnergy >= 0.99 && // Fully charged
                    (now - this.lastTouchDownTime) > cascadeConfig.resonantCascadeHoldTime && // Held long enough since initial touch
                    (!this.currentTouchedCrystal.lastCascadeTime || (now - this.currentTouchedCrystal.lastCascadeTime) > (cascadeConfig.resonantCascadeHoldTime * 2)) // Cooldown for cascade
                ) {
                    this._triggerResonantCascade(this.currentTouchedCrystal);
                    this.currentTouchedCrystal.lastCascadeTime = now; // Mark time of cascade
                    this.currentTouchedCrystal.chargeEnergy = 0; // Discharge after cascade
                    this.currentTouchedCrystal.isCharged = false;
                    // Potentially reset lastTouchDownTime here if cascade should only happen once per continuous touch
                    // this.lastTouchDownTime = now; // Or a very large number to prevent re-trigger immediately
                }
            } else {
                 // If finger moved off a crystal that was being charged, reset its specific charging interaction time
                if(this.currentTouchedCrystal && this.currentTouchedCrystal.lastChargeInteractionTime !==0 && interactingCrystal !== this.currentTouchedCrystal){
                   // this.currentTouchedCrystal.lastChargeInteractionTime = 0; // Or let it be handled by general decay
                }
            }

            // Original crystal charging (aura based) - can be kept or modified
            const auraChargeConf = this.config.touchReactions.crystalCharge; // Old settings
            this.crystals.forEach(crystal => {
                if (crystal === this.currentTouchedCrystal) return; // Already handled by direct touch
                if (crystal.state === 'growing' || crystal.state === 'decaying') return;
                const dx = crystal.x - core.x;
                const dy = crystal.y - core.y;
                // Aura charging other nearby crystals (not the one directly under finger)
                if (Math.hypot(dx, dy) < (this.currentTouchedCrystal ? this.currentTouchedCrystal.currentSize / 2 : 0) + auraChargeConf.maxChargeEffectRadius + core.energy * 20) {
                    crystal.energy = Math.min(this.config.crystalMaxEnergy, crystal.energy + auraChargeConf.energyBoostFactor * core.energy * 0.5); // Reduced effect if not direct
                }
            });
        });

        this.touchCores.forEach(core => {
            if (!activeIds.has(core.id)) { // Touch was released
                if (this.currentTouchedCrystal && this.currentTouchedCrystal.isCharged) {
                    // V2: Initiate Energy Transfer (placeholder for next step)
                    console.log("Initiate energy transfer for", this.currentTouchedCrystal.id, "with chargeEnergy", this.currentTouchedCrystal.chargeEnergy);
                    if (this.config.resonance.energyTransfer.show) {
                        this._initiateEnergyTransfer(this.currentTouchedCrystal);
                    }
                    this.currentTouchedCrystal.isCharged = false;
                    this.currentTouchedCrystal.chargeEnergy = 0; // Reset charge after using it for transfer
                    this.currentTouchedCrystal = null; // Clear the currently touched crystal
                }
                this.lastTouchDownTime = 0; // Reset for resonant cascade
                this.lastTouchPoint = null; // V2: Reset for LightEcho

                if (core.energy > 0.1) { // Original release effect for core
                    const releaseConf = this.config.touchReactions.releaseEffect;
                    const particleConf = releaseConf.particleSpawn;
                    const numParticles = Math.floor(core.energy * particleConf.countFactor);
                    for (let i = 0; i < numParticles; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = particleConf.minSpeed + Math.random() * (particleConf.maxSpeed - particleConf.minSpeed);
                        this._spawnParticle({
                            x: core.x, y: core.y,
                            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                            size: particleConf.minSize + Math.random() * (particleConf.maxSize - particleConf.minSize),
                            color: this._adjustColorAlpha(core.color, 0.7 + Math.random() * 0.3), // Use core color
                            life: 1.0, decayRate: 1 / (particleConf.lifeMs / (1000/60)), type: particleConf.type
                        });
                    }
                    // TODO: Light flash effect (needs temporary object or state)
                }
                this.touchCores.delete(core.id);
            } else { // Still active, drain energy if not being "held" by continuous input (simplification)
                core.energy = Math.max(0, core.energy - coreConf.energyDrainRate);
                if(core.isActive && (now - core.lastTime > 200)) core.isActive = false; // If no move/down for a bit
            }
        });
    }


    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas) return;
        const now = Date.now();

        this._updateTouchCores(activeTouchStates, now); // Update TouchCores first
        this._processEnergyPropagationQueue(now); // V2: Process energy transfer wave
        this._updateAndDrawPhantomLights(now); // V2: Update phantom lights and their effect on crystals


        const currentX = deviceTilt.roll/90; const currentY = deviceTilt.pitch/90; const currentZ = (deviceTilt.alpha||0)/90;
        const deltaX = currentX - this.accelerometerData.lastX; const deltaY = currentY - this.accelerometerData.lastY; const deltaZ = currentZ - this.accelerometerData.lastZ;
        const accelChange = Math.sqrt(deltaX*deltaX + deltaY*deltaY + deltaZ*deltaZ);
        this.accelerometerData = { x:currentX, y:currentY, z:currentZ, lastX:currentX, lastY:currentY, lastZ:currentZ };

        this.ctx.globalCompositeOperation = 'source-over';
        const bgParts=this.config.backgroundColor.match(/[\d\.]+/g); let baseBgAlpha=1.0; if(bgParts&&bgParts.length===4)baseBgAlpha=parseFloat(bgParts[3]);
        this.ctx.fillStyle=`rgba(${bgParts?bgParts[0]:0},${bgParts?bgParts[1]:0},${bgParts?bgParts[2]:0},${this.config.fadeEffectSpeed*baseBgAlpha})`;
        this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        if(this.config.fadeEffectSpeed<1){this.ctx.globalCompositeOperation='destination-over';this.ctx.fillStyle=this.config.backgroundColor;this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);this.ctx.globalCompositeOperation='source-over';}

        let overallEnergy=0; if(audioData&&audioData.frequencyData&&audioData.frequencyData.length>0){overallEnergy=audioData.frequencyData.reduce((s,v)=>s+v,0)/audioData.frequencyData.length/255;}
        const soundConf = this.config.soundReactions;
        const nyquist=this.analyserNodeRef?this.analyserNodeRef.context.sampleRate/2:22050;
        const freqBinCount=audioData.frequencyData?audioData.frequencyData.length:0;
        const bandEnergies=soundConf.bands.map(b=>{if(!freqBinCount)return 0;const lI=Math.floor(b.minHz/(nyquist/freqBinCount));const hI=Math.min(freqBinCount-1,Math.ceil(b.maxHz/(nyquist/freqBinCount)));let sum=0;for(let k=lI;k<=hI;k++)sum+=audioData.frequencyData[k];return hI>lI?(sum/(hI-lI+1))/255:0;});

        // V2: Background Vibration Logic
        this.lowFrequencyEnergy = 0;
        const bassBand = soundConf.bands.find(b => b.name === "bass");
        if (bassBand) {
            const bassBandIndex = soundConf.bands.indexOf(bassBand);
            if (bandEnergies[bassBandIndex] !== undefined) {
                this.lowFrequencyEnergy = bandEnergies[bassBandIndex];
            }
        } else if (bandEnergies.length > 0) { // Fallback to first band if no "bass"
            this.lowFrequencyEnergy = bandEnergies[0];
        }

        const bgVibConf = this.config.backgroundVibration;
        let bgAlphaMod = 0;
        if (bgVibConf && bgVibConf.enabled && this.lowFrequencyEnergy > bgVibConf.lowFrequencyThreshold) {
            const intensity = (this.lowFrequencyEnergy - bgVibConf.lowFrequencyThreshold) * bgVibConf.waveIntensity;
            // For color/alpha modification instead of translate, as current bg is solid
            // This will make the background slightly "pulse" in alpha with bass
            bgAlphaMod = Math.sin(now * (bgVibConf.waveSpeed || 0.1)) * intensity * 0.2; // Modulate alpha by a small amount

            // If we had a textured background, offset would be calculated here:
            // this.backgroundVibrationOffset.x = Math.sin(now * (bgVibConf.waveSpeed || 0.1)) * intensity * 10; // Example pixel offset
            // this.backgroundVibrationOffset.y = Math.cos(now * (bgVibConf.waveSpeed || 0.1) * 0.7) * intensity * 10;
        } else {
            // this.backgroundVibrationOffset.x *= 0.9; // Smoothly return to 0
            // this.backgroundVibrationOffset.y *= 0.9;
        }
        // End V2 Background Vibration Logic


        // Apply background color & fade (with potential alpha modification)
        this.ctx.globalCompositeOperation = 'source-over';
        const bgParts=this.config.backgroundColor.match(/[\d\.]+/g);
        let baseBgAlpha=1.0;
        if(bgParts&&bgParts.length===4) baseBgAlpha=parseFloat(bgParts[3]);

        const finalBgAlpha = Math.max(0, Math.min(1, baseBgAlpha + bgAlphaMod)); // Apply alpha mod

        this.ctx.fillStyle=`rgba(${bgParts?bgParts[0]:0},${bgParts?bgParts[1]:0},${bgParts?bgParts[2]:0},${this.config.fadeEffectSpeed*finalBgAlpha})`;
        this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        if(this.config.fadeEffectSpeed<1){
            this.ctx.globalCompositeOperation='destination-over';
            this.ctx.fillStyle=`rgba(${bgParts?bgParts[0]:0},${bgParts?bgParts[1]:0},${bgParts?bgParts[2]:0},${finalBgAlpha})`;
            this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
            this.ctx.globalCompositeOperation='source-over';
        }


        for(let i=this.crystals.length-1;i>=0;i--){
            const c=this.crystals[i];
            if(c.state==='growing'){c.currentSize+=(c.maxSize-c.currentSize)*this.config.crystalGrowthSpeed;if(c.currentSize>=c.maxSize*0.99){c.currentSize=c.maxSize;c.state='idle';}}

            // V2: Natural decay for chargeEnergy if not actively being charged
            if (c !== this.currentTouchedCrystal || !this.touchCores.size > 0) { // If not the one being touched OR no touches at all
                if (c.chargeEnergy > 0) {
                    c.chargeEnergy = Math.max(0, c.chargeEnergy - (this.config.touchReactions.coreSettings.energyDrainRate || 0.008) * 0.5); // Slower decay for chargeEnergy
                }
                if (c.chargeEnergy === 0) {
                    c.isCharged = false; // Ensure isCharged is false if chargeEnergy depleted
                }
            }

            c.energy=Math.max(0,c.energy-this.config.crystalEnergyDecayRate); c.pulsation*=0.95;
            let currentBrightness=soundConf.minBrightnessFromEnergy+c.energy*soundConf.energyToBrightnessFactor;

            // V2: Add chargeEnergy to brightness calculation
            currentBrightness += c.chargeEnergy * 0.5; // Make charged crystals brighter

            // V2: visualEnergy decay and brightness contribution
            if (c.visualEnergy > 0) {
                currentBrightness += c.visualEnergy * 0.8; // visualEnergy makes crystal very bright
                c.visualEnergy *= (this.config.resonance.energyTransfer.decay * 0.98); // Decay visualEnergy (decay in config is for propagation, this is for fade out)
                if (c.visualEnergy < 0.01) c.visualEnergy = 0;
            }

            // V2: Add phantom light boost
            if (c.phantomLightBoost && c.phantomLightBoost > 0) {
                currentBrightness += c.phantomLightBoost * 0.6; // Adjust multiplier as needed
            }

            currentBrightness = Math.min(1.5, currentBrightness); // Cap brightness to avoid extreme blowouts


            if(soundConf.enableFrequencyBands){
                soundConf.bands.forEach((band,bandIdx)=>{
                    const cColorIdx=this.config.crystalBaseColors.indexOf(c.baseColor);
                    if(band.colorIndices.includes(cColorIdx)&&bandEnergies[bandIdx]>band.activationThreshold){
                        c.energy=Math.min(this.config.crystalMaxEnergy,c.energy+bandEnergies[bandIdx]*band.energyBoost);
                        c.pulsation=Math.max(c.pulsation,bandEnergies[bandIdx]*band.pulsationAmount);
                        currentBrightness=Math.max(currentBrightness,bandEnergies[bandIdx]*band.brightnessBoost);
                    }
                });
            }
            const loudFxConf=soundConf.overallLoudnessEffect;
            if(overallEnergy>loudFxConf.energyThreshold){c.energy=Math.min(this.config.crystalMaxEnergy,c.energy+overallEnergy*(loudFxConf.energyBoost||0.1));}
            const baseRgb=c.baseColor.match(/\d+/g).map(Number);const bAlpha=baseRgb.length>3?baseRgb[3]/255:1.0;
            const finalPulseBright=currentBrightness+c.pulsation*Math.sin(now*c.pulsationSpeed);
            c.color=`rgba(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]},${Math.min(1,Math.max(0.05,finalPulseBright*bAlpha))})`;
        }

        let shakeX=0,shakeY=0; const loudFxConf=soundConf.overallLoudnessEffect;
        if(this.shakeEndTime&&now<this.shakeEndTime){shakeX=(Math.random()-0.5)*loudFxConf.shakeIntensity;shakeY=(Math.random()-0.5)*loudFxConf.shakeIntensity;this.ctx.save();this.ctx.translate(shakeX,shakeY);}
        if(overallEnergy>loudFxConf.energyThreshold&&(!this.shakeEndTime||now>this.shakeEndTime)){
            this.shakeEndTime=now+loudFxConf.shakeDurationMs;
            const spawnConf=loudFxConf.particleSpawn;
            for(let k=0;k<spawnConf.count;k++){this._spawnParticle({
                x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-0.5)*spawnConf.maxSpeed,vy:(Math.random()-0.5)*spawnConf.maxSpeed,
                size:spawnConf.minSize+Math.random()*(spawnConf.maxSize-spawnConf.minSize),color:spawnConf.color,life:1.0,decayRate:1/(spawnConf.lifeMs/(1000/60)),type:spawnConf.type
            });}
        }

        const psConf=this.config.particleSystem; const pWindX=this.accelerometerData.x*psConf.particleWindFactor; const pWindY=this.accelerometerData.y*psConf.particleWindFactor;
        for(let i=this.particles.length-1;i>=0;i--){
            const p=this.particles[i]; if(!p.active)continue;
            p.vx+=pWindX; p.vy+=pWindY+(p.type==='dust_fall'?psConf.particleGravity*1.5:psConf.particleGravity);
            if(psConf.attractionToBrightCrystals.enabled&&p.type!=='dust_fall'){
                this.crystals.forEach(c=>{if(c.energy>psConf.attractionToBrightCrystals.energyThreshold&&c.state==='idle'){
                    const dx=c.x-p.x;const dy=c.y-p.y;const dSq=dx*dx+dy*dy;
                    if(dSq>1&&dSq<(c.currentSize*psConf.attractionToBrightCrystals.maxDistanceFactor)**2){ // Check dSq against squared factor
                        const dist=Math.sqrt(dSq);const force=psConf.attractionToBrightCrystals.forceFactor*c.energy/dist;
                        p.vx+=dx*force;p.vy+=dy*force;
                    }}});
            }
            p.x+=p.vx;p.y+=p.vy;p.life-=p.decayRate;

            // Bounce off walls slightly before disappearing
            const buffer = p.size * 2;
            if (p.x < -buffer || p.x > this.canvas.width + buffer || p.y < -buffer || p.y > this.canvas.height + buffer) {
                 p.life = 0; // Mark for removal if too far off-screen
            }

            if(p.life<=0){
                p.active=false;this.particles.splice(i,1);
                if(p.type===psConf.backgroundDust.type&&this.particles.filter(pt=>pt.type===psConf.backgroundDust.type).length<psConf.backgroundDust.count){
                    const dConf=psConf.backgroundDust;const lifeMs=dConf.lifeMinMs+Math.random()*(dConf.lifeMaxMs-dConf.lifeMinMs);
                    this._spawnParticle({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-0.5)*(dConf.maxSpeed-dConf.minSpeed)+dConf.minSpeed*Math.sign(Math.random()-0.5),vy:(Math.random()-0.5)*(dConf.maxSpeed-dConf.minSpeed)+dConf.minSpeed*Math.sign(Math.random()-0.5),size:dConf.minSize+Math.random()*(dConf.maxSize-dConf.minSize),color:dConf.baseColor,life:1.0,decayRate:1/(lifeMs/(1000/60)),type:dConf.type});
                }
            }
        }

        const dustAccelConf = this.config.accelerometerDust;
        if (dustAccelConf.enabled && accelChange > dustAccelConf.shakeThreshold) {
            const spawnConf = dustAccelConf.particleSpawn;
            for (let k = 0; k < spawnConf.count; k++) {
                this._spawnParticle({
                    x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height * 0.1,
                    vx: (Math.random() - 0.5) * spawnConf.maxSpeed, vy: Math.random() * spawnConf.maxSpeed * 0.8 + 0.2,
                    size: spawnConf.minSize + Math.random() * (spawnConf.maxSize - spawnConf.minSize),
                    color: spawnConf.color, life: 1.0, decayRate: 1 / (spawnConf.lifeMs / (1000/60)), type: spawnConf.type
                });
            }
        }

        this.ctx.globalCompositeOperation='lighter';
        this.particles.forEach(p=>{
            if(!p.active || p.life <=0) return;
            const alphaMatch=p.color.match(/[\d\.]+\)$/);
            const baseAlpha=alphaMatch?parseFloat(alphaMatch[0]):1;
            // Make dust fall particles even dimmer and more subtle
            const effectiveAlpha = p.type === 'dust_fall' ? baseAlpha * p.life * 0.3 : baseAlpha * p.life;
            this.ctx.fillStyle=this._adjustColorAlpha(p.color, effectiveAlpha);
            this.ctx.beginPath();this.ctx.arc(p.x,p.y,p.size,0,Math.PI*2);this.ctx.fill();
        });

        this.crystals.forEach(c=>{
            if(c.currentSize<1 || c.state === 'destroyed') return; // Don't draw if destroyed
            let drawSize = c.currentSize;
            let colorToDraw = c.color;

            if (c.state === 'decaying') {
                const decayProgress = 1 - (c.decayEndTime - now) / this.config.crystalLife.decayDurationMs;
                drawSize = c.currentSize * (1 - decayProgress);
                const baseRgb = c.baseColor.match(/\d+/g).map(Number);
                const baseAlpha = baseRgb.length > 3 ? baseRgb[3]/255 : 1.0;
                colorToDraw = `rgba(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]},${Math.max(0, baseAlpha * (1-decayProgress) * c.energy )})`;
                if (drawSize < 0.5) {
                    c.state = 'destroyed'; // Mark for actual removal next frame
                    return;
                }
            }
            if (drawSize < 1) return;


            const pts=this._getCrystalPoints({...c, currentSize: drawSize}); // Use drawSize for points
            if(pts.length<3)return;
            this.ctx.beginPath();this.ctx.moveTo(pts[0].x,pts[0].y);for(let k=1;k<pts.length;k++)this.ctx.lineTo(pts[k].x,pts[k].y);this.ctx.closePath();

            // Apply ambient glow from other crystals
            let finalColor = colorToDraw;
            const polishConf = this.config.visualPolish.crystalAmbientGlow;
            if (polishConf.enabled && c.state !== 'decaying') {
                let totalAmbientBoost = 0;
                this.crystals.forEach(otherC => {
                    if (c === otherC || otherC.state === 'decaying' || otherC.state === 'destroyed') return;
                    if (otherC.energy > polishConf.energyThreshold) {
                        const dx = c.x - otherC.x; const dy = c.y - otherC.y;
                        const dist = Math.hypot(dx, dy);
                        const influenceRadius = otherC.currentSize * polishConf.influenceRadiusFactor;
                        if (dist < influenceRadius) {
                            totalAmbientBoost += (1 - dist / influenceRadius) * otherC.energy * polishConf.maxBrightnessBoost;
                        }
                    }
                });
                if (totalAmbientBoost > 0) {
                    const [r,g,b,a] = finalColor.match(/\d+(\.\d+)?/g).map(Number);
                    finalColor = `rgba(${r},${g},${b},${Math.min(1, a + totalAmbientBoost)})`;
                }
            }
            this.ctx.fillStyle=finalColor;

            this.ctx.strokeStyle='rgba(255,255,255,0.03)'; // Even fainter stroke
            this.ctx.lineWidth=0.3;

            let currentShadowBlur = drawSize * 0.4 + c.energy * 30;
            // V2: Enhance shadow for the crystal being charged (Focus Light)
            if (c === this.currentTouchedCrystal && c.chargeEnergy > 0) {
                currentShadowBlur += c.chargeEnergy * 60; // Significantly larger shadow for charged crystal
                // Optionally, make the shadow color more intense or a specific "charged" color
                // finalColor could also be made brighter here based on chargeEnergy
                const [r,g,b,a] = finalColor.match(/\d+(\.\d+)?/g).map(Number);
                const chargeBoost = c.chargeEnergy * 0.5; // Boost brightness by up to 50%
                finalColor = `rgba(${Math.min(255,r+50*c.chargeEnergy)},${Math.min(255,g+50*c.chargeEnergy)},${Math.min(255,b+50*c.chargeEnergy)},${Math.min(1, a + chargeBoost)})`;
            }
            this.ctx.fillStyle=finalColor; // Re-assign in case it was changed by chargeEnergy boost
            this.ctx.shadowColor=finalColor; // Shadow from final color (possibly boosted)
            this.ctx.shadowBlur=currentShadowBlur; // Slightly increased glow

            this.ctx.fill();
            // this.ctx.stroke();
        });
        this.ctx.shadowBlur=0;

        this.ctx.globalCompositeOperation='source-over';

        const blickConf = this.config.accelerometerBlick;
        if (blickConf.enabled && (Math.abs(this.accelerometerData.x) > blickConf.sensitivity || Math.abs(this.accelerometerData.y) > blickConf.sensitivity)) {
            this.ctx.save(); this.ctx.globalCompositeOperation = 'overlay';
            this.ctx.lineWidth = blickConf.lineWidth; this.ctx.strokeStyle = blickConf.lineColor;
            this.ctx.shadowColor = blickConf.shadowColor; this.ctx.shadowBlur = blickConf.shadowBlur;
            this.blickAnimationOffset = (this.blickAnimationOffset + blickConf.animationSpeed*(Math.abs(this.accelerometerData.x)+Math.abs(this.accelerometerData.y)))%1;
            this.crystals.forEach(crystal => {
                if(crystal.currentSize<5||crystal.state==='decaying'||crystal.state==='destroyed')return;
                const points=this._getCrystalPoints(crystal); if(points.length<2)return;
                const lightSourceDir={x:-this.accelerometerData.y,y:this.accelerometerData.x}; const lightAngle=Math.atan2(lightSourceDir.y,lightSourceDir.x);
                for(let i=0;i<points.length;i++){
                    const p1=points[i];const p2=points[(i+1)%points.length];
                    const edgeDx=p2.x-p1.x;const edgeDy=p2.y-p1.y;const edgeAngle=Math.atan2(edgeDy,edgeDx);const normalAngle=edgeAngle-Math.PI/2;
                    const dotProd=Math.cos(lightAngle-normalAngle);
                    if(dotProd>blickConf.alignmentThreshold){
                        const segLen=crystal.currentSize*blickConf.segmentLengthFactor*dotProd;const numSeg=blickConf.segmentCount;
                        for(let j=0;j<numSeg;j++){
                            const tBase=(j+0.5)/numSeg;const tAnim=(tBase+this.blickAnimationOffset*dotProd*2)%1;
                            const bX=p1.x+edgeDx*tAnim;const bY=p1.y+edgeDy*tAnim;
                            this.ctx.beginPath();this.ctx.moveTo(bX-Math.cos(edgeAngle)*segLen/2,bY-Math.sin(edgeAngle)*segLen/2);this.ctx.lineTo(bX+Math.cos(edgeAngle)*segLen/2,bY+Math.sin(edgeAngle)*segLen/2);
                            this.ctx.globalAlpha=dotProd*0.7;this.ctx.stroke(); // Slightly reduced alpha for subtlety
                        }
                    }
                }
            });
            this.ctx.globalAlpha=1.0; this.ctx.restore();
        }

        // --- Этап 5: Отрисовка эффектов касания ---
        const coreConf = this.config.touchReactions.coreSettings;
        const trailConf = this.config.touchReactions.swipeTrail;
        const linkConf = this.config.touchReactions.multiTouchLink;

        this.touchCores.forEach(core => {
            // Draw aura for active cores
            if (core.isActive && core.energy > 0.05) {
                const auraSize = coreConf.minSize + core.energy * coreConf.maxSizeFromEnergy;
                this.ctx.beginPath();
                this.ctx.arc(core.x, core.y, auraSize, 0, Math.PI * 2);
                const coreColorAlpha = this._adjustColorAlpha(core.color, core.energy * 0.3 + 0.1); // More visible aura
                const grad = this.ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, auraSize);
                grad.addColorStop(0, this._adjustColorAlpha(core.color, core.energy * 0.5));
                grad.addColorStop(0.7, this._adjustColorAlpha(core.color, core.energy * 0.2));
                grad.addColorStop(1, this._adjustColorAlpha(core.color, 0));
                this.ctx.fillStyle = grad;
                this.ctx.fill();
            }
            // Draw swipe trail
            if (trailConf.enabled && core.trail.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(core.trail[0].x, core.trail[0].y);
                for (let k = 1; k < core.trail.length; k++) {
                    this.ctx.lineTo(core.trail[k].x, core.trail[k].y);
                }
                this.ctx.strokeStyle = this._adjustColorAlpha(trailConf.color, core.energy + 0.2); // Trail brightness from core energy
                this.ctx.lineWidth = trailConf.lineWidth * (0.5 + core.energy * 0.5); // Trail width from core energy
                this.ctx.stroke();
            }
        });

        // Draw links between multiple touch cores
        if (linkConf.enabled && this.touchCores.size > 1) {
            const activeCores = Array.from(this.touchCores.values()).filter(c => c.isActive);
            if (activeCores.length > 1) {
                for (let i = 0; i < activeCores.length; i++) {
                    for (let j = i + 1; j < activeCores.length; j++) {
                        const coreA = activeCores[i];
                        const coreB = activeCores[j];
                        this.ctx.beginPath();
                        this.ctx.moveTo(coreA.x, coreA.y);
                        this.ctx.lineTo(coreB.x, coreB.y);
                        const pulse = Math.sin(now * linkConf.pulseSpeed + i*j) * linkConf.pulseAmplitude * 0.5 + (1-linkConf.pulseAmplitude*0.5);
                        const linkAlpha = parseFloat(linkConf.color.match(/[\d\.]+\)$/)[0] || 0.2);
                        this.ctx.strokeStyle = this._adjustColorAlpha(linkConf.color, linkAlpha * pulse);
                        this.ctx.lineWidth = linkConf.lineWidth;
                        this.ctx.stroke();
                    }
                }
            }
        }
        // --- Конец Этапа 5 Отрисовки ---

        this._drawHarmonicLinks(now); // V2: Draw harmonic resonance lines

        if(this.shakeEndTime&&now>=this.shakeEndTime){this.ctx.restore();this.shakeEndTime=0;}
        this.ctx.shadowBlur=0; this.ctx.globalCompositeOperation='source-over';
    }

    _initiateEnergyTransfer(startCrystal) {
        if (!startCrystal || !this.config.resonance.energyTransfer.show) return;

        const transferSettings = this.config.resonance.energyTransfer;
        const initialEnergy = startCrystal.chargeEnergy * transferSettings.initialVisualEnergy; // Scale by charge
        if (initialEnergy < 0.1) return; // Don't start if too weak

        const waveId = `wave-${this.nextWaveFrontId++}`;

        startCrystal.visualEnergy = Math.max(startCrystal.visualEnergy, initialEnergy);
        // Add to a temporary processing queue for the current frame's propagation step
        // This avoids issues with modifying the main propagation queue while iterating it
        this.crystalsForEnergyPropagation.push({
            crystalId: startCrystal.id,
            energyLevel: initialEnergy,
            waveId: waveId,
            hops: 0 // Number of hops from the startCrystal
        });

        // console.log(`Energy transfer initiated from ${startCrystal.id} with energy ${initialEnergy}, wave ${waveId}`);
    }

    _processEnergyPropagationQueue(now) {
        if (!this.config.resonance.energyTransfer.show || this.crystalsForEnergyPropagation.length === 0) {
            return;
        }

        const transferSettings = this.config.resonance.energyTransfer;
        const currentProcessingQueue = [...this.crystalsForEnergyPropagation];
        this.crystalsForEnergyPropagation = []; // Clear for next frame's new initiations / next hop additions

        let newPropagations = [];

        for (const propagationData of currentProcessingQueue) {
            const sourceCrystal = this.crystals.find(c => c.id === propagationData.crystalId);
            if (!sourceCrystal || propagationData.energyLevel < 0.05) continue; // Energy too low to propagate further

            // Current crystal visual energy is already set by initiator or previous hop
            // It will naturally decay in the main crystal update loop

            // Propagate to neighbors
            const energyToPass = propagationData.energyLevel * transferSettings.decay; // Energy decays with each hop/spread
            if (energyToPass < 0.05) continue;

            sourceCrystal.nearbyCrystals.forEach(neighborId => {
                const neighborCrystal = this.crystals.find(c => c.id === neighborId);
                if (neighborCrystal) {
                    // Check if this neighbor on this wave has already been processed or is about to be processed in this same step
                    // to avoid instant re-activation or too rapid spread.
                    // A simple way is to check if its visualEnergy is already high from this wave.
                    // A more robust way would be to track (crystalId, waveId) pairs that have been queued/processed.

                    // If visualEnergy is low, it means it's likely ready to receive new energy pulse
                    if (neighborCrystal.visualEnergy < energyToPass * 0.8) { // Allow re-trigger if current energy is significantly lower
                        neighborCrystal.visualEnergy = Math.max(neighborCrystal.visualEnergy, energyToPass);

                        // Add to a temporary list for the *next* frame's propagation, scaled by speed
                        // The 'speed' parameter implies a delay or staggered activation rather than instant.
                        // A simple way to simulate speed is to delay adding to the main queue or reduce energy more sharply.
                        // For now, we'll add it to be processed in the next batch of propagations.
                        newPropagations.push({
                            crystalId: neighborCrystal.id,
                            energyLevel: energyToPass, // This will be the source energy for *its* neighbors
                            waveId: propagationData.waveId,
                            hops: propagationData.hops + 1
                        });
                    }
                }
            });
        }
        // Add all newly identified propagations for the next step
        if (newPropagations.length > 0) {
           // To implement 'speed', we could use a timeout or simply process fewer hops per frame.
           // For now, add them to be processed in the next frame.
           // A more advanced 'speed' could involve a delay before adding or a per-crystal timer.
           this.crystalsForEnergyPropagation.push(...newPropagations);
        }
    }


    dispose() {
        this.crystals = []; this.touchCores.clear(); this.particles = []; this.particlePool.forEach(p=>p.active=false);
        this.crystalsForEnergyPropagation = []; this.phantomLights = [];
        console.log("[CrystalGrottoRenderer] Disposed.");
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('CrystalGrottoRenderer', CrystalGrottoRenderer);
}

// V2: Resonant Cascade Trigger
CrystalGrottoRenderer.prototype._triggerResonantCascade = function(centerCrystal) {
    if (!centerCrystal || !this.config.touchReactions.resonantCascadeHoldTime) return; // Ensure config exists

    console.log(`Resonant Cascade triggered by ${centerCrystal.id}`);
    const cascadeSettings = this.config.touchReactions; // Contains resonantCascadeHoldTime, could add radius here
    // Use a default radius factor if not in config, or define one. Let's assume it's related to crystal size.
    const cascadeRadius = (cascadeSettings.resonantCascadeRadiusFactor || 3) * centerCrystal.maxSize;
    const cascadeEnergyBoost = this.config.resonance.energyTransfer.initialVisualEnergy || 1.0;

    centerCrystal.visualEnergy = Math.max(centerCrystal.visualEnergy, cascadeEnergyBoost); // Center crystal also pulses strongly

    this.crystals.forEach(targetCrystal => {
        if (targetCrystal.id === centerCrystal.id || targetCrystal.state === 'destroyed' || targetCrystal.state === 'decaying') {
            return;
        }

        const dist = Math.hypot(centerCrystal.x - targetCrystal.x, centerCrystal.y - targetCrystal.y);

        if (dist < cascadeRadius) {
            targetCrystal.visualEnergy = Math.max(targetCrystal.visualEnergy, cascadeEnergyBoost * (1 - dist / cascadeRadius));
            // Optionally add a small pulsation or other immediate effect
            targetCrystal.pulsation = Math.max(targetCrystal.pulsation, (cascadeEnergyBoost * (1 - dist / cascadeRadius)) * 0.5);
        }
    });

    // Optional: spawn some particles for the cascade effect from the center crystal
    const particleConf = this.config.soundReactions.overallLoudnessEffect.particleSpawn; // Reuse some particle settings
    if (particleConf) {
        for (let i = 0; i < (particleConf.count || 10) * 2; i++) { // More particles for cascade
            const angle = Math.random() * Math.PI * 2;
            const speed = (particleConf.minSpeed || 0.5) + Math.random() * ((particleConf.maxSpeed || 2.5) - (particleConf.minSpeed || 0.5));
            this._spawnParticle({
                x: centerCrystal.x, y: centerCrystal.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                size: (particleConf.minSize || 0.8) + Math.random() * ((particleConf.maxSize || 2.0) - (particleConf.minSize || 0.8)),
                color: this._adjustColorAlpha(centerCrystal.baseColor, 0.7 + Math.random() * 0.3),
                life: 1.0, decayRate: 1 / ((particleConf.lifeMs || 800) / (1000/60) * 0.7), // Shorter life for burst
                type: 'cascade_spark' // Could be a new particle type
            });
        }
    }
};

// V2: Light Echo Update Function
CrystalGrottoRenderer.prototype._updateAndDrawPhantomLights = function(now) {
    const lightEchoConf = this.config.touchReactions.lightEcho;
    if (!lightEchoConf || !lightEchoConf.enabled || this.phantomLights.length === 0) {
        // Clear any temporary boosts if effect is disabled or no lights
        this.crystals.forEach(c => c.phantomLightBoost = 0);
        return;
    }

    for (let i = this.phantomLights.length - 1; i >= 0; i--) {
        const phantom = this.phantomLights[i];
        phantom.age++;
        phantom.intensity -= phantom.decayRate; // Use the specific decay rate from config

        if (phantom.intensity <= 0 || phantom.age > phantom.maxAge) {
            this.phantomLights.splice(i, 1);
        }
    }

    // Apply effect to crystals
    this.crystals.forEach(crystal => {
        crystal.phantomLightBoost = 0; // Reset boost for this frame
        if (crystal.state === 'destroyed' || crystal.state === 'decaying') return;

        for (const phantom of this.phantomLights) {
            const dx = crystal.x - phantom.x;
            const dy = crystal.y - phantom.y;
            const dist = Math.hypot(dx, dy);

            if (dist < lightEchoConf.interactionRadius) {
                const effect = phantom.intensity * (1 - dist / lightEchoConf.interactionRadius);
                crystal.phantomLightBoost += effect;
            }
        }
        crystal.phantomLightBoost = Math.min(1.0, crystal.phantomLightBoost); // Cap the boost
    });
};


// V2: Helper for harmonic links - ensuring it's defined before use.
function simpleNoise(seed, time) {
    const x = Math.sin(seed + time) * 10000;
    return (x - Math.floor(x)) * 2 - 1; // Returns a value between -1 and 1
}


// V2: Implementation of _drawHarmonicLinks
CrystalGrottoRenderer.prototype._drawHarmonicLinks = function(now) {
    if (!this.config.resonance || !this.config.resonance.showHarmonicLinks || this.crystals.length < 2) {
        return;
    }

    this.activeHarmonicLinks = [];
    const resonanceSettings = this.config.resonance;
    const activityThreshold = 0.2; // Combined energy threshold to be considered "active" for linking

    for (const sourceCrystal of this.crystals) {
        if (sourceCrystal.state === 'destroyed' || sourceCrystal.state === 'decaying') continue;

        const sourceActivity = (sourceCrystal.energy + sourceCrystal.chargeEnergy + sourceCrystal.visualEnergy) / 3;
        if (sourceActivity < activityThreshold * 0.5) continue; // Source must have some minimum activity

        for (const targetId of sourceCrystal.harmonicLinks) {
            const targetCrystal = this.crystals.find(c => c.id === targetId);
            if (!targetCrystal || targetCrystal.state === 'destroyed' || targetCrystal.state === 'decaying') continue;

            // Avoid duplicate links (A-B and B-A) by only processing if source.id < target.id
            if (sourceCrystal.id >= targetCrystal.id) continue;

            const targetActivity = (targetCrystal.energy + targetCrystal.chargeEnergy + targetCrystal.visualEnergy) / 3;

            // Link if either both are fairly active, or one is very active and the other exists
            if (sourceActivity + targetActivity > activityThreshold) {
                this.activeHarmonicLinks.push({
                    source: sourceCrystal,
                    target: targetCrystal,
                    strength: (sourceActivity + targetActivity) / 2 // Average activity as strength
                });
            }
        }
    }

    // Sort by strength and limit count
    this.activeHarmonicLinks.sort((a, b) => b.strength - a.strength);
    const linksToDraw = this.activeHarmonicLinks.slice(0, resonanceSettings.maxSimultaneousHarmonicLinks);

    if (linksToDraw.length === 0) return;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter'; // Blend lines nicely

    for (const link of linksToDraw) {
        const { source, target, strength } = link;

        const lineWidth = resonanceSettings.linkMinWidth + strength * (resonanceSettings.linkMaxWidth - resonanceSettings.linkMinWidth);
        const alpha = Math.min(1, 0.2 + strength * 0.8); // Link opacity based on strength

        this.ctx.beginPath();
        this.ctx.moveTo(source.x, source.y);

        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.hypot(dx, dy);

        // Jitter for control points
        const jitterAmount = resonanceSettings.harmonicLinkJitter * strength * 15; // Scale jitter by strength
        const timeFactor = now * 0.001; // Slow time based animation for jitter

        // Offset control points perpendicular to the line for a curve
        // Use a combination of source/target unique properties for a stable seed for noise
        const seed1 = (source.id.charCodeAt(source.id.length-1) || 1) * (target.id.charCodeAt(target.id.length-1) || 1);

        const cp1OffsetX = simpleNoise(seed1, timeFactor) * jitterAmount;
        const cp1OffsetY = simpleNoise(seed1 * 1.1, timeFactor + 0.5) * jitterAmount;
        const cp2OffsetX = simpleNoise(seed1 * 1.2, timeFactor + 1.0) * jitterAmount;
        const cp2OffsetY = simpleNoise(seed1 * 1.3, timeFactor + 1.5) * jitterAmount;

        const ctrl1X = midX - dy * 0.2 + cp1OffsetX; // Perpendicular offset + jitter
        const ctrl1Y = midY + dx * 0.2 + cp1OffsetY;
        // For a simple straight line with jittered ends:
        // this.ctx.lineTo(target.x + cp1OffsetX, target.y + cp1OffsetY);

        this.ctx.quadraticCurveTo(ctrl1X, ctrl1Y, target.x, target.y);
        // For Bezier:
        // const ctrl2X = midX + dy * 0.1 + cp2OffsetX;
        // const ctrl2Y = midY - dx * 0.1 + cp2OffsetY;
        // this.ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, target.x, target.y);


        this.ctx.lineWidth = Math.max(0.1, lineWidth);
        this.ctx.strokeStyle = `rgba(220, 220, 255, ${alpha * 0.7})`; // Soft white/blueish lines
        this.ctx.stroke();

        // Optional: small dot at connection points or a subtle glow on the line
        if (strength > 0.5) {
             this.ctx.shadowColor = `rgba(200, 200, 255, ${alpha * 0.5})`;
             this.ctx.shadowBlur = lineWidth * 3 + strength * 5;
             this.ctx.stroke(); // Stroke again with shadow
             this.ctx.shadowBlur = 0;
        }
    }

    this.ctx.restore();
};
