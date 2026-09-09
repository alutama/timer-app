const CONFIG = {
  exerciseTime: 40,
  restTime: 20,
  rounds: 4,
  beepStart: 3
};

let currentState = 'READY'; // READY, EXERCISE, REST, COMPLETE
let currentRound = 1;
let timeLeft = CONFIG.exerciseTime;
let timerId = null;
let audioCtx = null;
let isPaused = false;
let wakeLock = null;

const elements = {
  app: document.getElementById('app'),
  timer: document.getElementById('timer-display'),
  drumTens: document.getElementById('drum-tens'),
  drumOnes: document.getElementById('drum-ones'),
  timerEmoji: document.getElementById('timer-emoji'),
  drumDivider: document.querySelector('.drum-divider'),
  label: document.getElementById('label'),
  round: document.getElementById('round-indicator'),
  status: document.getElementById('status-text'),
  progress: document.getElementById('progress-bar'),
  startBtn: document.getElementById('start-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn'),
  dots: document.querySelectorAll('.dot')
};

function rollDrum(drumEl, nextChar, animated = true) {
  if (!drumEl) return;
  const currentEl = drumEl.querySelector('.drum-digit.current');
  const nextEl = drumEl.querySelector('.drum-digit.next');
  if (!currentEl || !nextEl) return;

  if (currentEl.textContent === nextChar) {
    return;
  }

  if (!animated) {
    currentEl.textContent = nextChar;
    drumEl.classList.remove('rolling-down');
    return;
  }

  if (drumEl.classList.contains('rolling-down')) {
    currentEl.textContent = nextEl.textContent;
    drumEl.classList.remove('rolling-down');
    void drumEl.offsetWidth;
  }

  nextEl.textContent = nextChar;
  drumEl.classList.add('rolling-down');

  setTimeout(() => {
    currentEl.textContent = nextChar;
    drumEl.classList.remove('rolling-down');
  }, 280);
}

function setTimerDisplay(value, animated = true) {
  if (value === '🎉') {
    if (elements.drumTens) elements.drumTens.classList.add('hidden');
    if (elements.drumOnes) elements.drumOnes.classList.add('hidden');
    if (elements.drumDivider) elements.drumDivider.classList.add('hidden');
    if (elements.timerEmoji) elements.timerEmoji.classList.remove('hidden');
    return;
  }

  if (elements.drumTens) elements.drumTens.classList.remove('hidden');
  if (elements.drumOnes) elements.drumOnes.classList.remove('hidden');
  if (elements.drumDivider) elements.drumDivider.classList.remove('hidden');
  if (elements.timerEmoji) elements.timerEmoji.classList.add('hidden');

  const str = String(Math.max(0, value)).padStart(2, '0');
  rollDrum(elements.drumTens, str[0], animated);
  rollDrum(elements.drumOnes, str[1], animated);
}

