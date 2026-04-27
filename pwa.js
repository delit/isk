/**
 * PWA: service worker, installation (Android) och version mot GitHub.
 */
(function () {
  const pageDir = new URL('./', window.location.href);
  const versionUrl = new URL('version.json', pageDir).href;

  function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  /* ---- Service worker (alltid, även desktop — inget UI) ---- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(new URL('sw.js', pageDir).href, { scope: pageDir.href })
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            if (w) {
              w.addEventListener('statechange', () => {
                if (w.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateVisible(true);
                }
              });
            }
          });
        })
        .catch(() => {});
    });
  }

  function setUpdateVisible(visible) {
    const u = document.getElementById('pwaUpdateBtn');
    if (u) u.hidden = !visible;
  }

  /* ---- Android: beforeinstallprompt ---- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn && isMobileLayout()) {
      btn.hidden = false;
    }
  });

  document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) {
      btn.hidden = true;
    }
  });

  document.getElementById('pwaUpdateBtn')?.addEventListener('click', async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
    } catch (e) {}
    window.location.reload();
  });

  /* ---- Publik länk + ev. uppdatering mot GitHub (endast smal skärm) ---- */
  async function checkVersions() {
    if (!isMobileLayout()) {
      return;
    }

    const elLink = document.getElementById('pwaPublicLink');

    let remoteUrl = '';
    try {
      const r = await fetch(versionUrl, { cache: 'no-store' });
      const j = await r.json();
      remoteUrl = (j.githubVersionUrl && String(j.githubVersionUrl).trim()) || '';
      const localVer = j.version != null ? String(j.version) : '';
      const pub = (j.publicPageUrl && String(j.publicPageUrl).trim()) || '';
      if (elLink && pub && !pub.includes('ANVÄNDARE.github.io')) {
        elLink.href = pub;
        elLink.hidden = false;
      }
      if (!remoteUrl || remoteUrl.includes('ANVÄNDARE/REPO')) {
        setUpdateVisible(false);
        return;
      }
      const rr = await fetch(remoteUrl, { cache: 'no-store' });
      const jr = await rr.json();
      const remoteVer = jr.version != null ? String(jr.version) : '';
      if (localVer && remoteVer && localVer !== remoteVer) {
        setUpdateVisible(true);
      } else {
        setUpdateVisible(false);
      }
    } catch (e) {
      setUpdateVisible(false);
    }
  }

  checkVersions();
  window.setInterval(() => {
    if (isMobileLayout()) checkVersions();
  }, 4 * 60 * 60 * 1000);

  window.addEventListener('resize', () => {
    const install = document.getElementById('pwaInstallBtn');
    if (install && !isMobileLayout()) {
      install.hidden = true;
    }
    if (isMobileLayout()) {
      checkVersions();
    } else {
      setUpdateVisible(false);
    }
  });
})();
