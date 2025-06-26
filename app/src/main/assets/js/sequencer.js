const sequencer = {
    part: null,
    notes: new Map(), // Хранит { "time:note": eventId }
    isSetup: false,

    init() {
        if (this.isSetup) return;
        // Создаем Part. Коллбэк будет вызывать synth.js для проигрывания нот
        this.part = new Tone.Part((time, value) => {
            // value = { note, duration, freq, velocity }
            console.log(`[Sequencer] Playing note: ${value.note} at time ${time}`);
            // synth.startNote(value.freq, value.velocity, 0.8, `seq_${value.note}`); // Y-pos можно зафиксировать
            // Запланировать triggerRelease чуть раньше конца длительности ноты
            // synth.triggerRelease(`seq_${value.note}`, time + Tone.Time(value.duration).toSeconds() * 0.95);

            // Используем существующий synth API, предполагая, что он может обработать параметры напрямую
            // или что synth.playKey/startNote может быть адаптирован.
            // Для простоты пока оставляем комментарий, как в плане, но в реальной интеграции
            // нужно будет убедиться, что synth.js может корректно обработать эти вызовы.
            // Например, если synth.startNote ожидает y-координату, а здесь ее нет,
            // то нужно либо передать дефолтное значение, либо адаптировать synth.js.
            // Пока что используем synth.playKey как наиболее вероятный кандидат, если он есть,
            // или предполагаем, что synth.startNote может быть вызван без Y-координаты.

            if (typeof synth !== 'undefined' && synth.startNote) {
                 // Предполагаем, что synth.startNote может принять noteName, velocity, и опционально duration
                 // и сам рассчитает частоту. Если нет, то используем value.freq.
                 // Также, нужно передать уникальный идентификатор для возможности остановки этой конкретной ноты.
                 const noteId = `seq_${value.note}_${Date.now()}`; // Более уникальный ID
                 synth.startNote(value.note, value.velocity, undefined, noteId, time, value.duration);

                // Планируем остановку ноты. Tone.Part вызывает коллбэк в момент начала ноты.
                // Нам нужно запланировать ее окончание.
                const releaseTime = time + Tone.Time(value.duration).toSeconds();
                Tone.Transport.scheduleOnce(() => {
                    if (synth && synth.stopNote) {
                        synth.stopNote(noteId);
                    } else if (synth && synth.triggerRelease) { // Fallback
                        synth.triggerRelease(noteId);
                    }
                }, releaseTime);

            } else {
                console.warn("[Sequencer] synth.startNote is not available. Note playback skipped.");
            }

        }, []).start(0);

        this.part.loop = true;
        this.part.loopStart = 0;
        this.part.loopEnd = '1m'; // По умолчанию луп в 1 такт

        Tone.Transport.on('start', () => this.onTransportStart());
        Tone.Transport.on('stop', () => this.onTransportStop());
        // Следим за изменением темпа, чтобы обновлять loopEnd, если он задан в тактах
        Tone.Transport.on('bpm', bpm => {
            // Если loopEnd задан в терминах тактов (например, '1m', '2m'),
            // его длительность в секундах изменится. Tone.js должен это обрабатывать автоматически.
            // Но если мы делаем расчеты на основе loopEnd в секундах, их нужно будет обновить.
            console.log(`[Sequencer] BPM changed to: ${bpm}. Loop end is: ${this.part.loopEnd}`);
        });


        this.isSetup = true;
        console.log("[Sequencer] Initialized with Tone.Part.");
    },

    toggleNote(note, time, duration = '16n', velocity = 0.9) {
        if (!this.isSetup) {
            console.warn("[Sequencer] Sequencer not initialized. Call init() first.");
            return;
        }
        const key = `${time}:${note}`;
        if (this.notes.has(key)) {
            // Нота уже есть, удаляем ее
            const eventId = this.notes.get(key);
            this.part.remove(eventId);
            this.notes.delete(key);
            console.log(`[Sequencer] Note removed at ${time} for ${note} (Event ID: ${eventId})`);
        } else {
            // Ноты нет, добавляем
            // const freq = Tone.Frequency(note).toFrequency(); // Частота будет определяться в synth.js или уже есть в note объекте, если это MIDI note number
            const eventValue = { note, duration, velocity /* freq */ }; // freq убрали, т.к. synth должен сам ее находить по имени ноты
            const eventId = this.part.add(time, eventValue); // Передаем время и объект значения
            this.notes.set(key, eventId);
            console.log(`[Sequencer] Note added at ${time} for ${note} (Event ID: ${eventId}). Value:`, eventValue);
        }
    },

    onTransportStart() {
        console.log("[Sequencer] Transport started. Updating playhead.");
        // Здесь будет логика обновления курсора (playhead)
        // Например, запуск requestAnimationFrame для синхронизации UI с Tone.Transport.progress
        if (typeof visualizer !== 'undefined' && visualizer.startPlayhead) {
            visualizer.startPlayhead();
        }
    },

    onTransportStop() {
        console.log("[Sequencer] Transport stopped.");
        // Остановить все ноты синтезатора, которые были запущены секвенсором
        if (typeof synth !== 'undefined' && synth.stopAllNotes) {
            // TODO: Нужен более гранулярный способ остановки только нот секвенсора,
            // если stopAllNotes слишком агрессивен. Пока что оставляем так.
            // Возможно, synth.stopAllNotes должен принимать префикс ID, например 'seq_'.
            synth.stopAllNotes(); // Это может остановить и ноты, играемые вручную. Нужно быть осторожным.
        }
        if (typeof visualizer !== 'undefined' && visualizer.stopPlayhead) {
            visualizer.stopPlayhead();
        }
    },

    // Новые методы для управления состоянием паттерна (согласно плану Step 3.4)
    getPatternData() {
        if (!this.part) return [];
        const pattern = this.part.events.map(event => {
            return {
                time: event.time instanceof Tone.Time ? event.time.toNotation() : event.time, // Убедимся, что время в нужном формате
                note: event.value.note,
                duration: event.value.duration,
                velocity: event.value.velocity
            };
        });
        return pattern;
    },

    loadPatternData(data) {
        if (!this.part) return;

        // Очищаем текущий Part от всех событий
        this.part.clear();
        this.notes.clear();
        console.log("[Sequencer] Cleared current pattern.");

        // Загружаем новые ноты
        data.forEach(eventData => {
            // Убедимся, что время в правильном формате для Tone.Part.add
            // Tone.js гибок, но лучше явно указывать нотацию, если она приходит из JSON
            const time = typeof eventData.time === 'string' ? eventData.time : Tone.Time(eventData.time).toNotation();
            const value = {
                note: eventData.note,
                duration: eventData.duration,
                velocity: eventData.velocity
            };
            const eventId = this.part.add(time, value);
            this.notes.set(`${time}:${eventData.note}`, eventId);
        });
        console.log(`[Sequencer] Loaded ${data.length} notes into pattern.`);
    },

    clearPattern() {
        if (!this.part) return;
        this.part.clear();
        this.notes.clear();
        console.log("[Sequencer] Pattern cleared by sequencer.js.");
        // UI refresh should be handled by the caller (e.g., SequencerModeStrategy)
    },

    setLoopPoints(start, end) {
        if (!this.part) return;
        try {
            this.part.loopStart = start;
            this.part.loopEnd = end;
            console.log(`[Sequencer] Loop points set to Start: ${start}, End: ${end}`);
        } catch (e) {
            console.error("[Sequencer] Error setting loop points:", e);
        }
    },

    getLoopEnd() {
        return this.part ? this.part.loopEnd : '1m';
    },

    // Метод для установки BPM, который будет обернут UI
    setBPM(newBPM) {
        const bpmValue = parseInt(newBPM, 10);
        if (isNaN(bpmValue) || bpmValue < Tone.Transport.minBpm || bpmValue > Tone.Transport.maxBpm) {
            console.warn(`[Sequencer] Invalid BPM value: ${newBPM}. Must be between ${Tone.Transport.minBpm} and ${Tone.Transport.maxBpm}.`);
            return false;
        }
        Tone.Transport.bpm.value = bpmValue;
        console.log(`[Sequencer] BPM set to ${bpmValue}`);
        return true;
    }
};

// Для отладки в консоли браузера:
// window.sequencer = sequencer;
// sequencer.init();
// sequencer.toggleNote('C4', '0:0:0');
// sequencer.toggleNote('E4', '0:0:2');
// sequencer.toggleNote('G4', '0:1:0');
// Tone.Transport.start();
// Tone.Transport.stop();
// console.log(sequencer.getPatternData());
// sequencer.loadPatternData([{time: "0:0:0", note: "A4", duration: "8n", velocity: 0.7}]);
// sequencer.clearPattern();
// sequencer.setLoopPoints('0', '2m');
// sequencer.setBPM(140);
