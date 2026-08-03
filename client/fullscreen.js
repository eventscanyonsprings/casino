/**
 * fullscreen.js
 * Shared helper that puts the casino screens into fullscreen (hides the
 * browser address bar / tabs) and keeps them there.
 *
 * Browsers only allow the Fullscreen API to be triggered by a user gesture,
 * so we:
 *   1. Try to enter fullscreen automatically on the first user interaction
 *      (click / touch / keydown).
 *   2. Re-enter fullscreen automatically if the user exits it accidentally
 *      (optional, on by default for kiosk-style use).
 *   3. Expose window.toggleFullscreen() so a button can toggle it manually.
 *
 * For installed-PWA / home-screen launches, pair this with manifest.json
 * (display: fullscreen) so the address bar never appears in the first place.
 */
(function () {
    'use strict';

    const FULLSCREEN_REENTER = true; // re-enter if user exits (kiosk mode)

    function isFullscreen() {
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
    }

    function requestFullscreen() {
        const el = document.documentElement;
        const fn =
            el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen;
        if (fn && !isFullscreen()) {
            // Some browsers return a Promise; swallow rejections (e.g. user denied)
            try {
                const p = fn.call(el);
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {
                /* ignore */
            }
        }
    }

    function exitFullscreen() {
        const fn =
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.mozCancelFullScreen ||
            document.msExitFullscreen;
        if (fn && isFullscreen()) {
            try {
                const p = fn.call(document);
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {
                /* ignore */
            }
        }
    }

    // Public toggle (e.g. bind to a button)
    window.toggleFullscreen = function () {
        if (isFullscreen()) {
            exitFullscreen();
        } else {
            requestFullscreen();
        }
    };

    // Auto-enter on the first user gesture (browsers require a gesture)
    let firstGestureHandled = false;
    function autoEnterOnGesture() {
        if (firstGestureHandled) return;
        firstGestureHandled = true;
        requestFullscreen();
    }

    const gestureEvents = ['click', 'touchstart', 'keydown', 'pointerdown'];
    gestureEvents.forEach(function (evt) {
        document.addEventListener(evt, autoEnterOnGesture, { once: true });
    });

    // Re-enter fullscreen if the user exits it (kiosk behavior)
    if (FULLSCREEN_REENTER) {
        const changeEvents = [
            'fullscreenchange',
            'webkitfullscreenchange',
            'mozfullscreenchange',
            'msfullscreenchange'
        ];
        changeEvents.forEach(function (evt) {
            document.addEventListener(evt, function () {
                if (!isFullscreen()) {
                    // Slight delay so it doesn't fight the browser's own exit
                    setTimeout(requestFullscreen, 300);
                }
            });
        });
    }

    // Also try on load (works in some kiosk/PWA contexts without a gesture)
    requestFullscreen();
})();