// ===== DEBUG CONFIGURATION =====
const DEBUG = false; // Set to true to enable console logging
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Always log errors

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const canvasCtx = canvas.getContext('2d');
const status = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const controlBtn = document.getElementById('controlBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');

// Sensitivity settings with defaults
let sensitivitySettings = {
  scroll: 1.0,      // 100%
  click: 1.0,       // 100%
  gesture: 1.0,     // 100%
  cursorSpeed: 1.0  // 100%
};

// Settings UI elements
const scrollSensitivitySlider = document.getElementById('scrollSensitivity');
const clickSensitivitySlider = document.getElementById('clickSensitivity');
const gestureSensitivitySlider = document.getElementById('gestureSensitivity');
const cursorSpeedSlider = document.getElementById('cursorSpeed');

const scrollSensitivityValue = document.getElementById('scrollSensitivityValue');
const clickSensitivityValue = document.getElementById('clickSensitivityValue');
const gestureSensitivityValue = document.getElementById('gestureSensitivityValue');
const cursorSpeedValue = document.getElementById('cursorSpeedValue');

// ===== PHASE 1: GESTURE MODE & FEEDBACK SYSTEM =====
const INTERACTION_MODES = {
  NEUTRAL: 'neutral',           // Just browsing - gestures disabled
  GESTURE_ACTIVE: 'gesture',    // Gestures enabled for 5 seconds
  COOLDOWN: 'cooldown'          // 1 second after gesture execution
};

let currentMode = INTERACTION_MODES.NEUTRAL;
let modeActivationTime = 0;
const GESTURE_MODE_DURATION = 5000; // 5 seconds
const COOLDOWN_DURATION = 1000; // 1 second

// Wake-up gesture detection (double blink)
let lastBlinkTime = 0;
let blinkCount = 0;
let doubleBlinkDetected = false;

// Two-stage confirmation states
let jawOpenStage = 0; // 0 = not active, 1 = preparing, 2 = confirming
let jawOpenStartTime = 0;
let jawOpenConfirmedTime = 0;

let smileStage = 0;
let smileStartTime = 0;
let smileHoldDuration = 0;

// Visual feedback system
let feedbackElement = null;
let feedbackTimeout = null;

// ===== PHASE 2: DYNAMIC GESTURE CONFIGURATION =====
let gestureConfig = null;

// Current fatigue state
let userFatigueState = 'normal';
let lastFatigueCheck = 0;

// Enhanced zone tracking
let currentZone = 'neutral'; // 'cursor', 'scroll', 'navigation', 'neutral'
let lastZoneChange = 0;
const ZONE_TRANSITION_DELAY = 200; // ms to prevent flickering between zones

// Gesture attempt tracking
let activeGestureAttempt = null; // { type, startTime, stage }

// Initialize gesture configuration system
async function initializeGestureConfig() {
  // Load the gesture config manager
  try {
    // Import the GestureConfigManager class
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('gesture-config.js');
    document.head.appendChild(script);

    // Wait for script to load
    await new Promise(resolve => {
      script.onload = () => {
        gestureConfig = new GestureConfigManager();
        log('Gesture configuration system initialized');
        resolve();
      };
    });
  } catch (error) {
    error('Failed to load gesture config:', error);
    // Create fallback with default settings
    gestureConfig = {
      getDwellTime: (type) => ({ click: 800, smile: 1500, wink: 1000, navigation: 500 }[type] || 800),
      recordGestureAttempt: () => {},
      getScrollZoneStatus: () => ({ cursor: true, scroll: false, navigation: false, neutral: false }),
      getScrollIntensity: () => ({ vertical: 0, horizontal: 0 }),
      detectFatigueState: () => 'normal'
    };
  }
}

// Settings button handlers
settingsBtn.addEventListener('click', () => {
  if (settingsPanel.style.display === 'none' || !settingsPanel.style.display) {
    settingsPanel.style.display = 'block';
    // Trigger reflow to enable transition
    settingsPanel.offsetHeight;
    settingsPanel.style.right = '0';
  } else {
    settingsPanel.style.right = '-400px';
    setTimeout(() => {
      settingsPanel.style.display = 'none';
    }, 300);
  }
});

document.getElementById('closeSettings').addEventListener('click', () => {
  settingsPanel.style.right = '-400px';
  setTimeout(() => {
    settingsPanel.style.display = 'none';
  }, 300);
});

document.getElementById('resetSettings').addEventListener('click', () => {
  scrollSensitivitySlider.value = 100;
  clickSensitivitySlider.value = 100;
  gestureSensitivitySlider.value = 100;
  cursorSpeedSlider.value = 100;
  updateSensitivitySettings();
  saveSensitivitySettings();
});

document.getElementById('resetNeutralPosition').addEventListener('click', () => {
  // Clear saved neutral position and trigger recalibration
  chrome.storage.local.remove('neutralPosition', () => {
    needsNeutralCalibration = true;
    neutralCalibrationStartTime = 0;
    neutralCalibrationSamples = [];
    neutralPosition = { pitch: 0, yaw: 0, roll: 0 };
    showVisualFeedback('Neutral position reset!\nLook straight ahead to recalibrate', 'info', 2000);
    // Close settings panel
    settingsPanel.style.right = '-400px';
    setTimeout(() => {
      settingsPanel.style.display = 'none';
    }, 300);
  });
});

// Update sensitivity values when sliders change
scrollSensitivitySlider.addEventListener('input', updateSensitivitySettings);
clickSensitivitySlider.addEventListener('input', updateSensitivitySettings);
gestureSensitivitySlider.addEventListener('input', updateSensitivitySettings);
cursorSpeedSlider.addEventListener('input', updateSensitivitySettings);

function updateSensitivitySettings() {
  const scrollValue = parseInt(scrollSensitivitySlider.value);
  const clickValue = parseInt(clickSensitivitySlider.value);
  const gestureValue = parseInt(gestureSensitivitySlider.value);
  const cursorValue = parseInt(cursorSpeedSlider.value);

  scrollSensitivityValue.textContent = scrollValue + '%';
  clickSensitivityValue.textContent = clickValue + '%';
  gestureSensitivityValue.textContent = gestureValue + '%';
  cursorSpeedValue.textContent = cursorValue + '%';

  // Convert to multipliers (lower value = less sensitive = higher threshold)
  sensitivitySettings.scroll = 100 / scrollValue;
  sensitivitySettings.click = 100 / clickValue;
  sensitivitySettings.gesture = 100 / gestureValue;
  sensitivitySettings.cursorSpeed = cursorValue / 100;

  saveSensitivitySettings();
}

function saveSensitivitySettings() {
  chrome.storage.local.set({
    sensitivitySettings: {
      scroll: parseInt(scrollSensitivitySlider.value),
      click: parseInt(clickSensitivitySlider.value),
      gesture: parseInt(gestureSensitivitySlider.value),
      cursorSpeed: parseInt(cursorSpeedSlider.value)
    }
  });
}

function loadSensitivitySettings() {
  chrome.storage.local.get(['sensitivitySettings'], (result) => {
    if (result.sensitivitySettings) {
      const settings = result.sensitivitySettings;
      scrollSensitivitySlider.value = settings.scroll || 100;
      clickSensitivitySlider.value = settings.click || 100;
      gestureSensitivitySlider.value = settings.gesture || 100;
      cursorSpeedSlider.value = settings.cursorSpeed || 100;
      updateSensitivitySettings();
    }
  });
}

// Load settings on startup
loadSensitivitySettings();

