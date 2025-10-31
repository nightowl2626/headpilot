// ===== PHASE 2: DYNAMIC GESTURE CONFIGURATION SYSTEM =====

class GestureConfigManager {
  constructor() {
    // Base dwell times (in milliseconds)
    this.baseDwellTimes = {
      click: 800,           // Jaw open for click
      smile: 1500,          // Smile for new tab
      wink: 1000,           // Wink for refresh/close
      navigation: 500,      // Head turn for back/forward
      tabSwitch: 0          // Instant for tab switching
    };

    // Dynamic dwell times (will be adjusted)
    this.currentDwellTimes = { ...this.baseDwellTimes };

    // Gesture performance tracking
    this.gestureHistory = {
      click: { successes: [], failures: [], averageTime: 800 },
      smile: { successes: [], failures: [], averageTime: 1500 },
      wink: { successes: [], failures: [], averageTime: 1000 },
      navigation: { successes: [], failures: [], averageTime: 500 },
      tabSwitch: { successes: [], failures: [], averageTime: 0 }
    };

    // Adaptation settings
    this.adaptationRate = 0.1; // How quickly to adapt (10%)
    this.minDwellTime = 300;   // Minimum dwell time
    this.maxDwellTime = 2500;  // Maximum dwell time

    // Context-aware adjustments
    this.contextMultipliers = {
      highRisk: 1.3,      // For dangerous actions (close tab, go back)
      lowRisk: 0.8,       // For safe actions (scroll, cursor)
      fatigued: 1.5,      // When user shows fatigue
      confident: 0.9      // When user is performing well
    };

    // Scrolling zones configuration
    this.scrollZones = {
      pitch: {
        scrollMin: 15,     // Minimum pitch to start scrolling
        scrollMax: 60,     // Maximum useful pitch
        cursorMax: 12      // Maximum pitch for cursor control
      },
      yaw: {
        scrollMin: 25,     // Minimum yaw to start scrolling
        scrollMax: 60,     // Maximum useful yaw
        cursorMax: 15,     // Maximum yaw for cursor control
        navigationMin: 40  // Minimum yaw for back/forward
      }
    };

    // Load saved configuration
    this.loadConfiguration();
  }

  // ===== DWELL TIME MANAGEMENT =====

  getDwellTime(gestureType, context = 'normal') {
    let baseTime = this.currentDwellTimes[gestureType] || 800;

    // Apply context multiplier
    switch(context) {
      case 'highRisk':
        baseTime *= this.contextMultipliers.highRisk;
        break;
      case 'lowRisk':
        baseTime *= this.contextMultipliers.lowRisk;
        break;
      case 'fatigued':
        baseTime *= this.contextMultipliers.fatigued;
        break;
      case 'confident':
        baseTime *= this.contextMultipliers.confident;
        break;
    }

    // Clamp to min/max
    return Math.max(this.minDwellTime, Math.min(this.maxDwellTime, baseTime));
  }

  recordGestureAttempt(gestureType, wasSuccessful, attemptTime) {
    const history = this.gestureHistory[gestureType];
    if (!history) return;

    const record = {
      timestamp: Date.now(),
      duration: attemptTime,
      successful: wasSuccessful
    };

    if (wasSuccessful) {
      history.successes.push(record);
      // Keep only last 20 successes
      if (history.successes.length > 20) {
        history.successes.shift();
      }
    } else {
      history.failures.push(record);
      // Keep only last 10 failures
      if (history.failures.length > 10) {
        history.failures.shift();
      }
    }

    // Update average time and adapt dwell time
    this.updateDwellTime(gestureType);
    this.saveConfiguration();
  }

  updateDwellTime(gestureType) {
    const history = this.gestureHistory[gestureType];
    if (!history || history.successes.length < 3) return;

    // Calculate average successful attempt time
    const successTimes = history.successes.map(s => s.duration);
    const avgSuccessTime = successTimes.reduce((a, b) => a + b, 0) / successTimes.length;
    history.averageTime = avgSuccessTime;

    // Calculate success rate
    const totalAttempts = history.successes.length + history.failures.length;
    const successRate = history.successes.length / totalAttempts;

    // Adapt dwell time based on performance
    const currentDwell = this.currentDwellTimes[gestureType];
    let newDwell = currentDwell;

    if (successRate > 0.85) {
      // High success rate - can reduce dwell time slightly
      newDwell = currentDwell * (1 - this.adaptationRate * 0.5);
    } else if (successRate < 0.6) {
      // Low success rate - increase dwell time
      newDwell = currentDwell * (1 + this.adaptationRate);
    } else if (avgSuccessTime < currentDwell * 0.7) {
      // User is consistently faster than required - reduce dwell time
      newDwell = avgSuccessTime * 1.2; // 20% buffer above average
    }

    // Apply adaptation with smoothing
    this.currentDwellTimes[gestureType] =
      currentDwell * (1 - this.adaptationRate) + newDwell * this.adaptationRate;

    console.log(`Adapted ${gestureType} dwell time: ${currentDwell.toFixed(0)}ms → ${this.currentDwellTimes[gestureType].toFixed(0)}ms (success rate: ${(successRate * 100).toFixed(1)}%)`);
  }

  // ===== SCROLLING ZONE MANAGEMENT =====

