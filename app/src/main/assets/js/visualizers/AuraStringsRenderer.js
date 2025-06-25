// Файл: app/src/main/assets/js/visualizers/AuraStringsRenderer.js
// Версия 2.1 (Исправленная и стабилизированная)

class AuraStringsRenderer {
    constructor() {
        this.ctx = null;
        this.canvas = null;
        this.settings = {};
        this.themeColors = {};
        this.globalVisualizerRef = null;
        this.analyserNodeRef = null;
        this.strings = [];
        this.previousZoneCount = -1;
    }

    init(ctx, canvas, initialSettings, themeColors, globalVisualizerRef, analyserNodeRef) {
        if (!ctx || !canvas) return;
        this.ctx = ctx;
        this.canvas = canvas;
        this.settings = initialSettings || {};
        this.themeColors = themeColors || {};
        this.globalVisualizerRef = globalVisualizerRef;
        this.analyserNodeRef = analyserNodeRef; // <-- Важное исправление

        // Initialize settings-based properties
        this.nodesPerString = this.settings.nodesPerString !== undefined ? this.settings.nodesPerString : 25; // JSON has 25
        this.fadeSpeed = this.settings.fadeSpeed !== undefined ? this.settings.fadeSpeed : 0.15;
        this.stiffness = this.settings.stiffness !== undefined ? this.settings.stiffness : 0.1;
        this.damping = this.settings.damping !== undefined ? this.settings.damping : 0.92;
        this.touchAttractionForce = this.settings.touchAttractionForce !== undefined ? this.settings.touchAttractionForce : 0.8;
        this.touchRadius = this.settings.touchRadius !== undefined ? this.settings.touchRadius : 180;
        this.tiltWindForce = this.settings.tiltWindForce !== undefined ? this.settings.tiltWindForce : 0.2; // JSON has 0.2
        this.minWidthSetting = this.settings.minWidth !== undefined ? this.settings.minWidth : 1.5; // JSON has 1.5
        this.widthAgitationFactorSetting = this.settings.widthAgitationFactor !== undefined ? this.settings.widthAgitationFactor : 10;
        this.glowAgitationFactorSetting = this.settings.glowAgitationFactor !== undefined ? this.settings.glowAgitationFactor : 15;
        this.alphaBaseSetting = this.settings.alphaBase !== undefined ? this.settings.alphaBase : 0.05; // Retained for now, though might be superseded by touched/untouched
        this.alphaEnergyFactorSetting = this.settings.alphaEnergyFactor !== undefined ? this.settings.alphaEnergyFactor : 0.6;
        this.alphaAgitationFactorSetting = this.settings.alphaAgitationFactor !== undefined ? this.settings.alphaAgitationFactor : 0.3;

        this.touchedBaseAlphaSetting = this.settings.touchedBaseAlpha !== undefined ? this.settings.touchedBaseAlpha : 0.7;
        this.untouchedBaseAlphaSetting = this.settings.untouchedBaseAlpha !== undefined ? this.settings.untouchedBaseAlpha : 0.2;
        this.allowEnergyAgitationOnUntouchedSetting = this.settings.allowEnergyAgitationOnUntouched !== undefined ? this.settings.allowEnergyAgitationOnUntouched : true;


        this._initStrings();
        console.log("[AuraStringsRenderer v2] Initialized with settings.");
    }