// ===== PHASE 1: VISUAL FEEDBACK SYSTEM =====
function initializeFeedbackSystem() {
  // Create feedback overlay if it doesn't exist
  if (!feedbackElement) {
    feedbackElement = document.createElement('div');
    feedbackElement.id = 'gesture-feedback';
    feedbackElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 30px 50px;
      background: rgba(0, 0, 0, 0.9);
      border: 3px solid #4CAF50;
      border-radius: 20px;
      color: white;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      z-index: 999999;
      display: none;
      box-shadow: 0 0 30px rgba(76, 175, 80, 0.5);
      animation: pulse 0.5s ease-in-out;
    `;
    document.body.appendChild(feedbackElement);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.1); }
      }
      @keyframes progressFill {
        from { width: 0%; }
        to { width: 100%; }
      }
      .feedback-success { border-color: #4CAF50; background: rgba(76, 175, 80, 0.2); }
      .feedback-warning { border-color: #FF9800; background: rgba(255, 152, 0, 0.2); }
      .feedback-error { border-color: #f44336; background: rgba(244, 67, 54, 0.2); }
      .feedback-info { border-color: #2196F3; background: rgba(33, 150, 243, 0.2); }
    `;
    document.head.appendChild(style);
  }
}

function showVisualFeedback(message, type = 'info', duration = 1500, iconName = null) {
  if (!feedbackElement) initializeFeedbackSystem();

  // Clear any existing timeout
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
  }

  // Set message and style with optional icon
  if (iconName && typeof getIconHTML === 'function') {
    const iconColor = {
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#f44336',
      info: '#2196F3'
    }[type] || '#2196F3';

    const iconHTML = getIconHTML(iconName, '', `width: 28px; height: 28px; color: ${iconColor};`);
    feedbackElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; justify-content: center;">
        <div style="flex-shrink: 0;">${iconHTML}</div>
        <div>${message}</div>
      </div>
    `;
  } else {
    feedbackElement.textContent = message;
  }

  feedbackElement.className = `feedback-${type}`;

  // Update border color based on type
  const colors = {
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#f44336',
    info: '#2196F3'
  };
  feedbackElement.style.borderColor = colors[type] || colors.info;
  feedbackElement.style.display = 'block';

  // Play sound
  playFeedbackSound(type);

  // Auto-hide after duration
  feedbackTimeout = setTimeout(() => {
    feedbackElement.style.display = 'none';
  }, duration);
}

function showProgressFeedback(message, progress, type = 'warning', iconName = null) {
  if (!feedbackElement) initializeFeedbackSystem();

  const percentage = Math.min(100, Math.max(0, progress * 100));

  const iconColor = {
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#f44336',
    info: '#2196F3'
  }[type] || '#FF9800';

  let iconHTML = '';
  if (iconName && typeof getIconHTML === 'function') {
    iconHTML = `<div style="flex-shrink: 0; margin-bottom: 10px;">${getIconHTML(iconName, '', `width: 28px; height: 28px; color: ${iconColor};`)}</div>`;
  }

  feedbackElement.innerHTML = `
    ${iconHTML}
    <div style="margin-bottom: 10px;">${message}</div>
    <div style="width: 200px; height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden;">
      <div style="height: 100%; width: ${percentage}%; background: #4CAF50; transition: width 0.1s linear;"></div>
    </div>
    <div style="margin-top: 8px; font-size: 18px;">${percentage.toFixed(0)}%</div>
  `;

  feedbackElement.className = `feedback-${type}`;
  feedbackElement.style.display = 'block';

  // Play escalating tone based on progress
  if (percentage > 0 && percentage % 25 === 0) {
    playProgressTone(progress);
  }
}

function playFeedbackSound(type) {
  // Create audio context for sound feedback
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different tones for different feedback types
    const frequencies = {
      success: 800,
      warning: 600,
      error: 400,
      info: 500
    };

    oscillator.frequency.value = frequencies[type] || 500;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    log('Audio feedback not available:', e);
  }
}

function playProgressTone(progress) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Escalating frequency based on progress
    oscillator.frequency.value = 400 + (progress * 400); // 400-800 Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
  } catch (e) {
    log('Audio feedback not available:', e);
  }
}

function hideVisualFeedback() {
  if (feedbackElement) {
    feedbackElement.style.display = 'none';
  }
}

// ===== PHASE 2: ZONE VISUALIZATION =====
function initializeZoneVisualization() {
  // Create zone indicator overlay
  const zoneIndicator = document.createElement('div');
  zoneIndicator.id = 'zone-indicator';
  zoneIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.7);
    border: 2px solid #4CAF50;
    border-radius: 10px;
    color: white;
    font-size: 14px;
    font-weight: bold;
    z-index: 999998;
    display: none;
    min-width: 150px;
  `;
  document.body.appendChild(zoneIndicator);

  // Add zone color styles
  const zoneStyles = document.createElement('style');
  zoneStyles.textContent = `
    .zone-cursor { border-color: #2196F3; background: rgba(33, 150, 243, 0.2); }
    .zone-scroll { border-color: #FF9800; background: rgba(255, 152, 0, 0.2); }
    .zone-navigation { border-color: #f44336; background: rgba(244, 67, 54, 0.2); }
    .zone-neutral { border-color: #9E9E9E; background: rgba(158, 158, 158, 0.2); }
  `;
  document.head.appendChild(zoneStyles);
}

function updateZoneIndicator(zone, pitch, yaw) {
  const indicator = document.getElementById('zone-indicator');
  if (!indicator) return;

  const zoneInfo = {
    cursor: { emoji: '🎯', text: 'CURSOR MODE', color: 'zone-cursor' },
    scroll: { emoji: '📜', text: 'SCROLL MODE', color: 'zone-scroll' },
    navigation: { emoji: '🧭', text: 'NAVIGATION MODE', color: 'zone-navigation' },
    neutral: { emoji: '😐', text: 'NEUTRAL', color: 'zone-neutral' }
  };

  const info = zoneInfo[zone] || zoneInfo.neutral;
  indicator.className = info.color;
  indicator.innerHTML = `
    <div>${info.emoji} ${info.text}</div>
    <div style="font-size: 11px; margin-top: 5px;">
      Pitch: ${pitch.toFixed(1)}° | Yaw: ${yaw.toFixed(1)}°
    </div>
  `;
  indicator.style.display = 'block';
}

// ===== PHASE 1: GESTURE MODE MANAGEMENT (Enhanced with Phase 2 fatigue detection) =====
function updateGestureMode() {
  const now = Date.now();

  // Check fatigue state every 30 seconds
  if (now - lastFatigueCheck > 30000) {
    if (gestureConfig) {
      const previousState = userFatigueState;
      userFatigueState = gestureConfig.detectFatigueState();

      if (previousState !== userFatigueState) {
        log(`Fatigue state changed: ${previousState} → ${userFatigueState}`);

        if (userFatigueState === 'fatigued') {
          showVisualFeedback('😓 Taking longer to confirm gestures (fatigue detected)', 'warning', 3000);
        } else if (userFatigueState === 'confident') {
          showVisualFeedback('🚀 Gestures responding faster (confident mode)', 'success', 2000);
        }
      }
    }
    lastFatigueCheck = now;
  }

  switch (currentMode) {
    case INTERACTION_MODES.GESTURE_ACTIVE:
      // Check if gesture mode has expired
      if (now - modeActivationTime > GESTURE_MODE_DURATION) {
        currentMode = INTERACTION_MODES.NEUTRAL;
        showVisualFeedback('Gesture mode deactivated', 'info', 1000);
        log('Gesture mode expired');
      }
      break;

    // COOLDOWN mode removed - each gesture has its own cooldown timer
  }
}

