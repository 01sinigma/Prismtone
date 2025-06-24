 // Файл: app/src/main/assets/js/visualizers/EventHorizonRenderer.js
 // Версия 2.1 (Исправленная и стабилизированная)

 class EventHorizonRenderer {
     constructor() {
         this.ctx = null;
         this.canvas = null;
         this.settings = {};
         this.themeColors = {};
         this.globalVisualizerRef = null;

         this.stars = [];
         this.particles = [];
         this.particlePool = [];

         this.blackHole = { x: 0, y: 0, radius: 40 };
     }

     init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef) {
         if (!ctx || !canvas) return;
         this.ctx = ctx;
         this.canvas = canvas;
         this.settings = initialSettings || {};
         this.themeColors = themeColors || {};
         this.globalVisualizerRef = globalVisualizerRef;

         this.particles = [];
         this.particlePool = Array.from({ length: this.settings.maxMatter || 300 }, () => ({ active: false }));

         this.onResize();
         console.log("[EventHorizonRenderer v2] Initialized.");
     }

     onResize() {
         if (!this.canvas) return;
         this.blackHole.x = this.canvas.width / 2;
         this.blackHole.y = this.canvas.height / 2;
         this._initStars();
     }

     onThemeChange(themeColors) { this.themeColors = themeColors; }

     _initStars() {
         if (!this.canvas || this.canvas.width === 0) return;
         this.stars = [];
         for (let i = 0; i < (this.settings.starCount || 200); i++) {
             this.stars.push({
                 x: Math.random() * this.canvas.width,
                 y: Math.random() * this.canvas.height,
                 size: 0.5 + Math.random() * 1.5,
                 opacity: 0.2 + Math.random() * 0.5
             });
         }
     }

     _createParticle(touch) {
         const p = this.particlePool.find(p => !p.active);
         if (!p || !this.canvas || !this.globalVisualizerRef) return null;

         const color = this.globalVisualizerRef.noteColors[touch.noteInfo.midiNote % 12] || this.themeColors.primary;

         p.active = true;
         p.x = touch.x * this.canvas.width;
         p.y = (1 - touch.y) * this.canvas.height;
         p.vx = (Math.random() - 0.5) * 4;
         p.vy = (Math.random() - 0.5) * 4;
         p.life = 1.0;
         p.size = (this.settings.minMatterSize || 2) + touch.y * (this.settings.matterSizeYFactor || 10);
         p.color = color;

         return p;
     }

     draw(audioData, activeTouchStates, deviceTilt) {
         if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

         this.ctx.globalCompositeOperation = 'source-over';
         this.ctx.fillStyle = `rgba(0, 0, 10, ${this.settings.fadeSpeed || 0.25})`;
         this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

         activeTouchStates.forEach(touch => {
             if (this.particles.length < (this.settings.maxMatter || 300)) {
                 const newMatter = this._createParticle(touch);
                 if (newMatter) this.particles.push(newMatter);
             }
         });

        // >>> НАЧАЛО НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ (for star parallax) <<<
        let tiltX = 0; // Used for star parallax
        let tiltY = 0; // Used for star parallax

        const defaultTiltStrength = this.settings.tiltParallax !== undefined ? this.settings.tiltParallax : 20;
        // Original: tiltX from roll, tiltY from pitch. This matches new standard.
        const tiltSettings = this.settings.tiltPhysics || {
            enabled: true,
            strength: defaultTiltStrength,
            invertPitch: false,
            invertRoll: false
        };

        if (tiltSettings.enabled && deviceTilt) {
            const pitchFactor = tiltSettings.invertPitch ? -1 : 1;
            const rollFactor = tiltSettings.invertRoll ? -1 : 1;

            // Original used roll/50 and pitch/50. New standard is roll/90, pitch/90.
            // The 'strength' from tiltPhysics will be used directly.
            // If settings.tiltParallax was, for example, 20, and it was intended to mean "multiply roll/50 by 20",
            // the new strength in tiltPhysics should be adjusted if direct multiplication of roll/90 is desired to have the same magnitude.
            // E.g., old_effect = (roll/50) * S. new_effect = (roll/90) * S'.
            // If S' = S, new_effect is (50/90) * old_effect.
            // To keep magnitude: S' = S * 90/50 = S * 1.8.
            // For now, we assume tiltPhysics.strength is already correctly set.
            tiltX = (deviceTilt.roll / 90) * tiltSettings.strength * rollFactor;
            tiltY = (deviceTilt.pitch / 90) * tiltSettings.strength * pitchFactor;
        }
        // >>> КОНЕЦ НОВОГО УНИВЕРСАЛЬНОГО БЛОКА ГРАВИТАЦИИ <<<

        this.stars.forEach(star => {
             this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
             this.ctx.beginPath();
             this.ctx.arc(star.x + tiltX, star.y + tiltY, star.size, 0, Math.PI * 2);
             this.ctx.fill();
         });

         this.ctx.globalCompositeOperation = 'lighter';
         for (let i = this.particles.length - 1; i >= 0; i--) {
             const p = this.particles[i];

             const dx = this.blackHole.x - p.x;
             const dy = this.blackHole.y - p.y;
             const distSq = dx * dx + dy * dy;

             if (distSq < this.blackHole.radius * this.blackHole.radius) {
                 p.active = false;
                 this.particlePool.push(p);
                 this.particles.splice(i, 1);
                 continue;
             }

             const dist = Math.sqrt(distSq);
             const force = (this.settings.gravity || 1000) / (distSq + 1000);

             p.vx = (p.vx * 0.98) + ((dx / dist) * force);
             p.vy = (p.vy * 0.98) + ((dy / dist) * force);
             p.x += p.vx;
             p.y += p.vy;

             this.ctx.fillStyle = this.globalVisualizerRef.getColorWithAlpha(p.color, 0.8);
             this.ctx.beginPath();
             this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
             this.ctx.fill();
         }

         this.ctx.globalCompositeOperation = 'destination-out';
         this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';
         this.ctx.beginPath();
         this.ctx.arc(this.blackHole.x, this.blackHole.y, this.blackHole.radius, 0, Math.PI*2);
         this.ctx.fill();

         this.ctx.globalCompositeOperation = 'lighter';
         const glowRadius = this.blackHole.radius + (this.settings.horizonGlowSize || 15);
         const grad = this.ctx.createRadialGradient(this.blackHole.x, this.blackHole.y, this.blackHole.radius, this.blackHole.x, this.blackHole.y, glowRadius);
         grad.addColorStop(0, this.globalVisualizerRef.getColorWithAlpha(this.themeColors.accent || '#FF4081', 0.8));
         grad.addColorStop(1, 'rgba(0,0,0,0)');

         this.ctx.strokeStyle = grad;
         this.ctx.lineWidth = this.settings.horizonGlowSize || 15;
         this.ctx.stroke();
     }

     dispose() {
         this.particles = [];
         this.particlePool.forEach(p => p.active = false);
     }
 }

 if (typeof visualizer !== 'undefined') {
     visualizer.registerRenderer('EventHorizonRenderer', EventHorizonRenderer);
 }