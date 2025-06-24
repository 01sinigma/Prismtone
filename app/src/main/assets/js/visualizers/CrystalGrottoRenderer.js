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
            }
        };
        this.config = JSON.parse(JSON.stringify(this.configDefaults)); // Deep copy
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if(!ctx || !canvas) return;
        this.ctx = ctx; this.canvas = canvas; this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef; this.analyserNodeRef = analyserNodeRef;
        this.settings = initialSettings || {};
        this._applyConfig(); this._initParticlePool(); this._initCrystals(); this._initBackgroundDust();
        const deviceTilt = globalVisualizerRef?.lastDeviceTilt || {beta:0,gamma:0,alpha:0}; // Get initial tilt if available
        this.accelerometerData.lastX = deviceTilt.gamma/90; this.accelerometerData.lastY = deviceTilt.beta/90; this.accelerometerData.lastZ = (deviceTilt.alpha||0)/90;
        console.log("[CrystalGrottoRenderer] Initialized. Version 1.5 (Touch Effects). Config:", this.config);
    }

    _applyConfig() { /* ... (robust merge logic from previous steps) ... */
        this.config = JSON.parse(JSON.stringify(this.configDefaults));
        for (const key in this.configDefaults) {
            if (this.settings.hasOwnProperty(key)) {
                if (typeof this.configDefaults[key] === 'object' && !Array.isArray(this.configDefaults[key]) && this.configDefaults[key] !== null) {
                    this.config[key] = { ...this.configDefaults[key], ...this.settings[key] };
                    const deepMergeKeys = ['soundReactions', 'particleSystem', 'accelerometerBlick', 'accelerometerDust', 'touchReactions'];
                    if (deepMergeKeys.includes(key) && this.settings[key]) {
                        for (const subKey in this.configDefaults[key]) {
                            if (this.settings[key].hasOwnProperty(subKey)) {
                                if (typeof this.configDefaults[key][subKey] === 'object' && !Array.isArray(this.configDefaults[key][subKey]) && this.configDefaults[key][subKey] !== null &&
                                    this.settings[key][subKey] && typeof this.settings[key][subKey] === 'object') {
                                    this.config[key][subKey] = { ...this.configDefaults[key][subKey], ...this.settings[key][subKey] };
                                    // Specific deeper merges if necessary (e.g., particleSpawn objects)
                                     const particleSpawnKeys = ['overallLoudnessEffect', 'accelerometerDust', 'releaseEffect'];
                                    if(particleSpawnKeys.some(psk => psk === subKey && this.settings[key][subKey]?.particleSpawn)){
                                        this.config[key][subKey].particleSpawn = {...this.configDefaults[key][subKey].particleSpawn, ...this.settings[key][subKey].particleSpawn};
                                    } else if (key === 'soundReactions' && subKey === 'bands' && Array.isArray(this.settings[key][subKey])) {
                                       this.config[key][subKey] = JSON.parse(JSON.stringify(this.settings[key][subKey]));
                                    }

                                } else { this.config[key][subKey] = this.settings[key][subKey]; }
                            }
                        }
                    }
                } else { this.config[key] = this.settings[key]; }
            }
        }
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
        const lifeConf = this.config.crystalLife;
        for (let i = 0; i < this.config.maxCrystalGroups; i++) {
            const groupX = Math.random()*this.canvas.width; const groupY = Math.random()*this.canvas.height;
            const numInGroup = 1 + Math.floor(Math.random()*(this.config.maxCrystalsPerGroup-1)+1);
            const baseClr = this.config.crystalBaseColors[Math.floor(Math.random()*this.config.crystalBaseColors.length)];
            for (let j=0; j<numInGroup; j++) {
                const maxSize = this.config.minCrystalSize+Math.random()*(this.config.maxCrystalSize-this.config.minCrystalSize);
                const currentSize = maxSize*this.config.crystalMinSizeFactor;
                const aspect = 1+(Math.random()-0.5)*2*this.config.crystalAspectRatioVariation;
                this.crystals.push({
                    id:`C${Date.now()}${i}${j}`, x:groupX+(Math.random()-0.5)*maxSize, y:groupY+(Math.random()-0.5)*maxSize,
                    maxSize:maxSize, currentSize:currentSize, aspectRatio:aspect, angle:Math.random()*Math.PI*2,
                    sides:this.config.crystalSideMin+Math.floor(Math.random()*(this.config.crystalSideMax-this.config.crystalSideMin+1)),
                    baseColor:baseClr, color:baseClr, energy:this.config.crystalInitialEnergy, life:this.config.crystalLifeSpan, state:'growing',
                    pulsation:0, pulsationSpeed:this.config.pulsationSpeedMin+Math.random()*(this.config.pulsationSpeedMax-this.config.pulsationSpeedMin)
                });
            }
        }
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

            if (!core) {
                core = {
                    id: touch.id, x: touchX, y: touchY,
                    startX: touchX, startY: touchY, // For swipe detection later
                    energy: 0, startTime: now, lastTime: now,
                    isActive: true, color: coreConf.defaultCoreColor,
                    trail: [] // For swipe trail
                };
                this.touchCores.set(touch.id, core);
            } else {
                core.isActive = true;
                core.lastTime = now;
                // Update position and trail for swipe
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
            }

            core.energy = Math.min(coreConf.maxEnergy, core.energy + coreConf.energyGainRate);

            // Crystal charging
            const chargeConf = this.config.touchReactions.crystalCharge;
            this.crystals.forEach(crystal => {
                if (crystal.state === 'growing' || crystal.state === 'decaying') return;
                const dx = crystal.x - core.x;
                const dy = crystal.y - core.y;
                if (Math.hypot(dx, dy) < crystal.currentSize / 2 + chargeConf.maxChargeEffectRadius) {
                    crystal.energy = Math.min(this.config.crystalMaxEnergy, crystal.energy + chargeConf.energyBoostFactor * core.energy);
                    core.color = crystal.baseColor; // Core takes on crystal color when charging it
                }
            });
        });

        this.touchCores.forEach(core => {
            if (!activeIds.has(core.id)) { // Touch was released
                if (core.energy > 0.1) { // Only trigger effect if core had some energy
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

        const currentX = deviceTilt.gamma/90; const currentY = deviceTilt.beta/90; const currentZ = (deviceTilt.alpha||0)/90;
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

        for(let i=this.crystals.length-1;i>=0;i--){
            const c=this.crystals[i];
            if(c.state==='growing'){c.currentSize+=(c.maxSize-c.currentSize)*this.config.crystalGrowthSpeed;if(c.currentSize>=c.maxSize*0.99){c.currentSize=c.maxSize;c.state='idle';}}
            c.energy=Math.max(0,c.energy-this.config.crystalEnergyDecayRate); c.pulsation*=0.95;
            let currentBrightness=soundConf.minBrightnessFromEnergy+c.energy*soundConf.energyToBrightnessFactor;
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
            this.ctx.shadowColor=finalColor; // Shadow from final color
            this.ctx.shadowBlur=drawSize*0.4 + c.energy*30; // Slightly increased glow
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


        if(this.shakeEndTime&&now>=this.shakeEndTime){this.ctx.restore();this.shakeEndTime=0;}
        this.ctx.shadowBlur=0; this.ctx.globalCompositeOperation='source-over';
    }

    dispose() {
        this.crystals = []; this.touchCores.clear(); this.particles = []; this.particlePool.forEach(p=>p.active=false);
        console.log("[CrystalGrottoRenderer] Disposed.");
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('CrystalGrottoRenderer', CrystalGrottoRenderer);
}