function activateGestureMode() {
  currentMode = INTERACTION_MODES.GESTURE_ACTIVE;
  modeActivationTime = Date.now();
  showVisualFeedback('GESTURE MODE ACTIVE\n(5 seconds)', 'success', 1500, 'info');
  log('Gesture mode activated');
}

function enterCooldown() {
  // REMOVED: Global cooldown was interfering with multi-gesture sequences
  // Each gesture has its own cooldown (lastRefreshTime, lastCloseTabTime, etc.)
  // So we don't need to exit gesture mode after each gesture
  // Instead, EXTEND gesture mode so user can continue using gestures
  if (currentMode === INTERACTION_MODES.GESTURE_ACTIVE) {
    modeActivationTime = Date.now(); // Reset the timer to give another 5 seconds
    log('Gesture mode extended (gesture executed)');
  }
}

function isGestureModeActive() {
  return currentMode === INTERACTION_MODES.GESTURE_ACTIVE;
}

// ===== PHASE 2: GESTURE ATTEMPT TRACKING =====
function startGestureAttempt(gestureType, context = 'normal') {
  if (activeGestureAttempt && activeGestureAttempt.type !== gestureType) {
    // Cancel previous gesture if starting a different one
    cancelGestureAttempt(false);
  }

  if (!activeGestureAttempt) {
    activeGestureAttempt = {
      type: gestureType,
      startTime: Date.now(),
      stage: 1,
      context: context
    };
  }
}

function completeGestureAttempt(successful = true) {
  if (!activeGestureAttempt || !gestureConfig) return;

  const duration = Date.now() - activeGestureAttempt.startTime;
  gestureConfig.recordGestureAttempt(activeGestureAttempt.type, successful, duration);

  if (successful) {
    log(`✓ ${activeGestureAttempt.type} completed in ${duration}ms`);
  } else {
    log(`✗ ${activeGestureAttempt.type} failed after ${duration}ms`);
  }

  activeGestureAttempt = null;
}

function cancelGestureAttempt(recordAsFailure = true) {
  if (!activeGestureAttempt) return;

  if (recordAsFailure) {
    completeGestureAttempt(false);
  } else {
    activeGestureAttempt = null;
  }
}

function getGestureDwellTime(gestureType) {
  if (!gestureConfig) {
    // Fallback to default times
    return { click: 800, smile: 1500, wink: 1000, navigation: 500, tabSwitch: 0 }[gestureType] || 800;
  }

  // Get context-aware dwell time
  let context = 'normal';
  if (userFatigueState === 'fatigued') {
    context = 'fatigued';
  } else if (userFatigueState === 'confident') {
    context = 'confident';
  }

  // Apply risk level
  if (['navigation', 'wink'].includes(gestureType)) {
    context = 'highRisk';
  }

  return gestureConfig.getDwellTime(gestureType, context);
}

// ===== PHASE 1: WAKE-UP GESTURE (DOUBLE BLINK) =====
function detectWakeUpGesture(blendshapes) {
  if (!blendshapes) return;

  const now = Date.now();
  const leftBlink = blendshapes.categories.find(b => b.categoryName === 'eyeBlinkLeft');
  const rightBlink = blendshapes.categories.find(b => b.categoryName === 'eyeBlinkRight');

  const leftScore = leftBlink?.score || 0;
  const rightScore = rightBlink?.score || 0;

  // Detect simultaneous blink (both eyes > 0.8)
  const isBothBlinking = leftScore > 0.7 && rightScore > 0.7;

  if (isBothBlinking && !doubleBlinkDetected) {
    // A blink is happening
    if (now - lastBlinkTime < 800 && now - lastBlinkTime > 100) {
      // Second blink within 800ms of first = DOUBLE BLINK!
      blinkCount++;

      if (blinkCount >= 2) {
        // Wake up gesture detected!
        activateGestureMode();
        blinkCount = 0;
        doubleBlinkDetected = true;
      }
    } else {
      // First blink or too far apart
      blinkCount = 1;
    }

    lastBlinkTime = now;
  } else if (leftScore < 0.3 && rightScore < 0.3) {
    // Eyes are open - reset detection flag
    doubleBlinkDetected = false;
  }
}

// ===== EYEBROW RAISE DETECTION (TEXT FIELD MODE) =====
// NOTE: Only works when gesture mode is active!
function detectEyebrowRaise(blendshapes, pitch, isInGestureMode) {
  if (!blendshapes) return;

  // ONLY allow text field mode activation when gesture mode is active
  if (!isInGestureMode) {
    // Reset state when not in gesture mode
    eyebrowRaiseDetected = false;
    return;
  }

  const now = Date.now();
  const browInnerUp = blendshapes.categories.find(b => b.categoryName === 'browInnerUp');
  const browOuterUpLeft = blendshapes.categories.find(b => b.categoryName === 'browOuterUpLeft');
  const browOuterUpRight = blendshapes.categories.find(b => b.categoryName === 'browOuterUpRight');

  const browInnerScore = browInnerUp?.score || 0;
  const browLeftScore = browOuterUpLeft?.score || 0;
  const browRightScore = browOuterUpRight?.score || 0;

  // Average eyebrow raise score
  const avgBrowScore = (browInnerScore + browLeftScore + browRightScore) / 3;

  // Less strict threshold (0.4 instead of 0.5) for easier activation
  const isBrowRaised = avgBrowScore > 0.4;

  // DETAILED DEBUG LOGGING - Show all values when eyebrows are active
  if (avgBrowScore > 0.3) {
    log('─── EYEBROW DETECTION (GESTURE MODE) ───');
    log(`  browInnerUp: ${browInnerScore.toFixed(3)}`);
    log(`  browOuterUpLeft: ${browLeftScore.toFixed(3)}`);
    log(`  browOuterUpRight: ${browRightScore.toFixed(3)}`);
    log(`  avgBrowScore: ${avgBrowScore.toFixed(3)} ${avgBrowScore > 0.4 ? '✓ PASS (>0.4)' : '✗ FAIL (need >0.4)'}`);
    log(`  isBrowRaised: ${isBrowRaised}`);
    log(`  eyebrowRaiseDetected: ${eyebrowRaiseDetected}`);
    log(`  cooldown remaining: ${Math.max(0, 1000 - (now - lastEyebrowRaiseTime))}ms`);
    log('────────────────────────────────────────');
  }

  if (isBrowRaised && !eyebrowRaiseDetected && now - lastEyebrowRaiseTime > 1000) {
    // Eyebrow raise detected!
    eyebrowRaiseDetected = true;
    lastEyebrowRaiseTime = now;
    log('🎯 EYEBROW RAISE CONFIRMED! Toggling text field mode');
    toggleTextFieldMode();
  } else if (avgBrowScore < 0.3) {
    // Eyebrows relaxed - reset detection flag
    eyebrowRaiseDetected = false;
  }
}

