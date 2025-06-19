// Utility function to cache the results of a function call.
// If the function is called again with the same arguments, the cached result is returned,
// avoiding redundant computation for expensive functions.
function memoize(fn) {
    const cache = {};
    return function(...args) {
        const key = JSON.stringify(args); // Using JSON.stringify for simplicity
        if (cache.hasOwnProperty(key)) { // More robust check
            return cache[key];
        }
        const result = fn.apply(this, args);
        cache[key] = result;
        return result;
    };
}

// Файл: assets/js/harmonicMarkerEngine.js
const harmonicMarkerEngine = {
    musicTheoryServiceRef: null,
    isInitialized: false,
    _lastDetectedChordSymbol: null, // Для отладки или отображения

    // Memoized function references
    _memoizedGetScaleNotes: null,
    _memoizedTonalChordGet: null,
    _memoizedTonalScaleGet: null,

    // Цветовая палитра для маркеров (может быть вынесена в настройки темы или Rocket Mode)
    markerColors: {
        tonic: "gold",           // Золотой (Тоника, I)
        dominant: "orangered",    // Оранжево-красный (Доминанта, V)
        subdominant: "deepskyblue", // Голубой (Субдоминанта, IV)
        secondaryDominant: "salmon", // Розово-оранжевый (Вторичная доминанта)
        modalInterchange: "darkorchid", // Фиолетовый (Модальная замена)
        nextStepGeneric: "mediumseagreen", // Зеленый (Общий следующий шаг)
        chromaticPass: "lightslategray", // Светло-серый (Хроматический проход)
        unresolved: "silver"     // Серебряный (Неопределенное направление)
    },

    init(musicTheoryServiceInstance) {
        // console.log("[HarmonicMarkerEngine] Initializing...");
        if (!musicTheoryServiceInstance || typeof musicTheoryServiceInstance.getNoteDetails !== 'function') {
            // console.error("[HarmonicMarkerEngine.init] Invalid MusicTheoryService instance provided.");
            this.isInitialized = false;
            return;
        }
        this.musicTheoryServiceRef = musicTheoryServiceInstance;
        this.isInitialized = true;

        // Initialize memoized functions
        // Memoized version of Tonal.Scale.get().notes.
        // Caches the notes of a scale to avoid recomputing them if the tonic and scaleId haven't changed.
        this._memoizedGetScaleNotes = memoize((tonicPc, scaleId) => {
            if (!Tonal || !Tonal.Scale || typeof Tonal.Scale.get !== 'function' || !tonicPc || !scaleId) {
                // console.warn('[HME._memoizedGetScaleNotes] Tonal.Scale.get not available or invalid input.');
                return [];
            }
            const scaleName = `${tonicPc} ${scaleId}`;
            const scaleData = Tonal.Scale.get(scaleName);
            return scaleData.empty ? [] : scaleData.notes;
        });

        // Memoized version of Tonal.Chord.get().
        // Caches the details of a chord to avoid redundant parsing and computation.
        this._memoizedTonalChordGet = memoize((chordSymbol) => {
            if (!Tonal || !Tonal.Chord || typeof Tonal.Chord.get !== 'function' || !chordSymbol) {
                // console.warn('[HME._memoizedTonalChordGet] Tonal.Chord.get not available or invalid input.');
                return { empty: true }; // Return Tonal.js like empty object
            }
            return Tonal.Chord.get(chordSymbol);
        });

        // Memoized version of Tonal.Scale.get().
        // Caches the full scale object (including notes, intervals, chords) to avoid re-fetching.
        this._memoizedTonalScaleGet = memoize((scaleName) => {
            if (!Tonal || !Tonal.Scale || typeof Tonal.Scale.get !== 'function' || !scaleName) {
                 // console.warn('[HME._memoizedTonalScaleGet] Tonal.Scale.get not available or invalid input.');
                return { empty: true, notes: [], intervals: [], chords: [] }; // Return Tonal.js like empty object
            }
            return Tonal.Scale.get(scaleName);
        });
        // console.log("[HarmonicMarkerEngine] Initialized successfully with memoized functions.");
    },

    // Note: This function and its subordinate suggestion methods were refactored to be synchronous
    // after optimizations (e.g., memoization of Tonal.js calls), removing previous async/await usage
    // where operations are purely computational.
    analyzeAndSuggest(activeNotes, context) {
        const { tonic, scaleId, previousChordSymbol, currentPhase, selectedMarkerStyle, subMode, displaySettings } = context;
        // console.log(`[HME.analyzeAndSuggest] Current SubMode: ${subMode}`);
        if (!this.isInitialized || !activeNotes || activeNotes.length === 0 || !context || !context.tonic || !context.scaleId) {
            // console.warn("[HarmonicMarkerEngine.analyzeAndSuggest] Not initialized or invalid input.");
            return [];
        }
        this._lastDetectedChordSymbol = null;

        const activeNotePitchClasses = activeNotes.map(note =>
            this.musicTheoryServiceRef._TonalNote.pitchClass(note.name || Tonal.Note.fromMidi(note.midiNote))
        ).filter(pc => pc);

        if (activeNotePitchClasses.length === 0) return [];

        let detectedChordSymbols = [];
        if (activeNotePitchClasses.length > 1) {
            try {
                detectedChordSymbols = Tonal.Chord.detect(activeNotePitchClasses);
            } catch (e) {
                // console.warn("[HME] Tonal.Chord.detect error:", e);
                detectedChordSymbols = [];
            }
        }

        let elementType = null;
        let currentHarmonicElement = null;
        if (activeNotes && activeNotes.length > 0) {
            if (activeNotes.length === 1) {
                elementType = 'singleNote';
                currentHarmonicElement = {
                    pc: this.musicTheoryServiceRef.noteNameToPitchClass(activeNotes[0].name),
                    midi: activeNotes[0].midiNote,
                    name: activeNotes[0].name
                };
            } else {
                // Попытка определить аккорд
                const chord = this.musicTheoryServiceRef.detectChordFromNotes(activeNotes.map(n => n.midiNote));
                if (chord && chord.symbol) {
                    elementType = 'chord';
                    currentHarmonicElement = {
                        symbol: chord.symbol,
                        tonic: chord.tonic,
                        type: chord.type,
                        notes: chord.notes
                    };
                    this._lastDetectedChordSymbol = chord.symbol;
                } else {
                    elementType = 'singleNote';
                    currentHarmonicElement = {
                        pc: this.musicTheoryServiceRef.noteNameToPitchClass(activeNotes[0].name),
                        midi: activeNotes[0].midiNote,
                        name: activeNotes[0].name
                    };
                }
            }
        }
        // console.log(`[HME] Element Type: ${elementType}, Element:`, currentHarmonicElement ? (currentHarmonicElement.symbol || currentHarmonicElement.name) : 'None');

        let suggestions = [];
        switch (subMode) {
            case 'tonalBinding':
                if (elementType === 'chord' && currentHarmonicElement) {
                    currentHarmonicElement.function = this._getChordFunction(currentHarmonicElement.symbol, tonic, scaleId);
                    suggestions = this._suggestNext_TonalBinding_Chord(currentHarmonicElement, context, selectedMarkerStyle);
                } else if (elementType === 'singleNote' && currentHarmonicElement) {
                    const noteFunction = this._getNoteFunction(currentHarmonicElement.pc, tonic, scaleId);
                    suggestions = this._suggestNext_TonalBinding_Single(currentHarmonicElement, noteFunction, context, selectedMarkerStyle);
                }
                break;
            case 'adaptiveAnalysis':
                suggestions = this._suggestNext_AdaptiveAnalysis(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle);
                break;
            case 'semiFree':
                suggestions = this._suggestNext_SemiFree(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle);
                break;
            case 'randomDirected':
                suggestions = this._suggestNext_RandomDirected(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle);
                break;
            default:
                // console.warn(`[HME] Unknown subMode: ${subMode}. Falling back to tonalBinding.`);
                if (elementType === 'chord' && currentHarmonicElement) {
                    currentHarmonicElement.function = this._getChordFunction(currentHarmonicElement.symbol, tonic, scaleId);
                    suggestions = this._suggestNext_TonalBinding_Chord(currentHarmonicElement, context, selectedMarkerStyle);
                } else if (elementType === 'singleNote' && currentHarmonicElement) {
                    const noteFunction = this._getNoteFunction(currentHarmonicElement.pc, tonic, scaleId);
                    suggestions = this._suggestNext_TonalBinding_Single(currentHarmonicElement, noteFunction, context, selectedMarkerStyle);
                }
        }

        // Фильтрация по displaySettings.inKeyOnly (для 'tonalBinding' это уже учтено)
        if (subMode === 'tonalBinding' && displaySettings?.inKeyOnly) {
            const scaleNotesForFilter = Tonal.Scale.get(`${Tonal.Note.pitchClass(tonic)} ${scaleId}`).notes;
            suggestions = suggestions.filter(sugg => {
                if (sugg.isChord && sugg.notes) {
                    return sugg.notes.every(n => scaleNotesForFilter.includes(Tonal.Note.pitchClass(n.name)));
                } else if (!sugg.isChord && sugg.noteName) {
                    return scaleNotesForFilter.includes(Tonal.Note.pitchClass(sugg.noteName));
                }
                return true;
            });
        }

        // Удаление functionLabel, если не нужно отображать
        if (displaySettings?.displayFunctionNames === 'None') {
            suggestions.forEach(s => delete s.functionLabel);
        } else if (displaySettings?.displayFunctionNames !== 'Full') {
            suggestions.forEach(s => {
                if (s.functionLabel) {
                    const match = s.functionLabel.match(/^([TSD])/);
                    s.functionLabel = match ? match[1] : s.functionLabel.substring(0,3);
                }
            });
        }

        // console.log("[HarmonicMarkerEngine.analyzeAndSuggest] Final suggestions:", JSON.parse(JSON.stringify(suggestions)));
        return suggestions;
    },

    _getChordFunction(chordSymbol, scaleTonic, scaleId) {
        if (!this.musicTheoryServiceRef.isTonalJsLoaded) return "unknown";
        try {
            // Use memoized Tonal.Chord.get
            const chordDetails = this._memoizedTonalChordGet(chordSymbol);
            if (chordDetails.empty) return "unknown";

            const rootPc = chordDetails.tonic;
            const scaleTonicPc = Tonal.Note.pitchClass(scaleTonic); // Tonal.Note.pitchClass is usually fast

            // Use memoized function for scale notes
            const scaleNotes = this._memoizedGetScaleNotes(scaleTonicPc, scaleId);

            if (!rootPc || !scaleNotes || scaleNotes.length === 0) return "unknown";

            let degreeNumber = -1;
            for(let i=0; i < scaleNotes.length; i++){
                if(Tonal.Note.simplify(scaleNotes[i]) === Tonal.Note.simplify(rootPc)){
                    degreeNumber = i + 1;
                    break;
                }
            }

            if (degreeNumber === -1) return "chromatic";

            if (scaleId.includes("major") || scaleId.includes("minor")) {
                if (degreeNumber === 1) return `T (I)`;
                if (degreeNumber === 5) return `D (V)`;
                if (degreeNumber === 4) return `S (IV)`;
                if (degreeNumber === 2) return `Sp (ii)`;
                if (degreeNumber === 6) return `Tp (vi)`;
                if (degreeNumber === 3) return (scaleId.includes("major")) ? `Dp (iii)` : `Tp (III)`;
                if (degreeNumber === 7) return (scaleId.includes("major")) ? `Leading (vii°)` : `Subtonic (VII)`;
            }
            return `Deg.${degreeNumber}`;
        } catch (e) {
            // console.warn(`[HME._getChordFunction] Error for ${chordSymbol}, ${scaleTonic} ${scaleId}:", e);
            return "unknown";
        }
         // Add a default return if no path is taken:
        return "unknown"; // Or an appropriate default
    },

    _getNoteFunction(notePitchClass, scaleTonic, scaleId) {
        if (!this.musicTheoryServiceRef.isTonalJsLoaded) return "unknown_note";
        try {
            const scaleTonicPc = Tonal.Note.pitchClass(scaleTonic);
            // Use memoized function for scale notes
            const scaleNotes = this._memoizedGetScaleNotes(scaleTonicPc, scaleId);
            if (!scaleNotes || scaleNotes.length === 0) return "unknown_note";

            const simplifiedNotePc = Tonal.Note.simplify(notePitchClass);
            const degreeIndex = scaleNotes.findIndex(scaleNotePc => Tonal.Note.simplify(scaleNotePc) === simplifiedNotePc);

            if (degreeIndex === -1) return "chromatic_note";
            const degreeNumber = degreeIndex + 1;

            if (degreeNumber === 1) return "Tonic Note (I)";
            if (degreeNumber === 5) return "Dominant Note (V)";
            if (degreeNumber === 3) return "Mediant Note (III)";
            if (degreeNumber === 4) return "Subdominant Note (IV)";
            return `Scale Degree ${degreeNumber}`;
        } catch (e) {
            // console.warn(`[HME._getNoteFunction] Error for ${notePitchClass}, ${scaleTonic} ${scaleId}:", e);
            return "unknown_note";
        }
        // Add a default return if no path is taken:
        return "unknown_note"; // Or an appropriate default
    },

    _suggestNext_TonalBinding_Chord(currentHarmonicElement, context, selectedMarkerStyle) {
        const suggestions = [];
        const tonicPc = Tonal.Note.pitchClass(context.tonic);
        // Use memoized function for scale notes
        const scaleNotes = this._memoizedGetScaleNotes(tonicPc, context.scaleId);
        const currentOctave = Tonal.Note.octave(context.tonic);

        const createSuggestion = (targetRootPc, chordTypeName, funcLabel, color) => {
            try {
                const chordSymbol = targetRootPc + chordTypeName;
                // Use memoized Tonal.Chord.get
                const chord = this._memoizedTonalChordGet(chordSymbol);
                if (!chord.empty) {
                    const targetNotes = chord.notes.map(notePc => {
                        let targetNoteFullName = notePc + currentOctave;
                        const tonicMidi = Tonal.Note.midi(context.tonic);
                        let targetMidi = Tonal.Note.midi(targetNoteFullName);
                        if (targetMidi && tonicMidi && Math.abs(targetMidi - tonicMidi) > 9) {
                            if (targetMidi > tonicMidi) targetNoteFullName = notePc + (currentOctave - 1);
                            else targetNoteFullName = notePc + (currentOctave + 1);
                            targetMidi = Tonal.Note.midi(targetNoteFullName);
                        }
                        return { name: targetNoteFullName, midiNote: targetMidi };
                    });

                    suggestions.push({
                        notes: targetNotes,
                        isChord: true,
                        functionLabel: funcLabel,
                        color: color,
                        style: selectedMarkerStyle,
                        type: 'harmonic_suggestion',
                        targetChordSymbol: chordSymbol
                    });
                }
            } catch (e) { /* console.warn(`[HME] Error creating suggestion for ${targetRootPc}${chordTypeName}:", e); */ }
        };

        if (currentHarmonicElement.function.includes("D (V)")) {
            createSuggestion(scaleNotes[0], Tonal.Scale.chord(context.scaleId, "1") || "M", "Tonic (I)", this.markerColors.tonic);
        } else if (currentHarmonicElement.function.includes("S (IV)")) {
            createSuggestion(scaleNotes[4], Tonal.Scale.chord(context.scaleId, "5") || "M", "Dominant (V)", this.markerColors.dominant);
        } else if (currentHarmonicElement.function.includes("T (I)")) {
            createSuggestion(scaleNotes[3], Tonal.Scale.chord(context.scaleId, "4") || "M", "Subdominant (IV)", this.markerColors.subdominant);
            createSuggestion(scaleNotes[4], Tonal.Scale.chord(context.scaleId, "5") || "M", "Dominant (V)", this.markerColors.dominant);
        } else {
            createSuggestion(scaleNotes[0], Tonal.Scale.chord(context.scaleId, "1") || "M", "Tonic (I)", this.markerColors.tonic);
        }
        return suggestions.slice(0, 3);
    },

    _suggestNext_TonalBinding_Single(currentHarmonicElement, noteFunction, context, selectedMarkerStyle) {
        const suggestions = [];
        const tonicPc = Tonal.Note.pitchClass(context.tonic);
        // Use memoized function for scale notes
        const scaleNotes = this._memoizedGetScaleNotes(tonicPc, context.scaleId);
        const currentNoteOctave = Tonal.Note.octave(currentHarmonicElement.name);

        const createSuggestion = (targetNotePc, funcLabel, color) => {
            try {
                const targetNoteFullName = targetNotePc + currentNoteOctave;
                const targetMidi = Tonal.Note.midi(targetNoteFullName);
                if (targetMidi !== null) {
                    suggestions.push({
                        noteName: targetNoteFullName,
                        midiNote: targetMidi,
                        isChord: false,
                        functionLabel: funcLabel,
                        color: color,
                        style: selectedMarkerStyle,
                        type: 'harmonic_suggestion'
                    });
                }
            } catch (e) { /* console.warn(`[HME] Error creating single note suggestion for ${targetNotePc}:", e); */ }
        };

        if (noteFunction.includes("Dominant Note (V)")) {
            createSuggestion(scaleNotes[0], "Tonic Note", this.markerColors.tonic);
        } else if (noteFunction.includes("Tonic Note (I)")) {
            createSuggestion(scaleNotes[4], "To Dominant", this.markerColors.dominant);
            createSuggestion(scaleNotes[3], "To Subdominant", this.markerColors.subdominant);
        } else if (noteFunction.includes("Subdominant Note (IV)")) {
            createSuggestion(scaleNotes[4], "To Dominant", this.markerColors.dominant);
        } else {
            const currentNotePc = Tonal.Note.pitchClass(currentHarmonicElement.name);
            const currentIndexInScale = scaleNotes.indexOf(currentNotePc);
            if (currentIndexInScale !== -1) {
                if (currentIndexInScale + 1 < scaleNotes.length) {
                    createSuggestion(scaleNotes[currentIndexInScale + 1], "Next Scale Tone", this.markerColors.nextStepGeneric);
                }
                if (currentIndexInScale - 1 >= 0) {
                    createSuggestion(scaleNotes[currentIndexInScale - 1], "Prev Scale Tone", this.markerColors.nextStepGeneric);
                }
            } else {
                createSuggestion(scaleNotes[0], "To Tonic (Fallback)", this.markerColors.tonic);
            }
        }
        return suggestions.slice(0, 2);
    },

    _suggestNext_AdaptiveAnalysis(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle) {
        let suggestions = [];
        const globalTonic = context.tonic;
        const globalScaleId = context.scaleId;
        if (elementType === 'chord' && currentHarmonicElement) {
            const localTonicPc = currentHarmonicElement.tonic;
            if (currentHarmonicElement.type === 'major' || currentHarmonicElement.type === 'minor') {
                const dominantOfLocal = this.musicTheoryServiceRef._TonalTransposeFn(localTonicPc, "P5");
                this._createChordSuggestion(suggestions, dominantOfLocal, "7", `V7 of ${localTonicPc}`, this.markerColors.secondaryDominant, context, selectedMarkerStyle);
                const subdominantOfLocal = this.musicTheoryServiceRef._TonalTransposeFn(localTonicPc, "P4");
                this._createChordSuggestion(suggestions, subdominantOfLocal, currentHarmonicElement.type, `IV of ${localTonicPc}`, this.markerColors.subdominant, context, selectedMarkerStyle);
            }
        }
        if (suggestions.length === 0) {
            if (elementType === 'chord' && currentHarmonicElement) {
                suggestions = this._suggestNext_TonalBinding_Chord(currentHarmonicElement, context, selectedMarkerStyle);
            } else if (elementType === 'singleNote' && currentHarmonicElement) {
                const noteFunction = this._getNoteFunction(currentHarmonicElement.pc, globalTonic, globalScaleId);
                suggestions = this._suggestNext_TonalBinding_Single(currentHarmonicElement, noteFunction, context, selectedMarkerStyle);
            }
        }
        if(activeNotes.length > 0) {
            const lastPlayedMidi = activeNotes[activeNotes.length-1].midiNote;
            this._createSingleNoteSuggestion(suggestions, lastPlayedMidi + 1, "Chromatic Up", this.markerColors.chromaticPass, context, selectedMarkerStyle);
            this._createSingleNoteSuggestion(suggestions, lastPlayedMidi - 1, "Chromatic Down", this.markerColors.chromaticPass, context, selectedMarkerStyle);
        }
        return suggestions.slice(0,3);
    },

    _suggestNext_SemiFree(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle) {
        let suggestions = [];
        if (elementType === 'chord' && currentHarmonicElement) {
            currentHarmonicElement.function = this._getChordFunction(currentHarmonicElement.symbol, context.tonic, context.scaleId);
            suggestions = this._suggestNext_TonalBinding_Chord(currentHarmonicElement, context, selectedMarkerStyle);
        } else if (elementType === 'singleNote' && currentHarmonicElement) {
            const noteFunction = this._getNoteFunction(currentHarmonicElement.pc, context.tonic, context.scaleId);
            suggestions = this._suggestNext_TonalBinding_Single(currentHarmonicElement, noteFunction, context, selectedMarkerStyle);
        }
        const tonicPc = Tonal.Note.pitchClass(context.tonic);
        if (suggestions.length < 3) {
            const IVpc = this.musicTheoryServiceRef._TonalTransposeFn(tonicPc, Tonal.Scale.get(`${tonicPc} ${context.scaleId}`).intervals[3]);
            if (IVpc) {
                const VofIVpc = this.musicTheoryServiceRef._TonalTransposeFn(IVpc, "P5");
                this._createChordSuggestion(suggestions, VofIVpc, "7", `V7/IV (to ${IVpc})`, this.markerColors.secondaryDominant, context, selectedMarkerStyle);
            }
        }
        if (suggestions.length < 3 && currentHarmonicElement && currentHarmonicElement.tonic) {
            if (currentHarmonicElement.function && currentHarmonicElement.function.includes("D (V)")) {
                const tritoneSubPc = this.musicTheoryServiceRef._TonalTransposeFn(currentHarmonicElement.tonic, "d5");
                const bII_Pc = this.musicTheoryServiceRef._TonalTransposeFn(tonicPc, "m2");
                this._createChordSuggestion(suggestions, bII_Pc, "7", `SubV7 (to ${tonicPc})`, this.markerColors.modalInterchange, context, selectedMarkerStyle);
            }
        }
        return suggestions.slice(0,3);
    },

    _suggestNext_RandomDirected(activeNotes, currentHarmonicElement, elementType, context, selectedMarkerStyle) {
        const suggestions = [];
        const tonicPc = Tonal.Note.pitchClass(context.tonic);
        // Use memoized function for scale data
        const scaleInfo = this._memoizedTonalScaleGet ? this._memoizedTonalScaleGet(`${tonicPc} ${context.scaleId}`) : Tonal.Scale.get(`${tonicPc} ${context.scaleId}`);

        if (!scaleInfo || scaleInfo.empty) return [];
        const diatonicChordNames = scaleInfo.chords;
        const potentialRoots = scaleInfo.notes;
        const numSuggestions = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < numSuggestions; i++) {
            const randomRootPc = potentialRoots[Math.floor(Math.random() * potentialRoots.length)];
            let randomChordTypeSymbol = diatonicChordNames[Math.floor(Math.random() * diatonicChordNames.length)];
            randomChordTypeSymbol = randomChordTypeSymbol.replace(/^[iv]+/i, '');
            if (randomChordTypeSymbol === "M") randomChordTypeSymbol = "maj";
            const randomColors = Object.values(this.markerColors);
            const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)];
            const randomStyles = ['GlowFromNote', 'WaveToNote', 'PulseRing', 'SparkTrail', 'ShadowDrop'];
            const randomStyle = randomStyles[Math.floor(Math.random() * randomStyles.length)];
            this._createChordSuggestion(suggestions, randomRootPc, randomChordTypeSymbol, `Try: ${randomRootPc}${randomChordTypeSymbol}`, randomColor, context, randomStyle);
        }
        return suggestions.slice(0, 3);
    },

    _createChordSuggestion(suggestionsArray, rootPc, chordTypeSymbol, funcLabel, color, context, style) {
        try {
            const chordSymbol = rootPc + chordTypeSymbol;
            // Use memoized Tonal.Chord.get
            const chord = this._memoizedTonalChordGet(chordSymbol);
            if (!chord.empty) {
                const currentOctave = Tonal.Note.octave(context.tonic) || 4;
                const targetNotes = chord.notes.map(notePc => {
                    let targetNoteFullName = notePc + currentOctave;
                    const tonicMidi = Tonal.Note.midi(context.tonic);
                    let targetMidi = Tonal.Note.midi(targetNoteFullName);
                    if (targetMidi && tonicMidi && Math.abs(targetMidi - tonicMidi) > 9 && Math.abs(targetMidi - tonicMidi) < 18) {
                        if (targetMidi > tonicMidi) targetNoteFullName = notePc + (currentOctave - 1);
                        else targetNoteFullName = notePc + (currentOctave + 1);
                        targetMidi = Tonal.Note.midi(targetNoteFullName);
                    } else if (targetMidi && tonicMidi && Math.abs(targetMidi - tonicMidi) >=18) {
                        targetNoteFullName = notePc + (currentOctave - (targetMidi > tonicMidi ? 2: -2));
                        targetMidi = Tonal.Note.midi(targetNoteFullName);
                    }
                    return { name: targetNoteFullName, midiNote: targetMidi, frequency: Tonal.Note.freq(targetNoteFullName) };
                });
                suggestionsArray.push({
                    notes: targetNotes,
                    isChord: true,
                    functionLabel: funcLabel,
                    color: color,
                    style: style,
                    type: 'harmonic_suggestion',
                    targetChordSymbol: chordSymbol
                });
            } else {
                // console.warn(`[HME._createChordSuggestion] Could not get valid chord for ${chordSymbol}`);
            }
        } catch (e) { /* console.warn(`[HME._createChordSuggestion] Error:`, e); */ }
    },

    _createSingleNoteSuggestion(suggestionsArray, targetMidi, funcLabel, color, context, style) {
        try {
            const targetNoteName = this.musicTheoryServiceRef.midiToNoteName(targetMidi);
            const targetFreq = this.musicTheoryServiceRef.midiToFrequency(targetMidi);
            if (targetNoteName && targetMidi !== null) {
                suggestionsArray.push({
                    noteName: targetNoteName,
                    midiNote: targetMidi,
                    frequency: targetFreq,
                    isChord: false,
                    functionLabel: funcLabel,
                    color: color,
                    style: style,
                    type: 'harmonic_suggestion'
                });
            }
        } catch (e) { /* console.warn(`[HME._createSingleNoteSuggestion] Error:`, e); */ }
    },

    _selectBestChord(detectedChordSymbols, activeNotePitchClasses, tonic, scaleId) {
        if (!detectedChordSymbols || detectedChordSymbols.length === 0) return null;

        const tonicPc = Tonal.Note.pitchClass(tonic);
        // Use memoized function for scale notes
        const scaleNotesPc = this._memoizedGetScaleNotes(tonicPc, scaleId);

        let bestMatch = null;
        let highestScore = -1;

        for (const symbol of detectedChordSymbols) {
            try {
                // Use memoized Tonal.Chord.get
                const chord = this._memoizedTonalChordGet(symbol);
                if (chord.empty) continue;

                let score = 0;
                if (activeNotePitchClasses.every(pc => chord.notes.includes(pc))) {
                    score += 100;
                }
                const diatonicNotesInChord = chord.notes.filter(notePc => scaleNotesPc.includes(notePc)).length;
                score += diatonicNotesInChord * 10;
                score -= chord.notes.length * 2;
                if (activeNotePitchClasses.includes(chord.tonic)) {
                    score += 20;
                }
                if (chord.tonic === tonicPc) {
                    score += 30;
                }

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = symbol;
                }
            } catch (e) { /* игнорируем ошибки парсинга */ }
        }
        // console.log(`[HME._selectBestChord] Best match: ${bestMatch} with score ${highestScore} from`, detectedChordSymbols);
        return bestMatch;
    }
}; 