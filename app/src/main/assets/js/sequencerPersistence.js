const sequencerPersistence = {

    /**
     * Handles the action of saving the current sequencer pattern.
     * Assumes PrismtoneBridge.savePattern(patternId, jsonString) is available.
     * Assumes PrismtoneBridge.showToast(message) is available for feedback.
     */
    async handleSavePattern() {
        if (typeof sequencer === 'undefined' || !sequencer.isSetup) {
            console.warn("[SequencerPersistence] Sequencer not ready.");
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast("Sequencer not ready to save pattern.");
            }
            return;
        }

        const patternData = sequencer.getPatternData();
        if (!patternData || patternData.length === 0) {
            console.info("[SequencerPersistence] Pattern is empty. Nothing to save.");
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast("Pattern is empty. Add some notes to save.");
            }
            return;
        }

        // In a real scenario, prompt user for a name or use a file picker.
        // For this conceptual step, let's generate a name.
        const patternName = `pattern_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, -4)}`; // e.g., pattern_20231027T123055
        const patternId = patternName; // For now, name is ID. Could be sanitized further.

        try {
            const jsonString = JSON.stringify(patternData);
            console.log(`[SequencerPersistence] Saving pattern "${patternId}". Data:`, jsonString);

            // Simulate bridge call
            if (window.PrismtoneBridge && PrismtoneBridge.savePattern) {
                const success = await PrismtoneBridge.savePattern(patternId, jsonString);
                if (success) {
                    console.log(`[SequencerPersistence] Pattern "${patternId}" saved successfully via Bridge.`);
                    PrismtoneBridge.showToast(`Pattern "${patternName}" saved!`);
                } else {
                    console.error(`[SequencerPersistence] Bridge reported failure saving pattern "${patternId}".`);
                    PrismtoneBridge.showToast(`Failed to save pattern "${patternName}".`);
                }
            } else {
                console.warn("[SequencerPersistence] PrismtoneBridge.savePattern not available. Simulating save.");
                // localStorage.setItem(`sequencer_pattern_${patternId}`, jsonString); // Example local fallback
                alert(`Simulated Save: Pattern "${patternName}" would be saved with data:\n${jsonString.substring(0,100)}...`);
            }
        } catch (error) {
            console.error(`[SequencerPersistence] Error saving pattern "${patternId}":`, error);
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast("Error saving pattern.");
            }
        }
    },

    /**
     * Handles fetching the list of available patterns and (conceptually) displaying them.
     * Assumes PrismtoneBridge.listPatterns() is available.
     * Assumes a UI mechanism (e.g., a popover/modal) to show patterns and select one.
     */
    async handleLoadPatternList() {
        if (typeof sequencer === 'undefined' || !sequencer.isSetup) {
            console.warn("[SequencerPersistence] Sequencer not ready.");
             if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast("Sequencer not ready to load patterns.");
            }
            return;
        }

        console.log("[SequencerPersistence] Requesting pattern list...");
        try {
            let patternIds = [];
            if (window.PrismtoneBridge && PrismtoneBridge.listPatterns) {
                const idsJsonString = await PrismtoneBridge.listPatterns(); // Returns JSON string array
                patternIds = JSON.parse(idsJsonString || "[]");
                console.log("[SequencerPersistence] Received pattern IDs from Bridge:", patternIds);
            } else {
                console.warn("[SequencerPersistence] PrismtoneBridge.listPatterns not available. Simulating list.");
                // Example local fallback:
                // for (let i = 0; i < localStorage.length; i++) {
                //     const key = localStorage.key(i);
                //     if (key.startsWith("sequencer_pattern_")) {
                //         patternIds.push(key.replace("sequencer_pattern_", ""));
                //     }
                // }
                // For simulation:
                patternIds = ["sim_pattern_alpha", "sim_pattern_beta", "pattern_20231027T123055"];
                alert(`Simulated Load: Available patterns:\n- ${patternIds.join("\n- ")}\n\n(Click OK to try loading first one)`);
            }

            if (patternIds && patternIds.length > 0) {
                // Conceptual: Display these IDs to the user.
                // For now, let's just try to load the first one as a test.
                // In a real app, a UI element would call handleLoadSpecificPattern with the chosen ID.
                console.log("[SequencerPersistence] Available patterns:", patternIds);
                // Example: automatically try to load the first pattern for demonstration
                if (confirm(`Load pattern "${patternIds[0]}"?`)) {
                     this.handleLoadSpecificPattern(patternIds[0]);
                }
            } else {
                console.info("[SequencerPersistence] No patterns available to load.");
                if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                    PrismtoneBridge.showToast("No saved patterns found.");
                } else {
                    alert("No saved patterns found (simulation).");
                }
            }
        } catch (error) {
            console.error("[SequencerPersistence] Error listing patterns:", error);
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast("Error listing patterns.");
            }
        }
    },

    /**
     * Handles loading a specific pattern by its ID.
     * Assumes PrismtoneBridge.loadPattern(patternId) is available.
     * @param {string} patternId - The ID of the pattern to load.
     */
    async handleLoadSpecificPattern(patternId) {
        if (!patternId) {
            console.warn("[SequencerPersistence] No patternId provided to load.");
            return;
        }
        if (typeof sequencer === 'undefined' || !sequencer.isSetup) {
            console.warn("[SequencerPersistence] Sequencer not ready.");
            return;
        }

        console.log(`[SequencerPersistence] Loading pattern: "${patternId}"`);
        try {
            let jsonDataString = null;
            if (window.PrismtoneBridge && PrismtoneBridge.loadPattern) {
                jsonDataString = await PrismtoneBridge.loadPattern(patternId);
            } else {
                console.warn(`[SequencerPersistence] PrismtoneBridge.loadPattern not available. Simulating load for "${patternId}".`);
                // jsonDataString = localStorage.getItem(`sequencer_pattern_${patternId}`); // Example local fallback
                if (patternId === "sim_pattern_alpha") {
                    jsonDataString = JSON.stringify([{time: "0:0:0", note: "C4", duration: "8n", velocity: 0.8},{time: "0:1:0", note: "E4", duration: "8n", velocity: 0.8}]);
                }
            }

            if (jsonDataString) {
                const patternData = JSON.parse(jsonDataString);
                sequencer.loadPatternData(patternData); // This clears and loads new data

                // Refresh grid if SequencerModeStrategy is active and available
                if (typeof PadModeManager !== 'undefined' && PadModeManager.getCurrentModeId() === 'SequencerMode') {
                    const strategy = PadModeManager.getCurrentStrategy();
                    if (strategy && typeof strategy.refreshGridHighlights === 'function') {
                        strategy.refreshGridHighlights();
                    }
                }
                console.log(`[SequencerPersistence] Pattern "${patternId}" loaded and applied.`);
                if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                     PrismtoneBridge.showToast(`Pattern "${patternId}" loaded.`);
                } else {
                    alert(`Pattern "${patternId}" loaded (simulation).`);
                }
            } else {
                console.error(`[SequencerPersistence] No data found for pattern "${patternId}".`);
                 if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                    PrismtoneBridge.showToast(`Could not load pattern "${patternId}".`);
                }
            }
        } catch (error) {
            console.error(`[SequencerPersistence] Error loading pattern "${patternId}":`, error);
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast(`Error loading pattern "${patternId}".`);
            }
        }
    },

    /**
     * Handles deleting a specific pattern by its ID.
     * Assumes PrismtoneBridge.deletePattern(patternId) is available.
     * @param {string} patternId - The ID of the pattern to delete.
     */
    async handleDeletePattern(patternId) {
        if (!patternId) {
            console.warn("[SequencerPersistence] No patternId provided to delete.");
            return;
        }
         if (typeof sequencer === 'undefined' || !sequencer.isSetup) { // Should not depend on sequencer state for deletion
            console.warn("[SequencerPersistence] Sequencer not ready (though not strictly required for delete bridge call).");
        }

        console.log(`[SequencerPersistence] Deleting pattern: "${patternId}"`);
        try {
            // Conceptual: Confirm with user before deleting
            // if (!confirm(`Are you sure you want to delete pattern "${patternId}"?`)) {
            //     return;
            // }

            let success = false;
            if (window.PrismtoneBridge && PrismtoneBridge.deletePattern) {
                success = await PrismtoneBridge.deletePattern(patternId);
            } else {
                console.warn(`[SequencerPersistence] PrismtoneBridge.deletePattern not available. Simulating delete for "${patternId}".`);
                // localStorage.removeItem(`sequencer_pattern_${patternId}`); // Example local fallback
                success = true; // Simulate success
            }

            if (success) {
                console.log(`[SequencerPersistence] Pattern "${patternId}" deleted.`);
                if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                    PrismtoneBridge.showToast(`Pattern "${patternId}" deleted.`);
                } else {
                    alert(`Pattern "${patternId}" deleted (simulation).`);
                }
                // Optionally, refresh the list of patterns if a pattern list UI is open
            } else {
                console.error(`[SequencerPersistence] Failed to delete pattern "${patternId}".`);
                 if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                    PrismtoneBridge.showToast(`Failed to delete pattern "${patternId}".`);
                }
            }
        } catch (error) {
            console.error(`[SequencerPersistence] Error deleting pattern "${patternId}":`, error);
            if (window.PrismtoneBridge && PrismtoneBridge.showToast) {
                PrismtoneBridge.showToast(`Error deleting pattern "${patternId}".`);
            }
        }
    }
};

// For debugging from console:
// window.sequencerPersistence = sequencerPersistence;
// To test save: sequencerPersistence.handleSavePattern()
// To test load list: sequencerPersistence.handleLoadPatternList() (will try to load first item if confirmed)
// To test delete (after saving one): sequencerPersistence.handleDeletePattern('pattern_YYYYMMDDTHHMMSS')
