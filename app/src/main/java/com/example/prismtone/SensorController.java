// Файл: app/src/main/java/com/example/prismtone/SensorController.java
package com.example.prismtone;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

public class SensorController implements SensorEventListener {
    private static final String TAG = "SensorController";
    private final SensorManager sensorManager;
    private final Sensor rotationVectorSensor;
    private final PrismtoneBridge bridge;
    private final WindowManager windowManager;

    private final float[] rotationMatrix = new float[9];
    private final float[] remappedRotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    private static final float ALPHA = 0.15f;
    private float lastPitch = 0f;
    private float lastRoll = 0f;

    public SensorController(Context context, PrismtoneBridge bridge) {
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        this.rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        this.bridge = bridge;
        this.windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);

        if (rotationVectorSensor == null) {
            Log.w(TAG, "Rotation Vector Sensor not available on this device.");
        }
    }

    public void start() {
        if (rotationVectorSensor != null) {
            sensorManager.registerListener(this, rotationVectorSensor, SensorManager.SENSOR_DELAY_UI);
        }
    }

    public void stop() {
        if (rotationVectorSensor != null) {
            sensorManager.unregisterListener(this);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) {
            return;
        }

        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);

        Display display = windowManager.getDefaultDisplay();
        int displayRotation = display.getRotation();

        // Эта логика переназначения осей остается, она важна для корректной работы в ландшафте.
        int worldAxisX = SensorManager.AXIS_X;
        int worldAxisY = SensorManager.AXIS_Y;

        switch (displayRotation) {
            case Surface.ROTATION_90:
                worldAxisX = SensorManager.AXIS_Y;
                worldAxisY = SensorManager.AXIS_MINUS_X;
                break;
            case Surface.ROTATION_270:
                worldAxisX = SensorManager.AXIS_MINUS_Y;
                worldAxisY = SensorManager.AXIS_X;
                break;
            // ROTATION_0 и ROTATION_180 остаются по умолчанию
        }

        SensorManager.remapCoordinateSystem(rotationMatrix, worldAxisX, worldAxisY, remappedRotationMatrix);
        SensorManager.getOrientation(remappedRotationMatrix, orientationAngles);

        // >>> ИСПРАВЛЕНИЕ: Инвертируем знаки для pitch и roll <<<
        // Конвертируем радианы в градусы и сразу меняем знак, чтобы соответствовать визуальному восприятию.

        // Pitch: наклон телефона "от себя" (верхний край вниз) должен давать отрицательные значения.
        // Стандартно он дает положительные, поэтому инвертируем.
        float rawPitch = -(float) Math.toDegrees(orientationAngles[1]);

        // Roll: наклон телефона "вправо" (правый край вниз) должен давать положительные значения.
        // Стандартно он дает отрицательные, поэтому инвертируем.
        float rawRoll = -(float) Math.toDegrees(orientationAngles[2]);

        // Сглаживаем "дрожащие" данные от сенсора
        lastPitch = lastPitch + ALPHA * (rawPitch - lastPitch);
        lastRoll = lastRoll + ALPHA * (rawRoll - lastRoll);

        // Отправляем исправленные и сглаженные данные в JavaScript
        if (bridge != null) {
            bridge.sendDeviceTiltToJs(lastPitch, lastRoll);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Не используется
    }
}