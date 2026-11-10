export function setupGardenViewport(app, notice) {
  const viewport = window.visualViewport;
  const inGarden = () => document.body.classList.contains('garden-active');
  let recoveringPinch = false;
  function sync() {
    const zoomed = inGarden() && (viewport?.scale ?? 1) > 1.01;
    app.toggleAttribute('data-page-zoomed', zoomed);
    notice.hidden = !zoomed;
    if (zoomed) {
      const x = viewport.offsetLeft + viewport.width / 2;
      const y = viewport.offsetTop + 12 / viewport.scale;
      notice.style.transform = `translate(${x}px, ${y}px) scale(${1 / viewport.scale}) translateX(-50%)`;
    }
  }

  function blockPinch(event) {
    if (event.type === 'gesturestart') recoveringPinch = app.hasAttribute('data-page-zoomed');
    if (inGarden() && !recoveringPinch && event.cancelable) event.preventDefault();
  }
  app.addEventListener('gesturestart', blockPinch, { passive: false });
  app.addEventListener('gesturechange', blockPinch, { passive: false });
  app.addEventListener('gestureend', () => { recoveringPinch = false; });
  viewport?.addEventListener('resize', sync);
  viewport?.addEventListener('scroll', sync);
  return sync;
}
