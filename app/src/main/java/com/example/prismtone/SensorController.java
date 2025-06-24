// Файл: app/src/main/java/com/example/prismtone/SensorController.java
// ВЕРСИЯ 2.0: Стандартизированная и отказоустойчивая обработка наклона

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

/**
 * Управляет сенсором ориентации устройства (Rotation Vector).
 * Его задача - получать данные о наклоне, корректно преобразовывать их
 * для ландшафтного режима, сглаживать и отправлять в JavaScript.
 */
public class SensorController implements SensorEventListener {
    private static final String TAG = "SensorController";
    private final SensorManager sensorManager;
    private final Sensor rotationVectorSensor;
    private final PrismtoneBridge bridge;
    private final WindowManager windowManager;

    // Массивы для вычислений, вынесены для производительности
    private final float[] rotationMatrix = new float[9];
    private final float[] remappedRotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    // Коэффициент для фильтра нижних частот для сглаживания "дрожания" данных
    private static final float ALPHA = 0.15f;
    private float smoothedPitch = 0f;
    private float smoothedRoll = 0f;

    public SensorController(Context context, PrismtoneBridge bridge) {
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        // Rotation Vector - лучший выбор для ориентации, так как он программно объединяет
        // данные с акселерометра, гироскопа и магнитометра.
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

        // 1. Получаем матрицу поворота из данных сенсора
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);

        // 2. Определяем текущую ориентацию дисплея
        Display display = windowManager.getDefaultDisplay();

        // 3. Переназначаем систему координат, чтобы оси соответствовали ландшафтному виду
        SensorManager.remapCoordinateSystem(rotationMatrix, SensorManager.AXIS_X, SensorManager.AXIS_Z, remappedRotationMatrix);

        // 4. Получаем углы ориентации
        SensorManager.getOrientation(remappedRotationMatrix, orientationAngles);

        // 5. Конвертируем в градусы и стандартизируем
        // Pitch (тангаж): Наклон верхнего края телефона "от себя" -> отрицательные значения. Наклон "на себя" -> положительные.
        float rawPitch = (float) Math.toDegrees(orientationAngles[1]);

        // Roll (крен): Наклон правого края телефона "вниз" (наклон вправо) -> положительные значения. Наклон влево -> отрицательные.
        float rawRoll = (float) Math.toDegrees(orientationAngles[2]);

        // 6. Сглаживаем "дрожащие" данные
        smoothedPitch = smoothedPitch + ALPHA * (rawPitch - smoothedPitch);
        smoothedRoll = smoothedRoll + ALPHA * (rawRoll - smoothedRoll);

        // 7. Отправляем финальные данные в JavaScript
        if (bridge != null) {
            bridge.sendDeviceTiltToJs(smoothedPitch, smoothedRoll);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* Не используется */ }
}