function toggleTextFieldMode() {
  textFieldModeActive = !textFieldModeActive;

  if (textFieldModeActive) {
    // Enter text field mode (from gesture mode)
    chrome.runtime.sendMessage({ action: 'enableTextFieldMode' }, (response) => {
      if (response && response.success) {
        showVisualFeedback(`WRITER MODE\nFound ${response.fieldCount} fields`, 'info', 2000, 'edit');
        log('Writer mode enabled, found', response.fieldCount, 'fields');
      }
    });
    currentTextFieldIndex = -1;
    textFieldHoverStartTime = 0;
  } else {
    // Exit writer mode - return to gesture mode (not neutral)
    chrome.runtime.sendMessage({ action: 'disableTextFieldMode' });

    // IMPORTANT: Return to gesture mode and reset the timer for another 5 seconds
    currentMode = INTERACTION_MODES.GESTURE_ACTIVE;
    modeActivationTime = Date.now(); // Give another 5 seconds of gesture mode

    showVisualFeedback('Writer mode disabled\nReturned to gesture mode', 'info', 1500, 'edit');
    log('Writer mode disabled, returned to gesture mode');
    currentTextFieldIndex = -1;
    textFieldHoverStartTime = 0;
  }
}

// Load calibration data
let calibrationThresholds = {
  pitchDown: 15,
  pitchUp: -15,
  yawLeft: -20,
  yawRight: 20,
  yawBackLeft: -50,
  yawBackRight: 50,
  smile: 0.6,
  leftWink: 0.5,  // Reduced from 0.7 for small eyes
  rightWink: 0.5, // Reduced from 0.7 for small eyes
  rollLeft: -25,
  rollRight: 25,
  jawOpen: 0.5
};

// User's neutral position (baseline for all movements)
let neutralPosition = {
  pitch: 0,
  yaw: 0,
  roll: 0
};

// Load saved neutral position only (gesture thresholds use defaults)
chrome.storage.local.get(['neutralPosition'], (result) => {
  if (result.neutralPosition) {
    neutralPosition = result.neutralPosition;
    needsNeutralCalibration = false;
    log('Loaded neutral position:', neutralPosition);
  } else {
    log('No saved neutral position - will auto-calibrate on first use');
  }
});

let webcamRunning = false;
let faceLandmarker = null;
let FaceLandmarker, FilesetResolver, DrawingUtils; // Make these global
let animationId = null;
let lastVideoTime = -1;
let drawingUtils = null;
let previousLandmarks = null;
let browserControlEnabled = false;
let lastClickTime = 0;
let previousYaw = 0;
let backGestureCooldown = 0;
let forwardGestureCooldown = 0;
let lastYawDirection = 0; // Track which direction we turned
// New gesture detection variables
let leftWinkStartTime = 0;
let rightWinkStartTime = 0;
let smileDetected = false;
let lastTabSwitchTime = 0;
let lastNewTabTime = 0;
let lastCloseTabTime = 0;
let lastRefreshTime = 0;

// Text field navigation mode
let textFieldModeActive = false;
let lastEyebrowRaiseTime = 0;
let eyebrowRaiseDetected = false;
let currentTextFieldIndex = -1;
let textFieldHoverStartTime = 0;
let lastTextFieldSwitchTime = 0;

// Auto-calibration for neutral position
let needsNeutralCalibration = true;
let neutralCalibrationStartTime = 0;
let neutralCalibrationSamples = [];
const NEUTRAL_CALIBRATION_DURATION = 3000; // 3 seconds

async function initializeFaceLandmarker() {
  try {
    status.innerHTML = '<div class="info">Loading MediaPipe library...</div>';

    const vision = await import(chrome.runtime.getURL('vision_bundle.mjs'));

    // Assign to global variables
    FaceLandmarker = vision.FaceLandmarker;
    FilesetResolver = vision.FilesetResolver;
    DrawingUtils = vision.DrawingUtils;

    status.innerHTML = '<div class="info">Loading WASM runtime...</div>';

    const filesetResolver = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('wasm')
    );

    status.innerHTML = '<div class="info">Loading Face Landmarker model...</div>';

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    });

    drawingUtils = new DrawingUtils(canvasCtx);

    // Initialize Phase 2 gesture configuration system
    await initializeGestureConfig();

    const checkIcon = typeof getIconHTML === 'function' ? getIconHTML('check', '', 'width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;') : '✓';
    status.innerHTML = `<div class="info" style="color: #4CAF50;">${checkIcon} MediaPipe loaded! Click "Start Camera" to begin.</div>`;
    startBtn.disabled = false;
    startBtn.innerHTML = 'Start Camera';

  } catch (error) {
    status.innerHTML = `<div class="info error">✗ Failed to load MediaPipe: ${error.message}</div>`;
    error('Initialization error:', error);
  }
}

async function enableWebcam() {
  if (!faceLandmarker) {
    alert('Please wait for Face Landmarker to load');
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = 'Requesting camera...';
  status.innerHTML = '<div class="info">Requesting camera access... Please allow when prompted!</div>';
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      } 
    });
    
    video.srcObject = stream;
    
    video.addEventListener('loadeddata', () => {
      webcamRunning = true;
      initializeFeedbackSystem(); // Initialize Phase 1 feedback system
      initializeZoneVisualization(); // Initialize Phase 2 zone visualization
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      controlBtn.style.display = 'inline-block';
      settingsBtn.style.display = 'inline-block';
      const checkIcon = typeof getIconHTML === 'function' ? getIconHTML('check', '', 'width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;') : '✓';
      status.innerHTML = `<div class="info" style="color: #4CAF50;">${checkIcon} Camera active! Move your head to see tracking.</div>`;
      predictWebcam();
    });
    
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Camera';
    
    let errorMsg = '';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      errorMsg = `<div class="info error">✗ Camera access denied</div>
        <div class="info">Please:</div>
        <div class="info">1. Click the camera icon in Chrome's address bar</div>
        <div class="info">2. Select "Always allow" for this extension</div>
        <div class="info">3. Try clicking "Start Camera" again</div>`;
    } else if (err.name === 'NotFoundError') {
      errorMsg = `<div class="info error">✗ No camera found</div>
        <div class="info">Please connect a webcam and try again.</div>`;
    } else {
      errorMsg = `<div class="info error">✗ Error: ${err.message}</div>`;
    }
    
    status.innerHTML = errorMsg;
    error('Camera error:', err);
  }
}

function stopWebcam() {
  webcamRunning = false;
  browserControlEnabled = false;
  
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  previousLandmarks = null;
  
  startBtn.style.display = 'inline-block';
  startBtn.disabled = false;
  startBtn.textContent = 'Start Camera';
  stopBtn.style.display = 'none';
  controlBtn.style.display = 'none';
  controlBtn.textContent = 'Enable Browser Control';
  controlBtn.style.background = '#FF9800';
  status.innerHTML = '<div class="info">Camera stopped.</div>';
}

