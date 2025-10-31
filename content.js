// ===== DEBUG CONFIGURATION =====
const DEBUG = false; // Set to true to enable console logging
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Always log errors

// Inject CSS styles
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = chrome.runtime.getURL('content-styles.css');
document.head.appendChild(styleLink);

// Inject icons script
const iconsScript = document.createElement('script');
iconsScript.src = chrome.runtime.getURL('icons.js');
document.head.appendChild(iconsScript);

log('Face control content script loaded!');

let cursorElement = null;
let eyeControlEnabled = false;

// Text field navigation state
let textFieldMode = false;
let textFields = [];
let currentFieldIndex = -1;
let fieldHighlights = [];

// Speech recognition state
let recognition = null;
let isRecognitionActive = false;
let recognitionIndicator = null;

// Text editing options state
let isShowingEditOptions = false;
let editOptionsUI = null;
let currentEditOption = 0; // 0 = Keep, 1 = Fix, 2 = Improve
let dictatedText = '';
let dictatedTextField = null;
let speechPauseTimer = null;
const SPEECH_PAUSE_DURATION = 3000; // 3 seconds of silence triggers options

// ===== UNIFIED NOTIFICATION SYSTEM =====
const NOTIFICATION_TYPES = {
  info: {
    background: '#e8f0fe',
    color: '#1a73e8',
    border: '#aecbfa'
  },
  success: {
    background: '#e6f4ea',
    color: '#188038',
    border: '#c6e1c6'
  },
  warning: {
    background: '#fef7e0',
    color: '#f9ab00',
    border: '#fdd663'
  },
  error: {
    background: '#fce8e6',
    color: '#d93025',
    border: '#f5c6cb'
  },
  speech: {
    background: '#fce8e6',
    color: '#d93025',
    border: '#f5c6cb'
  }
};

