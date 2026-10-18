import { IS_DEV } from './env.js';

// Optional frame-time panel (mr.doob Stats). `?stats=1` shows it; F8 toggles
// it in dev. Nothing is loaded or created until it is first shown.
function statsRequestedByUrl() {
  try {
    return new URLSearchParams(window.location.search).get('stats') === '1';
  } catch {
    return false;
  }
}

export function createStatsOverlay({ enabled = statsRequestedByUrl() } = {}) {
  let stats = null;
  let visible = false;
  let loading = false;

  function attach() {
    stats = new globalThis.Stats();
    stats.showPanel(0);
    // The vendored Stats (r16) exposes `domElement`; newer builds expose `dom`.
    stats.dom = stats.dom || stats.domElement;
    Object.assign(stats.dom.style, {
      position: 'fixed',
      left: '50%',
      top: '8px',
      transform: 'translateX(-50%)',
      zIndex: '10000',
    });
    document.body.appendChild(stats.dom);
  }

  function show() {
    visible = true;
    if (stats) {
      stats.dom.style.display = 'block';
    } else if (globalThis.Stats) {
      attach();
    } else if (!loading) {
      loading = true;
      const script = document.createElement('script');
      script.src = `${import.meta.env.BASE_URL}libs/Stats.min.js`;
      script.onload = () => {
        if (visible) attach();
      };
      document.head.appendChild(script);
    }
  }

  function hide() {
    visible = false;
    if (stats) stats.dom.style.display = 'none';
  }

  if (enabled) show();

  return {
    begin() {
      stats?.begin();
    },
    end() {
      stats?.end();
    },
    toggle() {
      if (!IS_DEV) return;
      if (visible) hide();
      else show();
    },
  };
}
