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
let isMuted = false;
let wakeLock = null;

const elements = {
  app: document.getElementById('app'),
  timer: document.getElementById('timer-display'),
  label: document.getElementById('label'),
  round: document.getElementById('round-indicator'),
  status: document.getElementById('status-text'),
  progress: document.getElementById('progress-bar'),
  startBtn: document.getElementById('start-btn'),
  resetBtn: document.getElementById('reset-btn'),
  muteBtn: document.getElementById('mute-btn'),
  dots: document.querySelectorAll('.dot')
};

// Initialize Audio Context on user interaction
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function beep(freq = 440, duration = 0.1) {
  if (!audioCtx || isMuted) return;
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
  elements.timer.textContent = timeLeft;
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
    elements.label.textContent = 'DONE!';
    elements.status.textContent = 'WORKOUT FINISHED';
    elements.timer.textContent = '🎉';
    elements.startBtn.classList.add('hidden');
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

elements.startBtn.addEventListener('click', async () => {
  initAudio();
  elements.startBtn.classList.add('hidden');
  elements.resetBtn.classList.remove('hidden');
  switchState('EXERCISE');
  timerId = setInterval(tick, 1000);

  // Request wake lock
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');
    }
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
});

elements.resetBtn.addEventListener('click', () => {
  clearInterval(timerId);

  // Release wake lock
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }

  currentRound = 1;
  timeLeft = CONFIG.exerciseTime;
  currentState = 'READY';
  elements.app.className = 'screen-ready';
  elements.status.textContent = 'READY';
  elements.label.textContent = 'EXERCISE';
  elements.timer.textContent = timeLeft;
  elements.startBtn.classList.remove('hidden');
  elements.resetBtn.classList.add('hidden');
  updateUI();
});

elements.muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  elements.muteBtn.textContent = isMuted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
});

// Re-acquire wake lock when page becomes visible
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    wakeLock = await navigator.wakeLock.request('screen');
  }
});