function showNotification(message, type = 'info', duration = 2000, iconName = null) {
  const style = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;

  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: ${style.background} !important;
    color: ${style.color} !important;
    padding: 16px 24px !important;
    border-radius: 8px !important;
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    z-index: 2147483647 !important;
    box-shadow: 0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15) !important;
    border: 1px solid ${style.border} !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    max-width: 400px !important;
  `;

  // Get icon SVG if icon name is provided
  let iconHTML = '';
  if (iconName && typeof getIconHTML === 'function') {
    iconHTML = getIconHTML(iconName, '', `width: 24px; height: 24px; flex-shrink: 0;`);
  }

  if (iconHTML) {
    notification.innerHTML = `
      <div style="flex-shrink: 0; display: flex; align-items: center;">${iconHTML}</div>
      <div>${message}</div>
    `;
  } else {
    notification.innerHTML = `<div>${message}</div>`;
  }

  document.body.appendChild(notification);

  if (duration > 0) {
    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s ease-out';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  return notification;
}

// Debug: Check extension context and AI availability (wrapped in try-catch to prevent crashes)
try {
  log('[Content Script] Extension context:', !!chrome?.runtime?.id);
  log('[Content Script] Extension ID:', chrome?.runtime?.id);
  log('[Content Script] typeof ai:', typeof ai);
  log('[Content Script] typeof window.ai:', typeof window.ai);

  // Only log objects if they exist
  if (typeof ai !== 'undefined') {
    log('[Content Script] ai object:', ai);
    log('[Content Script] ai.rewriter:', ai.rewriter);
    log('[Content Script] ai.writer:', ai.writer);
  }
  if (typeof window.ai !== 'undefined') {
    log('[Content Script] window.ai object:', window.ai);
    log('[Content Script] window.ai.rewriter:', window.ai.rewriter);
    log('[Content Script] window.ai.writer:', window.ai.writer);
  }
} catch (err) {
  error('[Content Script] Error during AI availability check:', err);
}

// Listen for control commands
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Content script received message:', request.action);
  
  try {
    if (request.action === 'scroll') {
      log('Scrolling:', request.deltaX, request.deltaY);
      window.scrollBy({
        top: request.deltaY,
        left: request.deltaX,
        behavior: 'auto'
      });
      sendResponse({ success: true });
    } else if (request.action === 'moveCursor') {
      // Move virtual cursor based on eye gaze
      if (!cursorElement) {
        createCursor();
      }
      
      // Map gaze coordinates (0-1) to screen coordinates
      const x = request.gazeX * window.innerWidth;
      const y = request.gazeY * window.innerHeight;
      
      cursorElement.style.left = x + 'px';
      cursorElement.style.top = y + 'px';
      
      sendResponse({ success: true, x, y });
    } else if (request.action === 'click') {
      log('Click command received!');
      
      let x, y;
      
      // If cursor exists, click at cursor position
      if (cursorElement) {
        x = parseFloat(cursorElement.style.left);
        y = parseFloat(cursorElement.style.top);
      } else {
        // Otherwise click at screen center
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }
      
      let element = document.elementFromPoint(x, y);
      
      if (element) {
        log('Element at cursor:', element);
        let clickableElement = findClickableElement(element);
        
        if (clickableElement) {
          log('Clicking:', clickableElement);
          clickableElement.click();
          
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          });
          clickableElement.dispatchEvent(clickEvent);
          
          // Visual feedback - pulse effect
          const originalOutline = clickableElement.style.outline;
          const originalBg = clickableElement.style.backgroundColor;
          clickableElement.style.outline = '3px solid #4CAF50';
          clickableElement.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
          
          // Cursor pulse
          if (cursorElement) {
            cursorElement.style.transform = 'translate(-50%, -50%) scale(1.5)';
            setTimeout(() => {
              cursorElement.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 200);
          }
          
          setTimeout(() => {
            clickableElement.style.outline = originalOutline;
            clickableElement.style.backgroundColor = originalBg;
          }, 400);
          
          sendResponse({ success: true });
        } else {
          element.click();
          sendResponse({ success: true });
        }
      } else {
        sendResponse({ success: false });
      }
    } else if (request.action === 'removeIndicators') {
      const indicator = document.getElementById('face-control-indicator');
      const crosshair = document.getElementById('face-control-crosshair');
      if (indicator) indicator.remove();
      if (crosshair) crosshair.remove();
      if (cursorElement) cursorElement.remove();
      cursorElement = null;
      sendResponse({ success: true });
    } else if (request.action === 'enableTextFieldMode') {
      enableTextFieldMode();
      sendResponse({ success: true, fieldCount: textFields.length });
    } else if (request.action === 'disableTextFieldMode') {
      disableTextFieldMode();
      sendResponse({ success: true });
    } else if (request.action === 'nextTextField') {
      // If showing edit options, navigate options instead
      if (isShowingEditOptions) {
        navigateEditOption(1);
        sendResponse({ success: true, option: currentEditOption });
      } else {
        navigateTextField(1);
        sendResponse({ success: true, index: currentFieldIndex, total: textFields.length });
      }
    } else if (request.action === 'previousTextField') {
      // If showing edit options, navigate options instead
      if (isShowingEditOptions) {
        navigateEditOption(-1);
        sendResponse({ success: true, option: currentEditOption });
      } else {
        navigateTextField(-1);
        sendResponse({ success: true, index: currentFieldIndex, total: textFields.length });
      }
    } else if (request.action === 'selectTextField') {
      selectCurrentTextField();
      sendResponse({ success: true });
    } else if (request.action === 'confirmEditOption') {
      // Smile gesture confirms the selected edit option
      if (isShowingEditOptions) {
        applyEditOption();
        sendResponse({ success: true });
      }
    }
  } catch (error) {
    error('Face control error:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
});

// Create virtual cursor
function createCursor() {
  if (cursorElement) return;

  cursorElement = document.createElement('div');
  cursorElement.id = 'face-control-cursor';
  document.body.appendChild(cursorElement);
}

// Helper functions
function findClickableElement(element) {
  const maxDepth = 10;
  let current = element;
  let depth = 0;
  
  while (current && depth < maxDepth) {
    if (isClickable(current)) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }
  
  return null;
}

function isClickable(element) {
  if (!element) return false;
  
  const tag = element.tagName.toLowerCase();
  
  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) {
    return true;
  }
  
  if (element.onclick || element.hasAttribute('onclick')) {
    return true;
  }
  
  const role = element.getAttribute('role');
  if (['button', 'link', 'menuitem', 'tab', 'option'].includes(role)) {
    return true;
  }
  
  const style = window.getComputedStyle(element);
  if (style.cursor === 'pointer') {
    return true;
  }
  
  if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
    return true;
  }
  
  return false;
}

// Visual indicators
if (!document.getElementById('face-control-indicator')) {
  const indicator = document.createElement('div');
  indicator.id = 'face-control-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(76, 175, 80, 0.9);
    color: white;
    padding: 10px 15px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
  `;
  indicator.textContent = 'Face Control Active';
  document.body.appendChild(indicator);
}

