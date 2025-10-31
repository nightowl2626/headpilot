// ===== DEBUG CONFIGURATION =====
const DEBUG = false; // Set to true to enable console logging
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Always log errors

// Keep track of control state
let browserControlEnabled = false;
let controlledTabs = new Set();

// ===== OFFSCREEN DOCUMENT MANAGEMENT FOR AI APIS =====
let offscreenDocumentCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      log('Offscreen document already exists');
      offscreenDocumentCreated = true;
      return;
    }

    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'], // Using DOM_SCRAPING as a valid reason
      justification: 'Use Chrome AI APIs (Proofreader/Rewriter) from extension context'
    });

    log('Offscreen document created');
    offscreenDocumentCreated = true;
  } catch (err) {
    error('Failed to create offscreen document:', err);
    throw err;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Background received message:', request.action || request.type);

  // Handle AI API requests - route to offscreen document
  if (request.type === 'PROOFREAD_TEXT' || request.type === 'REWRITE_TEXT') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const response = await chrome.runtime.sendMessage(request);
        sendResponse(response);
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (request.action === 'scroll' || request.action === 'click' || request.action === 'moveCursor') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const activeTab = tabs[0];
        chrome.tabs.sendMessage(activeTab.id, request, (response) => {
          if (chrome.runtime.lastError) {
            error('Message send error:', chrome.runtime.lastError.message);
          }
        });
      }
    });
    sendResponse({ received: true });
    return true;
  } else if (request.action === 'goBack') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.goBack(tabs[0].id);
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'goForward') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.goForward(tabs[0].id);
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'newTab') {
    // Open new tab
    chrome.tabs.create({}, (tab) => {
      log('New tab created:', tab.id);
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'closeTab') {
    // Close current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.remove(tabs[0].id, () => {
          log('Tab closed');
        });
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'refresh') {
    // Refresh current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.reload(tabs[0].id, () => {
          log('Page refreshed');
        });
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'nextTab') {
    // Switch to next tab
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.active);
        const nextIndex = (currentIndex + 1) % tabs.length;
        chrome.tabs.update(tabs[nextIndex].id, { active: true });
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'previousTab') {
    // Switch to previous tab
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.active);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        chrome.tabs.update(tabs[prevIndex].id, { active: true });
      }
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'enableBrowserControl') {
    // ... rest of existing code
    // ... rest of code
    // ... rest of existing code
    browserControlEnabled = true;
    
    // Inject content script into ALL existing tabs
    chrome.tabs.query({}, async (tabs) => {
      let successCount = 0;
      let failCount = 0;
      
      for (const tab of tabs) {
        // Skip chrome:// and extension pages
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            controlledTabs.add(tab.id);
            successCount++;
            log(`Injected into tab ${tab.id}: ${tab.url}`);
          } catch (error) {
            log(`Failed to inject into tab ${tab.id}:`, error.message);
            failCount++;
          }
        }
      }
      
      log(`Injection complete: ${successCount} success, ${failCount} failed`);
      
      sendResponse({ 
        success: true, 
        injected: successCount,
        failed: failCount,
        total: tabs.length 
      });
    });
    
    return true;
  } else if (request.action === 'disableBrowserControl') {
    browserControlEnabled = false;

    // Send message to all tabs to remove indicators
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (controlledTabs.has(tab.id)) {
          chrome.tabs.sendMessage(tab.id, { action: 'removeIndicators' }).catch(() => {});
        }
      });
    });

    controlledTabs.clear();
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'enableTextFieldMode') {
    // Forward to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          if (chrome.runtime.lastError) {
            error('Message send error:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  } else if (request.action === 'disableTextFieldMode') {
    // Forward to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          if (chrome.runtime.lastError) {
            error('Message send error:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  } else if (request.action === 'nextTextField' || request.action === 'previousTextField' || request.action === 'selectTextField') {
    // Forward text field navigation to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          if (chrome.runtime.lastError) {
            error('Message send error:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  } else if (request.action === 'confirmEditOption') {
    // Forward edit option confirmation to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          if (chrome.runtime.lastError) {
            error('Message send error:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }
});

// Inject content script into NEW tabs automatically when control is enabled
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (browserControlEnabled && changeInfo.status === 'complete') {
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).then(() => {
        controlledTabs.add(tabId);
        log(`Auto-injected content script into new tab ${tabId}`);
      }).catch(err => {
        log(`Failed to auto-inject into tab ${tabId}:`, err.message);
      });
    }
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  controlledTabs.delete(tabId);
});