function analyzeHeadMovement(landmarks, blendshapes) {
  if (!landmarks || landmarks.length === 0) return null;

  // Graceful degradation - check for essential landmarks only
  const noseTip = landmarks[4];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  if (!noseTip || !leftEye || !rightEye) {
    // Can't track without these essential points
    return null;
  }

  const chin = landmarks[152];
  const forehead = landmarks[10];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  if (previousLandmarks) {
    const prevNose = previousLandmarks[4];
    if (!prevNose) return null;
    const deltaX = (noseTip.x - prevNose.x) * canvas.width;
    const deltaY = (noseTip.y - prevNose.y) * canvas.height;
    const deltaZ = (noseTip.z - prevNose.z) * 100;

    // Calculate roll (head tilt left/right)
    const rawRoll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

    // Calculate pitch (head nod up/down) - IMPROVED
    // Use nose tip Y position relative to eyes
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const noseTipRelativeY = noseTip.y - eyeCenterY;

    // Also use forehead to chin distance for better pitch detection
    const verticalDistance = chin.y - forehead.y;
    const rawPitch = Math.atan2(noseTipRelativeY, verticalDistance) * (180 / Math.PI) * 2;

    // Calculate yaw (head turn left/right)
    const mouthCenterX = (leftMouth.x + rightMouth.x) / 2;
    const faceWidth = Math.abs(rightMouth.x - leftMouth.x);
    const rawYaw = ((noseTip.x - mouthCenterX) / faceWidth) * 90;

    // Apply neutral position offset - all movements relative to user's baseline
    const pitch = rawPitch - neutralPosition.pitch;
    const yaw = rawYaw - neutralPosition.yaw;
    const roll = rawRoll - neutralPosition.roll;

    let movements = [];
    if (Math.abs(deltaX) > 3) movements.push(deltaX > 0 ? 'RIGHT' : 'LEFT');
    if (Math.abs(deltaY) > 3) movements.push(deltaY > 0 ? 'DOWN' : 'UP');
    if (Math.abs(deltaZ) > 0.5) movements.push(deltaZ > 0 ? 'FORWARD' : 'BACKWARD');
    
    if (Math.abs(roll) > 10) movements.push(`TILT`);
    if (Math.abs(yaw) > 15) movements.push(`TURN`);
    if (Math.abs(pitch) > 15) movements.push(`NOD`);

    previousLandmarks = landmarks;

    return {
      movements: movements.length > 0 ? movements : ['STABLE'],
      rotation: { roll: roll.toFixed(1), pitch: pitch.toFixed(1), yaw: yaw.toFixed(1) },
      speed: Math.sqrt(deltaX * deltaX + deltaY * deltaY).toFixed(1),
      blendshapes: blendshapes
    };
  }

  previousLandmarks = landmarks;
  return null;
}

// Auto-calibrate neutral position on first use
function performNeutralCalibration(pitch, yaw, roll) {
  if (!needsNeutralCalibration) return false;

  const now = Date.now();

  if (neutralCalibrationStartTime === 0) {
    neutralCalibrationStartTime = now;
    showVisualFeedback('Calibrating...\nLook straight ahead!', 'info', 3000, 'locationOn');
    log('Starting neutral position calibration...');
  }

  const elapsed = now - neutralCalibrationStartTime;
  const progress = Math.min(1, elapsed / NEUTRAL_CALIBRATION_DURATION);

  // Collect samples
  neutralCalibrationSamples.push({ pitch, yaw, roll });

  // Show progress
  if (elapsed % 500 < 50) { // Update every ~500ms
    showProgressFeedback('Hold steady...', progress, 'info', 'locationOn');
  }

  // Complete calibration after 3 seconds
  if (elapsed >= NEUTRAL_CALIBRATION_DURATION) {
    // Average all samples
    const avgPitch = neutralCalibrationSamples.reduce((sum, s) => sum + s.pitch, 0) / neutralCalibrationSamples.length;
    const avgYaw = neutralCalibrationSamples.reduce((sum, s) => sum + s.yaw, 0) / neutralCalibrationSamples.length;
    const avgRoll = neutralCalibrationSamples.reduce((sum, s) => sum + s.roll, 0) / neutralCalibrationSamples.length;

    neutralPosition.pitch = avgPitch;
    neutralPosition.yaw = avgYaw;
    neutralPosition.roll = avgRoll;

    // Save to storage
    chrome.storage.local.set({ neutralPosition }, () => {
      log('Neutral position calibrated and saved:', neutralPosition);
      showVisualFeedback('Calibration Complete!\nReady to use!', 'success', 2000, 'check');
    });

    needsNeutralCalibration = false;
    return true; // Calibration complete
  }

  return false; // Still calibrating
}