log('Face control indicators added!');

// ===== TEXT FIELD MODE FUNCTIONS =====
function enableTextFieldMode() {
  textFieldMode = true;

  // Find all text input fields, textareas, and contenteditable elements
  textFields = Array.from(document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="search"], input[type="password"], input[type="url"], input[type="tel"], input[type="number"], input[type="date"], input[type="time"], input[type="datetime-local"], input:not([type]), textarea, [contenteditable="true"]'
  )).filter(field => {
    // Filter out hidden, disabled, or very small fields
    const rect = field.getBoundingClientRect();
    const style = window.getComputedStyle(field);

    // Check if field is visible and accessible
    const isVisible = rect.width > 20 && rect.height > 10 &&
                     style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     style.opacity !== '0';

    // Check if field is not disabled or readonly
    const isEditable = !field.disabled && !field.readOnly;

    // Check if field is in the viewport or reasonably close
    const isInOrNearViewport = rect.top < window.innerHeight + 1000 &&
                               rect.bottom > -1000;

    return isVisible && isEditable && isInOrNearViewport;
  });

  log(`Found ${textFields.length} editable text fields`);

  // Show notification to user
  showTextFieldModeNotification(textFields.length);

  // Highlight all text fields with blue outline
  fieldHighlights = [];
  textFields.forEach((field, index) => {
    const highlight = document.createElement('div');
    highlight.className = 'headpilot-field-highlight';

    // Add field number label
    const label = document.createElement('div');
    label.className = 'headpilot-field-label';
    label.textContent = `${index + 1}`;
    highlight.appendChild(label);

    updateHighlightPosition(highlight, field);
    document.body.appendChild(highlight);
    fieldHighlights.push(highlight);
  });

  currentFieldIndex = -1;
}

function disableTextFieldMode() {
  textFieldMode = false;

  // Stop speech recognition
  stopSpeechRecognition();

  // Hide edit options if they're showing
  if (isShowingEditOptions) {
    hideEditOptions();
  }

  // Clear speech pause timer
  if (speechPauseTimer) {
    clearTimeout(speechPauseTimer);
    speechPauseTimer = null;
  }

  // Remove all highlights
  fieldHighlights.forEach(highlight => highlight.remove());
  fieldHighlights = [];
  textFields = [];
  currentFieldIndex = -1;

  // Show notification
  showTextFieldModeDisabledNotification();
}

function updateHighlightPosition(highlight, field) {
  const rect = field.getBoundingClientRect();
  highlight.style.left = (rect.left + window.scrollX - 3) + 'px';
  highlight.style.top = (rect.top + window.scrollY - 3) + 'px';
  highlight.style.width = (rect.width + 6) + 'px';
  highlight.style.height = (rect.height + 6) + 'px';
}

