import { inject } from 'utils'
import { MBFixer } from 'mb'

inject(() => {
    // disable facebook & google
    //@ts-ignore
    HTMLElement.prototype.insertBefore = () => {};

    // disable contalyze
    Object.defineProperty(window, 'onload', {
        value: () => {},
        writable: false,
        enumerable: false,
        configurable: false,
    });

    // disable popunderjs
    Object.defineProperty(window, 'vavpo', {
        value: null,
        writable: false,
        enumerable: false,
        configurable: false,
    });
});

// run the following code as soon as possible, but only once
document.addEventListener('readystatechange', () => {

    // cloudflare challenge
    const cf = document.getElementById('challenge-form') as HTMLFormElement | null;
    if (cf) return;

    // extension will only be active if the site is used with a hash
    if (location.hash) {
        (window as any).M = new MBFixer(location.hash.slice(1), true);
    }

}, { once: true });