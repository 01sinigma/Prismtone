const PadAnimationEngine = {
    trigger: (animationName, element) => {
        if (!element) return;

        const animationClass = `animation-${animationName}`;
        
        // Ensure the class is removed before re-adding it to re-trigger the animation
        element.classList.remove(animationClass);

        // A small delay to allow the browser to remove the class before adding it again
        requestAnimationFrame(() => {
            element.classList.add(animationClass);
            setTimeout(() => {
                element.classList.remove(animationClass);
            }, 300); // Duration of the animation
        });
    }
};