function navigateTextField(direction) {
  if (textFields.length === 0) return;

  // Remove active highlight from previous field
  if (currentFieldIndex >= 0 && currentFieldIndex < fieldHighlights.length) {
    fieldHighlights[currentFieldIndex].style.border = '3px solid #2196F3';
    fieldHighlights[currentFieldIndex].style.background = 'rgba(33, 150, 243, 0.1)';
  }

  // Move to next/previous field
  currentFieldIndex += direction;

  // Wrap around
  if (currentFieldIndex >= textFields.length) {
    currentFieldIndex = 0;
  } else if (currentFieldIndex < 0) {
    currentFieldIndex = textFields.length - 1;
  }

  // Highlight current field more prominently
  if (currentFieldIndex >= 0 && currentFieldIndex < fieldHighlights.length) {
    const highlight = fieldHighlights[currentFieldIndex];
    highlight.style.border = '4px solid #FF9800';
    highlight.style.background = 'rgba(255, 152, 0, 0.2)';
    highlight.style.boxShadow = '0 0 20px rgba(255, 152, 0, 0.8)';

    // Scroll field into view
    textFields[currentFieldIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function selectCurrentTextField() {
  if (currentFieldIndex >= 0 && currentFieldIndex < textFields.length) {
    const field = textFields[currentFieldIndex];

    // Focus the field
    field.focus();

    // If it's an input or textarea, select all text
    if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
      field.select();
    }

    // Make highlight green to show it's selected
    // First, remove selected class from all highlights
    fieldHighlights.forEach(h => h.classList.remove('selected'));

    // Then add it to the current one
    if (currentFieldIndex < fieldHighlights.length) {
      fieldHighlights[currentFieldIndex].classList.add('selected');
    }

    log('Text field selected and focused:', field);

    // Start speech recognition automatically
    startSpeechRecognition(field);
  }
}

// ===== SPEECH RECOGNITION FUNCTIONS =====
function initializeSpeechRecognition() {
  // Check if speech recognition is supported
  const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

  if (!SpeechRecognition) {
    error('Speech recognition not supported in this browser');
    return null;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;  // Keep listening
  recognition.interimResults = true;  // Show interim results
  recognition.lang = 'en-US';  // Default to English

  recognition.onstart = () => {
    isRecognitionActive = true;
    log('Speech recognition started');
    showRecognitionIndicator();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    // Clear the pause timer since user is speaking
    if (speechPauseTimer) {
      clearTimeout(speechPauseTimer);
      speechPauseTimer = null;
    }

    // Update the active text field with the transcript
    const activeField = document.activeElement;
    if (activeField && (activeField.tagName === 'INPUT' || activeField.tagName === 'TEXTAREA' || activeField.contentEditable === 'true')) {
      if (finalTranscript) {
        // Track the dictated text for potential editing
        dictatedText += finalTranscript;
        dictatedTextField = activeField;

        // Insert final transcript
        if (activeField.tagName === 'INPUT' || activeField.tagName === 'TEXTAREA') {
          const cursorPos = activeField.selectionStart;
          const textBefore = activeField.value.substring(0, cursorPos);
          const textAfter = activeField.value.substring(activeField.selectionEnd);
          activeField.value = textBefore + finalTranscript + textAfter;
          activeField.selectionStart = activeField.selectionEnd = cursorPos + finalTranscript.length;
        } else if (activeField.contentEditable === 'true') {
          document.execCommand('insertText', false, finalTranscript);
        }

        // Start pause timer - if no speech for 3 seconds, show edit options
        speechPauseTimer = setTimeout(() => {
          if (dictatedText.trim().length > 0) {
            showEditOptions();
          }
        }, SPEECH_PAUSE_DURATION);
      }

      // Update recognition indicator with interim results
      if (interimTranscript && recognitionIndicator) {
        updateRecognitionIndicator(interimTranscript);
      }
    }

    log('Final:', finalTranscript, 'Interim:', interimTranscript);
  };

  recognition.onerror = (event) => {
    error('Speech recognition error:', event.error);
    if (event.error === 'no-speech') {
      // No speech detected, keep listening
      log('No speech detected, continuing...');
    } else if (event.error === 'not-allowed') {
      showSpeechErrorNotification('Microphone access denied. Please allow microphone access.');
      stopSpeechRecognition();
    } else {
      showSpeechErrorNotification(`Speech recognition error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    log('Speech recognition ended');
    isRecognitionActive = false;
    hideRecognitionIndicator();

    // Auto-restart if text field mode is still active and a field is focused
    if (textFieldMode && document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.contentEditable === 'true')) {
      setTimeout(() => {
        if (recognition && !isRecognitionActive) {
          try {
            recognition.start();
          } catch (e) {
            log('Could not restart recognition:', e);
          }
        }
      }, 100);
    }
  };

  return recognition;
}

function startSpeechRecognition(field) {
  if (!recognition) {
    recognition = initializeSpeechRecognition();
  }

  if (!recognition) {
    error('Cannot initialize speech recognition');
    return;
  }

  // Stop any existing recognition
  if (isRecognitionActive) {
    try {
      recognition.stop();
    } catch (e) {
      log('Error stopping recognition:', e);
    }
  }

  // Start new recognition
  setTimeout(() => {
    try {
      recognition.start();
      log('Started speech recognition for field:', field);
      showSpeechStartNotification();
    } catch (e) {
      error('Failed to start speech recognition:', e);
      if (e.message.includes('already started')) {
        log('Recognition already running');
      }
    }
  }, 100);
}

function stopSpeechRecognition() {
  if (recognition && isRecognitionActive) {
    try {
      recognition.stop();
      log('Speech recognition stopped');
    } catch (e) {
      log('Error stopping recognition:', e);
    }
  }
  hideRecognitionIndicator();
}

function showRecognitionIndicator() {
  if (recognitionIndicator) {
    recognitionIndicator.remove();
  }

  recognitionIndicator = document.createElement('div');
  recognitionIndicator.id = 'speech-recognition-indicator';
  recognitionIndicator.innerHTML = `
    <div class="pulse"></div>
    <div id="recognition-text">Listening...</div>
  `;

  document.body.appendChild(recognitionIndicator);
}

function updateRecognitionIndicator(text) {
  if (recognitionIndicator) {
    const textElement = recognitionIndicator.querySelector('#recognition-text');
    if (textElement) {
      textElement.textContent = text || 'Listening...';
    }
  }
}

function hideRecognitionIndicator() {
  if (recognitionIndicator) {
    recognitionIndicator.remove();
    recognitionIndicator = null;
  }
}

function showSpeechStartNotification() {
  showNotification('Speech Recognition Active<br><span style="font-size: 12px; opacity: 0.8;">Start speaking to type</span>', 'speech', 2000, 'mic');
}

function showSpeechErrorNotification(message) {
  showNotification(message, 'error', 3000, 'warning');
}

// Update highlight positions when window is scrolled or resized
if (textFieldMode) {
  window.addEventListener('scroll', () => {
    textFields.forEach((field, index) => {
      if (fieldHighlights[index]) {
        updateHighlightPosition(fieldHighlights[index], field);
      }
    });
  });

  window.addEventListener('resize', () => {
    textFields.forEach((field, index) => {
      if (fieldHighlights[index]) {
        updateHighlightPosition(fieldHighlights[index], field);
      }
    });
  });
}

function showTextFieldModeNotification(fieldCount) {
  log('Showing text field mode notification for', fieldCount, 'fields');

  // Remove any existing notification first
  const existing = document.getElementById('text-field-mode-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification overlay
  const notification = document.createElement('div');
  notification.id = 'text-field-mode-notification';
  notification.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%) !important;
    color: white !important;
    padding: 20px 40px !important;
    border-radius: 12px !important;
    font-family: Arial, sans-serif !important;
    font-size: 16px !important;
    font-weight: bold !important;
    z-index: 2147483647 !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    text-align: center !important;
    min-width: 300px !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  `;

  const editIcon = typeof getIconHTML === 'function' ? getIconHTML('edit', '', 'width: 40px; height: 40px; color: #1a73e8;') : '';
  notification.innerHTML = `
    ${editIcon ? `<div style="margin-bottom: 12px; color: #1a73e8; display: flex; justify-content: center;">${editIcon}</div>` : ''}
    <div style="font-size: 18px; margin-bottom: 8px;">TEXT FIELD MODE ENABLED</div>
    <div style="font-size: 14px; font-weight: normal; opacity: 0.9;">
      Found ${fieldCount} text field${fieldCount !== 1 ? 's' : ''}<br>
      <span style="font-size: 12px; margin-top: 6px; display: inline-block;">
        Tilt head left/right to navigate • Hold 2s to select
      </span>
    </div>
  `;

  // Ensure body exists
  if (!document.body) {
    error('document.body not available for notification');
    return;
  }

  document.body.appendChild(notification);
  log('Notification element added to DOM:', notification);

  // Remove notification after 4 seconds
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s ease-out';
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
        log('Notification removed');
      }
    }, 300);
  }, 4000);
}

function showTextFieldModeDisabledNotification() {
  showNotification('Text Field Mode Disabled', 'info', 2000, 'edit');
}

// ===== EDIT OPTIONS UI AND LOGIC =====

function showEditOptions() {
  // Pause speech recognition while showing options
  if (recognition && isRecognitionActive) {
    recognition.stop();
  }

  isShowingEditOptions = true;
  currentEditOption = 0; // Start with "Keep"

  // Create edit options UI (Chrome Material Design theme)
  editOptionsUI = document.createElement('div');
  editOptionsUI.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: #ffffff !important;
    color: #202124 !important;
    padding: 32px !important;
    border-radius: 8px !important;
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
    z-index: 2147483647 !important;
    box-shadow: 0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15) !important;
    text-align: center !important;
    min-width: 480px !important;
    max-width: 600px !important;
  `;

  editOptionsUI.innerHTML = `
    <div style="font-size: 20px; font-weight: 500; margin-bottom: 8px; color: #202124;">
      What would you like to do?
    </div>
    <div style="font-size: 13px; margin-bottom: 24px; color: #5f6368; line-height: 1.5;">
      Tilt head left/right to navigate • Smile to confirm
    </div>
    <div id="edit-options-container" style="display: flex; justify-content: space-between; gap: 12px;">
      <div id="option-keep" class="edit-option" style="
        flex: 1;
        padding: 24px 16px;
        background: #ffffff;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid #dadce0;
        box-sizing: border-box;
      ">
        <div style="margin-bottom: 12px; color: #1a73e8; display: flex; justify-content: center;">
          ${typeof getIconHTML === 'function' ? getIconHTML('check', '', 'width: 48px; height: 48px;') : '<div style="font-size: 40px;">✓</div>'}
        </div>
        <div style="font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 4px;">Keep</div>
        <div style="font-size: 12px; color: #5f6368; line-height: 1.4;">As is</div>
      </div>
      <div id="option-fix" class="edit-option" style="
        flex: 1;
        padding: 24px 16px;
        background: #ffffff;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid #dadce0;
        box-sizing: border-box;
      ">
        <div style="margin-bottom: 12px; color: #5f6368; display: flex; justify-content: center;">
          ${typeof getIconHTML === 'function' ? getIconHTML('build', '', 'width: 48px; height: 48px;') : '<div style="font-size: 40px;">🔧</div>'}
        </div>
        <div style="font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 4px;">Fix</div>
        <div style="font-size: 12px; color: #5f6368; line-height: 1.4;">Grammar & spelling</div>
      </div>
      <div id="option-improve" class="edit-option" style="
        flex: 1;
        padding: 24px 16px;
        background: #ffffff;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid #dadce0;
        box-sizing: border-box;
      ">
        <div style="margin-bottom: 12px; color: #f9ab00; display: flex; justify-content: center;">
          ${typeof getIconHTML === 'function' ? getIconHTML('autoAwesome', '', 'width: 48px; height: 48px;') : '<div style="font-size: 40px;">✨</div>'}
        </div>
        <div style="font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 4px;">Rewrite</div>
        <div style="font-size: 12px; color: #5f6368; line-height: 1.4;">Enhance & refine</div>
      </div>
    </div>
  `;

  document.body.appendChild(editOptionsUI);
  updateEditOptionHighlight();

  log('Edit options shown');
}

function hideEditOptions() {
  if (editOptionsUI) {
    editOptionsUI.remove();
    editOptionsUI = null;
  }
  isShowingEditOptions = false;
  currentEditOption = 0;
  dictatedText = '';
  dictatedTextField = null;

  // Resume speech recognition
  if (textFieldMode && document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA' ||
       document.activeElement.contentEditable === 'true')) {
    setTimeout(() => {
      if (recognition) {
        recognition.start();
      }
    }, 500);
  }
}

function navigateEditOption(direction) {
  currentEditOption = (currentEditOption + direction + 3) % 3; // Cycle through 0, 1, 2
  updateEditOptionHighlight();
  log('Edit option changed to:', currentEditOption);
}

function updateEditOptionHighlight() {
  if (!editOptionsUI) return;

  const options = ['option-keep', 'option-fix', 'option-improve'];
  options.forEach((optionId, index) => {
    const element = editOptionsUI.querySelector(`#${optionId}`);
    if (element) {
      if (index === currentEditOption) {
        // Selected state - Google blue border and light blue background
        element.style.border = '2px solid #1a73e8';
        element.style.background = '#e8f0fe';
        element.style.transform = 'scale(1.02)';
        element.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.3), 0 2px 6px 2px rgba(60,64,67,0.15)';
      } else {
        // Unselected state - neutral border
        element.style.border = '2px solid #dadce0';
        element.style.background = '#ffffff';
        element.style.transform = 'scale(1)';
        element.style.boxShadow = 'none';
      }
    }
  });
}

