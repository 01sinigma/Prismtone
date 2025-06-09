package com.example.prismtone;

import android.content.Context;
import android.util.Log;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays; // Для Arrays.toString()
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner; // Для более надежного чтения файла

public class ModuleManager {
    private final Context context;
    private final MainViewModel viewModel;
    private final Map<String, List<ModuleInfo>> modules;
    private final Gson gson;
    private static final String TAG = "ModuleManager";

    public ModuleManager(Context context, MainViewModel viewModel) {
        this.context = context.getApplicationContext();
        this.viewModel = viewModel;
        this.modules = new HashMap<>();
        this.gson = new Gson();

        // Инициализация карты модулей для всех известных типов
        String[] knownModuleTypes = {
                "soundpreset", "fxchain", "theme", "language", "visualizer",
                "effect", "scale", "audioComponent", "touchEffect", "chordProgression"
        };
        for (String type : knownModuleTypes) {
            modules.put(type, new ArrayList<>());
        }
        Log.d(TAG, "ModuleManager initialized. Known module types: " + Arrays.toString(knownModuleTypes));
    }

    public void scanModules() {
        Log.i(TAG, "Starting module scan...");
        scanAssetsModules();
        // scanExternalModules(); // Если потребуется в будущем

        if (viewModel != null) {
            ensureDefaultModules();
        } else {
            Log.w(TAG, "ViewModel is null, skipping ensureDefaultModules during scan.");
        }

        Log.i(TAG, "Module scanning complete. Summary:");
        for (Map.Entry<String, List<ModuleInfo>> entry : modules.entrySet()) {
            Log.i(TAG, "  Type: " + entry.getKey() + ", Count: " + entry.getValue().size());
        }
    }

