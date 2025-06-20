package com.example.prismtone;

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonSyntaxException
import kotlinx.coroutines.*
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.*
import java.util.concurrent.ConcurrentHashMap // Added
import kotlin.collections.ArrayList

class ModuleManager(context: Context, private val viewModel: MainViewModel?) { // Changed to nullable viewModel
    private val appContext: Context = context.applicationContext // Renamed and made private val
    private val modules: ConcurrentHashMap<String, MutableList<ModuleInfo>> = ConcurrentHashMap() // Changed to ConcurrentHashMap and MutableList
    private val gson: Gson = Gson()
    // SupervisorJob() ensures that if one coroutine in this scope fails, others are not cancelled.
    // Dispatchers.IO is used for disk and network IO operations.
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    companion object {
        private const val TAG = "ModuleManager" // Changed to const val
        private val KNOWN_MODULE_TYPES = arrayOf( // Changed to private val in companion object
            "soundpreset", "fxchain", "theme", "language", "visualizer",
            "effect", "scale", "audioComponent", "touchEffect", "chordProgression"
        )
    }

    init {
        KNOWN_MODULE_TYPES.forEach { type ->
            // Using Collections.synchronizedList to ensure thread-safety for list modifications.
            modules[type] = Collections.synchronizedList(ArrayList())
        }
        Log.d(TAG, "ModuleManager initialized. Known module types: ${KNOWN_MODULE_TYPES.joinToString()}") // Kotlin string template and joinToString
    }

    fun scanModules() {
        Log.i(TAG, "Starting module scan...")
        // viewModel?.setIsScanningModules(true) // Potential direct LiveData update (if public)
        // Or using the new public method:
        viewModel?.setIsScanningModules(true)

        coroutineScope.launch {
            try {
                scanAssetsModulesInternal()

                // Ensure viewModel is not null before calling ensureDefaultModulesInternal or accessing it
                val currentViewModel = viewModel ?: run {
                    Log.w(TAG, "ViewModel is null, skipping ensureDefaultModulesInternal during scan.")
                    return@launch // Exit this specific coroutine launch block
                }
                ensureDefaultModulesInternal() // No need to pass currentViewModel if ensureDefaultModulesInternal uses the class property

                Log.i(TAG, "Module scanning complete (async). Summary:")
                modules.entries.forEach { entry ->
                    Log.i(TAG, "  Type: ${entry.key}, Count: ${entry.value.size}")
                }
            } catch (e: CancellationException) {
                Log.i(TAG, "Module scan was cancelled.", e)
                // Optional: rethrow if you want the scope to handle it as a cancellation
                // throw e
            } catch (e: IOException) {
                Log.e(TAG, "IOException during module scanning", e)
            } catch (e: JsonSyntaxException) {
                Log.e(TAG, "JsonSyntaxException during module scanning (likely in scanAssetsModulesInternal)", e)
            } catch (e: Exception) {
                Log.e(TAG, "Generic error during module scanning", e)
            } finally {
                // viewModel?._isScanningModules?.postValue(false) // Direct update (if public)
                // Or using the new public method:
                viewModel?.setIsScanningModules(false)
            }
        }
    }