async function predictWebcam() {
  if (!webcamRunning) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  let startTimeMs = performance.now();
  
  if (lastVideoTime !== video.currentTime && faceLandmarker) {
    lastVideoTime = video.currentTime;
    
    const results = faceLandmarker.detectForVideo(video, startTimeMs);
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];
      
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#C0C0C070', lineWidth: 1 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF3030', lineWidth: 2 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, { color: '#FF3030', lineWidth: 1 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#30FF30', lineWidth: 2 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, { color: '#30FF30', lineWidth: 1 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: '#E0E0E0', lineWidth: 2 });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: '#E0E0E0', lineWidth: 2 });
      
      const movement = analyzeHeadMovement(landmarks, results.faceBlendshapes ? results.faceBlendshapes[0] : null);

// ===== AUTO-CALIBRATION FOR NEUTRAL POSITION =====
if (movement && needsNeutralCalibration) {
  const pitch = parseFloat(movement.rotation.pitch);
  const yaw = parseFloat(movement.rotation.yaw);
  const roll = parseFloat(movement.rotation.roll);

  // Perform calibration (blocks other interactions)
  performNeutralCalibration(pitch, yaw, roll);
  // Skip all other processing during calibration
}

// ===== BROWSER CONTROL LOGIC =====
if (movement && browserControlEnabled && !needsNeutralCalibration) {
  // Update gesture mode state
  updateGestureMode();

  const pitch = parseFloat(movement.rotation.pitch);
  const yaw = parseFloat(movement.rotation.yaw);
  const roll = parseFloat(movement.rotation.roll);

  // Always check for wake-up gesture and eyebrow raise (only in gesture mode)
  if (movement.blendshapes) {
    detectWakeUpGesture(movement.blendshapes);
    detectEyebrowRaise(movement.blendshapes, pitch, isGestureModeActive());
  }

  // Debug: Log ALL head movements continuously
  if (browserControlEnabled && (Math.abs(yaw) > 20 || Math.abs(roll) > 15)) {
    log(`HEAD: Pitch=${pitch.toFixed(1)}° Yaw=${yaw.toFixed(1)}° Roll=${roll.toFixed(1)}° | GestureMode=${isGestureModeActive()}`);
  }

  // Initialize previousYaw if not set
  if (previousYaw === 0 && yaw !== 0) {
    previousYaw = yaw;
  }

  // ===== NAVIGATION GESTURES (Require Gesture Mode, disabled in text field mode) =====
  if (isGestureModeActive() && !textFieldModeActive) {

    // BACK GESTURE - Quick snap left
    const yawChange = yaw - previousYaw;
    const absYawChange = Math.abs(yawChange);

    // Debug: Log when approaching back/forward thresholds
    if (Math.abs(yaw) > 40) {
      log(`Yaw: ${yaw.toFixed(1)} | BackLeft: ${calibrationThresholds.yawBackLeft} | BackRight: ${calibrationThresholds.yawBackRight}`);
    }

    // Sharp left turn with speed requirement - triggers immediately
    if (yaw < calibrationThresholds.yawBackLeft && absYawChange > 15 && Date.now() > backGestureCooldown) {
      chrome.runtime.sendMessage({ action: 'goBack' });
      showVisualFeedback('NAVIGATED BACK!', 'success', 1000, 'arrowBack');
      backGestureCooldown = Date.now() + 2000;
      enterCooldown();
    }

    // FORWARD GESTURE - Quick snap right
    // Sharp right turn with speed requirement - triggers immediately
    if (yaw > calibrationThresholds.yawBackRight && absYawChange > 15 && Date.now() > forwardGestureCooldown) {
      chrome.runtime.sendMessage({ action: 'goForward' });
      showVisualFeedback('NAVIGATED FORWARD!', 'success', 1000, 'arrowForward');
      forwardGestureCooldown = Date.now() + 2000;
      enterCooldown();
    }

    previousYaw = yaw;

    // ===== OTHER GESTURES (Also require Gesture Mode) =====
    if (movement.blendshapes) {
      const categories = movement.blendshapes.categories;

      const mouthSmileLeft = categories.find(b => b.categoryName === 'mouthSmileLeft');
      const mouthSmileRight = categories.find(b => b.categoryName === 'mouthSmileRight');
      const eyeBlinkLeft = categories.find(b => b.categoryName === 'eyeBlinkLeft');
      const eyeBlinkRight = categories.find(b => b.categoryName === 'eyeBlinkRight');

      const leftWinkScore = eyeBlinkLeft?.score || 0;
      const rightWinkScore = eyeBlinkRight?.score || 0;

      // LEFT WINK: Refresh (already has hold, add feedback)
      const adjustedLeftWinkThreshold = calibrationThresholds.leftWink / sensitivitySettings.gesture;
      if (leftWinkScore > adjustedLeftWinkThreshold && rightWinkScore < 0.4) {
        if (leftWinkStartTime === 0) {
          leftWinkStartTime = Date.now();
          showProgressFeedback('REFRESH?', 0, 'info');
        } else {
          const holdDuration = (Date.now() - leftWinkStartTime) / 1000;
          showProgressFeedback('Hold wink...', holdDuration / 1.0, 'info');

          if (holdDuration > 1.0 && Date.now() - lastRefreshTime > 2000) {
            chrome.runtime.sendMessage({ action: 'refresh' });
            showVisualFeedback('PAGE REFRESHED!', 'success', 1500, 'refresh');
            leftWinkStartTime = 0;
            lastRefreshTime = Date.now();
            enterCooldown();
          }
        }
      } else {
        if (leftWinkStartTime > 0) hideVisualFeedback();
        leftWinkStartTime = 0;
      }

      // RIGHT WINK: Close tab (already has hold, add feedback)
      const adjustedRightWinkThreshold = calibrationThresholds.rightWink / sensitivitySettings.gesture;
      if (rightWinkScore > adjustedRightWinkThreshold && leftWinkScore < 0.4) {
        if (rightWinkStartTime === 0) {
          rightWinkStartTime = Date.now();
          showProgressFeedback('CLOSE TAB?', 0, 'warning');
        } else {
          const holdDuration = (Date.now() - rightWinkStartTime) / 1000;
          showProgressFeedback('Hold wink...', holdDuration / 1.0, 'warning');

          if (holdDuration > 1.0 && Date.now() - lastCloseTabTime > 2000) {
            chrome.runtime.sendMessage({ action: 'closeTab' });
            showVisualFeedback('TAB CLOSED!', 'warning', 1500, 'close');
            rightWinkStartTime = 0;
            lastCloseTabTime = Date.now();
            enterCooldown();
          }
        }
      } else {
        if (rightWinkStartTime > 0) hideVisualFeedback();
        rightWinkStartTime = 0;
      }

      // SMILE: New tab
      const smileLeftScore = mouthSmileLeft?.score || 0;
      const smileRightScore = mouthSmileRight?.score || 0;
      const smileScore = Math.max(smileLeftScore, smileRightScore);
      const adjustedSmileThreshold = calibrationThresholds.smile / sensitivitySettings.gesture;

      // Debug logging
      if (smileScore > 0.3) {
        log(`Smile detected: ${smileScore.toFixed(2)} | Threshold: ${adjustedSmileThreshold.toFixed(2)} | Gesture mode: ${isGestureModeActive()}`);
      }

      if (smileScore > adjustedSmileThreshold) {
        if (smileStartTime === 0) {
          smileStartTime = Date.now();
          showProgressFeedback('NEW TAB?', 0, 'info');
          log('Smile gesture started!');
        } else {
          const holdDuration = (Date.now() - smileStartTime) / 1000;
          showProgressFeedback('Hold smile...', holdDuration / 1.5, 'info');
          log(`Smile hold duration: ${holdDuration.toFixed(2)}s / 1.5s`);

          if (holdDuration > 1.5 && Date.now() - lastNewTabTime > 2000) {
            log('Sending newTab message!');
            chrome.runtime.sendMessage({ action: 'newTab' }, (response) => {
              log('newTab response:', response);
            });
            showVisualFeedback('NEW TAB OPENED!', 'success', 1500, 'check');
            smileStartTime = 0;
            lastNewTabTime = Date.now();
            enterCooldown();
          }
        }
      } else {
        if (smileStartTime > 0) {
          log('Smile released early, resetting');
          hideVisualFeedback();
        }
        smileStartTime = 0;
      }
    }

    // TAB SWITCHING: Head tilt (only when NOT doing back/forward gestures)
    // Don't check roll if user is doing extreme yaw turns (back/forward navigation)
    const isDoingBackForwardGesture = Math.abs(yaw) > 40;

    if (!isDoingBackForwardGesture) {
      const adjustedRollLeftThreshold = calibrationThresholds.rollLeft / sensitivitySettings.gesture;
      const adjustedRollRightThreshold = calibrationThresholds.rollRight / sensitivitySettings.gesture;

      // Debug: Log when approaching tilt thresholds
      if (Math.abs(roll) > 20) {
        log(`Roll: ${roll.toFixed(1)} | RollLeft: ${adjustedRollLeftThreshold.toFixed(1)} | RollRight: ${adjustedRollRightThreshold.toFixed(1)}`);
      }

      if (roll < adjustedRollLeftThreshold && Date.now() - lastTabSwitchTime > 1000) {
        chrome.runtime.sendMessage({ action: 'nextTab' });
        showVisualFeedback('NEXT TAB', 'info', 800, 'tabNext');
        lastTabSwitchTime = Date.now();
        enterCooldown();
      }

      if (roll > adjustedRollRightThreshold && Date.now() - lastTabSwitchTime > 1000) {
        chrome.runtime.sendMessage({ action: 'previousTab' });
        showVisualFeedback('PREVIOUS TAB', 'info', 800, 'tabPrevious');
        lastTabSwitchTime = Date.now();
        enterCooldown();
      }
    }

  } // End gesture mode check

  // ===== CURSOR & SCROLLING (Always active, don't require gesture mode) =====
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[4];

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;

  let gazeX = eyeCenterX + (yaw / 90) * 0.15 * sensitivitySettings.cursorSpeed;
  let gazeY = eyeCenterY + (pitch / 90) * 0.1 * sensitivitySettings.cursorSpeed;

  gazeX = Math.max(0, Math.min(1, gazeX));
  gazeY = Math.max(0, Math.min(1, gazeY));

  chrome.runtime.sendMessage({
    action: 'moveCursor',
    gazeX: gazeX,
    gazeY: gazeY
  });

  // ===== SCROLLING (ONLY in regular mode - not in gesture mode, not in text field mode) =====
  if (!isGestureModeActive() && !textFieldModeActive) {
    let scrollX = 0;
    let scrollY = 0;

    const isUsingCursorControl = Math.abs(gazeX - 0.5) > 0.1 || Math.abs(gazeY - 0.5) > 0.1;

    if (!isUsingCursorControl) {
      const pitchThreshold = Math.min(Math.abs(calibrationThresholds.pitchDown), Math.abs(calibrationThresholds.pitchUp)) * 0.7 * sensitivitySettings.scroll;
      if (Math.abs(pitch) > pitchThreshold) {
        scrollY = pitch * 0.8 / sensitivitySettings.scroll;
      }

      const yawThreshold = Math.min(Math.abs(calibrationThresholds.yawLeft), Math.abs(calibrationThresholds.yawRight)) * 0.7 * sensitivitySettings.scroll;
      const yawBackThreshold = Math.min(Math.abs(calibrationThresholds.yawBackLeft), Math.abs(calibrationThresholds.yawBackRight));
      if (Math.abs(yaw) > yawThreshold && Math.abs(yaw) < yawBackThreshold) {
        scrollX = yaw * 0.5 / sensitivitySettings.scroll;
      }

      if (Math.abs(scrollX) > 1 || Math.abs(scrollY) > 1) {
        chrome.runtime.sendMessage({
          action: 'scroll',
          deltaY: scrollY,
          deltaX: scrollX
        });
      }
    }
  }

  // ===== TEXT FIELD NAVIGATION (when text field mode is active) =====
  if (textFieldModeActive) {
    const adjustedRollLeftThreshold = calibrationThresholds.rollLeft / sensitivitySettings.gesture;
    const adjustedRollRightThreshold = calibrationThresholds.rollRight / sensitivitySettings.gesture;

    // Navigate to next text field (tilt left)
    if (roll < adjustedRollLeftThreshold && Date.now() - lastTextFieldSwitchTime > 500) {
      chrome.runtime.sendMessage({ action: 'nextTextField' }, (response) => {
        if (response && response.success) {
          currentTextFieldIndex = response.index;
          textFieldHoverStartTime = Date.now();
          showVisualFeedback(`Field ${response.index + 1}/${response.total}`, 'info', 500, 'arrowForward');
        }
      });
      lastTextFieldSwitchTime = Date.now();
    }

    // Navigate to previous text field (tilt right)
    if (roll > adjustedRollRightThreshold && Date.now() - lastTextFieldSwitchTime > 500) {
      chrome.runtime.sendMessage({ action: 'previousTextField' }, (response) => {
        if (response && response.success) {
          currentTextFieldIndex = response.index;
          textFieldHoverStartTime = Date.now();
          showVisualFeedback(`Field ${response.index + 1}/${response.total}`, 'info', 500, 'arrowBack');
        }
      });
      lastTextFieldSwitchTime = Date.now();
    }

    // Check if user has been hovering on current field for 2 seconds
    if (currentTextFieldIndex >= 0 && textFieldHoverStartTime > 0) {
      const hoverDuration = (Date.now() - textFieldHoverStartTime) / 1000;

      if (hoverDuration >= 2.0) {
        // Select the field and focus it
        chrome.runtime.sendMessage({ action: 'selectTextField', index: currentTextFieldIndex }, (response) => {
          if (response && response.success) {
            showVisualFeedback('Field selected - Ready to type!', 'success', 1500, 'edit');
            textFieldHoverStartTime = 0; // Reset so we don't select again
          }
        });
      } else if (hoverDuration > 0.5) {
        // Show progress feedback
        showProgressFeedback(`⏱️ Selecting field...`, hoverDuration / 2.0, 'info');
      }
    }

    // SMILE gesture to confirm edit options (when in text field mode)
    if (movement.blendshapes) {
      const categories = movement.blendshapes.categories;
      const mouthSmileLeft = categories.find(b => b.categoryName === 'mouthSmileLeft');
      const mouthSmileRight = categories.find(b => b.categoryName === 'mouthSmileRight');
      const smileLeftScore = mouthSmileLeft?.score || 0;
      const smileRightScore = mouthSmileRight?.score || 0;
      const smileScore = Math.max(smileLeftScore, smileRightScore);
      const adjustedSmileThreshold = calibrationThresholds.smile / sensitivitySettings.gesture;

      if (smileScore > adjustedSmileThreshold) {
        if (smileStartTime === 0) {
          smileStartTime = Date.now();
          showProgressFeedback('CONFIRM?', 0, 'info');
        } else {
          const holdDuration = (Date.now() - smileStartTime) / 1000;
          showProgressFeedback('Hold smile...', holdDuration / 1.0, 'info');

          if (holdDuration > 1.0 && Date.now() - lastNewTabTime > 2000) {
            // Send confirmation message
            chrome.runtime.sendMessage({ action: 'confirmEditOption' }, (response) => {
              log('Confirm edit option response:', response);
            });
            showVisualFeedback('CONFIRMED!', 'success', 1500, 'check');
            smileStartTime = 0;
            lastNewTabTime = Date.now();
          }
        }
      } else {
        if (smileStartTime > 0) {
          hideVisualFeedback();
        }
        smileStartTime = 0;
      }
    }
  }

  // ===== CLICK with two-stage confirmation (ONLY in regular mode - not in gesture mode, not in text field mode) =====
  if (movement.blendshapes && !isGestureModeActive() && !textFieldModeActive) {
    const jawOpen = movement.blendshapes.categories.find(b => b.categoryName === 'jawOpen');
    const mouthOpen = movement.blendshapes.categories.find(b => b.categoryName === 'mouthOpen');

    const openScore = Math.max(
      jawOpen?.score || 0,
      mouthOpen?.mouthOpen || 0
    );

    const adjustedJawOpenThreshold = calibrationThresholds.jawOpen * sensitivitySettings.click;

    if (openScore > adjustedJawOpenThreshold) {
      if (jawOpenStage === 0) {
        // Stage 1: Initial detection
        jawOpenStage = 1;
        jawOpenStartTime = Date.now();
        showProgressFeedback('CLICK?', 0, 'warning');
      } else if (jawOpenStage === 1) {
        // Stage 2: Require 0.8 second hold
        const holdDuration = (Date.now() - jawOpenStartTime) / 1000;
        showProgressFeedback('Hold open...', holdDuration / 0.8, 'warning');

        if (holdDuration >= 0.8) {
          jawOpenStage = 2;
          jawOpenConfirmedTime = Date.now();
          showVisualFeedback('Close mouth to CLICK', 'info', 800);
        }
      }
    } else {
      // Mouth closed
      if (jawOpenStage === 2 && (Date.now() - jawOpenConfirmedTime < 1500)) {
        // Stage 3: User closed mouth within time window - CLICK!
        if (!lastClickTime || Date.now() - lastClickTime > 1000) {
          chrome.runtime.sendMessage({ action: 'click' });
          showVisualFeedback('CLICKED!', 'success', 1500, 'check');
          lastClickTime = Date.now();
          // Note: Click is a neutral gesture, so we don't enter cooldown
        }
      } else if (jawOpenStage === 1) {
        // User released too early - cancel
        hideVisualFeedback();
      }
      jawOpenStage = 0;
    }
  }

}
// ===== END BROWSER CONTROL LOGIC =====
    if (movement) {
const checkIcon = typeof getIconHTML === 'function' ? getIconHTML('check', '', 'width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;') : '✓';
let html = `<div class="info" style="color: #4CAF50;">${checkIcon} Tracking 478 facial landmarks!</div>`;

        if (browserControlEnabled) {
  // Show current mode
  const modeColor = {
    neutral: '#9E9E9E',
    gesture: '#4CAF50',
    cooldown: '#FF9800'
  };
  const modeText = currentMode === INTERACTION_MODES.GESTURE_ACTIVE
    ? `GESTURE MODE ACTIVE (${Math.ceil((GESTURE_MODE_DURATION - (Date.now() - modeActivationTime)) / 1000)}s left)`
    : currentMode === INTERACTION_MODES.COOLDOWN
    ? 'COOLDOWN'
    : 'Double-blink to activate gestures';

  html += `<div class="info" style="color: ${modeColor[currentMode]}; font-weight: bold;">${modeText}</div>`;
  html += '<div class="info" style="color: #2196F3; font-size: 11px;">Eyes→Cursor | Mouth→Click (always active)<br>Gesture Mode: Turn→Back/Forward | Smile→New Tab<br>Wink Left→Refresh | Wink Right→Close | Tilt→Switch Tab</div>';
  
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  const pitch = parseFloat(movement.rotation.pitch);
  const yaw = parseFloat(movement.rotation.yaw);
  const roll = parseFloat(movement.rotation.roll);
  
  let gazeX = eyeCenterX + (yaw / 90) * 0.15;
  let gazeY = eyeCenterY + (pitch / 90) * 0.1;
  gazeX = Math.max(0, Math.min(1, gazeX));
  gazeY = Math.max(0, Math.min(1, gazeY));
  
  html += `<div class="info">Cursor: ${(gazeX * 100).toFixed(0)}%, ${(gazeY * 100).toFixed(0)}%</div>`;
  
  // Show gesture detection feedback
  if (movement.blendshapes) {
    const categories = movement.blendshapes.categories;
    const smileLeft = categories.find(b => b.categoryName === 'mouthSmileLeft');
    const smileRight = categories.find(b => b.categoryName === 'mouthSmileRight');
    const leftBlink = categories.find(b => b.categoryName === 'eyeBlinkLeft');
    const rightBlink = categories.find(b => b.categoryName === 'eyeBlinkRight');
    
    const smileScore = Math.max(smileLeft?.score || 0, smileRight?.score || 0);
    const leftBlinkScore = leftBlink?.score || 0;
    const rightBlinkScore = rightBlink?.score || 0;
    
    if (smileScore > 0.5) {
      html += `<div class="info" style="color: #4CAF50; font-weight: bold;">Smile: ${(smileScore * 100).toFixed(0)}%</div>`;
    }
    if (leftBlinkScore > 0.7 && rightBlinkScore < 0.3) {
      const holdTime = leftWinkStartTime > 0 ? ((Date.now() - leftWinkStartTime) / 1000).toFixed(1) : 0;
      html += `<div class="info" style="color: #2196F3; font-weight: bold;">Left wink: ${holdTime}s (1s = refresh)</div>`;
    }
    if (rightBlinkScore > 0.7 && leftBlinkScore < 0.3) {
      const holdTime = rightWinkStartTime > 0 ? ((Date.now() - rightWinkStartTime) / 1000).toFixed(1) : 0;
      html += `<div class="info" style="color: #f44336; font-weight: bold;">Right wink: ${holdTime}s (1s = close tab)</div>`;
    }
  }
  
  // Show head tilt for tab switching
  if (Math.abs(roll) > 20) {
    html += `<div class="info" style="color: #FF9800; font-weight: bold;">Tilt: ${roll.toFixed(0)}° ${roll > 25 ? 'Prev Tab' : roll < -25 ? 'Next Tab' : ''}</div>`;
  }

  // Show navigation gesture status
  if (yaw < -50) {
    html += '<div class="info" style="color: #FF9800; font-weight: bold;">BACK READY (turn left)</div>';
  } else if (yaw > 50) {
    html += '<div class="info" style="color: #2196F3; font-weight: bold;">FORWARD READY (turn right)</div>';
  }

  let controlStatus = [];
  if (Math.abs(pitch) > 15) {
    controlStatus.push(pitch > 0 ? 'DOWN' : 'UP');
  }
  if (Math.abs(yaw) > 20 && Math.abs(yaw) < 50) {
    controlStatus.push(yaw > 0 ? 'Scroll RIGHT' : 'Scroll LEFT');
  }
  
  if (controlStatus.length > 0) {
    html += `<div class="info">${controlStatus.join(' | ')}</div>`;
  }
}
        
        if (movement.movements[0] !== 'STABLE') {
          html += `<div class="info movement">${movement.movements.join(' + ')}</div>`;
        }
        
        html += `<div class="info">Pitch: ${movement.rotation.pitch}° | Yaw: ${movement.rotation.yaw}° | Roll: ${movement.rotation.roll}°</div>`;
        
        if (movement.blendshapes) {
  const topExpressions = movement.blendshapes.categories
    .filter(b => b.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Show top 5 instead of 3
  
  if (topExpressions.length > 0) {
    html += '<div class="info">Expressions: ' + 
      topExpressions.map(e => {
        const highlight = (e.categoryName === 'jawOpen' && e.score > 0.5) ? 
          'style="color: #FF3030; font-weight: bold;"' : '';
        return `<span ${highlight}>${e.categoryName} (${(e.score * 100).toFixed(0)}%)</span>`;
      }).join(', ') +
      '</div>';
  }
}
        
        status.innerHTML = html;
      }
    } else {
      status.innerHTML = '<div class="info">No face detected. Please face the camera.</div>';
      previousLandmarks = null;
    }
    
    canvasCtx.restore();
  }

  if (webcamRunning) {
    animationId = window.requestAnimationFrame(predictWebcam);
  }
}



