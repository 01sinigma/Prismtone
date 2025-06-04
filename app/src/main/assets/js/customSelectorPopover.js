// app/src/main/assets/js/customSelectorPopover.js

// Объявляем функцию в глобальной области видимости
// eslint-disable-next-line no-unused-vars
function showCustomSelectorPopover(options) {
    const {
        type, // 'language', 'theme', 'visualizer', 'touchEffect', 'scale', 'fxChain'
        title, // Заголовок для поповера
        selectElement, // Оригинальный <select> элемент (для получения текущего значения или как fallback)
        currentValue, // Текущее выбранное значение
        onSelect, // callback(newValue)
        parentPanelId // (Опционально) ID родительской панели для позиционирования или стилизации
    } = options;

    console.log(`[CustomSelector] Showing for type: ${type}, title: ${title}, currentValue: ${currentValue}`);

    const popoverElement = document.getElementById('custom-selector-popover');
    const backdropElement = popoverElement?.querySelector('.custom-selector-backdrop');
    const modalElement = popoverElement?.querySelector('.custom-selector-modal');
    const titleElement = popoverElement?.querySelector('#custom-selector-title');
    const optionsContainer = popoverElement?.querySelector('#custom-selector-options');
    const closeButton = popoverElement?.querySelector('#custom-selector-close');

    if (!popoverElement || !backdropElement || !modalElement || !titleElement || !optionsContainer || !closeButton) {
        console.error('[CustomSelector] Critical UI elements for popover are missing!');
        // Возможно, здесь стоит показать стандартный select, если он есть
        if (selectElement && typeof selectElement.click === 'function') {
            // selectElement.click(); // Это не сработает для открытия, только для фокуса
        }
        return;
    }

    titleElement.textContent = title || i18n.translate('select_option', 'Select Option');
    optionsContainer.innerHTML = ''; // Очищаем предыдущие опции

    let itemsPromise;

    // === ПАТЧ: поддержка передачи itemsArray напрямую ===
    if (options.itemsArray) {
        itemsPromise = Promise.resolve(options.itemsArray);
    } else {
        // Загружаем опции в зависимости от типа
        switch (type) {
            case 'language':
            case 'theme':
            case 'visualizer':
            case 'touchEffect':
            case 'scale':
            case 'fxChain':
                console.log(`[CustomSelector] Calling moduleManager.getModules with type: ${type}`);
                itemsPromise = moduleManager.getModules(type, true); // true для forceRefresh, чтобы всегда были свежие данные
                break;
            default:
                console.warn(`[CustomSelector] Unknown type: ${type}. Trying to read from selectElement.`);
                // Попытка прочитать из <select> элемента как fallback
                if (selectElement && selectElement.options) {
                    const selectOptions = Array.from(selectElement.options).map(opt => ({
                        id: opt.value,
                        name: opt.textContent,
                        // Для тем может понадобиться специальная логика для цвета
                    }));
                    itemsPromise = Promise.resolve(selectOptions);
                } else {
                    itemsPromise = Promise.resolve([]);
                }
        }
    }

    itemsPromise.then(items => {
        if (!Array.isArray(items)) {
            console.error(`[CustomSelector] Module items for type '${type}' is not an array. Got:`, items);
            items = [];
        }

        console.log(`[CustomSelector] Loaded ${items.length} items for type: ${type}`);

        if (type === 'fxChain') {
            // Добавляем опцию "-- None --" для FX Chain
            const noneOption = document.createElement('button');
            noneOption.className = 'custom-selector-option';
            noneOption.dataset.value = ""; // Пустое значение для "None"
            const noneLabel = document.createElement('span');
            noneLabel.className = 'option-label';
            noneLabel.textContent = i18n.translate('none_fxchain', '-- None --');
            noneOption.appendChild(noneLabel);
            if (currentValue === null || currentValue === "") {
                noneOption.classList.add('active');
            }
            noneOption.addEventListener('click', () => handleSelect(""));
            optionsContainer.appendChild(noneOption);
        } else if (type === 'touchEffect') {
             const noneOption = document.createElement('button');
             noneOption.className = 'custom-selector-option';
             noneOption.dataset.value = "none";
             const noneLabel = document.createElement('span');
             noneLabel.className = 'option-label';
             noneLabel.textContent = i18n.translate('none_touch_effect', 'None');
             noneOption.appendChild(noneLabel);
             if (currentValue === "none") {
                 noneOption.classList.add('active');
             }
             noneOption.addEventListener('click', () => handleSelect("none"));
             optionsContainer.appendChild(noneOption);
        }


        items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        items.forEach(item => {
            const optionButton = document.createElement('button');
            optionButton.className = 'custom-selector-option';
            optionButton.dataset.value = item.id;

            const previewSpan = document.createElement('span');
            previewSpan.className = 'option-preview';
            // Добавляем специфичные для типа превью
            if (type === 'theme' && item.data?.data?.colors?.primary) {
                previewSpan.classList.add('theme');
                previewSpan.style.backgroundColor = item.data.data.colors.primary;
                if (item.data.data.colors.text) { // Цвет текста для лучшей читаемости превью
                    const textColor = item.data.data.colors.text;
                    const contrastBackground =視覺対比の良い色(item.data.data.colors.primary, textColor); // вымышленная функция
                    if (contrastBackground !== item.data.data.colors.primary) {
                         // previewSpan.style.borderColor = textColor; // или другой способ указать контраст
                    }
                }
            } else if (type === 'language') {
                previewSpan.classList.add('language');
                previewSpan.textContent = item.id.toUpperCase(); // Например, "EN", "RU"
            } else if (type === 'visualizer') {
                previewSpan.classList.add('visualizer');
                previewSpan.textContent = 'V'; // Простая иконка
            } else if (type === 'touchEffect') {
                 previewSpan.classList.add('touchEffect');
                 previewSpan.textContent = '✨';
            } else if (type === 'scale') {
                previewSpan.classList.add('scale');
                previewSpan.textContent = '♪';
            } else if (type === 'fxChain') {
                 previewSpan.classList.add('fxchain');
                 previewSpan.textContent = 'FX';
            }
            // ... другие типы по необходимости ...
            optionButton.appendChild(previewSpan);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'option-label';
            labelSpan.textContent = item.name || item.id;
            optionButton.appendChild(labelSpan);

            if (item.id === currentValue) {
                optionButton.classList.add('active');
            }

            optionButton.addEventListener('click', () => handleSelect(item.id));
            optionsContainer.appendChild(optionButton);
        });

        if (items.length === 0 && type !== 'fxChain' && type !== 'touchEffect') {
             const noItemsMsg = document.createElement('div');
             noItemsMsg.className = 'custom-selector-option disabled';
             noItemsMsg.textContent = i18n.translate(`no_${type}_found`, `No ${type}s found`);
             optionsContainer.appendChild(noItemsMsg);
        }

        popoverElement.style.display = 'flex'; // Показываем поповер
        requestAnimationFrame(() => {
            modalElement.classList.add('active'); // для анимации появления
            popoverElement.classList.add('active');
        });

    }).catch(error => {
        console.error(`[CustomSelector] Error loading items for type ${type}:`, error);
        optionsContainer.innerHTML = `<div class="custom-selector-option disabled">${i18n.translate('error_loading_options', 'Error loading options')}</div>`;
        popoverElement.style.display = 'flex';
        requestAnimationFrame(() => {
            modalElement.classList.add('active');
            popoverElement.classList.add('active');
        });
    });

    function closePopover() {
        modalElement.classList.remove('active');
        popoverElement.classList.remove('active');
        // Используем transitionend для скрытия после завершения анимации
        const onTransitionEnd = () => {
            popoverElement.style.display = 'none';
            modalElement.removeEventListener('transitionend', onTransitionEnd);
        };
        modalElement.addEventListener('transitionend', onTransitionEnd);

        // Фоллбэк, если transitionend не сработает (например, нет анимации)
        setTimeout(() => {
             if (popoverElement.style.display !== 'none') {
                popoverElement.style.display = 'none';
             }
        }, 300); // Длительность должна соответствовать CSS transition
    }

    function handleSelect(value) {
        console.log(`[CustomSelector] Selected value: ${value} for type: ${type}`);
        if (selectElement) {
            selectElement.value = value; // Все равно обновляем скрытый select для хранения значения

            // === НОВОЕ: Обновление текстового дисплея ===
            const displayElementId = selectElement.id + '-display'; // e.g., scale-select-display
            const displayElement = document.getElementById(displayElementId);
            if (displayElement) {
                const selectedOption = Array.from(optionsContainer.querySelectorAll('.custom-selector-option'))
                                         .find(opt => opt.dataset.value === value);
                if (selectedOption) {
                    const labelSpan = selectedOption.querySelector('.option-label');
                    displayElement.textContent = labelSpan ? labelSpan.textContent : value;
                } else if (value === "" && type === "fxChain") { // Особый случай для "-- None --" FX Chain
                    displayElement.textContent = i18n.translate('none_fxchain', '-- None --');
                } else if (value === "none" && type === "touchEffect") {
                     displayElement.textContent = i18n.translate('none_touch_effect', 'None');
                }
                 else {
                    displayElement.textContent = value; // Fallback
                }
            }
            // ========================================
        }
        if (typeof onSelect === 'function') {
            onSelect(value);
        }
        closePopover();
    }

    // Обработчики закрытия
    backdropElement.addEventListener('click', closePopover, { once: true });
    closeButton.addEventListener('click', closePopover, { once: true });

    // Закрытие по Esc
    function handleEscKey(event) {
        if (event.key === 'Escape') {
            closePopover();
            document.removeEventListener('keydown', handleEscKey);
        }
    }
    document.addEventListener('keydown', handleEscKey);
}

// Вымышленная функция для примера контрастного цвета, ее нужно реализовать
// function getContrastColor(bgColor, lightColor = '#FFFFFF', darkColor = '#000000') {
//     if (!bgColor) return darkColor;
//     const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
//     const r = parseInt(color.substring(0, 2), 16); // hexToR
//     const g = parseInt(color.substring(2, 4), 16); // hexToG
//     const b = parseInt(color.substring(4, 6), 16); // hexToB
//     return (((r * 0.299) + (g * 0.587) + (b * 0.114)) > 186) ? darkColor : lightColor;
// }

// CSS стили для этого поповера должны быть в styles.css или themes.css
// Пример стилей был в одном из предыдущих ответов (секция про `.custom-selector-popover` и т.д.)

// Явное присвоение функции в глобальную область видимости для надежности
if (typeof window !== 'undefined') {
    window.showCustomSelectorPopover = showCustomSelectorPopover;
}