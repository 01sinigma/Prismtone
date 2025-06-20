// Файл: app/src/main/java/com/example/prismtone/SensorController.java
// ВЕРСИЯ 1.1: Добавлены проверки на null для сенсоров.

package com.example.prismtone;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;

public class SensorController implements SensorEventListener {

    private static final String TAG = "SensorController";
    private final SensorManager sensorManager;
    private final Sensor accelerometer;
    private final Sensor magnetometer;

    // --- Добавляем проверку на наличие сенсоров ---
    private final boolean hasRequiredSensors;

    private final float[] accelerometerReading = new float[3];
    private final float[] magnetometerReading = new float[3];
    private final float[] rotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    private final PrismtoneBridge bridge;
    private long lastUpdateTime = 0;
    private static final long UPDATE_INTERVAL_MS = 33; // ~30 Гц

    public SensorController(Context context, PrismtoneBridge bridge) {
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        this.bridge = bridge;

        // --- Инициализация сенсоров с проверкой на null ---
        if (this.sensorManager != null) {
            this.accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            this.magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        } else {
            this.accelerometer = null;
            this.magnetometer = null;
            Log.e(TAG, "SensorManager service not available!");
        }

        if (this.accelerometer == null) {
            Log.e(TAG, "Accelerometer not available on this device.");
        }
        if (this.magnetometer == null) {
            Log.e(TAG, "Magnetometer not available on this device.");
        }

        // --- Устанавливаем флаг, только если все нужные сенсоры есть ---
        this.hasRequiredSensors = this.accelerometer != null && this.magnetometer != null;
    }

    public void start() {
        // --- Регистрируем слушателей только если сенсоры существуют ---
        if (hasRequiredSensors) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
            sensorManager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_UI);
            Log.i(TAG, "Sensor listeners registered.");
        } else {
            Log.w(TAG, "Cannot start sensor listeners: required sensors are missing.");
        }
    }

    public void stop() {
        // --- Проверяем sensorManager перед использованием ---
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
            Log.i(TAG, "Sensor listeners unregistered.");
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Не используется
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        // --- Проверяем, что мы вообще должны работать с сенсорами ---
        if (!hasRequiredSensors) return;

        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, accelerometerReading, 0, accelerometerReading.length);
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, magnetometerReading, 0, magnetometerReading.length);
        }

        long currentTime = System.currentTimeMillis();
        if ((currentTime - lastUpdateTime) > UPDATE_INTERVAL_MS) {
            lastUpdateTime = currentTime;
            updateOrientationAngles();
        }
    }

    private void updateOrientationAngles() {
        boolean success = SensorManager.getRotationMatrix(rotationMatrix, null, accelerometerReading, magnetometerReading);

        // --- Проверяем, что матрица вращения успешно получена ---
        if (success) {
            SensorManager.getOrientation(rotationMatrix, orientationAngles);

            float pitch = (float) Math.toDegrees(orientationAngles[1]);
            float roll = (float) Math.toDegrees(orientationAngles[2]);

            if (bridge != null) {
                bridge.sendDeviceTiltToJs(pitch, roll);
            }
        }
    }
}