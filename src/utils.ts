/**
 * Throttles a function with `requestAnimationFrame()`
 */
export function rafThrottle(callback: Function) {

    let requestId: number | null = null;

    const later = (context: any) => () => {
        requestId = null;
        callback.apply(context);
    };

    const throttled = function (this: any) {
        if (requestId === null) {
            requestId = requestAnimationFrame(later(this));
        }
    };

    throttled.cancel = () => {
        cancelAnimationFrame(requestId!);
        requestId = null;
    };

    return throttled;
}

/**
 * Injects Function into page context
 */
export function inject(func: Function) {

    const scr = document.createElement('script');
    scr.type = 'text/javascript';
    scr.textContent = `(${func})();`;
    (document.head || document.documentElement).appendChild(scr);
}