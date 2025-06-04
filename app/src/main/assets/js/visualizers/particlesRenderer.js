class SchoolOfFishRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.fish = [];
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef;
        this.fish = [];
        this._initFish();
        console.log("[SchoolOfFishRenderer] Initialized with settings:", this.settings);
    }

    _getRandomColor() {
        const palette = this.settings.particleColors || [
            '#fffbe6', '#ffe0b2', '#b3e5fc', '#ffd180', '#ff8a80', '#b388ff', '#69f0ae', '#ffd54f', '#ff5252', '#40c4ff'
        ];
        return palette[Math.floor(Math.random() * palette.length)];
    }

    _applyBoidsPhysics(activeTouchStates) {
        const boids = this.fish;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const neighborDist = 60;
        const separationDist = 18;
        const maxSpeed = 8.0;
        const maxForce = 0.5;
        const alignmentWeight = 1.0;
        const cohesionWeight = 0.7;
        const separationWeight = 1.5;
        const fearWeight = 40.0;
        const fearRadius = 180;
        const killRadius = 32;
        let toRemove = new Set();
        if (!this._touchOnFishFrames) this._touchOnFishFrames = {};
        for (let i = 0; i < boids.length; i++) {
            let b = boids[i];
            let steerAlign = {x:0, y:0}, steerCohesion = {x:0, y:0}, steerSeparation = {x:0, y:0};
            let countAlign = 0, countCohesion = 0, countSeparation = 0;
            for (let j = 0; j < boids.length; j++) {
                if (i === j) continue;
                let other = boids[j];
                let dx = other.x - b.x;
                let dy = other.y - b.y;
                if (dx > width/2) dx -= width;
                if (dx < -width/2) dx += width;
                if (dy > height/2) dy -= height;
                if (dy < -height/2) dy += height;
                let dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < neighborDist) {
                    steerAlign.x += other.vx;
                    steerAlign.y += other.vy;
                    countAlign++;
                    steerCohesion.x += other.x;
                    steerCohesion.y += other.y;
                    countCohesion++;
                }
                if (dist < separationDist) {
                    steerSeparation.x -= (other.x - b.x) / (dist+0.1);
                    steerSeparation.y -= (other.y - b.y) / (dist+0.1);
                    countSeparation++;
                }
            }
            if (countAlign > 0) {
                steerAlign.x /= countAlign;
                steerAlign.y /= countAlign;
                let mag = Math.sqrt(steerAlign.x*steerAlign.x + steerAlign.y*steerAlign.y);
                if (mag > 0) {
                    steerAlign.x = (steerAlign.x / mag) * maxSpeed - b.vx;
                    steerAlign.y = (steerAlign.y / mag) * maxSpeed - b.vy;
                }
            }
            if (countCohesion > 0) {
                steerCohesion.x = (steerCohesion.x / countCohesion) - b.x;
                steerCohesion.y = (steerCohesion.y / countCohesion) - b.y;
                let mag = Math.sqrt(steerCohesion.x*steerCohesion.x + steerCohesion.y*steerCohesion.y);
                if (mag > 0) {
                    steerCohesion.x = (steerCohesion.x / mag) * maxSpeed - b.vx;
                    steerCohesion.y = (steerCohesion.y / mag) * maxSpeed - b.vy;
                }
            }
            if (countSeparation > 0) {
                steerSeparation.x /= countSeparation;
                steerSeparation.y /= countSeparation;
                let mag = Math.sqrt(steerSeparation.x*steerSeparation.x + steerSeparation.y*steerSeparation.y);
                if (mag > 0) {
                    steerSeparation.x = (steerSeparation.x / mag) * maxSpeed - b.vx;
                    steerSeparation.y = (steerSeparation.y / mag) * maxSpeed - b.vy;
                }
            }
            let ax = 0, ay = 0;
            ax += steerAlign.x * alignmentWeight;
            ay += steerAlign.y * alignmentWeight;
            ax += steerCohesion.x * cohesionWeight;
            ay += steerCohesion.y * cohesionWeight;
            ax += steerSeparation.x * separationWeight;
            ay += steerSeparation.y * separationWeight;
            let fishTouched = false;
            if (activeTouchStates && activeTouchStates.length > 0) {
                for (const touch of activeTouchStates) {
                    let tx = touch.x * width;
                    let ty = touch.y * height;
                    let dx = b.x - tx;
                    let dy = b.y - ty;
                    if (dx > width/2) dx -= width;
                    if (dx < -width/2) dx += width;
                    if (dy > height/2) dy -= height;
                    if (dy < -height/2) dy += height;
                    let dist = Math.sqrt(dx*dx + dy*dy) + 1;
                    if (dist < killRadius) {
                        fishTouched = true;
                    } else if (dist < fearRadius) {
                        b.scaredTimer = 60;
                        let vAway = maxSpeed * 1.2;
                        b.vx = (dx / dist) * vAway;
                        b.vy = (dy / dist) * vAway;
                    }
                    if (b.scaredTimer && b.scaredTimer > 0) {
                        let force = fearWeight * (1 / (dist * dist)) * 2000;
                        ax += (dx / dist) * force;
                        ay += (dy / dist) * force;
                    }
                }
            }
            if (fishTouched) {
                this._touchOnFishFrames[i] = (this._touchOnFishFrames[i] || 0) + 1;
                if (this._touchOnFishFrames[i] >= 2) {
                    toRemove.add(i);
                }
            } else {
                this._touchOnFishFrames[i] = 0;
            }
            let amag = Math.sqrt(ax*ax + ay*ay);
            if (amag > maxForce) {
                ax = (ax / amag) * maxForce;
                ay = (ay / amag) * maxForce;
            }
            b.vx += ax;
            b.vy += ay;
            let vmag = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
            if (vmag > maxSpeed) {
                b.vx = (b.vx / vmag) * maxSpeed;
                b.vy = (b.vy / vmag) * maxSpeed;
            }
        }
        if (toRemove.size > 0) {
            this.fish = this.fish.filter((_, idx) => !toRemove.has(idx));
        }
    }

    _initFish() {
        if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) return;
        this.fish = [];
        const maxFish = this.settings.count || 100;
        const minRadius = this.settings.minRadius || 1;
        const maxRadius = this.settings.maxRadius || 3;
        for (let i = 0; i < maxFish; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.2 + Math.random() * 0.5;
            this.fish.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * (maxRadius - minRadius) + minRadius,
                color: this._getRandomColor(),
                baseAlpha: Math.random() * 0.5 + 0.2
            });
        }
    }

    onThemeChange(themeColors) {
        this.themeColors = themeColors;
    }

    onSettingsChange(newSettings) {
        const oldCount = this.settings.count;
        this.settings = { ...this.settings, ...newSettings };
        if (this.settings.count !== oldCount) {
            this._initFish(); // Re-initialize if count changes
        }
    }

    draw(audioData, activeTouchStates) {
        if (!this.ctx || !this.canvas || this.fish.length === 0) return;
        this._applyBoidsPhysics(activeTouchStates);
        for (let p of this.fish) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.scaredTimer && p.scaredTimer > 0) {
                let bounced = false;
                if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); bounced = true; }
                if (p.x > this.canvas.width) { p.x = this.canvas.width; p.vx = -Math.abs(p.vx); bounced = true; }
                if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); bounced = true; }
                if (p.y > this.canvas.height) { p.y = this.canvas.height; p.vy = -Math.abs(p.vy); bounced = true; }
                if (bounced) {
                    const angle = Math.atan2(p.vy, p.vx);
                    const delta = (Math.random() - 0.5) * (Math.PI / 4);
                    const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
                    const newAngle = angle + delta;
                    p.vx = Math.cos(newAngle) * speed;
                    p.vy = Math.sin(newAngle) * speed;
                    const cx = this.canvas.width / 2;
                    const cy = this.canvas.height / 2;
                    const dx = cx - p.x;
                    const dy = cy - p.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) + 1;
                    p.vx += (dx / dist) * 1.5;
                    p.vy += (dy / dist) * 1.5;
                }
            } else {
                if (p.x < 0) p.x += this.canvas.width;
                if (p.x > this.canvas.width) p.x -= this.canvas.width;
                if (p.y < 0) p.y += this.canvas.height;
                if (p.y > this.canvas.height) p.y -= this.canvas.height;
            }
            if (p.scaredTimer && p.scaredTimer > 0) p.scaredTimer--;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let p of this.fish) {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            const angle = Math.atan2(p.vy, p.vx);
            this.ctx.rotate(angle);
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, p.radius * 1.5, p.radius * 0.7, 0, 0, Math.PI * 2);
            const alpha = Math.min(1, p.baseAlpha);
            this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, alpha);
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 8;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            this.ctx.restore();
        }
    }
    dispose() {
        this.fish = [];
        this.ctx = null;
        this.canvas = null;
        this.analyserNodeRef = null;
        console.log("[SchoolOfFishRenderer] Disposed.");
    }
}

// Self-registration
if (typeof visualizer !== 'undefined' && typeof visualizer.registerRenderer === 'function') {
    visualizer.registerRenderer('SchoolOfFishRenderer', SchoolOfFishRenderer);
} else {
    window.SchoolOfFishRenderer = SchoolOfFishRenderer;
    console.warn('[SchoolOfFishRenderer] Registered globally as visualizer object was not available at load time.');
}