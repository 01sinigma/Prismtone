package com.example.prismtone;

import com.google.gson.JsonObject;

public class ModuleInfo {
    private final String id;
    private final String type;
    private final String name;
    private final String version;
    private final String description;
    private final boolean active;
    private final String path;
    private final JsonObject data;

    public ModuleInfo(String id, String type, String name, String version, 
                     String description, boolean active, String path, JsonObject data) {
        this.id = id;
        this.type = type;
        this.name = name;
        this.version = version;
        this.description = description;
        this.active = active;
        this.path = path;
        this.data = data;
    }

    public String getId() {
        return id;
    }

    public String getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public String getVersion() {
        return version;
    }

    public String getDescription() {
        return description;
    }

    public boolean isActive() {
        return active;
    }

    public String getPath() {
        return path;
    }

    public JsonObject getData() {
        return data;
    }
    
    @Override
    public String toString() {
        return "ModuleInfo{" +
                "id='" + id + '\'' +
                ", type='" + type + '\'' +
                ", name='" + name + '\'' +
                ", version='" + version + '\'' +
                '}';
    }
}
