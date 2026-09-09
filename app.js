const urlParams = new URLSearchParams(window.location.search);
const isTestMode = urlParams.get('test') === '1' || urlParams.get('test') === 'true';

const CONFIG = {
  exerciseTime: isTestMode ? 4 : 40,
  restTime: isTestMode ? 2 : 20,
  rounds: 4,
  beepStart: isTestMode ? 1 : 3
};

if (isTestMode) {
  console.log('⚡ Test mode active: 4s exercise / 2s rest');
}

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
  finishScreen: document.getElementById('finish-screen'),
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

function playFanfare() {
  if (!audioCtx) return;
  const notes = [
    { freq: 523.25, time: 0.0, dur: 0.2 },  // C5
    { freq: 659.25, time: 0.16, dur: 0.2 }, // E5
    { freq: 783.99, time: 0.32, dur: 0.25 }, // G5
    { freq: 1046.50, time: 0.52, dur: 0.6 } // C6
  ];

  notes.forEach(n => {
    setTimeout(() => {
      beep(n.freq, n.dur);
    }, n.time * 1000);
  });
}

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
  if (currentState !== 'COMPLETE') {
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
  } else {
    elements.dots.forEach(dot => {
      dot.classList.remove('active');
      dot.classList.add('completed');
    });
    elements.round.textContent = `ROUND ${CONFIG.rounds}/${CONFIG.rounds}`;
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

    // Show celebratory finish screen, hide timer and active workout elements
    if (elements.finishScreen) elements.finishScreen.classList.remove('hidden');
    if (elements.timer) elements.timer.classList.add('hidden');
    if (elements.label) elements.label.classList.add('hidden');
    if (elements.status) elements.status.classList.add('hidden');
    if (elements.progress && elements.progress.parentElement) {
      elements.progress.parentElement.classList.add('hidden');
    }

    elements.timer.classList.remove('beeping');
    elements.startBtn.classList.add('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.resetBtn.classList.remove('hidden');
    elements.resetBtn.textContent = 'START NEW WORKOUT';
    elements.resetBtn.classList.add('finish-cta');

    playFanfare();
  }
  updateUI();
}

function tick() {
  timeLeft--;
  if (timeLeft < 0) {
    if (currentState === 'EXERCISE') {
      if (currentRound >= CONFIG.rounds) {
        switchState('COMPLETE');
      } else {
        switchState('REST');
      }
    } else if (currentState === 'REST') {
      currentRound++;
      switchState('EXERCISE');
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

  // Hide celebration screen and restore timer elements
  if (elements.finishScreen) elements.finishScreen.classList.add('hidden');
  if (elements.timer) elements.timer.classList.remove('hidden');
  if (elements.label) elements.label.classList.remove('hidden');
  if (elements.status) elements.status.classList.remove('hidden');
  if (elements.progress && elements.progress.parentElement) {
    elements.progress.parentElement.classList.remove('hidden');
  }

  elements.resetBtn.textContent = 'RESET';
  elements.resetBtn.classList.remove('finish-cta');

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
if (elements.finishScreen) elements.finishScreen.classList.add('hidden');
setTimerDisplay(timeLeft, false);
updateUI();