async function applyEditOption() {
  const optionNames = ['Keep', 'Fix', 'Rewrite'];
  log(`Applying edit option: ${optionNames[currentEditOption]}`);

  // Show processing notification
  showProcessingNotification();

  try {
    let processedText = dictatedText.trim();

    if (currentEditOption === 1) {
      // Fix with Rewriter API (proofreading mode)
      processedText = await rewriteTextWithSettings(dictatedText, 'fix');
    } else if (currentEditOption === 2) {
      // Rewrite with Rewriter API (full rewrite mode)
      processedText = await rewriteTextWithSettings(dictatedText, 'rewrite');
    }
    // If option 0 (Keep), processedText remains unchanged

    // Replace the dictated text in the field with the processed text
    if (dictatedTextField) {
      if (dictatedTextField.tagName === 'INPUT' || dictatedTextField.tagName === 'TEXTAREA') {
        const currentValue = dictatedTextField.value;
        const textLength = dictatedText.length;
        const cursorPos = dictatedTextField.selectionStart;

        // Find and replace the dictated text
        const startPos = cursorPos - textLength;
        const textBefore = currentValue.substring(0, startPos);
        const textAfter = currentValue.substring(cursorPos);

        dictatedTextField.value = textBefore + processedText + textAfter;
        dictatedTextField.selectionStart = dictatedTextField.selectionEnd = startPos + processedText.length;
      } else if (dictatedTextField.contentEditable === 'true') {
        // For contenteditable, we need to replace the last dictated text
        const content = dictatedTextField.textContent;
        const lastIndex = content.lastIndexOf(dictatedText.trim());
        if (lastIndex !== -1) {
          const range = document.createRange();
          const textNode = findTextNode(dictatedTextField, lastIndex);
          if (textNode) {
            range.setStart(textNode, lastIndex);
            range.setEnd(textNode, lastIndex + dictatedText.trim().length);
            range.deleteContents();
            range.insertNode(document.createTextNode(processedText));
          }
        }
      }
    }

    hideProcessingNotification();
    showEditSuccessNotification(optionNames[currentEditOption]);
    hideEditOptions();
  } catch (error) {
    error('Error applying edit option:', error);
    hideProcessingNotification();
    showEditErrorNotification(error.message);
    hideEditOptions();
  }
}

