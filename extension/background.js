// Toolbar button -> toggle the element picker in the page's MAIN world.
// The engine (capture-animation.js) runs as a MAIN-world content script and
// defines window.__capPicker; we just flip it. activeTab grants the temporary
// host access needed to executeScript on click, so no broad host prompt.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (window.__capPicker) window.__capPicker.toggle();
        else console.warn('[capture] engine not loaded on this page (try reloading the tab)');
      },
    });
  } catch (e) {
    console.warn('[capture] cannot run here (e.g. chrome:// or the Web Store):', e.message);
  }
});
