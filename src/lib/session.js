// Bridge to the vault service worker (seal/sw.js). In local dev there is no service worker,
// so `isSealed()` is false and sign-out is hidden.
export const isSealed = () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);

export async function signOut() {
  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      sw.postMessage({ type: 'logout' }, [ch.port2]);
      setTimeout(resolve, 1500);
    });
  }
  window.location.replace(import.meta.env.BASE_URL);
}
