package com.example.prismtone;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;

/**
 * Utility class for file operations
 */
public class FileUtils {
    /**
     * Read a file into a string
     */
    public static String readFile(File file) throws IOException {
        StringBuilder content = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
        }
        return content.toString();
    }
    
    /**
     * Write a string to a file
     */
    public static void writeFile(File file, String content) throws IOException {
        try (FileWriter writer = new FileWriter(file)) {
            writer.write(content);
        }
    }
    
    /**
     * Delete a file
     */
    public static boolean deleteFile(File file) {
        return file.exists() && file.delete();
    }
    
    /**
     * Get all files in a directory with a specific extension
     */
    public static File[] getFilesWithExtension(File directory, String extension) {
        return directory.listFiles((dir, name) -> name.toLowerCase().endsWith(extension));
    }
}