  getScrollZoneStatus(pitch, yaw) {
    const absPitch = Math.abs(pitch);
    const absYaw = Math.abs(yaw);

    // Determine what zone we're in
    const zones = {
      cursor: false,
      scroll: false,
      navigation: false,
      neutral: false
    };

    // Navigation zone (sharp turns for back/forward)
    if (absYaw > this.scrollZones.yaw.navigationMin) {
      zones.navigation = true;
      return zones;
    }

    // Scroll zone (moderate head movement)
    if (absPitch > this.scrollZones.pitch.scrollMin ||
        (absYaw > this.scrollZones.yaw.scrollMin && absYaw < this.scrollZones.yaw.navigationMin)) {
      zones.scroll = true;
      return zones;
    }

    // Cursor zone (small movements)
    if (absPitch < this.scrollZones.pitch.cursorMax && absYaw < this.scrollZones.yaw.cursorMax) {
      zones.cursor = true;
      return zones;
    }

    // Neutral zone (no interaction)
    zones.neutral = true;
    return zones;
  }

  getScrollIntensity(pitch, yaw) {
    const absPitch = Math.abs(pitch);
    const absYaw = Math.abs(yaw);

    // Calculate scroll intensity (0-1) based on position in scroll zone
    let pitchIntensity = 0;
    let yawIntensity = 0;

    if (absPitch > this.scrollZones.pitch.scrollMin) {
      pitchIntensity = Math.min(1,
        (absPitch - this.scrollZones.pitch.scrollMin) /
        (this.scrollZones.pitch.scrollMax - this.scrollZones.pitch.scrollMin)
      );
    }

    if (absYaw > this.scrollZones.yaw.scrollMin && absYaw < this.scrollZones.yaw.navigationMin) {
      yawIntensity = Math.min(1,
        (absYaw - this.scrollZones.yaw.scrollMin) /
        (this.scrollZones.yaw.scrollMax - this.scrollZones.yaw.scrollMin)
      );
    }

    return {
      vertical: pitch > 0 ? pitchIntensity : -pitchIntensity,
      horizontal: yaw > 0 ? yawIntensity : -yawIntensity
    };
  }

  // ===== FATIGUE DETECTION =====

  detectFatigueState() {
    const recentPeriod = Date.now() - (5 * 60 * 1000); // Last 5 minutes
    let recentFailures = 0;
    let recentSuccesses = 0;

    // Count recent attempts across all gestures
    Object.values(this.gestureHistory).forEach(history => {
      recentFailures += history.failures.filter(f => f.timestamp > recentPeriod).length;
      recentSuccesses += history.successes.filter(s => s.timestamp > recentPeriod).length;
    });

    const totalRecent = recentFailures + recentSuccesses;
    if (totalRecent < 10) return 'normal'; // Not enough data

    const errorRate = recentFailures / totalRecent;
    const activityRate = totalRecent / 5; // Gestures per minute

    if (errorRate > 0.4 || activityRate > 30) {
      return 'fatigued';
    } else if (errorRate < 0.15 && recentSuccesses > 15) {
      return 'confident';
    }

    return 'normal';
  }

  // ===== PERSISTENCE =====

  saveConfiguration() {
    const config = {
      currentDwellTimes: this.currentDwellTimes,
      gestureHistory: this.gestureHistory,
      scrollZones: this.scrollZones,
      lastUpdated: Date.now()
    };

    chrome.storage.local.set({ gestureConfig: config });
  }

  loadConfiguration() {
    chrome.storage.local.get(['gestureConfig'], (result) => {
      if (result.gestureConfig) {
        const config = result.gestureConfig;

        // Only load if less than 7 days old
        if (Date.now() - config.lastUpdated < 7 * 24 * 60 * 60 * 1000) {
          this.currentDwellTimes = config.currentDwellTimes || this.currentDwellTimes;
          this.gestureHistory = config.gestureHistory || this.gestureHistory;
          this.scrollZones = config.scrollZones || this.scrollZones;

          console.log('Loaded gesture configuration:', this.currentDwellTimes);
        }
      }
    });
  }

  resetToDefaults() {
    this.currentDwellTimes = { ...this.baseDwellTimes };
    this.gestureHistory = {
      click: { successes: [], failures: [], averageTime: 800 },
      smile: { successes: [], failures: [], averageTime: 1500 },
      wink: { successes: [], failures: [], averageTime: 1000 },
      navigation: { successes: [], failures: [], averageTime: 500 },
      tabSwitch: { successes: [], failures: [], averageTime: 0 }
    };
    this.saveConfiguration();
  }

  getStatistics() {
    const stats = {};

    Object.keys(this.gestureHistory).forEach(gesture => {
      const history = this.gestureHistory[gesture];
      const total = history.successes.length + history.failures.length;
      const successRate = total > 0 ? (history.successes.length / total * 100).toFixed(1) : 0;

      stats[gesture] = {
        successRate: successRate + '%',
        attempts: total,
        averageTime: history.averageTime.toFixed(0) + 'ms',
        currentDwell: this.currentDwellTimes[gesture].toFixed(0) + 'ms'
      };
    });

    return stats;
  }
}

// Export for use in tracker.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureConfigManager;
}
