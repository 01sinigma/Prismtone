// Файл: app/src/main/java/com/example/prismtone/SensorController.java
// ВЕРСИЯ 3.0: Полный контроль над осями и силой вынесен в настраиваемые переменные.

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
 * Управляет сенсором ориентации, преобразует данные для ландшафтного режима,
 * применяет пользовательские настройки (инверсия, сила) и отправляет
 * финальные, готовые к использованию значения в JavaScript.
 */
public class SensorController implements SensorEventListener {
    private static final String TAG = "SensorController";
    private SensorManager sensorManager; // Made non-final for potential re-init if needed
    private Sensor rotationVectorSensor; // Made non-final
    private final PrismtoneBridge bridge;
    private final WindowManager windowManager;

    // Массивы для вычислений, вынесены для производительности
    private final float[] rotationMatrix = new float[9];
    private final float[] remappedRotationMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    // ====================================================================
    // === USER-CONFIGURABLE SETTINGS (ПОЛЬЗОВАТЕЛЬСКИЕ НАСТРОЙКИ) ===
    // ====================================================================

    /**
     * Коэффициент сглаживания "дрожания" данных.
     * 0 < ALPHA < 1. Чем меньше значение, тем более плавными, но инертными будут данные.
     * Хорошее значение: 0.15f
     */
    private float smoothingAlpha = 0.15f;

    /**
     * Инвертировать вертикальную ось (Pitch: наклон вперед/назад)?
     * false: Наклон "на себя" -> объекты движутся ВВЕРХ (интуитивно для "всплытия").
     * true:  Наклон "на себя" -> объекты движутся ВНИЗ (интуитивно для "падения").
     */
    private boolean invertPitchAxis = true;

    /**
     * Инвертировать горизонтальную ось (Roll: наклон влево/вправо)?
     * false: Наклон вправо -> объекты движутся ВПРАВО.
     * true:  Наклон вправо -> объекты движутся ВЛЕВО.
     */
    private boolean invertRollAxis = false;

    /**
     * Поменять оси местами?
     * false: (Стандарт) Pitch -> Y, Roll -> X.
     * true:  Pitch -> X, Roll -> Y. Полезно, если физика визуализатора этого требует.
     */
    private boolean swapAxes = false;

    // ====================================================================

    // Public setters for these properties
    public void setSmoothingAlpha(float alpha) {
        if (alpha > 0 && alpha < 1) { // Basic validation
            this.smoothingAlpha = alpha;
            Log.d(TAG, "Smoothing Alpha updated to: " + alpha);
        } else {
            Log.w(TAG, "Invalid Smoothing Alpha value: " + alpha + ". Must be between 0 and 1.");
        }
    }

    public void setInvertPitchAxis(boolean invert) {
        this.invertPitchAxis = invert;
        Log.d(TAG, "Invert Pitch Axis updated to: " + invert);
    }

    public void setInvertRollAxis(boolean invert) {
        this.invertRollAxis = invert;
        Log.d(TAG, "Invert Roll Axis updated to: " + invert);
    }

    public void setSwapAxes(boolean swap) {
        this.swapAxes = swap;
        Log.d(TAG, "Swap Axes updated to: " + swap);
    }
    // End of public setters

    private float smoothedPitch = 0f;
    private float smoothedRoll = 0f;

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

        // 1. Получаем матрицу поворота
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);

        // 2. Переназначаем систему координат для ландшафтного режима
        // Используем AXIS_X и AXIS_Z, так как это стандарт для большинства телефонов в ландшафте.
        // Если телефон держится в "обратном" ландшафте, может потребоваться другая комбинация.
        // Однако, getRotation() ниже должен это учитывать.
        int rotation = 0;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (windowManager != null && windowManager.getDefaultDisplay() != null) {
                rotation = windowManager.getDefaultDisplay().getRotation();
            }
        } else {
            // Для старых версий API (до R)
            if (windowManager != null && windowManager.getDefaultDisplay() != null) {
                rotation = windowManager.getDefaultDisplay().getRotation();
            }
        }


        int axisX = SensorManager.AXIS_X;
        int axisY = SensorManager.AXIS_Z; // Обычно Z для ландшафта, Y для портрета

        switch (rotation) {
            case Surface.ROTATION_0: // Портретный режим (редко для этого приложения, но на всякий случай)
                axisX = SensorManager.AXIS_X;
                axisY = SensorManager.AXIS_Y;
                break;
            case Surface.ROTATION_90: // Ландшафтный режим (телефон повернут влево)
                axisX = SensorManager.AXIS_Y;
                axisY = SensorManager.AXIS_MINUS_X;
                break;
            case Surface.ROTATION_180: // Обратный портретный (редко)
                axisX = SensorManager.AXIS_MINUS_X;
                axisY = SensorManager.AXIS_MINUS_Y;
                break;
            case Surface.ROTATION_270: // Обратный ландшафтный (телефон повернут вправо)
                axisX = SensorManager.AXIS_MINUS_Y;
                axisY = SensorManager.AXIS_X;
                break;
        }
        SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, remappedRotationMatrix);

        // 3. Получаем углы ориентации
        SensorManager.getOrientation(remappedRotationMatrix, orientationAngles);

        // 4. Конвертируем в градусы. Здесь знаки пока не трогаем.
        // orientationAngles[1] - pitch, наклон вперед/назад
        // orientationAngles[2] - roll, наклон влево/вправо
        float rawPitch = (float) Math.toDegrees(orientationAngles[1]);
        float rawRoll = (float) Math.toDegrees(orientationAngles[2]);

        // 5. Применяем пользовательские настройки инверсии и смены осей
        float finalPitch = this.invertPitchAxis ? -rawPitch : rawPitch;
        float finalRoll = this.invertRollAxis ? -rawRoll : rawRoll;

        float valueForJsPitch;
        float valueForJsRoll;

        if (this.swapAxes) {
            // Если оси поменяны местами
            valueForJsPitch = finalRoll;
            valueForJsRoll = finalPitch;
        } else {
            // Стандартное сопоставление
            valueForJsPitch = finalPitch;
            valueForJsRoll = finalRoll;
        }

        // 6. Сглаживаем финальные значения
        smoothedPitch = smoothedPitch + this.smoothingAlpha * (valueForJsPitch - smoothedPitch);
        smoothedRoll = smoothedRoll + this.smoothingAlpha * (valueForJsRoll - smoothedRoll);

        // 7. Отправляем готовые к использованию данные в JavaScript
        if (bridge != null) {
            bridge.sendDeviceTiltToJs(smoothedPitch, smoothedRoll);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* Не используется */ }
}