// Control button toggle
controlBtn.addEventListener('click', async () => {
  browserControlEnabled = !browserControlEnabled;
  
  if (browserControlEnabled) {
    controlBtn.textContent = 'Disabling...';
    controlBtn.disabled = true;
    
    // Enable control across ALL tabs
    chrome.runtime.sendMessage({ action: 'enableBrowserControl' }, (response) => {
      controlBtn.disabled = false;
      
      if (chrome.runtime.lastError) {
        status.innerHTML = '<div class="info error">Error: ' + chrome.runtime.lastError.message + '</div>';
        browserControlEnabled = false;
        controlBtn.textContent = 'Enable Browser Control';
        controlBtn.style.background = '#FF9800';
      } else if (response && response.success) {
        controlBtn.textContent = 'Disable Browser Control';
        controlBtn.style.background = '#f44336';
        const checkIcon2 = typeof getIconHTML === 'function' ? getIconHTML('check', '', 'width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;') : '✓';
        const warningIcon = typeof getIconHTML === 'function' ? getIconHTML('warning', '', 'width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;') : '⚠️';
        status.innerHTML = `<div class="info" style="color: #FF9800;">Browser control ENABLED across ALL tabs!<br>
          ${checkIcon2} Injected into ${response.injected} tabs<br>
          ${response.failed > 0 ? `${warningIcon} Failed: ${response.failed} tabs (likely protected pages)<br>` : ''}
          Tilt head to scroll | Open jaw to click</div>`;
      } else {
        status.innerHTML = '<div class="info error">Failed to enable control.</div>';
        browserControlEnabled = false;
        controlBtn.textContent = 'Enable Browser Control';
        controlBtn.style.background = '#FF9800';
      }
    });
  } else {
    controlBtn.textContent = 'Enabling...';
    controlBtn.disabled = true;
    
    // Disable control
    chrome.runtime.sendMessage({ action: 'disableBrowserControl' }, (response) => {
      controlBtn.disabled = false;
      controlBtn.textContent = 'Enable Browser Control';
      controlBtn.style.background = '#FF9800';
      status.innerHTML = '<div class="info">Browser control disabled across all tabs.</div>';
    });
  }
});

initializeFaceLandmarker();
startBtn.addEventListener('click', enableWebcam);
stopBtn.addEventListener('click', stopWebcam);