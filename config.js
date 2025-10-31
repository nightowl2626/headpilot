/**
 * HeadPilot - Shared Configuration
 * Centralizes all constants, thresholds, and magic numbers
 */

const CONFIG = {
  // ===== CALIBRATION =====
  NEUTRAL_CALIBRATION_DURATION: 3000, // 3 seconds to calibrate neutral position
  NEUTRAL_CALIBRATION_SAMPLES_MIN: 60, // Minimum samples for calibration

  // ===== GESTURE MODE =====
  GESTURE_MODE_DURATION: 15000, // 15 seconds of gesture mode activity
  GESTURE_MODE_COOLDOWN: 500, // ms between gesture mode checks

  // ===== GESTURE THRESHOLDS (Defaults) =====
  THRESHOLDS: {
    // Head rotation (degrees from neutral)
    pitchDown: 15,
    pitchUp: -15,
    yawLeft: -20,
    yawRight: 20,
    yawBackLeft: -50,  // Sharp turn left (back navigation)
    yawBackRight: 50,  // Sharp turn right (forward navigation)
    rollLeft: -25,
    rollRight: 25,

    // Facial expressions (blend shape scores 0-1)
    smile: 0.5,
    leftWink: 0.6,
    rightWink: 0.6,
    jawOpen: 0.4,
    eyebrowRaise: 0.4,

    // Movement speed requirements
    minYawChange: 15, // Degrees change required for quick turn detection
  },

  // ===== GESTURE HOLD TIMES =====
  HOLD_TIMES: {
    smile: 1500,      // ms to hold smile for new tab
    wink: 1000,       // ms to hold wink for tab close/refresh
    jawOpen: 500,     // ms to hold jaw open for click
    smileConfirm: 1000, // ms to hold smile for confirming edit options
  },

  // ===== COOLDOWN PERIODS =====
  COOLDOWNS: {
    eyebrowRaise: 1000,
    tabSwitch: 1000,
    navigation: 2000,   // Back/forward navigation
    newTab: 2000,
    closeTab: 2000,
    refresh: 2000,
    textFieldSwitch: 500,
  },

  // ===== SCROLLING =====
  SCROLL: {
    sensitivity: 1.0,
    deadzone: 5,      // Degrees of movement to ignore
    maxSpeed: 20,     // Maximum pixels per frame
  },

  // ===== CURSOR CONTROL =====
  CURSOR: {
    speed: 1.0,
    smoothing: 0.3,   // Lower = smoother, higher = more responsive
  },

  // ===== TEXT FIELD MODE =====
  TEXT_FIELD: {
    hoverDuration: 2000,  // ms to hover before selecting field
    speechPauseDuration: 3000, // ms of silence before showing edit options
  },

  // ===== SENSITIVITY DEFAULTS =====
  SENSITIVITY_DEFAULTS: {
    scroll: 1.0,      // 100%
    click: 1.0,       // 100%
    gesture: 1.0,     // 100%
    cursorSpeed: 1.0, // 100%
  },

  // ===== SENSITIVITY RANGES =====
  SENSITIVITY_RANGES: {
    scroll: { min: 10, max: 200, step: 10 },
    click: { min: 50, max: 200, step: 10 },
    gesture: { min: 50, max: 200, step: 10 },
    cursorSpeed: { min: 25, max: 200, step: 25 },
  },

  // ===== NOTIFICATION DURATIONS =====
  NOTIFICATION: {
    default: 2000,
    quick: 1000,
    long: 3000,
    speech: 2000,
    error: 3000,
  },

  // ===== INTERACTION MODES =====
  MODES: {
    NEUTRAL: 'neutral',
    GESTURE_ACTIVE: 'gesture_active',
    TEXT_FIELD: 'text_field',
  },

  // ===== VIDEO SETTINGS =====
  VIDEO: {
    width: 640,
    height: 480,
    facingMode: 'user', // Front camera
  },

  // ===== MEDIAPIPE SETTINGS =====
  MEDIAPIPE: {
    runningMode: 'VIDEO',
    numFaces: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  // ===== DEBUG =====
  DEBUG: false, // Enable console logging
};

// Make CONFIG read-only
Object.freeze(CONFIG);
Object.freeze(CONFIG.THRESHOLDS);
Object.freeze(CONFIG.HOLD_TIMES);
Object.freeze(CONFIG.COOLDOWNS);
Object.freeze(CONFIG.SCROLL);
Object.freeze(CONFIG.CURSOR);
Object.freeze(CONFIG.TEXT_FIELD);
Object.freeze(CONFIG.SENSITIVITY_DEFAULTS);
Object.freeze(CONFIG.SENSITIVITY_RANGES);
Object.freeze(CONFIG.NOTIFICATION);
Object.freeze(CONFIG.MODES);
Object.freeze(CONFIG.VIDEO);
Object.freeze(CONFIG.MEDIAPIPE);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