function findTextNode(element, targetIndex) {
  let currentIndex = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node;

  while (node = walker.nextNode()) {
    const nodeLength = node.textContent.length;
    if (currentIndex + nodeLength > targetIndex) {
      return node;
    }
    currentIndex += nodeLength;
  }

  return null;
}

// ===== AI API CALLS (Via Offscreen Document) =====

async function rewriteTextWithSettings(text, mode) {
  try {
    const modeLabel = mode === 'fix' ? 'proofreading' : 'rewriting';
    log(`[Content Script] Requesting ${modeLabel} via offscreen document...`);
    log('[Content Script] Text to process:', text);

    // Send message to background, which routes to offscreen document
    const response = await chrome.runtime.sendMessage({
      type: 'REWRITE_TEXT',
      text: text,
      mode: mode  // 'fix' or 'rewrite'
    });

    log(`[Content Script] Rewriter (${mode}) response:`, response);

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Rewriter failed');
    }

    return response.result || text;
  } catch (err) {
    error(`[Content Script] Rewriter (${mode}) error:`, err);
    throw new Error(`Failed to ${mode} text: ${err.message}`);
  }
}

let processingNotification = null;

function showProcessingNotification() {
  hideProcessingNotification(); // Remove any existing notification
  processingNotification = showNotification(
    '<div style="display: flex; align-items: center; gap: 12px;"><div style="width: 20px; height: 20px; border: 2px solid #1a73e8; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div><div>Processing your text...</div></div><style>@keyframes spin { to { transform: rotate(360deg); } }</style>',
    'info',
    0 // No auto-dismiss
  );
}

function hideProcessingNotification() {
  if (processingNotification && processingNotification.parentNode) {
    processingNotification.remove();
    processingNotification = null;
  }
}

function showEditSuccessNotification(optionName) {
  showNotification(`${optionName} applied successfully!`, 'success', 2000, 'check');
}

function showEditErrorNotification(errorMsg) {
  showNotification(`<div style="font-weight: 600; margin-bottom: 4px;">Error</div><div style="font-size: 13px; opacity: 0.8;">${errorMsg}</div>`, 'error', 3000, 'warning');
}