    private void scanAssetsModules() {
        Log.d(TAG, "scanAssetsModules: Attempting to list 'modules' directory in assets...");
        String[] moduleDirs;
        try {
            moduleDirs = context.getAssets().list("modules");
        } catch (IOException e) {
            Log.e(TAG, "scanAssetsModules: IOException listing root 'modules' directory.", e);
            return;
        }

        if (moduleDirs == null || moduleDirs.length == 0) {
            Log.e(TAG, "scanAssetsModules: 'modules' directory in assets is empty or not found!");
            return;
        }
        Log.d(TAG, "scanAssetsModules: Found asset sub-directories: " + Arrays.toString(moduleDirs));

        for (String moduleTypeDirName : moduleDirs) {
            Log.d(TAG, "scanAssetsModules: Processing directory: modules/" + moduleTypeDirName);

            if (!modules.containsKey(moduleTypeDirName)) {
                Log.w(TAG, "scanAssetsModules: Skipping directory '" + moduleTypeDirName + "' as it's not a known module type.");
                continue;
            }

            String[] moduleFiles;
            try {
                moduleFiles = context.getAssets().list("modules/" + moduleTypeDirName);
            } catch (IOException e) {
                Log.e(TAG, "scanAssetsModules: IOException listing files in 'modules/" + moduleTypeDirName + "'. Skipping this directory.", e);
                continue;
            }

            if (moduleFiles == null || moduleFiles.length == 0) {
                Log.w(TAG, "scanAssetsModules: No files found in directory: modules/" + moduleTypeDirName);
                continue;
            }
            Log.d(TAG, "scanAssetsModules: Files in 'modules/" + moduleTypeDirName + "': " + Arrays.toString(moduleFiles));

            for (String moduleFile : moduleFiles) {
                if (moduleFile.endsWith(".json")) {
                    String path = "modules/" + moduleTypeDirName + "/" + moduleFile;
                    Log.d(TAG, "--- Processing file: " + path + " ---");

                    String jsonString;
                    try (InputStream is = context.getAssets().open(path);
                         Scanner scanner = new Scanner(is, StandardCharsets.UTF_8.name()).useDelimiter("\\A")) {
                        jsonString = scanner.hasNext() ? scanner.next() : "";
                    } catch (IOException e) {
                        Log.e(TAG, "IOException reading file " + path, e);
                        continue; // Пропустить этот файл
                    }

                    if (jsonString.isEmpty()) {
                        Log.w(TAG, "File content is empty for: " + path);
                        continue; // Пропустить этот файл
                    }
                    // Логируем только начало, чтобы не засорять Logcat полностью
                    Log.v(TAG, "Raw JSON for " + path + " (first 200 chars): " + jsonString.substring(0, Math.min(jsonString.length(), 200)));

                    JsonObject moduleJson = null;
                    try {
                        moduleJson = gson.fromJson(jsonString, JsonObject.class);
                    } catch (JsonSyntaxException e) {
                        Log.e(TAG, "GSON parsing error for " + path + ". Invalid JSON content.", e);
                        continue; // Пропустить этот файл
                    }

                    if (moduleJson == null) {
                        // Это может случиться, если JSON строка была, например, "null"
                        Log.e(TAG, "GSON parsing resulted in NULL JsonObject for " + path + ".");
                        continue; // Пропустить этот файл
                    }
                    Log.d(TAG, "Successfully parsed JSON for " + path);

                    // Проверка обязательных полей верхнего уровня
                    boolean hasId = moduleJson.has("id") && moduleJson.get("id").isJsonPrimitive() && moduleJson.get("id").getAsJsonPrimitive().isString();
                    boolean hasType = moduleJson.has("type") && moduleJson.get("type").isJsonPrimitive() && moduleJson.get("type").getAsJsonPrimitive().isString();
                    boolean hasName = moduleJson.has("name") && moduleJson.get("name").isJsonPrimitive() && moduleJson.get("name").getAsJsonPrimitive().isString();
                    boolean hasVersion = moduleJson.has("version") && moduleJson.get("version").isJsonPrimitive() && moduleJson.get("version").getAsJsonPrimitive().isString();

                    String parsedType = hasType ? moduleJson.get("type").getAsString() : "N/A_TYPE";
                    String parsedId = hasId ? moduleJson.get("id").getAsString() : "N/A_ID";

                    Log.d(TAG, "Validation for " + path + ": id=" + parsedId + " (valid: " + hasId + ")" +
                            ", type=" + parsedType + " (valid: " + hasType + ")" +
                            ", name=" + (hasName ? moduleJson.get("name").getAsString() : "N/A_NAME") + " (valid: " + hasName + ")" +
                            ", version=" + (hasVersion ? moduleJson.get("version").getAsString() : "N/A_VERSION") + " (valid: " + hasVersion + ")");

                    if (hasId && hasType && hasName && hasVersion) {
                        // Важно: Проверяем, что тип из JSON совпадает с именем директории
                        if (!parsedType.equals(moduleTypeDirName)) {
                            Log.w(TAG, "Module type mismatch for " + path + ": Directory is '" + moduleTypeDirName + "', but JSON 'type' is '" + parsedType + "'. Skipping.");
                            continue;
                        }

                        ModuleInfo info = new ModuleInfo(
                                parsedId,
                                parsedType,
                                moduleJson.get("name").getAsString(),
                                moduleJson.get("version").getAsString(),
                                (moduleJson.has("description") && moduleJson.get("description").isJsonPrimitive()) ? moduleJson.get("description").getAsString() : "",
                                (moduleJson.has("active") && moduleJson.get("active").isJsonPrimitive()) ? moduleJson.get("active").getAsBoolean() : true,
                                "asset://" + path,
                                moduleJson // Передаем весь JSON-объект
                        );
                        Log.d(TAG, "ModuleInfo created for: " + info.getId() + " of type " + info.getType());
                        addModule(info);
                    } else {
                        Log.w(TAG, "Skipping module " + path + " due to missing or invalid required fields (id, type, name, version).");
                    }
                }
            }
        }
    }

    // scanExternalModules() - остается без изменений или закомментирован