    _initStrings() {
        if (!this.canvas || !this.globalVisualizerRef || this.globalVisualizerRef.noteColors.length === 0) return;
        this.strings = [];

        let numStrings = 9; // Default value
        if (typeof app !== 'undefined' && app.state && typeof app.state.zoneCount === 'number') {
            numStrings = app.state.zoneCount;
        }
        if (numStrings === 0) { // Fallback if zoneCount is 0
            numStrings = 1;
        }
        this.numStrings = numStrings; // Store for use in draw()

        let currentZones = [];
        if (typeof pad !== 'undefined' && pad._currentDisplayedZones && Array.isArray(pad._currentDisplayedZones)) {
            currentZones = pad._currentDisplayedZones;
        }

        if (currentZones.length > 0 && currentZones.length !== numStrings && currentZones.length < numStrings) {
            // This specific warning is for when app.state.zoneCount is higher than available detailed zones.
            // Other warnings will be inside the loop.
            console.warn(`[AuraStringsRenderer] app.state.zoneCount (${numStrings}) is greater than pad._currentDisplayedZones.length (${currentZones.length}). Some strings will use fallback positioning.`);
        } else if (currentZones.length === 0 && numStrings > 0) {
             console.log(`[AuraStringsRenderer] pad._currentDisplayedZones is empty. Using fallback positioning for all ${numStrings} strings.`);
        }

        // Use the class property initialized from settings
        const nodesPerString = this.nodesPerString;
        const padHints = this.globalVisualizerRef && Array.isArray(this.globalVisualizerRef._padHintsToDraw) ? this.globalVisualizerRef._padHintsToDraw : [];

        for (let s_idx = 0; s_idx < numStrings; s_idx++) {
            let baseXPos;
            const zoneInfo = currentZones[s_idx]; // Might be undefined if s_idx >= currentZones.length

            if (zoneInfo && typeof zoneInfo.startX === 'number' && typeof zoneInfo.endX === 'number' && this.canvas.width > 0) {
                baseXPos = (zoneInfo.startX + (zoneInfo.endX - zoneInfo.startX) / 2) * this.canvas.width;
            } else {
                baseXPos = (this.canvas.width / (numStrings || 1)) * (i + 0.5);
                // Refined warnings for different fallback scenarios
                if (!zoneInfo && i < currentZones.length) {
                    // This case means currentZones[s_idx] was undefined/null, or lacked startX/endX, but we expected it based on currentZones.length
                    console.warn(`[AuraStringsRenderer] Zone data for string ${s_idx} (index within currentZones) was invalid or incomplete. Using fallback positioning.`);
                } else if (s_idx >= currentZones.length && currentZones.length > 0) {
                    // This case means app.state.zoneCount is greater than the number of zones in pad._currentDisplayedZones,
                    // and we've looped past the end of currentZones. This was partially warned about before the loop.
                    // console.log(`[AuraStringsRenderer] No detailed zone data in pad._currentDisplayedZones for string ${s_idx} (app.state.zoneCount is ${numStrings}). Using fallback positioning.`);
                } else if (currentZones.length === 0 && numStrings > 0) {
                    // This means pad._currentDisplayedZones was empty from the start. Already warned before loop.
                    // No need for per-string warning here if already generally warned.
                }
            }

            let stringColor;
            let isUndefinedColor = false;
            let colorSourceDetails = "unknown";
            let hintColor = undefined;

            for (let h = padHints.length - 1; h >= 0; h--) {
                const hint = padHints[h];
                if (hint && typeof hint.zoneIndex === 'number' && hint.zoneIndex === s_idx && hint.color) {
                    hintColor = hint.color;
                    colorSourceDetails = `hint.color for zoneIndex ${s_idx} (hint type: ${hint.type})`;
                    break;
                }
            }

            if (hintColor) {
                stringColor = hintColor;
            } else if (zoneInfo && typeof zoneInfo.midiNote === 'number' && this.globalVisualizerRef && this.globalVisualizerRef.noteColors && this.globalVisualizerRef.noteColors.length === 12) {
                stringColor = this.globalVisualizerRef.noteColors[zoneInfo.midiNote % 12];
                colorSourceDetails = `noteColors[${zoneInfo.midiNote % 12}] for zone ${s_idx}`;
            } else {
                stringColor = 'rgba(128, 128, 128, 0.3)';
                isUndefinedColor = true;
                colorSourceDetails = `neutral fallback for string ${s_idx}`;
                // console.warn(`[AuraStringsRenderer] String ${s_idx}: No hint.color and no valid zone/MIDI note. Using neutral. ZoneInfo: ${zoneInfo ? JSON.stringify(zoneInfo) : 'N/A'}`);
            }
            // console.log(`[AuraStringsRenderer] String ${s_idx} color: ${stringColor} (Source: ${colorSourceDetails})`);

            this.strings.push({
                baseX: baseXPos,
                nodes: Array.from({ length: this.nodesPerString }, (_, j) => ({ // Ensure this.nodesPerString is used here too
                    y: (j / (this.nodesPerString - 1)) * this.canvas.height,
                    x: baseXPos,
                    vx: 0,
                })),
                color: stringColor,
                energy: 0,
                isUndefinedColor: isUndefinedColor
            });
        }
    }

