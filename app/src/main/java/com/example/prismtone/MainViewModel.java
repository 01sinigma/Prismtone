// Файл: app\src\main\java\com\example\prismtone\MainViewModel.java
package com.example.prismtone;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;
import com.google.gson.Gson; // Для десериализации JSON в setYAxisControlsFromJson

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import com.example.prismtone.model.YAxisControls;

public class MainViewModel extends ViewModel {

    // YAxisControls класс теперь определен в YAxisControls.java

    private final MutableLiveData<String> currentTheme = new MutableLiveData<>("aurora");
    private final MutableLiveData<String> currentLanguage = new MutableLiveData<>("en");
    private final MutableLiveData<String> currentSoundPreset = new MutableLiveData<>("default_piano");
    private final MutableLiveData<String> currentFxChain = new MutableLiveData<>(null); // null по умолчанию
    private final MutableLiveData<String> currentVisualizer = new MutableLiveData<>("nebula");
    private final MutableLiveData<String> touchEffect = new MutableLiveData<>("ballLightningLink");
    private final MutableLiveData<String> currentScale = new MutableLiveData<>("major");
    private final MutableLiveData<Integer> octaveOffset = new MutableLiveData<>(0);
    private final MutableLiveData<Integer> zoneCount = new MutableLiveData<>(12);
    private final MutableLiveData<String> currentTonic = new MutableLiveData<>("C4");
    private final MutableLiveData<YAxisControls> yAxisControlsLiveData = new MutableLiveData<>(new YAxisControls());
    private final Map<String, Object> genericSettings = new HashMap<>();

    public MainViewModel() {
        // Теперь genericSettings заполняются из значений LiveData
        genericSettings.put("theme", currentTheme.getValue());
        genericSettings.put("language", currentLanguage.getValue());
        genericSettings.put("soundPreset", currentSoundPreset.getValue());
        genericSettings.put("fxChain", currentFxChain.getValue());
        genericSettings.put("visualizer", currentVisualizer.getValue());
        genericSettings.put("touchEffect", touchEffect.getValue());
        genericSettings.put("scale", currentScale.getValue());
        genericSettings.put("octaveOffset", octaveOffset.getValue());
        genericSettings.put("zoneCount", zoneCount.getValue());
        genericSettings.put("currentTonic", currentTonic.getValue());
        
        // >>> НАЧАЛО ИЗМЕНЕНИЙ: ОБНОВЛЕНИЕ БУЛЕВЫХ И ЧИСЛОВЫХ ЗНАЧЕНИЙ <<<
        genericSettings.put("showNoteNames", true);
        genericSettings.put("showLines", true);
        genericSettings.put("masterVolumeCeiling", 1.0);
        genericSettings.put("enablePolyphonyVolumeScaling", true);
        genericSettings.put("highlightSharpsFlats", true); // Включено по умолчанию
        genericSettings.put("vibrationEnabled", true);
        genericSettings.put("vibrationIntensity", "weak");
        // >>> КОНЕЦ ИЗМЕНЕНИЙ <<<
    }

    public LiveData<String> getCurrentTheme() { return currentTheme; }
    public LiveData<String> getCurrentLanguage() { return currentLanguage; }
    public LiveData<String> getCurrentSoundPreset() { return currentSoundPreset; }
    public LiveData<String> getCurrentFxChain() { return currentFxChain; }
    public LiveData<String> getCurrentVisualizer() { return currentVisualizer; }
    public LiveData<String> getTouchEffect() { return touchEffect; }
    public LiveData<String> getCurrentScale() { return currentScale; }
    public LiveData<Integer> getOctaveOffset() { return octaveOffset; }
    public LiveData<Integer> getZoneCount() { return zoneCount; }
    public LiveData<YAxisControls> getYAxisControls() { return yAxisControlsLiveData; }

    // === НОВОЕ: Getter для текущей тоники ===
    public LiveData<String> getCurrentTonic() { return currentTonic; }
    // ========================================

    public void setCurrentTheme(String themeId) {
        currentTheme.setValue(themeId);
        genericSettings.put("theme", themeId);
    }
    public void setCurrentLanguage(String languageId) {
        currentLanguage.setValue(languageId);
        genericSettings.put("language", languageId);
    }
    public void setCurrentSoundPreset(String presetId) {
        currentSoundPreset.setValue(presetId);
        genericSettings.put("soundPreset", presetId);
    }
    public void setCurrentFxChain(String chainId) {
        currentFxChain.setValue(chainId);
        genericSettings.put("fxChain", chainId);
    }
    public void setCurrentVisualizer(String visualizerId) {
        currentVisualizer.setValue(visualizerId);
        genericSettings.put("visualizer", visualizerId);
    }
    public void setTouchEffect(String effectId) {
        touchEffect.setValue(effectId);
        genericSettings.put("touchEffect", effectId);
    }
    public void setCurrentScale(String scaleId) {
        currentScale.setValue(scaleId);
        genericSettings.put("scale", scaleId);
    }

