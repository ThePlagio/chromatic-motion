(() => {
  "use strict";

  const elements = {
    stage: document.querySelector("#stage"),
    video: document.querySelector("#camera"),
    frozenCanvas: document.querySelector("#frozen-frame"),
    overlay: document.querySelector("#overlay"),
    stageEmpty: document.querySelector("#stage-empty"),
    stageNote: document.querySelector("#stage-note"),
    status: document.querySelector("#status"),
    startCamera: document.querySelector("#start-camera"),
    stopCamera: document.querySelector("#stop-camera"),
    freezeFrame: document.querySelector("#freeze-frame"),
    liveFrame: document.querySelector("#live-frame"),
    drawMask: document.querySelector("#draw-mask"),
    clearMask: document.querySelector("#clear-mask"),
    density: document.querySelector("#density"),
    densityValue: document.querySelector("#density-value"),
    speed: document.querySelector("#speed"),
    speedValue: document.querySelector("#speed-value"),
    newColors: document.querySelector("#new-colors"),
    effectButtons: [...document.querySelectorAll("[data-effect]")],
    colorButtons: [...document.querySelectorAll("[data-colors]")],
  };

  const overlayContext = elements.overlay.getContext("2d");
  const frozenContext = elements.frozenCanvas.getContext("2d");
  const snapshotCanvas = document.createElement("canvas");
  const snapshotContext = snapshotCanvas.getContext("2d");

  const state = {
    stream: null,
    selection: [],
    isDrawing: false,
    drawArmed: false,
    frozen: false,
    hasSnapshot: false,
    effect: "stripes",
    colors: "color",
    palette: createPalette(),
    density: Number(elements.density.value),
    speed: Number(elements.speed.value),
    metrics: null,
    lastFrame: 0,
  };

  function createPalette() {
    const hue = Math.floor(Math.random() * 360);
    return [0, 56, 125, 198, 264].map((offset, index) => {
      const saturation = 75 + ((index * 9) % 18);
      const lightness = 48 + ((index * 7) % 16);
      return `hsl(${(hue + offset) % 360} ${saturation}% ${lightness}%)`;
    });
  }

  function currentPalette() {
    return state.colors === "mono"
      ? ["#101012", "#f7f5ef", "#6e6e72", "#dedcd6"]
      : state.palette;
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function setStageNote(message) {
    elements.stageNote.textContent = message;
  }

  function setControls(cameraOn) {
    elements.startCamera.disabled = cameraOn;
    elements.stopCamera.disabled = !cameraOn;
    elements.freezeFrame.disabled = !cameraOn;
    elements.liveFrame.disabled = !cameraOn || !state.frozen;
    elements.drawMask.disabled = !cameraOn;
    elements.clearMask.disabled = state.selection.length === 0 && !state.isDrawing;
  }

  function getMetrics() {
    const bounds = elements.stage.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    return { width, height, scale: Math.min(window.devicePixelRatio || 1, 2) };
  }

  function resizeCanvas(canvas, metrics) {
    const pixelWidth = Math.round(metrics.width * metrics.scale);
    const pixelHeight = Math.round(metrics.height * metrics.scale);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
  }

  function prepareContext(context) {
    const { width, height, scale } = state.metrics;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
  }

  function renderVideoCover(context, source) {
    const { width, height } = state.metrics;
    const sourceWidth = source.videoWidth || source.width;
    const sourceHeight = source.videoHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const factor = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * factor;
    const drawHeight = sourceHeight * factor;
    context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function syncCanvases() {
    state.metrics = getMetrics();
    resizeCanvas(elements.overlay, state.metrics);
    resizeCanvas(elements.frozenCanvas, state.metrics);
    if (state.frozen && state.hasSnapshot) renderFrozenFrame();
    renderFrame(performance.now());
  }

  function renderFrozenFrame() {
    prepareContext(frozenContext);
    renderVideoCover(frozenContext, snapshotCanvas);
  }

  function normalisedPoint(event) {
    const bounds = elements.overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function pointOnCanvas(point) {
    return { x: point.x * state.metrics.width, y: point.y * state.metrics.height };
  }

  function appendPoint(point) {
    const previous = state.selection[state.selection.length - 1];
    if (!previous) {
      state.selection.push(point);
      return;
    }
    const dx = (point.x - previous.x) * state.metrics.width;
    const dy = (point.y - previous.y) * state.metrics.height;
    if (Math.hypot(dx, dy) >= 1.5) state.selection.push(point);
  }

  function tracePath(context, points) {
    if (!points.length) return false;
    const first = pointOnCanvas(points[0]);
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = pointOnCanvas(points[index]);
      context.lineTo(point.x, point.y);
    }
    context.closePath();
    return true;
  }

  function drawOutline(context, points, isComplete) {
    if (!points.length) return;
    const first = pointOnCanvas(points[0]);
    context.save();
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = pointOnCanvas(points[index]);
      context.lineTo(point.x, point.y);
    }
    if (isComplete) context.closePath();
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "rgba(8, 8, 10, 0.82)";
    context.lineWidth = 6;
    context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, 0.97)";
    context.lineWidth = 2;
    if (isComplete) context.setLineDash([6, 5]);
    context.stroke();
    context.restore();
  }

  function drawStripes(context, time, palette) {
    const { width, height } = state.metrics;
    const gap = Math.max(22, 200 / Math.max(1, state.density));
    const bandWidth = gap * 0.72;
    const diagonal = Math.hypot(width, height) * 1.45;
    const offset = ((time * (state.speed + 0.6) * 0.035) % gap) - gap;

    context.fillStyle = palette[0];
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(-0.54);
    for (let x = -diagonal + offset, index = 0; x < diagonal; x += gap, index += 1) {
      context.fillStyle = palette[Math.abs(index) % palette.length];
      context.fillRect(x, -diagonal, bandWidth, diagonal * 2);
    }
    context.restore();
  }

  function drawCircles(context, time, palette) {
    const { width, height } = state.metrics;
    const cell = Math.max(24, Math.min(width, height) / (state.density * 0.47));
    const drift = (time * (state.speed + 0.2) * 0.024) % cell;
    context.fillStyle = palette[0];
    context.fillRect(0, 0, width, height);
    let row = 0;
    for (let y = -cell + drift; y < height + cell; y += cell, row += 1) {
      let column = 0;
      for (let x = -cell; x < width + cell; x += cell, column += 1) {
        const wave = Math.sin(time * 0.0022 * (state.speed + 0.4) + row * 0.7 + column * 0.4);
        const radius = cell * (0.27 + wave * 0.09);
        context.fillStyle = palette[(row + column) % palette.length];
        context.beginPath();
        context.arc(x + cell / 2 + (row % 2 ? cell * 0.18 : 0), y + cell / 2, Math.max(3, radius), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function renderFrame(time) {
    if (!state.metrics) return;
    prepareContext(overlayContext);
    if (state.selection.length >= 3 && !state.isDrawing) {
      overlayContext.save();
      tracePath(overlayContext, state.selection);
      overlayContext.clip();
      const palette = currentPalette();
      if (state.effect === "stripes") drawStripes(overlayContext, time, palette);
      else drawCircles(overlayContext, time, palette);
      overlayContext.restore();
      drawOutline(overlayContext, state.selection, true);
    } else if (state.selection.length) {
      drawOutline(overlayContext, state.selection, false);
    }
  }

  function animationLoop(time) {
    if (!document.hidden) renderFrame(time);
    state.lastFrame = requestAnimationFrame(animationLoop);
  }

  function takeSnapshot() {
    if (elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setStatus("Attendi un istante: il flusso della fotocamera sta arrivando.");
      return false;
    }
    const sourceWidth = elements.video.videoWidth;
    const sourceHeight = elements.video.videoHeight;
    const limit = 1440;
    const factor = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
    snapshotCanvas.width = Math.max(1, Math.round(sourceWidth * factor));
    snapshotCanvas.height = Math.max(1, Math.round(sourceHeight * factor));
    snapshotContext.drawImage(elements.video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    state.hasSnapshot = true;
    state.frozen = true;
    elements.frozenCanvas.classList.add("is-visible");
    renderFrozenFrame();
    setControls(true);
    return true;
  }

  function freezeCurrentFrame() {
    const hadMask = state.selection.length >= 3;
    if (!takeSnapshot()) return false;
    if (hadMask) state.selection = [];
    state.drawArmed = false;
    setStageNote("Fotogramma fissato");
    setStatus(hadMask ? "Nuovo fotogramma fissato: la sagoma precedente è stata rimossa." : "Fotogramma fissato. Ora puoi disegnare il bordo dell'oggetto.");
    setControls(true);
    return true;
  }

  function returnToLive() {
    if (!state.stream) return;
    state.frozen = false;
    state.drawArmed = false;
    elements.frozenCanvas.classList.remove("is-visible");
    setStageNote("Anteprima live");
    setStatus("Anteprima live. La sagoma resta visibile, ma per ridisegnarla fissa un nuovo fotogramma.");
    setControls(true);
  }

  function armDrawing() {
    if (!state.stream) return;
    if (!state.frozen && !freezeCurrentFrame()) return;
    state.selection = [];
    state.drawArmed = true;
    setStageNote("Traccia il contorno con un dito");
    setStatus("Traccia senza sollevare il dito lungo il bordo dell'oggetto. Al rilascio, il riempimento apparirà dentro la sagoma.");
    setControls(true);
  }

  function clearMask() {
    state.selection = [];
    state.isDrawing = false;
    state.drawArmed = false;
    elements.overlay.classList.remove("is-drawing");
    setStageNote(state.frozen ? "Fotogramma fissato" : "Anteprima live");
    setStatus("Sagoma rimossa. Puoi disegnarne una nuova.");
    setControls(Boolean(state.stream));
  }

  function formatCameraError(error) {
    if (error?.name === "NotAllowedError") return "Permesso fotocamera negato. Abilitalo nelle impostazioni di Safari e riprova.";
    if (error?.name === "NotFoundError") return "Nessuna fotocamera disponibile su questo dispositivo.";
    if (error?.name === "NotReadableError") return "La fotocamera è già usata da un'altra app o pagina.";
    if (error?.name === "OverconstrainedError") return "Questa configurazione della fotocamera non è disponibile.";
    return "Impossibile aprire la fotocamera. Verifica HTTPS, permessi e riprova.";
  }

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("La fotocamera richiede Safari aggiornato e una pagina HTTPS (oppure localhost).");
      return;
    }
    elements.startCamera.disabled = true;
    setStatus("Richiesta di accesso alla fotocamera…");
    let requestedStream = null;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      state.stream = requestedStream;
      elements.video.srcObject = requestedStream;
      await elements.video.play();
      elements.stageEmpty.classList.add("is-hidden");
      const facingMode = requestedStream.getVideoTracks()[0]?.getSettings?.().facingMode;
      setStageNote(facingMode === "user" ? "Fotocamera frontale attiva" : "Fotocamera posteriore richiesta");
      setStatus(facingMode === "user" ? "Il dispositivo ha aperto la fotocamera frontale. Seleziona la posteriore nelle impostazioni del browser, se disponibile." : "Fotocamera attiva. Fissa un fotogramma per disegnare una sagoma precisa.");
      setControls(true);
      syncCanvases();
    } catch (error) {
      requestedStream?.getTracks().forEach((track) => track.stop());
      elements.video.srcObject = null;
      setStatus(formatCameraError(error));
      state.stream = null;
      setControls(false);
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    elements.video.srcObject = null;
    state.frozen = false;
    state.hasSnapshot = false;
    state.selection = [];
    state.isDrawing = false;
    state.drawArmed = false;
    elements.frozenCanvas.classList.remove("is-visible");
    elements.stageEmpty.classList.remove("is-hidden");
    setStageNote("Inquadra l'oggetto");
    setStatus("Fotocamera chiusa. Nessun fotogramma viene salvato o caricato.");
    setControls(false);
    renderFrame(performance.now());
  }

  function onPointerDown(event) {
    if (!state.drawArmed || !state.frozen || !state.stream) return;
    event.preventDefault();
    state.isDrawing = true;
    state.selection = [];
    appendPoint(normalisedPoint(event));
    elements.overlay.setPointerCapture?.(event.pointerId);
    elements.overlay.classList.add("is-drawing");
    setStageNote("Disegno in corso…");
    setControls(true);
  }

  function onPointerMove(event) {
    if (!state.isDrawing) return;
    event.preventDefault();
    appendPoint(normalisedPoint(event));
  }

  function onPointerEnd(event) {
    if (!state.isDrawing) return;
    event.preventDefault();
    state.isDrawing = false;
    elements.overlay.releasePointerCapture?.(event.pointerId);
    elements.overlay.classList.remove("is-drawing");
    if (state.selection.length < 12) {
      state.selection = [];
      setStatus("Il tratto è troppo breve. Riprova seguendo il bordo dell'oggetto con un gesto continuo.");
      setStageNote("Traccia il contorno con un dito");
      state.drawArmed = true;
    } else {
      state.drawArmed = false;
      setStatus("Sagoma pronta. Il riempimento è opaco e resta confinato al suo interno.");
      setStageNote("Sagoma attiva");
    }
    setControls(true);
  }

  function updateSegmented(buttons, selected) {
    buttons.forEach((button) => {
      const isSelected = button === selected;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", stopCamera);
  elements.freezeFrame.addEventListener("click", freezeCurrentFrame);
  elements.liveFrame.addEventListener("click", returnToLive);
  elements.drawMask.addEventListener("click", armDrawing);
  elements.clearMask.addEventListener("click", clearMask);
  elements.newColors.addEventListener("click", () => {
    state.palette = createPalette();
    if (state.colors === "color") setStatus("Nuova palette generata sul dispositivo.");
  });

  elements.effectButtons.forEach((button) => button.addEventListener("click", () => {
    state.effect = button.dataset.effect;
    updateSegmented(elements.effectButtons, button);
  }));
  elements.colorButtons.forEach((button) => button.addEventListener("click", () => {
    state.colors = button.dataset.colors;
    updateSegmented(elements.colorButtons, button);
  }));
  elements.density.addEventListener("input", () => {
    state.density = Number(elements.density.value);
    elements.densityValue.value = String(state.density);
    elements.densityValue.textContent = String(state.density);
  });
  elements.speed.addEventListener("input", () => {
    state.speed = Number(elements.speed.value);
    elements.speedValue.value = String(state.speed);
    elements.speedValue.textContent = String(state.speed);
  });

  elements.overlay.addEventListener("pointerdown", onPointerDown);
  elements.overlay.addEventListener("pointermove", onPointerMove);
  elements.overlay.addEventListener("pointerup", onPointerEnd);
  elements.overlay.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("resize", syncCanvases);
  window.addEventListener("orientationchange", () => {
    if (state.selection.length) {
      state.selection = [];
      state.drawArmed = false;
      setStatus("Orientamento cambiato: ridisegna la sagoma per mantenerla allineata al fotogramma.");
    }
    window.setTimeout(syncCanvases, 120);
  });
  window.addEventListener("pagehide", () => state.stream?.getTracks().forEach((track) => track.stop()));

  syncCanvases();
  setControls(false);
  state.lastFrame = requestAnimationFrame(animationLoop);
})();
