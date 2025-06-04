// Файл: app\src\main\java\com\example\prismtone\YAxisControls.java
package com.example.prismtone.model;

public class YAxisControls {
    private VolumeControl volume;
    private EffectsControl effects;

    public YAxisControls() {
        this.volume = new VolumeControl();
        this.effects = new EffectsControl();
    }

    public YAxisControls(VolumeControl volume, EffectsControl effects) {
        this.volume = volume != null ? volume : new VolumeControl();
        this.effects = effects != null ? effects : new EffectsControl();
    }

    public VolumeControl getVolume() { return volume; }
    public void setVolume(VolumeControl volume) { this.volume = volume; }

    public EffectsControl getEffects() { return effects; }
    public void setEffects(EffectsControl effects) { this.effects = effects; }

    public static class VolumeControl {
        private double minOutput = 0.0;
        private double maxOutput = 1.0;
        private double yThreshold = 0.0;
        private String curveType = "linear";
        private double curveFactor = 1.0;
        private String outputType = "gain"; // Не используется в UI, но может быть в логике

        public VolumeControl() {}

        // Getters and Setters
        public double getMinOutput() { return minOutput; }
        public void setMinOutput(double minOutput) { this.minOutput = minOutput; }
        public double getMaxOutput() { return maxOutput; }
        public void setMaxOutput(double maxOutput) { this.maxOutput = maxOutput; }
        public double getyThreshold() { return yThreshold; } // Имя геттера изменено
        public void setyThreshold(double yThreshold) { this.yThreshold = yThreshold; } // Имя сеттера изменено
        public String getCurveType() { return curveType; }
        public void setCurveType(String curveType) { this.curveType = curveType; }
        public double getCurveFactor() { return curveFactor; }
        public void setCurveFactor(double curveFactor) { this.curveFactor = curveFactor; }
        public String getOutputType() { return outputType; }
        public void setOutputType(String outputType) { this.outputType = outputType; }
    }

    public static class EffectsControl {
        private double minOutput = -60.0;
        private double maxOutput = 0.0;
        private double yThreshold = 0.1;
        private String curveType = "exponential";
        private double curveFactor = 2.0;
        private String outputType = "db"; // Не используется в UI, но может быть в логике

        public EffectsControl() {}

        // Getters and Setters
        public double getMinOutput() { return minOutput; }
        public void setMinOutput(double minOutput) { this.minOutput = minOutput; }
        public double getMaxOutput() { return maxOutput; }
        public void setMaxOutput(double maxOutput) { this.maxOutput = maxOutput; }
        public double getyThreshold() { return yThreshold; } // Имя геттера изменено
        public void setyThreshold(double yThreshold) { this.yThreshold = yThreshold; } // Имя сеттера изменено
        public String getCurveType() { return curveType; }
        public void setCurveType(String curveType) { this.curveType = curveType; }
        public double getCurveFactor() { return curveFactor; }
        public void setCurveFactor(double curveFactor) { this.curveFactor = curveFactor; }
        public String getOutputType() { return outputType; }
        public void setOutputType(String outputType) { this.outputType = outputType; }
    }
}