// Initialize Audio Context on user interaction
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function beep(freq = 440, duration = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function updateUI() {
  setTimerDisplay(timeLeft, true);
  elements.round.textContent = `ROUND ${currentRound}/${CONFIG.rounds}`;

  const total = currentState === 'EXERCISE' ? CONFIG.exerciseTime : CONFIG.restTime;
  const percent = (timeLeft / total) * 100;
  elements.progress.style.width = `${percent}%`;

  // Highlight dots
  elements.dots.forEach((dot, i) => {
    dot.classList.remove('active', 'completed');
    if (i + 1 < currentRound) dot.classList.add('completed');
    if (i + 1 === currentRound) dot.classList.add('active');
  });

  if (timeLeft <= CONFIG.beepStart && timeLeft > 0) {
    elements.timer.classList.add('beeping');
    beep(timeLeft === 1 ? 880 : 440);
  } else {
    elements.timer.classList.remove('beeping');
  }
}

function switchState(newState) {
  currentState = newState;
  elements.app.className = `screen-${newState.toLowerCase()}`;

  if (newState === 'EXERCISE') {
    timeLeft = CONFIG.exerciseTime;
    elements.label.textContent = 'EXERCISE';
    elements.status.textContent = 'GO!';
    beep(660, 0.3);
  } else if (newState === 'REST') {
    timeLeft = CONFIG.restTime;
    elements.label.textContent = 'REST';
    elements.status.textContent = 'BREATHE';
    beep(330, 0.3);
  } else if (newState === 'COMPLETE') {
    clearInterval(timerId);
    timerId = null;
    isPaused = false;
    releaseWakeLock();
    elements.label.textContent = 'DONE!';
    elements.status.textContent = 'WORKOUT FINISHED';
    setTimerDisplay('🎉', false);
    elements.timer.classList.remove('beeping');
    elements.startBtn.classList.add('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.resetBtn.classList.remove('hidden');
    beep(523.25, 0.5); // C5
    setTimeout(() => beep(659.25, 0.5), 200); // E5
    setTimeout(() => beep(783.99, 0.5), 400); // G5
  }
  updateUI();
}

function tick() {
  timeLeft--;
  if (timeLeft < 0) {
    if (currentState === 'EXERCISE') {
      switchState('REST');
    } else if (currentState === 'REST') {
      if (currentRound < CONFIG.rounds) {
        currentRound++;
        switchState('EXERCISE');
      } else {
        switchState('COMPLETE');
      }
    }
  } else {
    updateUI();
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && wakeLock === null) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');
    }
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
    }).catch(() => {
      wakeLock = null;
    });
  }
}

function pauseWorkout() {
  if (!isPaused && (currentState === 'EXERCISE' || currentState === 'REST')) {
    isPaused = true;
    clearInterval(timerId);
    timerId = null;
    elements.pauseBtn.textContent = 'RESUME';
    elements.pauseBtn.classList.add('resuming');
    elements.status.textContent = 'PAUSED';
    elements.timer.classList.remove('beeping');
  }
}

function resumeWorkout() {
  if (isPaused) {
    isPaused = false;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    elements.pauseBtn.textContent = 'PAUSE';
    elements.pauseBtn.classList.remove('resuming');
    elements.status.textContent = currentState === 'EXERCISE' ? 'GO!' : 'BREATHE';
    if (timeLeft <= CONFIG.beepStart && timeLeft > 0) {
      elements.timer.classList.add('beeping');
    }
    timerId = setInterval(tick, 1000);
    requestWakeLock();
  }
}

elements.startBtn.addEventListener('click', async () => {
  initAudio();
  isPaused = false;
  elements.startBtn.classList.add('hidden');
  elements.pauseBtn.classList.remove('hidden');
  elements.pauseBtn.textContent = 'PAUSE';
  elements.pauseBtn.classList.remove('resuming');
  elements.resetBtn.classList.remove('hidden');
  switchState('EXERCISE');
  timerId = setInterval(tick, 1000);
  requestWakeLock();
});

elements.pauseBtn.addEventListener('click', () => {
  if (isPaused) {
    resumeWorkout();
  } else {
    pauseWorkout();
  }
});

elements.resetBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
  isPaused = false;

  // Release wake lock
  releaseWakeLock();

  currentRound = 1;
  timeLeft = CONFIG.exerciseTime;
  currentState = 'READY';
  elements.app.className = 'screen-ready';
  elements.status.textContent = 'READY';
  elements.label.textContent = 'EXERCISE';
  setTimerDisplay(timeLeft, false);
  elements.timer.classList.remove('beeping');
  elements.startBtn.classList.remove('hidden');
  elements.pauseBtn.classList.add('hidden');
  elements.pauseBtn.textContent = 'PAUSE';
  elements.pauseBtn.classList.remove('resuming');
  elements.resetBtn.classList.add('hidden');
  updateUI();
});

// Re-acquire wake lock when page becomes visible
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && (currentState === 'EXERCISE' || currentState === 'REST') && !isPaused) {
    requestWakeLock();
  }
});

// Initialize display at startup
setTimerDisplay(timeLeft, false);
