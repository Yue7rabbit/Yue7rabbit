import type { App } from '../app/App';
import { toggleFullscreen } from './debugPanel';

/**
 * Operator keyboard shortcuts (all hidden from visitors):
 *  D  debug panel      S  demo A→B→C       F  fullscreen
 *  B  blink            C  commit now       1/2/3  inject excited / serene / tense
 *  M  mute / unmute sound
 */
export function installShortcuts(app: App): void {
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'd':
        app.debug.toggle();
        break;
      case 's':
        app.runDemo(app.demoLoop);
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        app.audio.setMuted(!app.audio.muted);
        break;
      case 'b':
        app.triggerBlink();
        break;
      case 'c':
        app.forceCommit();
        break;
      case '1':
        app.injectKeyword('excited');
        break;
      case '2':
        app.injectKeyword('serene');
        break;
      case '3':
        app.injectKeyword('tense');
        break;
    }
  });
  window.addEventListener('dblclick', toggleFullscreen);
}
