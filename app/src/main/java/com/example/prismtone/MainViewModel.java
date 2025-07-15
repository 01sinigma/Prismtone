// Файл: app\src\main\java\com\example\prismtone\MainViewModel.java
package com.example.prismtone;

import android.content.SharedPreferences;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;
import com.google.gson.Gson;
import com.example.prismtone.model.YAxisControls;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

public class MainViewModel extends ViewModel {

    // region SharedPreferences Keys
    private static final String PREF_KEY_LANGUAGE = "app_language";
    private static final String PREF_KEY_THEME = "app_theme";
    private static final String PREF_KEY_SOUND_PRESET = "sound_preset";
    private static final String PREF_KEY_FX_CHAIN = "fx_chain";
    private static final String PREF_KEY_VISUALIZER = "visualizer";
    private static final String PREF_KEY_TOUCH_EFFECT = "touch_effect";
    private static final String PREF_KEY_SCALE = "scale";
    private static final String PREF_KEY_TONIC = "tonic";
    private static final String PREF_KEY_OCTAVE_OFFSET = "octave_offset";
    private static final String PREF_KEY_ZONE_COUNT = "zone_count";
    private static final String PREF_KEY_SHOW_NOTE_NAMES = "show_note_names";
    private static final String PREF_KEY_SHOW_LINES = "show_lines";
    private static final String PREF_KEY_MASTER_VOLUME_CEILING = "master_volume_ceiling";
    private static final String PREF_KEY_ENABLE_POLY_SCALING = "enable_poly_scaling";
    private static final String PREF_KEY_HIGHLIGHT_SHARPS = "highlight_sharps";
    private static final String PREF_KEY_YAXIS_CONTROLS = "yaxis_controls";
    // endregion

    private final MutableLiveData<String> currentTheme = new MutableLiveData<>();
    private final MutableLiveData<String> currentLanguage = new MutableLiveData<>();
    private final MutableLiveData<String> currentSoundPreset = new MutableLiveData<>();
    private final MutableLiveData<String> currentFxChain = new MutableLiveData<>();
    private final MutableLiveData<String> currentVisualizer = new MutableLiveData<>();
    private final MutableLiveData<String> touchEffect = new MutableLiveData<>();
    private final MutableLiveData<String> currentScale = new MutableLiveData<>();
    private final MutableLiveData<Integer> octaveOffset = new MutableLiveData<>();
    private final MutableLiveData<Integer> zoneCount = new MutableLiveData<>();
    private final MutableLiveData<String> currentTonic = new MutableLiveData<>();
    private final MutableLiveData<YAxisControls> yAxisControlsLiveData = new MutableLiveData<>();
    private final Map<String, Object> genericSettings = new HashMap<>();
    private final Gson gson = new Gson();

    public MainViewModel() {
        // Конструктор остается для инициализации, но реальные значения
        // будут немедленно перезаписаны из loadSettings.
    }

    /**
     * Загружает настройки из SharedPreferences.
     * Если настройка языка отсутствует (первый запуск), определяет ее по языку системы.
     */
    public void loadSettings(SharedPreferences prefs) {
        // Язык (основная логика)
        String savedLang;
        if (!prefs.contains(PREF_KEY_LANGUAGE)) {
            String systemLang = Locale.getDefault().getLanguage(); // "en", "ru" и т.д.
            List<String> supportedLangs = Arrays.asList("en", "ru"); // Поддерживаемые языки
            savedLang = supportedLangs.contains(systemLang) ? systemLang : "en";
        } else {
            savedLang = prefs.getString(PREF_KEY_LANGUAGE, "en");
        }
        setCurrentLanguage(savedLang);

        // Загрузка остальных настроек
        setCurrentTheme(prefs.getString(PREF_KEY_THEME, "aurora"));
        setCurrentSoundPreset(prefs.getString(PREF_KEY_SOUND_PRESET, "default_piano"));
        setCurrentFxChain(prefs.getString(PREF_KEY_FX_CHAIN, null));
        setCurrentVisualizer(prefs.getString(PREF_KEY_VISUALIZER, "nebula"));
        setTouchEffect(prefs.getString(PREF_KEY_TOUCH_EFFECT, "ballLightningLink"));
        setCurrentScale(prefs.getString(PREF_KEY_SCALE, "major"));
        setCurrentTonic(prefs.getString(PREF_KEY_TONIC, "C4"));
        setOctaveOffset(prefs.getInt(PREF_KEY_OCTAVE_OFFSET, 0));
        setZoneCount(prefs.getInt(PREF_KEY_ZONE_COUNT, 12));
        
        setGenericSetting(PREF_KEY_SHOW_NOTE_NAMES, prefs.getBoolean(PREF_KEY_SHOW_NOTE_NAMES, true));
        setGenericSetting(PREF_KEY_SHOW_LINES, prefs.getBoolean(PREF_KEY_SHOW_LINES, true));
        setGenericSetting(PREF_KEY_MASTER_VOLUME_CEILING, (double) prefs.getFloat(PREF_KEY_MASTER_VOLUME_CEILING, 1.0f));
        setGenericSetting(PREF_KEY_ENABLE_POLY_SCALING, prefs.getBoolean(PREF_KEY_ENABLE_POLY_SCALING, true));
        setGenericSetting(PREF_KEY_HIGHLIGHT_SHARPS, prefs.getBoolean(PREF_KEY_HIGHLIGHT_SHARPS, true));

        String yAxisJson = prefs.getString(PREF_KEY_YAXIS_CONTROLS, null);
        if (yAxisJson != null) {
            setYAxisControlsFromJson(yAxisJson);
        } else {
            setYAxisControls(new YAxisControls());
        }
    }