    private void addModule(ModuleInfo info) {
        String type = info.getType();
        // Лог о попытке добавлен в scanAssetsModules перед вызовом addModule
        List<ModuleInfo> list = modules.get(type); // Тип уже должен быть валидным и присутствовать в карте

        boolean replaced = false;
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).getId().equals(info.getId())) {
                list.set(i, info); // Заменяем существующий с тем же ID
                replaced = true;
                Log.i(TAG, "addModule: Successfully REPLACED module: " + info.getId() + " (type: " + type + ")");
                break;
            }
        }
        if (!replaced) {
            list.add(info);
            Log.i(TAG, "addModule: Successfully ADDED module: " + info.getId() + " (type: " + type + ")");
        }
    }

    private void ensureDefaultModules() {
        if (viewModel == null) {
            Log.w(TAG, "ensureDefaultModules: ViewModel is null. Cannot set defaults.");
            return;
        }
        Log.d(TAG, "ensureDefaultModules: Setting default modules...");

        setDefault(viewModel::setCurrentSoundPreset, "soundpreset", "default_piano");
        // Для FX Chain, если вы хотите "никакой цепочки по умолчанию", передайте null.
        // Если вы хотите, чтобы "default_ambient" (или другой) был по умолчанию, если он существует:
        setDefault(viewModel::setCurrentFxChain, "fxchain", "default_ambient"); // Или null, если хотите "никакой"
        setDefault(viewModel::setCurrentTheme, "theme", "day");
        setDefault(viewModel::setCurrentLanguage, "language", "en");
        setDefault(viewModel::setCurrentVisualizer, "visualizer", "waves");
        setDefault(viewModel::setTouchEffect, "touchEffect", "glow");
        setDefault(viewModel::setCurrentScale, "scale", "major");
    }

    private void setDefault(java.util.function.Consumer<String> setter, String moduleType, String defaultId) {
        List<ModuleInfo> list = modules.get(moduleType);
        String selectedIdToSet = defaultId;

        Log.d(TAG, "setDefault: Processing type '" + moduleType + "' with defaultId '" + defaultId + "'. Found " + (list != null ? list.size() : "null list") + " modules.");

        if (list != null && !list.isEmpty()) {
            ModuleInfo activeModule = list.stream()
                    .filter(ModuleInfo::isActive) // Ищем активный
                    .findFirst()
                    .orElse(null);

            if (activeModule != null) {
                selectedIdToSet = activeModule.getId();
                Log.d(TAG, "setDefault: Found active module for type '" + moduleType + "': " + selectedIdToSet);
            } else {
                final String finalDefaultId = defaultId; // Для использования в лямбде
                boolean defaultIdExistsInList = (defaultId != null) && list.stream().anyMatch(m -> m.getId().equals(finalDefaultId));

                if (defaultIdExistsInList) {
                    selectedIdToSet = defaultId;
                    Log.d(TAG, "setDefault: No active module for '" + moduleType + "', but provided defaultId '" + defaultId + "' exists. Using it.");
                } else {
                    selectedIdToSet = list.get(0).getId(); // Берем первый из списка
                    Log.d(TAG, "setDefault: No active module for '" + moduleType + "' and defaultId '" + defaultId + "' not in list (or was null). Using first from list: " + selectedIdToSet);
                }
            }
        } else {
            Log.w(TAG, "setDefault: Module list for type '" + moduleType + "' is empty. Using provided defaultId: " + defaultId);
            // selectedIdToSet остается равным defaultId
        }

        // Особая обработка для fxChain, где null является валидным значением
        if (moduleType.equals("fxchain")) {
            Log.d(TAG, "setDefault for fxChain: Final ID to set is '" + selectedIdToSet + "'. Calling setter.");
            setter.accept(selectedIdToSet); // selectedIdToSet может быть null
        } else if (selectedIdToSet != null) {
            Log.d(TAG, "setDefault for " + moduleType + ": Final ID to set is '" + selectedIdToSet + "'. Calling setter.");
            setter.accept(selectedIdToSet);
        } else {
            Log.w(TAG, "setDefault: No valid module ID to set for type '" + moduleType + "' (selectedIdToSet is null and it's not fxchain). Setter NOT called.");
        }
    }

    public List<ModuleInfo> getModules(String moduleType) {
        Log.d(TAG, "getModules (Java): Received moduleType: " + moduleType);
        List<ModuleInfo> result = modules.getOrDefault(moduleType, new ArrayList<>());
        Log.d(TAG, "getModules (Java): Found " + result.size() + " modules in cache for type: " + moduleType);
        return result;
    }
    // compareVersions не нужен, если мы просто заменяем по ID
}