    // === НОВОЕ: Setter для текущей тоники ===
    public void setCurrentTonic(String tonic) {
        currentTonic.setValue(tonic);
        genericSettings.put("currentTonic", tonic);
    }
    // ========================================

    public void setOctaveOffset(int offset) {
        int clampedOffset = Math.max(-7, Math.min(7, offset));
        octaveOffset.setValue(clampedOffset);
        genericSettings.put("octaveOffset", clampedOffset);
    }

    public void setZoneCount(int count) {
        if (count == 7 || count == 12 || count == 24 || count == 36) {
            zoneCount.setValue(count);
            genericSettings.put("zoneCount", count);
        }
    }

    public void setYAxisControls(YAxisControls newControls) {
        if (newControls != null) {
            yAxisControlsLiveData.setValue(newControls);
            // genericSettings.put("yAxisControls", newControls); // Не храним весь объект в genericSettings, т.к. он сложный
        }
    }

    // Метод для обновления YAxisControls из JSON строки (например, от Bridge)
    public void setYAxisControlsFromJson(String jsonString) {
        try {
            Gson gson = new Gson();
            YAxisControls newControls = gson.fromJson(jsonString, YAxisControls.class);
            if (newControls != null) {
                // Обеспечиваем, что вложенные объекты не null
                if (newControls.getVolume() == null) newControls.setVolume(new YAxisControls.VolumeControl());
                if (newControls.getEffects() == null) newControls.setEffects(new YAxisControls.EffectsControl());
                setYAxisControls(newControls);
            }
        } catch (Exception e) {
            // Log error
        }
    }


    public void setGenericSetting(String key, Object value) {
        // ... (логика для masterVolumeCeiling и enablePolyphonyVolumeScaling остается) ...
        switch (key) {
            case "theme": setCurrentTheme((String) value); break;
            case "language": setCurrentLanguage((String) value); break;
            case "soundPreset": setCurrentSoundPreset((String) value); break;
            case "fxChain": setCurrentFxChain((String) value); break;
            case "visualizer": setCurrentVisualizer((String) value); break;
            case "touchEffect": setTouchEffect((String) value); break;
            case "scale": setCurrentScale((String) value); break;
            case "octaveOffset":
                if (value instanceof Number) setOctaveOffset(((Number) value).intValue());
                else if (value instanceof String) setOctaveOffset(Integer.parseInt((String) value));
                break;
            case "zoneCount":
                if (value instanceof Number) setZoneCount(((Number) value).intValue());
                else if (value instanceof String) setZoneCount(Integer.parseInt((String) value));
                break;
            case "showNoteNames":
            case "showLines": // Изменено обратно на showLines
            case "enablePolyphonyVolumeScaling":
                if (value instanceof Boolean) genericSettings.put(key, value);
                else if (value instanceof String) genericSettings.put(key, Boolean.parseBoolean((String) value));
                break;
            case "masterVolumeCeiling":
                if (value instanceof Number) genericSettings.put(key, ((Number) value).doubleValue());
                else if (value instanceof String) {
                    try {
                        genericSettings.put(key, Double.parseDouble((String) value));
                    } catch (NumberFormatException e) {
                        // Log error or handle
                    }
                }
                break;
            case "currentTonic":
                if (value instanceof String) setCurrentTonic((String) value);
                break;
            case "highlightSharpsFlats":
                if (value instanceof Boolean) genericSettings.put(key, value);
                else if (value instanceof String) genericSettings.put(key, Boolean.parseBoolean((String) value));
                break;
            default:
                genericSettings.put(key, value);
                break;
        }
    }

    public Object getSetting(String key) {
        // ... (логика для masterVolumeCeiling и enablePolyphonyVolumeScaling остается) ...
        switch (key) {
            case "theme": return Objects.requireNonNullElse(currentTheme.getValue(), genericSettings.get(key));
            case "language": return Objects.requireNonNullElse(currentLanguage.getValue(), genericSettings.get(key));
            case "soundPreset": return Objects.requireNonNullElse(currentSoundPreset.getValue(), genericSettings.get(key));
            case "fxChain": return currentFxChain.getValue();
            case "visualizer": return Objects.requireNonNullElse(currentVisualizer.getValue(), genericSettings.get(key));
            case "touchEffect": return Objects.requireNonNullElse(touchEffect.getValue(), genericSettings.get(key));
            case "scale": return Objects.requireNonNullElse(currentScale.getValue(), genericSettings.get(key));
            case "octaveOffset": return Objects.requireNonNullElse(octaveOffset.getValue(), genericSettings.get(key));
            case "zoneCount": return Objects.requireNonNullElse(zoneCount.getValue(), genericSettings.get(key));
            // yAxisControls получается целиком через getYAxisControls().getValue()
            case "masterVolumeCeiling":
            case "enablePolyphonyVolumeScaling":
            case "currentTonic": return Objects.requireNonNullElse(currentTonic.getValue(), genericSettings.get(key));
            default:
                return genericSettings.get(key);
        }
    }
}