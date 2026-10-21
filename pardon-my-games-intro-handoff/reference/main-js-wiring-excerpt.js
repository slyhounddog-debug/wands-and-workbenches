      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      if (e.type === 'keydown') e.stopImmediatePropagation();
      resumeAudio();
      resolve();
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
  });
}

async function runLoadingSequence() {
  const resources = [
    preloadAudioFile('audio/Game.mp3'),
    preloadAudioFile('audio/Battle.mp3'),
    preloadAudioFile('audio/Boss.mp3'),
    preloadAudioFile('audio/Fin Sanity.mp3'),
    document.fonts ? document.fonts.ready : Promise.resolve(),
    loadTitleFonts(), // the title logo is baked into sprites once, so its font has to be ready first
    loadStudioIntroFonts(), // ...and so are the studio intro's letters
  ];
  let completed = 0;
  updateLoadingBar(0);
  loadingStatus.textContent = 'Loading...';
  const allLoaded = Promise.all(resources.map((p) => Promise.resolve(p).then(() => {
    completed += 1;
    updateLoadingBar(completed / resources.length);
  })));
  const timeout = new Promise((resolve) => setTimeout(resolve, LOADING_SCREEN_TIMEOUT_MS));
  await Promise.race([allLoaded, timeout]);
  updateLoadingBar(1);
  // Per direct request: browsers keep audio locked until a click/keypress, so
  // the splash (and its Fin Sanity stinger) waits for one — that is what makes
  // the menu music start with the splash every time.
  loadingStatus.textContent = 'Click or press any key to begin';
  loadingStatus.classList.add('ready');
  await waitForFirstGesture();
  loadingDone = true;
  loadingOverlay.classList.add('hidden');
  // Per direct request, the studio intro plays first (its own sounds start inside this same gesture); the title and
  // its Fin Sanity music begin the moment it ends or is skipped.
  runStudioIntro(() => {
    initTitleScreen();
    document.getElementById('start-overlay').classList.remove('hidden');
    showTitle(performance.now());
    startMenuMusic(); // per direct request — Fin Sanity once, then the low-passed Game song, for as long as the main menu is up
  });
}
runLoadingSequence();

// ---- Perf counters for the debug overlay ----
