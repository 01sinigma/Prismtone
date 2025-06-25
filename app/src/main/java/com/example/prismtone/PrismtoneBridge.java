// Файл: app\src\main\java\com\example\prismtone\PrismtoneBridge.java
package com.example.prismtone;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.Keep;
import com.example.prismtone.model.YAxisControls;


import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonNull; // <<<--- ДОБАВЛЕН ИМПОРТ
import com.google.gson.reflect.TypeToken;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Keep
public class PrismtoneBridge {
    private final Context context;
    private final WebView webView;
    private final MainViewModel viewModel;
    private final ModuleManager moduleManager;
    private final Handler mainHandler;
    private final Gson gson;
    private final Vibrator vibrator;
    private static final String TAG = "PrismtoneBridge";
    private final ExecutorService executorService;
    private SensorController sensorControllerInstance; // Instance of SensorController

    // Inner class for deserializing sensor settings
    private static class SensorSettingsPayload {
        float smoothingAlpha;
        boolean invertPitchAxis;
        boolean invertRollAxis;
        boolean swapAxes;
    }

    public PrismtoneBridge(Context context, WebView webView, MainViewModel viewModel, ModuleManager moduleManager) {
        this.context = context.getApplicationContext();
        this.webView = webView;
        this.viewModel = viewModel;
        this.moduleManager = moduleManager;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.gson = new GsonBuilder().serializeNulls().create();
        this.vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        this.executorService = Executors.newSingleThreadExecutor();
    }