    /**
     * Сохраняет текущие настройки в SharedPreferences.
     */
    public void saveSettings(SharedPreferences prefs) {
        SharedPreferences.Editor editor = prefs.edit();
        
        editor.putString(PREF_KEY_LANGUAGE, currentLanguage.getValue());
        editor.putString(PREF_KEY_THEME, currentTheme.getValue());
        editor.putString(PREF_KEY_SOUND_PRESET, currentSoundPreset.getValue());
        editor.putString(PREF_KEY_FX_CHAIN, currentFxChain.getValue());
        editor.putString(PREF_KEY_VISUALIZER, currentVisualizer.getValue());
        editor.putString(PREF_KEY_TOUCH_EFFECT, touchEffect.getValue());
        editor.putString(PREF_KEY_SCALE, currentScale.getValue());
        editor.putString(PREF_KEY_TONIC, currentTonic.getValue());
        editor.putInt(PREF_KEY_OCTAVE_OFFSET, octaveOffset.getValue() != null ? octaveOffset.getValue() : 0);
        editor.putInt(PREF_KEY_ZONE_COUNT, zoneCount.getValue() != null ? zoneCount.getValue() : 12);

        if (getSetting(PREF_KEY_SHOW_NOTE_NAMES) instanceof Boolean) editor.putBoolean(PREF_KEY_SHOW_NOTE_NAMES, (Boolean) getSetting(PREF_KEY_SHOW_NOTE_NAMES));
        if (getSetting(PREF_KEY_SHOW_LINES) instanceof Boolean) editor.putBoolean(PREF_KEY_SHOW_LINES, (Boolean) getSetting(PREF_KEY_SHOW_LINES));
        if (getSetting(PREF_KEY_ENABLE_POLY_SCALING) instanceof Boolean) editor.putBoolean(PREF_KEY_ENABLE_POLY_SCALING, (Boolean) getSetting(PREF_KEY_ENABLE_POLY_SCALING));
        if (getSetting(PREF_KEY_HIGHLIGHT_SHARPS) instanceof Boolean) editor.putBoolean(PREF_KEY_HIGHLIGHT_SHARPS, (Boolean) getSetting(PREF_KEY_HIGHLIGHT_SHARPS));
        if (getSetting(PREF_KEY_MASTER_VOLUME_CEILING) instanceof Double) editor.putFloat(PREF_KEY_MASTER_VOLUME_CEILING, ((Double) getSetting(PREF_KEY_MASTER_VOLUME_CEILING)).floatValue());

        editor.putString(PREF_KEY_YAXIS_CONTROLS, gson.toJson(yAxisControlsLiveData.getValue()));

        editor.apply();
    }

    // ... (остальная часть вашего класса MainViewModel без изменений) ...
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
    public LiveData<String> getCurrentTonic() { return currentTonic; }
    
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
    public void setCurrentTonic(String tonic) {
        currentTonic.setValue(tonic);
        genericSettings.put("currentTonic", tonic);
    }
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
        }
    }
    public void setYAxisControlsFromJson(String jsonString) {
        try {
            YAxisControls newControls = gson.fromJson(jsonString, YAxisControls.class);
            if (newControls != null) {
                if (newControls.getVolume() == null) newControls.setVolume(new YAxisControls.VolumeControl());
                if (newControls.getEffects() == null) newControls.setEffects(new YAxisControls.EffectsControl());
                setYAxisControls(newControls);
            }
        } catch (Exception e) {
            // Log error
        }
    }
    public void setGenericSetting(String key, Object value) {
        switch (key) {
            case "theme": setCurrentTheme((String) value); break;
            case "language": setCurrentLanguage((String) value); break;
            // ... (остальные кейсы без изменений)
            default:
                genericSettings.put(key, value);
                break;
        }
    }
    public Object getSetting(String key) {
        // ... (ваш метод getSetting без изменений)
        return genericSettings.get(key);
    }
}