    // This function is suspendable and intended to be called from a coroutine on Dispatchers.IO
    private suspend fun scanAssetsModulesInternal() {
        Log.d(TAG, "scanAssetsModulesInternal: Listing 'modules' directory in assets...")
        val moduleDirs: Array<String>? = try {
            appContext.assets.list("modules")
        } catch (e: IOException) {
            Log.e(TAG, "scanAssetsModulesInternal: IOException listing root 'modules' directory.", e)
            null // Return null to indicate failure
        }

        if (moduleDirs.isNullOrEmpty()) {
            Log.e(TAG, "scanAssetsModulesInternal: 'modules' directory in assets is empty or not found!")
            return
        }
        Log.d(TAG, "scanAssetsModulesInternal: Found asset sub-directories: ${moduleDirs.joinToString()}")

        for (moduleTypeDirName in moduleDirs) {
            // Check if the directory name is a known module type
            if (!modules.containsKey(moduleTypeDirName)) {
                Log.w(TAG, "scanAssetsModulesInternal: Skipping directory '$moduleTypeDirName' as it's not a recognized module type.")
                continue
            }
            Log.d(TAG, "scanAssetsModulesInternal: Processing directory: modules/$moduleTypeDirName")

            val moduleFiles: Array<String>? = try {
                appContext.assets.list("modules/$moduleTypeDirName")
            } catch (e: IOException) {
                Log.e(TAG, "scanAssetsModulesInternal: IOException listing files in 'modules/$moduleTypeDirName'. Skipping.", e)
                continue // Skip this directory
            }

            if (moduleFiles.isNullOrEmpty()) {
                Log.w(TAG, "scanAssetsModulesInternal: No files found in directory: modules/$moduleTypeDirName")
                continue
            }
            Log.d(TAG, "scanAssetsModulesInternal: Files in 'modules/$moduleTypeDirName': ${moduleFiles.joinToString()}")

            for (moduleFile in moduleFiles) {
                if (moduleFile.endsWith(".json")) {
                    val path = "modules/$moduleTypeDirName/$moduleFile"
                    Log.d(TAG, "--- Processing file: $path ---")

                    val jsonString: String = try {
                        appContext.assets.open(path).bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                    } catch (e: IOException) {
                        Log.e(TAG, "IOException reading file $path", e)
                        continue // Skip this file
                    }

                    if (jsonString.isEmpty()) {
                        Log.w(TAG, "File content is empty for: $path")
                        continue
                    }
                    Log.v(TAG, "Raw JSON for $path (first 200 chars): ${jsonString.substring(0, jsonString.length.coerceAtMost(200))}")

                    val moduleJson: JsonObject? = try {
                        gson.fromJson(jsonString, JsonObject::class.java)
                    } catch (e: JsonSyntaxException) {
                        Log.e(TAG, "GSON parsing error for $path. Invalid JSON content.", e)
                        null // Indicate parsing failure
                    }

                    if (moduleJson == null) {
                        Log.e(TAG, "GSON parsing resulted in NULL or invalid JsonObject for $path.")
                        continue
                    }
                    Log.d(TAG, "Successfully parsed JSON for $path")

                    val hasId = moduleJson.has("id") && moduleJson.get("id").isJsonPrimitive && moduleJson.get("id").asJsonPrimitive.isString
                    val hasType = moduleJson.has("type") && moduleJson.get("type").isJsonPrimitive && moduleJson.get("type").asJsonPrimitive.isString
                    val hasName = moduleJson.has("name") && moduleJson.get("name").isJsonPrimitive && moduleJson.get("name").asJsonPrimitive.isString
                    val hasVersion = moduleJson.has("version") && moduleJson.get("version").isJsonPrimitive && moduleJson.get("version").asJsonPrimitive.isString

                    val parsedType = if (hasType) moduleJson.get("type").asString else "N/A_TYPE"
                    val parsedId = if (hasId) moduleJson.get("id").asString else "N/A_ID"

                    Log.d(TAG, "Validation for $path: id=$parsedId (valid: $hasId), type=$parsedType (valid: $hasType), name=${if (hasName) moduleJson.get("name").asString else "N/A_NAME"} (valid: $hasName), version=${if (hasVersion) moduleJson.get("version").asString else "N/A_VERSION"} (valid: $hasVersion)")

                    if (hasId && hasType && hasName && hasVersion) {
                        // Ensure the type from JSON matches the directory name it's in
                        if (parsedType != moduleTypeDirName) {
                            Log.w(TAG, "Module type mismatch for $path: Directory is '$moduleTypeDirName', but JSON 'type' is '$parsedType'. Skipping.")
                            continue
                        }

                        val info = ModuleInfo(
                            id = parsedId,
                            type = parsedType,
                            name = moduleJson.get("name").asString,
                            version = moduleJson.get("version").asString,
                            description = moduleJson.get("description")?.takeIf { it.isJsonPrimitive }?.asString ?: "",
                            active = moduleJson.get("active")?.takeIf { it.isJsonPrimitive }?.asBoolean ?: true,
                            path = "asset://$path",
                            json = moduleJson // Store the full JsonObject
                        )
                        Log.d(TAG, "ModuleInfo created for: ${info.id} of type ${info.type}")
                        addModule(info)
                    } else {
                        Log.w(TAG, "Skipping module $path due to missing or invalid required fields (id, type, name, version).")
                    }
                }
            }
        }
    }

