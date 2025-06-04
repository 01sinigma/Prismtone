// Файл: app/src/main/assets/js/bridge-fix.js
// Provides fixes or wrappers for potential bridge issues (timing, errors)
const bridgeFix = {

    /**
     * Calls a function on the PrismtoneBridge, handling potential errors and timing issues.
     * @param {string} functionName - The name of the bridge function to call.
     * @param {...any} args - Arguments to pass to the bridge function.
     * @returns {Promise<any>} - A promise that resolves with the bridge function's return value or rejects on error.
     */
    async callBridge(functionName, ...args) {
        // console.log(`[BridgeFix] Attempting call: ${functionName}`, args); // Лог вызова (можно раскомментировать для детальной отладки)
        return new Promise((resolve, reject) => {
            if (window.PrismtoneBridge && typeof window.PrismtoneBridge[functionName] === 'function') {
                try {
                    // Преобразуем аргументы в строки, если они объекты (кроме простых типов)
                    const stringArgs = args.map(arg => {
                        if (typeof arg === 'object' && arg !== null) {
                            try {
                                return JSON.stringify(arg);
                            } catch (e) {
                                console.error(`[BridgeFix] Error stringifying argument for ${functionName}:`, arg, e);
                                return null; // Или бросить ошибку? Пока null.
                            }
                        }
                        return arg; // Оставляем примитивы как есть
                    });

                    // Фильтруем null аргументы, возникшие из-за ошибки stringify
                    const finalArgs = stringArgs.filter(arg => arg !== null);
                    if (finalArgs.length !== args.length) {
                         console.error(`[BridgeFix] Some arguments could not be stringified for ${functionName}. Aborting call.`);
                         reject(new Error(`Argument stringification failed for ${functionName}`));
                         return;
                    }

                    // console.log(`[BridgeFix] Executing: PrismtoneBridge.${functionName}`, finalArgs);
                    const result = window.PrismtoneBridge[functionName](...finalArgs);

                    // Android JavascriptInterface calls are synchronous from JS perspective.
                    // The result is returned immediately.
                    // console.log(`[BridgeFix] Result [${functionName}]:`, result);

                    // Проверяем, не вернула ли Java ошибку в виде строки
                    if (typeof result === 'string' && result.toLowerCase().startsWith('error:')) {
                        console.error(`[BridgeFix] Bridge function '${functionName}' returned an error string: ${result}`);
                        reject(new Error(result)); // Отклоняем Promise с ошибкой
                    } else {
                        resolve(result); // Успешно разрешаем Promise
                    }

                } catch (error) {
                    console.error(`[BridgeFix] Error executing bridge function '${functionName}':`, error, error.stack);
                    reject(new Error(`Bridge call execution failed: ${error.message}`));
                }
            } else {
                // Мост недоступен или функция отсутствует
                const errorMsg = `Bridge function '${functionName}' not found or bridge not ready.`;
                console.error(`[BridgeFix] ${errorMsg}`);
                reject(new Error(errorMsg));
            }
        });
    }

    // Можно добавить другие обертки или хелперы при необходимости
};