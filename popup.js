document.getElementById('openBtn').addEventListener('click', () => {
  // Open tracker directly - auto-calibration happens on first use
  chrome.windows.create({
    url: 'tracker.html',
    type: 'popup',
    width: 680,
    height: 650,
    left: 100,
    top: 100
  });
});