    // scanExternalModules() - remains commented out or for future implementation

    private fun addModule(info: ModuleInfo) {
        val type = info.type
        // modules[type] should always return a synchronized list because of init block
        val list = modules[type]

        if (list == null) {
            // This case should ideally not happen if KNOWN_MODULE_TYPES covers all moduleTypeDirName possibilities
            Log.e(TAG, "addModule: No list found for module type '$type'. Module '${info.id}' not added.")
            return
        }

        // The list is a SynchronizedList; however, the sequence of operations
        // (find index, then replace or add) needs to be atomic.
        synchronized(list) {
            val existingIndex = list.indexOfFirst { item -> item.id == info.id }
            if (existingIndex != -1) {
                list[existingIndex] = info // Replace existing module with the same ID
                Log.i(TAG, "addModule: Successfully REPLACED module: ${info.id} (type: $type)")
            } else {
                list.add(info) // Add new module
                Log.i(TAG, "addModule: Successfully ADDED module: ${info.id} (type: $type)")
            }
        }
    }

    // This function is suspendable and will switch to the Main thread for UI (ViewModel) updates.
    private suspend fun ensureDefaultModulesInternal() {
        val currentViewModel = viewModel ?: run {
            Log.w(TAG, "ensureDefaultModulesInternal: ViewModel is null. Cannot set defaults.")
            return
        }
        Log.d(TAG, "ensureDefaultModulesInternal: Setting default modules on Main thread...")

        withContext(Dispatchers.Main) {
            Log.d(TAG, "ensureDefaultModulesInternal: Executing on ${Thread.currentThread().name}")
            setDefault(currentViewModel::setCurrentSoundPreset, "soundpreset", "default_piano")
            setDefault(currentViewModel::setCurrentFxChain, "fxchain", "default_ambient") // null is also a valid ID for "no chain"
            setDefault(currentViewModel::setCurrentTheme, "theme", "day")
            setDefault(currentViewModel::setCurrentLanguage, "language", "en")
            setDefault(currentViewModel::setCurrentVisualizer, "visualizer", "waves")
            setDefault(currentViewModel::setTouchEffect, "touchEffect", "glow")
            setDefault(currentViewModel::setCurrentScale, "scale", "major")
        }
    }