    private void runJavaScript(final String script) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            evaluateJs(script);
        } else {
            mainHandler.post(() -> evaluateJs(script));
        }
    }

    private void evaluateJs(final String script) {
        if (webView != null) {
            try {
                webView.evaluateJavascript(script, null);
            } catch (Exception e) {
                Log.e(TAG, "Exception evaluating JavaScript: " + script, e);
            }
        } else {
            Log.e(TAG, "WebView is null, cannot execute JavaScript: " + script);
        }
    }

    public void callJsFunction(String functionName, Object... args) {
        if (functionName == null || functionName.trim().isEmpty()) {
            Log.e(TAG, "callJsFunction called with empty function name.");
            return;
        }
        StringBuilder builder = new StringBuilder();
        builder.append(functionName).append("(");
        for (int i = 0; i < args.length; i++) {
            if (i > 0) builder.append(",");
            Object arg = args[i];
            if (arg == null) {
                builder.append("null");
            } else if (arg instanceof String) {
                builder.append("'").append(escapeStringForJs((String) arg)).append("'");
            } else if (arg instanceof Number || arg instanceof Boolean) {
                builder.append(arg);
            } else {
                try {
                    builder.append(gson.toJson(arg));
                } catch (Exception e) {
                    Log.e(TAG, "Error converting argument to JSON for JS call: " + arg, e);
                    builder.append("null");
                }
            }
        }
        builder.append(")");
        runJavaScript(builder.toString());
    }

    private String escapeStringForJs(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                .replace("\b", "\\b")
                .replace("\f", "\\f")
                .replace("</", "<\\/");
    }

    @JavascriptInterface
    public String getModules(String moduleType) {
        Log.d(TAG, "getModules called for type: " + moduleType);
        try {
            if (moduleManager != null) {
                List<ModuleInfo> moduleList = moduleManager.getModules(moduleType);
                return gson.toJson(moduleList);
            } else {
                Log.e(TAG, "getModules: moduleManager is null!");
                return "[]";
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in getModules for type: " + moduleType, e);
            return "[]";
        }
    }

    @JavascriptInterface
    public String getCurrentSettings() {
        Log.d(TAG, "getCurrentSettings called");
        JsonObject settings = new JsonObject();
        if (viewModel == null) {
            Log.e(TAG, "getCurrentSettings: viewModel is null!");
            return settings.toString();
        }
        try {
            settings.addProperty("theme", Objects.requireNonNullElse(viewModel.getCurrentTheme().getValue(), "day"));
            settings.addProperty("language", Objects.requireNonNullElse(viewModel.getCurrentLanguage().getValue(), "en"));
            settings.addProperty("soundPreset", Objects.requireNonNullElse(viewModel.getCurrentSoundPreset().getValue(), "default_piano"));
            settings.addProperty("fxChain", viewModel.getCurrentFxChain().getValue());
            settings.addProperty("visualizer", Objects.requireNonNullElse(viewModel.getCurrentVisualizer().getValue(), "waves"));
            settings.addProperty("touchEffect", Objects.requireNonNullElse(viewModel.getTouchEffect().getValue(), "glow"));
            settings.addProperty("scale", Objects.requireNonNullElse(viewModel.getCurrentScale().getValue(), "major"));
            settings.addProperty("octaveOffset", Objects.requireNonNullElse(viewModel.getOctaveOffset().getValue(), 0));
            settings.addProperty("zoneCount", Objects.requireNonNullElse(viewModel.getZoneCount().getValue(), 12));

            Object showNoteNamesVal = viewModel.getSetting("showNoteNames");
            settings.addProperty("showNoteNames", showNoteNamesVal instanceof Boolean ? (Boolean)showNoteNamesVal : true);

            Object showLinesVal = viewModel.getSetting("showLines");
            settings.addProperty("showLines", showLinesVal instanceof Boolean ? (Boolean)showLinesVal : true);

            Object masterVolCeilingVal = viewModel.getSetting("masterVolumeCeiling");
            settings.addProperty("masterVolumeCeiling", masterVolCeilingVal instanceof Number ? ((Number)masterVolCeilingVal).doubleValue() : 1.0);

            Object enablePolyScalingVal = viewModel.getSetting("enablePolyphonyVolumeScaling");
            settings.addProperty("enablePolyphonyVolumeScaling", enablePolyScalingVal instanceof Boolean ? (Boolean)enablePolyScalingVal : true);

            // === НОВОЕ: Добавление currentTonic и highlightSharpsFlats в настройки ===
            settings.addProperty("currentTonic", Objects.requireNonNullElse(viewModel.getCurrentTonic().getValue(), "C4"));
            Object highlightVal = viewModel.getSetting("highlightSharpsFlats");
            settings.addProperty("highlightSharpsFlats", highlightVal instanceof Boolean ? (Boolean)highlightVal : false);
            // =======================================================================

            YAxisControls yAxis = viewModel.getYAxisControls().getValue();
            if (yAxis != null) {
                settings.add("yAxisControls", gson.toJsonTree(yAxis));
            } else {
                settings.add("yAxisControls", JsonNull.INSTANCE);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error getting current settings", e);
        }
        Log.d(TAG, "getCurrentSettings returning: " + settings.toString());
        return settings.toString();
    }


    @JavascriptInterface
    public void setSoundPreset(String presetId) {
        Log.d(TAG, "setSoundPreset: " + presetId);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setCurrentSoundPreset(presetId);
            else Log.e(TAG, "setSoundPreset: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setFxChain(String chainId) {
        Log.d(TAG, "setFxChain: " + chainId);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setCurrentFxChain(chainId);
            else Log.e(TAG, "setFxChain: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setTheme(String themeId) {
        Log.d(TAG, "setTheme: " + themeId);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setCurrentTheme(themeId);
            else Log.e(TAG, "setTheme: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setLanguage(String languageId) {
        Log.d(TAG, "setLanguage: " + languageId);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setCurrentLanguage(languageId);
            else Log.e(TAG, "setLanguage: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setVisualizer(String visualizerId) {
        Log.d(TAG, "setVisualizer: " + visualizerId);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setCurrentVisualizer(visualizerId);
            else Log.e(TAG, "setVisualizer: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setTouchEffect(String effectId) {
        Log.d(TAG, "setTouchEffect: " + effectId);
        mainHandler.post(() -> {
            if (viewModel != null) {
                viewModel.setTouchEffect(effectId);
            } else {
                Log.e(TAG, "setTouchEffect: viewModel is null");
            }
        });
    }

    @JavascriptInterface
    public void setSetting(String key, String value) {
        Log.d(TAG, "setSetting called for key: " + key + ", string value: " + value);
        mainHandler.post(() -> {
            if (viewModel != null) {
                viewModel.setGenericSetting(key, value);
                Log.d(TAG, "ViewModel setting '" + key + "' updated via generic setter.");
            } else {
                Log.e(TAG, "Cannot setSetting: viewModel is null");
            }
        });
    }

    @JavascriptInterface
    public void setYAxisControlGroup(String groupName, String settingsJson) {
        Log.d(TAG, "setYAxisControlGroup called for group: " + groupName + ", json: " + settingsJson);
        mainHandler.post(() -> {
            if (viewModel != null) {
                try {
                    YAxisControls currentControls = viewModel.getYAxisControls().getValue();
                    if (currentControls == null) currentControls = new YAxisControls();

                    JsonObject groupSettings = JsonParser.parseString(settingsJson).getAsJsonObject();

                    if ("volume".equals(groupName)) {
                        YAxisControls.VolumeControl volCtrl = gson.fromJson(groupSettings, YAxisControls.VolumeControl.class);
                        currentControls.setVolume(volCtrl);
                    } else if ("effects".equals(groupName)) {
                        YAxisControls.EffectsControl fxCtrl = gson.fromJson(groupSettings, YAxisControls.EffectsControl.class);
                        currentControls.setEffects(fxCtrl);
                    }
                    viewModel.setYAxisControls(currentControls);
                    Log.d(TAG, "ViewModel YAxisControls group '" + groupName + "' updated.");
                } catch (JsonSyntaxException e) {
                    Log.e(TAG, "Error parsing YAxisControlGroup JSON for group " + groupName, e);
                } catch (Exception e) {
                    Log.e(TAG, "Error setting YAxisControlGroup for group " + groupName, e);
                }
            } else {
                Log.e(TAG, "Cannot setYAxisControlGroup: viewModel is null");
            }
        });
    }

    @JavascriptInterface
    public void setScale(String scaleId) {
        Log.d(TAG, "setScale: " + scaleId);
        mainHandler.post(() -> {
            if (viewModel != null) {
                viewModel.setCurrentScale(scaleId);
                // callJsFunction("app.updateZones"); // Удалено согласно инструкции
            } else Log.e(TAG, "setScale: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setOctaveOffset(int offset) {
        Log.d(TAG, "setOctaveOffset: " + offset);
        mainHandler.post(() -> {
            if (viewModel != null) {
                viewModel.setOctaveOffset(offset);
                // callJsFunction("app.updateZones"); // Удалено согласно инструкции
            } else Log.e(TAG, "setOctaveOffset: viewModel is null");
        });
    }

    @JavascriptInterface
    public void setZoneCount(int count) {
        Log.d(TAG, "setZoneCount: " + count);
        mainHandler.post(() -> {
            if (viewModel != null) viewModel.setZoneCount(count);
            else Log.e(TAG, "setZoneCount: viewModel is null");
        });
    }

    /**
     * Asynchronously saves a sound preset and invokes JS callbacks upon completion.
     */
    @JavascriptInterface
    public void saveSoundPreset(String presetDataJson, String successCallbackName, String errorCallbackName) {
        Log.d(TAG, "JS call: saveSoundPreset with callbacks");
        try {
            JsonObject preset = JsonParser.parseString(presetDataJson).getAsJsonObject();
            SoundPresetRepository.getInstance(context).savePreset(preset, successCallbackName, errorCallbackName, this);
        } catch (Exception e) {
            Log.e(TAG, "Error initiating saveSoundPreset", e);
            callJsFunctionOnMainThread(errorCallbackName, "Exception: " + escapeStringForJs(e.getMessage()));
        }
    }

    /**
     * Asynchronously saves an FxChain and invokes JS callbacks upon completion.
     */
    @JavascriptInterface
    public void saveFxChain(String chainDataJson, String successCallbackName, String errorCallbackName) {
        Log.d(TAG, "JS call: saveFxChain with callbacks");
        try {
            JsonObject chain = JsonParser.parseString(chainDataJson).getAsJsonObject();
            FxChainRepository.getInstance(context).saveChain(chain, successCallbackName, errorCallbackName, this);
        } catch (Exception e) {
            Log.e(TAG, "Error initiating saveFxChain", e);
            callJsFunctionOnMainThread(errorCallbackName, "Exception: " + escapeStringForJs(e.getMessage()));
        }
    }

    /**
     * Asynchronously saves a chord progression and invokes JS callbacks upon completion.
     */
    @JavascriptInterface
    public void saveChordProgression(String progressionDataJson, String successCallbackName, String errorCallbackName) {
        Log.d(TAG, "JS call: saveChordProgression with callbacks");
        try {
            JsonObject progression = JsonParser.parseString(progressionDataJson).getAsJsonObject();
            ChordProgressionRepository.getInstance(context).saveProgression(progression, successCallbackName, errorCallbackName, this);
        } catch (Exception e) {
            Log.e(TAG, "Error initiating saveChordProgression", e);
            callJsFunctionOnMainThread(errorCallbackName, "Exception: " + escapeStringForJs(e.getMessage()));
        }
    }

    /**
     * Helper method to safely call a JS function on the main thread from any background thread.
     * This is public so repositories can use it.
     */
    public void callJsFunctionOnMainThread(String functionName, String... args) {
        mainHandler.post(() -> callJsFunction(functionName, (Object[]) args));
    }

    @JavascriptInterface
    public boolean deleteSoundPreset(String presetId) {
        Log.d(TAG, "deleteSoundPreset for: " + presetId);
        if (context == null) { Log.e(TAG, "deleteSoundPreset: context is null"); return false; }
        try {
            SoundPresetRepository repo = SoundPresetRepository.getInstance(context);
            if (repo == null) { Log.e(TAG, "deleteSoundPreset: Repository instance is null"); return false; }
            return repo.deleteSoundPreset(presetId);
        } catch (Exception e) {
            Log.e(TAG, "Error deleting sound preset: " + presetId, e); return false;
        }
    }

    @JavascriptInterface
    public boolean deleteFxChain(String chainId) {
        Log.d(TAG, "deleteFxChain for: " + chainId);
        if (context == null) { Log.e(TAG, "deleteFxChain: context is null"); return false; }
        try {
            FxChainRepository repo = FxChainRepository.getInstance(context);
            if (repo == null) { Log.e(TAG, "deleteFxChain: Repository instance is null"); return false; }
            return repo.deleteFxChain(chainId);
        } catch (Exception e) {
            Log.e(TAG, "Error deleting FX chain: " + chainId, e); return false;
        }
    }

    @JavascriptInterface
    public boolean deleteChordProgression(String progressionId) {
        Log.d(TAG, "deleteChordProgression: " + progressionId);
        return ChordProgressionRepository.getInstance(context).deleteProgression(progressionId);
    }

    @JavascriptInterface
    public void logDebug(String message) {
        Log.d("JS_" + TAG, message);
    }

    @JavascriptInterface
    public void logError(String message, String errorStack) {
        Log.e("JS_" + TAG, message + "\nStack: " + errorStack);
    }

    @JavascriptInterface
    @Keep
    public void reloadWebView() {
        Log.w(TAG, "JavaScript запросил полную перезагрузку WebView.");
        mainHandler.post(() -> {
            if (webView != null) {
                Log.i(TAG, "Выполняется webView.reload()...");
                webView.reload();
            } else {
                Log.e(TAG, "Невозможно перезагрузить WebView: webView is null.");
            }
        });
    }

    /**
     * Вызывает ОДИНОЧНЫЙ импульс вибрации.
     */
    @JavascriptInterface
    public void vibrate(int durationMs, int amplitude) {
        if (vibrator == null || !vibrator.hasVibrator()) return;

        Log.d(TAG, ">>> VIBRATE (OneShot) <<< Received: duration=" + durationMs + ", amplitude=" + amplitude);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (vibrator.hasAmplitudeControl()) {
                int validAmplitude = Math.max(1, Math.min(255, amplitude));
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, validAmplitude));
            } else {
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
            }
        } else {
            vibrator.vibrate(durationMs);
        }
    }

    /**
     * НОВЫЙ МЕТОД: Вызывает НЕПРЕРЫВНУЮ вибрацию с заданным паттерном.
     * @param timingsJson JSON-строка массива long[] для паттерна (пауза, вибрация, пауза, ...)
     * @param amplitudesJson JSON-строка массива int[] для амплитуды каждого шага
     * @param repeat Индекс, с которого начинать повторение (-1 для отсутствия повторения)
     */
    @JavascriptInterface
    public void vibratePattern(String timingsJson, String amplitudesJson, int repeat) {
        if (vibrator == null || !vibrator.hasVibrator()) return;

        Log.d(TAG, ">>> VIBRATE (Pattern) <<< Received: timings=" + timingsJson + ", amplitudes=" + amplitudesJson + ", repeat=" + repeat);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Type longListType = new TypeToken<long[]>() {}.getType();
                Type intListType = new TypeToken<int[]>() {}.getType();
                long[] timings = gson.fromJson(timingsJson, longListType);
                int[] amplitudes = gson.fromJson(amplitudesJson, intListType);

                if (timings == null || amplitudes == null || timings.length != amplitudes.length) {
                    Log.e(TAG, "Mismatched or null timings/amplitudes for pattern vibration.");
                    return;
                }

                if (vibrator.hasAmplitudeControl()) {
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, repeat));
                } else {
                    // Устройства без контроля амплитуды не могут использовать паттерн с амплитудами.
                    // Создаем простой паттерн вкл/выкл.
                    for (int i = 0; i < amplitudes.length; i++) {
                        if(amplitudes[i] > 0) amplitudes[i] = VibrationEffect.DEFAULT_AMPLITUDE;
                    }
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, repeat));
                }
            } catch (Exception e) {
                Log.e(TAG, "Error creating vibration pattern", e);
            }
        } else {
            // Для старых API используем простой повторяющийся паттерн без амплитуды
            try {
                Type longListType = new TypeToken<long[]>() {}.getType();
                long[] timings = gson.fromJson(timingsJson, longListType);
                if (timings != null) {
                    vibrator.vibrate(timings, repeat);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error creating legacy vibration pattern", e);
            }
        }
    }

    @JavascriptInterface
    public void cancelVibration() {
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.cancel();
            Log.d(TAG, "Vibration cancelled");
        }
    }

    public void sendDeviceTiltToJs(float pitch, float roll) {
        String script = String.format(Locale.US,
                "if(window.app && typeof window.app.onDeviceTilt === 'function') { window.app.onDeviceTilt({ pitch: %.2f, roll: %.2f }); }",
                pitch, roll);
        runJavaScript(script);
    }

    public void setSensorController(SensorController controller) {
        this.sensorControllerInstance = controller;
    }

    @JavascriptInterface
    public void updateSensorSettings(String jsonSettings) {
        Log.d(TAG, "updateSensorSettings called with: " + jsonSettings);
        if (sensorControllerInstance == null) {
            Log.e(TAG, "SensorController instance is null in PrismtoneBridge. Cannot update settings.");
            return;
        }

        try {
            SensorSettingsPayload settings = gson.fromJson(jsonSettings, SensorSettingsPayload.class);
            if (settings != null) {
                mainHandler.post(() -> {
                    sensorControllerInstance.setSmoothingAlpha(settings.smoothingAlpha);
                    sensorControllerInstance.setInvertPitchAxis(settings.invertPitchAxis);
                    sensorControllerInstance.setInvertRollAxis(settings.invertRollAxis);
                    sensorControllerInstance.setSwapAxes(settings.swapAxes);
                    Log.i(TAG, "Sensor settings updated in SensorController.");
                });
            } else {
                Log.e(TAG, "Failed to parse sensor settings JSON.");
            }
        } catch (JsonSyntaxException e) {
            Log.e(TAG, "Error parsing sensor settings JSON: " + jsonSettings, e);
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error updating sensor settings: " + jsonSettings, e);
        }
    }
}