    onResize() { this._initStrings(); }
    onThemeChange(themeColors) { this.themeColors = themeColors; }

    draw(audioData, activeTouchStates, deviceTilt) {
        if (!this.ctx || !this.canvas || !this.globalVisualizerRef) return;

        let currentZoneCount = 0;
        if (typeof app !== 'undefined' && app.state && typeof app.state.zoneCount === 'number') {
            currentZoneCount = app.state.zoneCount;
        }
        // If zoneCount is 0, treat it as a valid count for change detection.
        // The _initStrings method will handle defaulting to 1 if currentZoneCount is 0.

        if (currentZoneCount !== this.previousZoneCount) {
            this._initStrings(); // This will now use app.state.zoneCount
            this.previousZoneCount = currentZoneCount;
        }

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeSpeed})`; // Use this.fadeSpeed
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- ИСПРАВЛЕНИЕ ОСЕЙ (v4 - Финальная версия) ---
        // Горизонтальный ветер (X) -> от наклона ВПЕРЕД/НАЗАД (pitch)
        const windForceX = (deviceTilt.pitch / 90) * this.tiltWindForce; // Use this.tiltWindForce
        // Вертикальный ветер (Y) -> от наклона ВЛЕВО/ВПРАВО (roll)
        const windForceY = (deviceTilt.roll / 90) * this.tiltWindForce; // Use this.tiltWindForce
        // ---------------------------------------------

        const stiffness = this.stiffness; // Use this.stiffness
        const damping = this.damping;   // Use this.damping

        this.ctx.lineCap = 'round';
        this.ctx.globalCompositeOperation = 'lighter';

        const touchedStringIndices = new Set();
        if (this.numStrings > 0) { // Ensure numStrings is positive
            activeTouchStates.forEach(touch => {
                // Assuming touch.x is normalized screen coordinate [0, 1]
                if (typeof touch.x === 'number') {
                    let stringIndex = Math.floor(touch.x * this.numStrings);
                    stringIndex = Math.max(0, Math.min(this.numStrings - 1, stringIndex)); // Clamp
                    touchedStringIndices.add(stringIndex);
                }
            });
        }
        // For debugging:
        // if (touchedStringIndices.size > 0) {
        //   console.log("Touched string indices:", Array.from(touchedStringIndices));
        // }

        // Calculate dynamicBaseWidth once before the loop
        const numStringsForThickness = this.numStrings || (this.strings ? this.strings.length : 9);
        const minAllowedWidth = this.minWidthSetting; // Use this.minWidthSetting
        const baseMaxThickness = this.settings.baseMaxThickness || 50; // Assuming this.settings.baseMaxThickness or default
        const totalAllowedAggregateThickness = this.settings.totalAllowedAggregateThickness || 200; // Assuming this.settings.totalAllowedAggregateThickness or default
        let dynamicBaseWidth = totalAllowedAggregateThickness / (numStringsForThickness || 1);
        dynamicBaseWidth = Math.min(dynamicBaseWidth, baseMaxThickness);
        dynamicBaseWidth = Math.max(dynamicBaseWidth, minAllowedWidth); // Ensure it respects minAllowedWidth from settings

        this.strings.forEach((str, index) => { // Add index to the loop
            str.nodes.forEach(node => {
                let forceX = (str.baseX - node.x) * stiffness; // stiffness from class property
                forceX += windForceX;

                // Применяем вертикальный ветер к скорости
                node.vy = (node.vy || 0) + windForceY;
                node.y += node.vy;
                node.vy *= damping; // damping from class property
                // Возвращающая сила для вертикали, чтобы струны не улетали
                node.vy += ((str.nodes.indexOf(node) / (str.nodes.length - 1)) * this.canvas.height - node.y) * stiffness * 0.1; // stiffness from class property


                activeTouchStates.forEach(touch => {
                    const touchX = touch.x * this.canvas.width;
                    const touchY = (1 - touch.y) * this.canvas.height;
                    const dx = touchX - node.x;
                    const dy = touchY - node.y;
                    const dist = Math.hypot(dx, dy);
                    // Use this.touchRadius for the base radius
                    const currentTouchRadius = this.touchRadius * touch.y; // touch.y scaling seems intentional

                    if (dist < currentTouchRadius) {
                        // Use this.touchAttractionForce
                        const pullForce = (1 - dist / currentTouchRadius) * this.touchAttractionForce * touch.y;
                        forceX += dx * pullForce;
                    }
                });

                node.vx = (node.vx + forceX) * damping; // damping from class property
                node.x += node.vx;
            });

            // Отрисовка струны - Path drawing first
            this.ctx.beginPath();
            this.ctx.moveTo(str.nodes[0].x, str.nodes[0].y);

            for (let k = 1; k < str.nodes.length - 2; k++) {
                const xc = (str.nodes[k].x + str.nodes[k + 1].x) / 2;
                const yc = (str.nodes[k].y + str.nodes[k + 1].y) / 2;
                this.ctx.quadraticCurveTo(str.nodes[k].x, str.nodes[k].y, xc, yc);
            }
            this.ctx.lineTo(str.nodes[str.nodes.length - 1].x, str.nodes[str.nodes.length - 1].y);
            // End of path drawing. Now set styles and stroke.

            const agitation = str.nodes.reduce((sum, node) => sum + Math.abs(node.vx), 0) / str.nodes.length;

            let finalAlpha, finalStrokeStyle, finalShadowColor, finalShadowBlur;
            let baseActiveAlpha;

            if (str.isUndefinedColor) {
                finalAlpha = 0.3; // From its neutral color 'rgba(128,128,128,0.3)'
                finalStrokeStyle = str.color;
                finalShadowColor = 'transparent';
                finalShadowBlur = 0;
            } else {
                // This is a defined string, its alpha depends on touch
                if (touchedStringIndices.has(index)) {
                    baseActiveAlpha = this.touchedBaseAlphaSetting;
                } else {
                    baseActiveAlpha = this.untouchedBaseAlphaSetting;
                }

                let applyEnergyAgitation = true;
                if (!touchedStringIndices.has(index) && !this.allowEnergyAgitationOnUntouchedSetting) {
                    applyEnergyAgitation = false;
                }

                if (applyEnergyAgitation) {
                    finalAlpha = Math.min(1, baseActiveAlpha + str.energy * this.alphaEnergyFactorSetting + agitation * this.alphaAgitationFactorSetting);
                } else {
                    finalAlpha = Math.min(1, baseActiveAlpha);
                }

                finalStrokeStyle = this.globalVisualizerRef.getColorWithAlpha(str.color, finalAlpha);
                finalShadowColor = str.color;
                finalShadowBlur = agitation * this.glowAgitationFactorSetting;
            }

            // Use settings-derived width agitation factor
            const currentLineWidth = dynamicBaseWidth + agitation * this.widthAgitationFactorSetting;

            if (finalAlpha > 0.01) {
                this.ctx.lineWidth = Math.max(minAllowedWidth, currentLineWidth); // minAllowedWidth from class property
                this.ctx.strokeStyle = finalStrokeStyle;
                this.ctx.shadowColor = finalShadowColor;
                this.ctx.shadowBlur = finalShadowBlur;
                this.ctx.stroke();
            }
        });

        this.ctx.shadowBlur = 0;
    }

    dispose() {
        this.strings = [];
    }
}

if (typeof visualizer !== 'undefined') {
    visualizer.registerRenderer('AuraStringsRenderer', AuraStringsRenderer);
}