    // This function is called on the Main thread (due to withContext in ensureDefaultModulesInternal)
    private fun setDefault(setter: (String?) -> Unit, moduleType: String, defaultId: String?) {
        // Create a snapshot (copy) of the list for safe iteration,
        // as the original list might be modified by the IO thread.
        val listSnapshot = modules[moduleType]?.toList() ?: emptyList()
        var selectedIdToSet: String? = defaultId

        Log.d(TAG, "setDefault: Processing type '$moduleType' with defaultId '$defaultId'. Found ${listSnapshot.size} modules.")

        if (listSnapshot.isNotEmpty()) {
            // Prefer an 'active' module if one exists
            val activeModule = listSnapshot.firstOrNull { it.active }

            selectedIdToSet = if (activeModule != null) {
                Log.d(TAG, "setDefault: Found active module for type '$moduleType': ${activeModule.id}")
                activeModule.id
            } else {
                // If no active module, check if the preferred defaultId exists in the list
                val defaultIdExists = defaultId != null && listSnapshot.any { m -> m.id == defaultId }
                if (defaultIdExists) {
                    Log.d(TAG, "setDefault: No active module for '$moduleType'. Default ID '$defaultId' exists. Using it.")
                    defaultId
                } else {
                    // Fallback to the first module in the list if no active and defaultId not found
                    val firstInListId = listSnapshot.first().id // isNotEmpty check ensures this is safe
                    Log.d(TAG, "setDefault: No active module for '$moduleType', defaultId '$defaultId' not found or was null. Using first from list: $firstInListId")
                    firstInListId
                }
            }
        } else {
            Log.w(TAG, "setDefault: Module list for type '$moduleType' is empty. Using provided defaultId: '$defaultId'")
            // selectedIdToSet remains the initial defaultId
        }

        Log.d(TAG, "setDefault for $moduleType: Final ID to set is '$selectedIdToSet'. Calling setter.")
        setter(selectedIdToSet) // Setter should be prepared to handle null if applicable (e.g., for fxChain)
    }

    fun getModules(moduleType: String): List<ModuleInfo> {
        Log.d(TAG, "getModules (Kotlin): Received moduleType: $moduleType")

        // Get a snapshot of the current asset modules for this type.
        // The list itself is synchronized, and toList() creates a shallow copy.
        val assetModules: List<ModuleInfo> = modules[moduleType]?.toList() ?: emptyList()
        Log.d(TAG, "getModules (Kotlin): Found ${assetModules.size} modules in asset cache for type: $moduleType")

        // Special handling for chordProgressions to include user-defined ones.
        if (moduleType == "chordProgression") {
            Log.d(TAG, "getModules (Kotlin): Fetching user-saved chord progressions for type '$moduleType'.")
            val repository = ChordProgressionRepository.getInstance(appContext) // Assuming this is thread-safe or okay to call from any thread
            val userProgressionsJson = repository.userProgressions // Assuming this returns List<JsonObject>

            Log.d(TAG, "getModules (Kotlin): Found ${userProgressionsJson.size} user progressions from repository.")

            val userModuleInfos = userProgressionsJson.mapNotNull { json ->
                try {
                    val id = json.get("id")?.asString
                    val type = json.get("type")?.asString ?: moduleType // Fallback to requested type
                    val name = json.get("name")?.asString ?: "Unnamed"
                    val version = json.get("version")?.asString ?: "1.0.0"
                    val description = json.get("description")?.asString ?: ""
                    // Ensure 'active' is a boolean primitive before trying to get it
                    val active = json.get("active")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean }?.asBoolean ?: true
                    val path = "user_defined"

                    if (id != null && moduleType == type) {
                        ModuleInfo(
                            id = id,
                            type = type,
                            name = name,
                            version = version,
                            description = description,
                            active = active,
                            path = path,
                            json = json
                        )
                    } else {
                        Log.w(TAG, "Skipping user progression due to missing ID or type mismatch: ${json.toString().take(200)}")
                        null
                    }
                } catch (e: Exception) {
                    // Catching generic Exception for issues like ClassCastException, IllegalStateException from JsonElement access
                    Log.e(TAG, "Error converting user progression JsonObject to ModuleInfo: ${json.toString().take(200)}", e)
                    null
                }
            }

            // Merge asset and user modules. User modules override asset modules with the same ID.
            // Using a LinkedHashMap to preserve the order of assetModules first, then add/replace with userModules.
            val combinedModulesMap = LinkedHashMap<String, ModuleInfo>()
            assetModules.forEach { combinedModulesMap[it.id] = it }
            userModuleInfos.forEach { combinedModulesMap[it.id] = it } // User module will overwrite if ID exists

            val result = ArrayList(combinedModulesMap.values)
            Log.d(TAG, "getModules (Kotlin): Total ${result.size} chord progressions after merging for type '$moduleType'.")
            return result
        }
        return assetModules // For other module types, return only asset modules
    }
}