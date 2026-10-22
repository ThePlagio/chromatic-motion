(() => {
  "use strict";

  const MIN_OBJECT_AREA = 0.04;
  const INFERENCE_INTERVAL_MS = 300;
  const MAX_MASK_AGE_MS = 3000;

  const elements = {
    stage: document.querySelector("#stage"), video: document.querySelector("#camera"), frozenCanvas: document.querySelector("#frozen-frame"), overlay: document.querySelector("#overlay"), stageEmpty: document.querySelector("#stage-empty"), stageNote: document.querySelector("#stage-note"), status: document.querySelector("#status"),
    startCamera: document.querySelector("#start-camera"), stopCamera: document.querySelector("#stop-camera"), autoMask: document.querySelector("#auto-mask"), freezeFrame: document.querySelector("#freeze-frame"), liveFrame: document.querySelector("#live-frame"), drawMask: document.querySelector("#draw-mask"), clearMask: document.querySelector("#clear-mask"),
    density: document.querySelector("#density"), densityValue: document.querySelector("#density-value"), lineSize: document.querySelector("#line-size"), lineSizeValue: document.querySelector("#line-size-value"), speed: document.querySelector("#speed"), speedValue: document.querySelector("#speed-value"), newColors: document.querySelector("#new-colors"), effectButtons: [...document.querySelectorAll("[data-effect]")], colorButtons: [...document.querySelectorAll("[data-colors]")], viewButtons: [...document.querySelectorAll("[data-view]")],
  };

  const overlayContext = elements.overlay.getContext("2d");
  const frozenContext = elements.frozenCanvas.getContext("2d");
  const snapshotCanvas = document.createElement("canvas");
  const snapshotContext = snapshotCanvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskContext = maskCanvas.getContext("2d");
  const inferenceCanvas = document.createElement("canvas");
  inferenceCanvas.width = 320; inferenceCanvas.height = 320;
  const inferenceContext = inferenceCanvas.getContext("2d", { willReadFrequently: true });

  const state = {
    stream: null, selection: [], isDrawing: false, drawArmed: false, frozen: false, hasSnapshot: false,
    effect: "deformed", colors: "mono", view: "camera", palette: createPalette(), density: Number(elements.density.value), lineSize: Number(elements.lineSize.value), speed: Number(elements.speed.value), metrics: null, marks: createMotionMarks(),
    auto: { enabled: true, loading: false, ready: false, failed: false, segmenter: null, busy: false, generation: 0, hasMask: false, lastInferenceAt: 0, lastFoundAt: 0, lastStatusAt: 0, pauseUntil: 0 },
  };

  function createPalette() {
    const hue = Math.floor(Math.random() * 360);
    return [0, 54, 122, 190, 258].map((offset, index) => `hsl(${(hue + offset) % 360} ${72 + ((index * 11) % 20)}% ${47 + ((index * 8) % 18)}%)`);
  }

  function createMotionMarks() {
    return Array.from({ length: 40 }, (_, index) => ({ x: Math.random(), y: Math.random(), phase: Math.random() * Math.PI * 2, drift: 0.35 + Math.random() * 0.9, size: 0.035 + Math.random() * 0.11, angle: Math.random() * Math.PI, color: index % 5, kind: index % 3 }));
  }

  function currentPalette() { return state.colors === "mono" ? ["#f7f5ef", "#c8c6c0", "#77777c", "#ffffff"] : state.palette; }
  function setStatus(message) { elements.status.textContent = message; }
  function setStageNote(message) { elements.stageNote.textContent = message; }

  function updateAutoButton() {
    const { auto } = state;
    elements.autoMask.setAttribute("aria-pressed", String(auto.enabled));
    elements.autoMask.classList.toggle("button-accent", auto.enabled);
    elements.autoMask.classList.toggle("button-secondary", !auto.enabled);
    elements.autoMask.textContent = auto.loading ? "Carico riconoscimento…" : auto.failed ? "Riprova riconoscimento" : auto.enabled ? "Rilevamento: attivo" : "Rilevamento: spento";
  }

  function setControls(cameraOn) {
    elements.startCamera.disabled = cameraOn;
    elements.stopCamera.disabled = !cameraOn;
    elements.autoMask.disabled = !cameraOn || state.auto.loading;
    elements.freezeFrame.disabled = !cameraOn;
    elements.liveFrame.disabled = !cameraOn || !state.frozen;
    elements.drawMask.disabled = !cameraOn;
    elements.clearMask.disabled = state.selection.length === 0 && !state.isDrawing && !state.auto.hasMask;
    updateAutoButton();
  }

  function getMetrics() {
    const bounds = elements.stage.getBoundingClientRect();
    return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), scale: Math.min(window.devicePixelRatio || 1, 2) };
  }

  function resizeCanvas(canvas, metrics) {
    const width = Math.round(metrics.width * metrics.scale);
    const height = Math.round(metrics.height * metrics.scale);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function prepareContext(context) {
    const { width, height, scale } = state.metrics;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
  }

  function videoPlacement() {
    const { width, height } = state.metrics;
    const sourceWidth = elements.video.videoWidth || 1;
    const sourceHeight = elements.video.videoHeight || 1;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
  }

  function renderVideoCover(context, source) {
    const sourceWidth = source.videoWidth || source.width;
    const sourceHeight = source.videoHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const { width, height } = state.metrics;
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

  function renderFrozenFrame() { prepareContext(frozenContext); renderVideoCover(frozenContext, snapshotCanvas); }

  function normalisedPoint(event) {
    const bounds = elements.overlay.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }

  function pointOnCanvas(point) { return { x: point.x * state.metrics.width, y: point.y * state.metrics.height }; }

  function appendPoint(point) {
    const previous = state.selection[state.selection.length - 1];
    if (!previous) { state.selection.push(point); return; }
    const dx = (point.x - previous.x) * state.metrics.width;
    const dy = (point.y - previous.y) * state.metrics.height;
    if (Math.hypot(dx, dy) >= 1.5) state.selection.push(point);
  }

  function tracePath(context, points) {
    if (!points.length) return false;
    const first = pointOnCanvas(points[0]);
    context.beginPath(); context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) { const point = pointOnCanvas(points[index]); context.lineTo(point.x, point.y); }
    context.closePath();
    return true;
  }

  function drawOutline(context, points, complete) {
    if (!points.length) return;
    const first = pointOnCanvas(points[0]);
    context.save(); context.beginPath(); context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) { const point = pointOnCanvas(points[index]); context.lineTo(point.x, point.y); }
    if (complete) context.closePath();
    context.lineJoin = "round"; context.lineCap = "round"; context.strokeStyle = "rgba(8, 8, 10, 0.82)"; context.lineWidth = 6; context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, 0.96)"; context.lineWidth = 2;
    if (complete) context.setLineDash([6, 5]);
    context.stroke(); context.restore();
  }

  function movingPoint(mark, time) {
    const speed = 0.00016 * (state.speed + 0.6) * mark.drift;
    const x = ((mark.x + Math.sin(time * speed + mark.phase) * 0.18) % 1 + 1) % 1;
    const y = ((mark.y + Math.cos(time * speed * 1.21 + mark.phase) * 0.17) % 1 + 1) % 1;
    return { x: x * state.metrics.width, y: y * state.metrics.height };
  }

  function lineSpan(base, mark) { return base * (0.16 + state.lineSize / 145) * (0.74 + mark.size * 2.2); }
  function lineWidth(mark) { return 1.6 + state.lineSize / 44 + mark.size * 8; }

  function drawPreciseLines(context, time, palette, count) {
    const base = Math.min(state.metrics.width, state.metrics.height);
    context.save(); context.lineCap = "round";
    for (let index = 0; index < count; index += 1) {
      const mark = state.marks[index % state.marks.length]; const point = movingPoint(mark, time); const span = lineSpan(base, mark);
      const angle = mark.angle + Math.sin(time * 0.0001 * (state.speed + 0.4) + mark.phase) * 0.12;
      const cos = Math.cos(angle); const sin = Math.sin(angle); const startX = point.x - cos * span / 2; const startY = point.y - sin * span / 2; const endX = point.x + cos * span / 2; const endY = point.y + sin * span / 2;
      context.strokeStyle = palette[mark.color % palette.length]; context.globalAlpha = 0.67 + (index % 3) * 0.08; context.lineWidth = lineWidth(mark);
      context.beginPath(); context.moveTo(startX, startY); context.quadraticCurveTo(point.x - sin * span * 0.025, point.y + cos * span * 0.025, endX, endY); context.stroke();
    }
    context.restore();
  }

  function drawFreeLines(context, time, palette, count) {
    const base = Math.min(state.metrics.width, state.metrics.height);
    const strokes = Math.max(1, Math.min(count, state.marks.length));
    context.save(); context.lineCap = "round"; context.lineJoin = "round";
    for (let index = 0; index < strokes; index += 1) {
      const mark = state.marks[index % state.marks.length];
      const point = movingPoint(mark, time);
      const span = lineSpan(base, mark);
      const angle = mark.angle + Math.sin(time * 0.00015 * (state.speed + 0.5) + mark.phase) * 0.38;
      const cos = Math.cos(angle); const sin = Math.sin(angle);
      context.strokeStyle = palette[mark.color % palette.length]; context.globalAlpha = 0.62 + (index % 3) * 0.1; context.lineWidth = lineWidth(mark);
      context.beginPath();
      for (let node = 0; node <= 10; node += 1) {
        const progress = node / 10 - 0.5;
        const along = progress * span;
        const arc = Math.sin(progress * Math.PI * 2.1 + time * 0.00042 * (state.speed + 0.4) + mark.phase) * span * 0.13;
        const wobble = Math.sin(progress * 15 + time * 0.00063 * (state.speed + 0.3) + mark.phase) * span * 0.055;
        const x = point.x + cos * along - sin * (arc + wobble);
        const y = point.y + sin * along + cos * (arc + wobble);
        if (node === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.restore();
  }

  function drawSpirals(context, time, palette, count) {
    const base = Math.min(state.metrics.width, state.metrics.height); const spirals = Math.max(1, Math.min(7, Math.ceil(count / 5)));
    context.save(); context.lineCap = "round"; context.lineJoin = "round";
    for (let index = 0; index < spirals; index += 1) {
      const mark = state.marks[index % state.marks.length]; const point = movingPoint(mark, time); const radius = lineSpan(base, mark) * 0.52; const turns = 1.3 + (index % 3) * 0.42;
      context.strokeStyle = palette[mark.color % palette.length]; context.globalAlpha = 0.72; context.lineWidth = lineWidth(mark);
      context.beginPath();
      for (let node = 0; node <= 56; node += 1) {
        const progress = node / 56; const angle = mark.phase + progress * Math.PI * 2 * turns + time * 0.00022 * (state.speed + 0.4); const localRadius = radius * (0.12 + progress * 0.88);
        const x = point.x + Math.cos(angle) * localRadius; const y = point.y + Math.sin(angle) * localRadius;
        if (node === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.restore();
  }

  function drawMovingShapes(context, time, palette, count) {
    context.save();
    for (let index = 0; index < count; index += 1) {
      const mark = state.marks[index % state.marks.length];
      const point = movingPoint(mark, time);
      const size = 9 + mark.size * 72 * (0.76 + state.density / 40);
      context.fillStyle = palette[mark.color % palette.length]; context.globalAlpha = 0.62 + (index % 3) * 0.1;
      context.save(); context.translate(point.x, point.y); context.rotate(mark.angle + time * 0.00009 * (state.speed + 0.5));
      if (mark.kind === 0) { context.beginPath(); context.arc(0, 0, size * 0.58, 0, Math.PI * 2); context.fill(); }
      else if (mark.kind === 1) context.fillRect(-size * 0.55, -size * 0.3, size * 1.1, size * 0.6);
      else { context.beginPath(); context.moveTo(0, -size * 0.72); context.lineTo(size * 0.65, size * 0.52); context.lineTo(-size * 0.65, size * 0.52); context.closePath(); context.fill(); }
      context.restore();
    }
    context.restore();
  }

  function drawMotion(context, time) {
    const count = Math.max(1, Math.min(state.marks.length, Math.round(state.density)));
    const palette = currentPalette();
    if (state.effect === "precise") drawPreciseLines(context, time, palette, count);
    else if (state.effect === "spiral") drawSpirals(context, time, palette, count);
    else drawFreeLines(context, time, palette, count);
  }

  function drawAutoEffect(context, time) {
    if (!state.auto.hasMask || !maskCanvas.width) return;
    context.save(); drawMotion(context, time);
    const placement = videoPlacement();
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskCanvas, placement.x, placement.y, placement.width, placement.height);
    context.restore();
  }

  // Draw exactly the same alpha mask used by the animated effect, over the camera.
  function drawAutoMaskPreview(context) {
    if (!state.auto.hasMask || !maskCanvas.width) return;
    const placement = videoPlacement();
    context.save();
    context.globalAlpha = 0.55;
    context.drawImage(maskCanvas, placement.x, placement.y, placement.width, placement.height);
    context.restore();
  }

  function renderFrame(time) {
    if (!state.metrics) return;
    prepareContext(overlayContext);
    if (state.selection.length >= 3 && !state.isDrawing) {
      overlayContext.save(); tracePath(overlayContext, state.selection);
      if (state.view === "mask") { overlayContext.fillStyle = "rgba(57, 255, 115, 0.55)"; overlayContext.fill(); }
      else { overlayContext.clip(); drawMotion(overlayContext, time); }
      overlayContext.restore(); drawOutline(overlayContext, state.selection, true);
    } else if (state.isDrawing && state.selection.length) drawOutline(overlayContext, state.selection, false);
    else if (state.auto.enabled && state.auto.hasMask && !state.frozen) {
      if (state.view === "mask") drawAutoMaskPreview(overlayContext);
      else drawAutoEffect(overlayContext, time);
    }
  }

  function clearAutoMask() {
    state.auto.hasMask = false;
    if (maskCanvas.width && maskCanvas.height) maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function connectedComponent(values, width, height) {
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    const minimumPixels = Math.ceil(total * MIN_OBJECT_AREA);
    let best = null; let bestScore = 0;
    for (let start = 0; start < total; start += 1) {
      const category = values[start];
      if (category === 0 || visited[start]) continue;
      let head = 0; let tail = 0; let sumX = 0; let sumY = 0;
      queue[tail++] = start; visited[start] = 1;
      while (head < tail) {
        const current = queue[head++]; const x = current % width; const y = Math.floor(current / width);
        sumX += x; sumY += y;
        const neighbours = [current - 1, current + 1, current - width, current + width];
        for (const next of neighbours) {
          if (next < 0 || next >= total || visited[next] || values[next] !== category) continue;
          if ((next === current - 1 || next === current + 1) && Math.floor(next / width) !== y) continue;
          visited[next] = 1; queue[tail++] = next;
        }
      }
      if (tail < minimumPixels) continue;
      const centerDistance = Math.hypot(sumX / tail / width - 0.5, sumY / tail / height - 0.5);
      const score = tail * (1 - Math.min(0.28, centerDistance * 0.28));
      if (score > bestScore) { bestScore = score; best = { pixels: queue.slice(0, tail) }; }
    }
    return best;
  }

  function consumeSegmentation(values, capturedAt) {
      const width = 320; const height = 320;
      const component = connectedComponent(values, width, height);
      const now = performance.now();
      if (!component) {
        if (state.auto.hasMask && now - state.auto.lastFoundAt > 700) {
          clearAutoMask();
          setStageNote("Cerco un oggetto grande");
          setStatus("Nessuna regione grande rilevata. Prova a cambiare distanza o sfondo.");
        }
        return;
      }
      if (maskCanvas.width !== width || maskCanvas.height !== height) { maskCanvas.width = width; maskCanvas.height = height; }
      const image = maskContext.createImageData(width, height);
      for (const pixel of component.pixels) { const offset = pixel * 4; image.data[offset] = 57; image.data[offset + 1] = 255; image.data[offset + 2] = 115; image.data[offset + 3] = 255; }
      maskContext.putImageData(image, 0, 0);
      state.auto.hasMask = true; state.auto.lastFoundAt = now; state.auto.maskCapturedAt = capturedAt;
      if (now - state.auto.lastStatusAt > 1200) {
        setStageNote("Soggetto visivo rilevato");
        setStatus(state.view === "mask" ? "La zona verde mostra la maschera stimata. Controlla se include parti dello sfondo." : "Soggetto visivo rilevato. Le linee seguono la maschera stimata, che può essere imprecisa o in ritardo.");
        state.auto.lastStatusAt = now;
      }
  }

  function runSegmentation(time) {
    const { auto } = state;
    if (!state.stream || !auto.enabled || !auto.ready || !auto.segmenter || auto.loading || state.frozen || document.hidden) return;
    if (auto.hasMask && time - auto.maskCapturedAt > MAX_MASK_AGE_MS) {
      clearAutoMask(); setStageNote("Aggiornamento lento"); setStatus("La maschera è in ritardo: prova a tenere fermo il telefono oppure riprova con il Prototipo A.");
    }
    if (auto.busy) return;
    if (time < auto.pauseUntil || time - auto.lastInferenceAt < INFERENCE_INTERVAL_MS || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    auto.lastInferenceAt = time; auto.busy = true;
    try {
      inferenceContext.drawImage(elements.video, 0, 0, 320, 320);
      const pixels = inferenceContext.getImageData(0, 0, 320, 320).data;
      auto.segmenter.postMessage({ type: "frame", pixels: pixels.buffer, capturedAt: time, generation: auto.generation }, [pixels.buffer]);
    }
    catch (error) {
      segmentationError(error);
    }
  }

  function segmentationError(error) {
    const auto = state.auto;
    auto.segmenter?.terminate(); auto.segmenter = null; auto.busy = false; auto.loading = false; auto.ready = false; auto.failed = true; auto.enabled = false; auto.generation++;
    clearAutoMask(); setStageNote("Rilevamento non disponibile");
    setStatus("Il modello oggetti non è disponibile. Controlla la connessione e riprova; puoi anche disegnare la sagoma a mano.");
    setControls(Boolean(state.stream)); console.warn("Foreground segmentation error", error);
  }

  function initialiseSegmentation() {
    if (state.auto.ready || state.auto.loading) return;
    state.auto.loading = true; state.auto.failed = false; setControls(Boolean(state.stream));
    setStageNote("Carico riconoscimento…"); setStatus("Carico il modello per oggetti sul dispositivo. Al primo utilizzo serve una connessione Internet.");
    try {
      const worker = new Worker("foreground-worker.js?v=20261022-objects1");
      state.auto.segmenter = worker;
      worker.onmessage = ({ data }) => {
        const auto = state.auto;
        if (worker !== auto.segmenter) return;
        if (data.type === "ready") {
          auto.ready = true; auto.loading = false;
          if (state.stream && auto.enabled) { setStageNote("Cerco il soggetto"); setStatus("Rilevamento pronto. Inquadra un oggetto ben distinto dallo sfondo."); }
          setControls(Boolean(state.stream));
        } else if (data.type === "result") {
          auto.busy = false;
          if (!state.stream || !auto.enabled || state.frozen || document.hidden || data.generation !== auto.generation) return;
          if (performance.now() - data.capturedAt > MAX_MASK_AGE_MS) { clearAutoMask(); setStageNote("Aggiornamento lento"); setStatus("Il dispositivo impiega troppo tempo per aggiornare la maschera. Prova con un soggetto fermo o usa il Prototipo A."); return; }
          consumeSegmentation(new Uint8Array(data.mask), data.capturedAt);
        } else if (data.type === "error") segmentationError(data.message);
      };
      worker.onerror = error => segmentationError(error);
      worker.postMessage({ type: "init" });
    } catch (error) {
      segmentationError(error);
    }
    setControls(Boolean(state.stream));
  }

  function setAutoEnabled(enabled, announce = true) {
    state.auto.enabled = enabled; state.auto.generation++; state.auto.pauseUntil = performance.now() + 120; clearAutoMask();
    if (enabled) {
      state.selection = []; state.isDrawing = false; state.drawArmed = false; state.frozen = false; elements.frozenCanvas.classList.remove("is-visible");
      if (state.stream) initialiseSegmentation();
      if (announce) { setStageNote("Cerco un oggetto grande"); setStatus("Rilevamento automatico attivo. Cerca una sola regione grande e ignora gli oggetti piccoli."); }
    } else if (announce) { setStageNote("Rilevamento in pausa"); setStatus("Rilevamento automatico in pausa. Puoi fissare un fotogramma e disegnare una sagoma manuale."); }
    setControls(Boolean(state.stream));
  }

  function toggleAutoSegmentation() {
    if (state.auto.failed) { state.auto.failed = false; state.auto.enabled = true; initialiseSegmentation(); return; }
    setAutoEnabled(!state.auto.enabled);
  }

  function takeSnapshot() {
    if (elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { setStatus("Attendi un istante: il flusso della fotocamera sta arrivando."); return false; }
    const sourceWidth = elements.video.videoWidth; const sourceHeight = elements.video.videoHeight; const factor = Math.min(1, 1440 / Math.max(sourceWidth, sourceHeight));
    snapshotCanvas.width = Math.max(1, Math.round(sourceWidth * factor)); snapshotCanvas.height = Math.max(1, Math.round(sourceHeight * factor));
    snapshotContext.drawImage(elements.video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    state.hasSnapshot = true; state.frozen = true; elements.frozenCanvas.classList.add("is-visible"); renderFrozenFrame(); setControls(true); return true;
  }

  function freezeCurrentFrame() {
    setAutoEnabled(false, false);
    const hadMask = state.selection.length >= 3;
    if (!takeSnapshot()) return false;
    if (hadMask) state.selection = [];
    state.drawArmed = false; setStageNote("Fotogramma fissato"); setStatus(hadMask ? "Nuovo fotogramma fissato: la sagoma precedente è stata rimossa." : "Fotogramma fissato. Ora puoi disegnare il bordo dell'oggetto."); setControls(true); return true;
  }

  function returnToLive() {
    if (!state.stream) return;
    state.frozen = false; state.drawArmed = false; elements.frozenCanvas.classList.remove("is-visible"); setAutoEnabled(true, false);
    setStageNote("Cerco un oggetto grande"); setStatus("Anteprima live. Il rilevamento automatico torna a cercare un oggetto grande."); setControls(true);
  }

  function armDrawing() {
    if (!state.stream) return;
    setAutoEnabled(false, false);
    if (!state.frozen && !freezeCurrentFrame()) return;
    state.selection = []; state.drawArmed = true; setStageNote("Traccia il contorno con un dito"); setStatus("Traccia senza sollevare il dito lungo il bordo dell'oggetto. Al rilascio, le forme appariranno nella sagoma."); setControls(true);
  }

  function clearMask() {
    state.selection = []; state.isDrawing = false; state.drawArmed = false; state.auto.generation++; state.auto.pauseUntil = performance.now() + 700; clearAutoMask(); elements.overlay.classList.remove("is-drawing");
    setStageNote(state.auto.enabled ? "Cerco un oggetto grande" : state.frozen ? "Fotogramma fissato" : "Anteprima live");
    setStatus(state.auto.enabled ? "Maschera rimossa. Il rilevamento automatico riprenderà tra un istante." : "Sagoma rimossa. Puoi disegnarne una nuova."); setControls(Boolean(state.stream));
  }

  function formatCameraError(error) {
    if (error?.name === "NotAllowedError") return "Permesso fotocamera negato. Abilitalo nelle impostazioni di Safari e riprova.";
    if (error?.name === "NotFoundError") return "Nessuna fotocamera disponibile su questo dispositivo.";
    if (error?.name === "NotReadableError") return "La fotocamera è già usata da un'altra app o pagina.";
    if (error?.name === "OverconstrainedError") return "Questa configurazione della fotocamera non è disponibile.";
    return "Impossibile aprire la fotocamera. Verifica HTTPS, permessi e riprova.";
  }

  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setStatus("La fotocamera richiede Safari aggiornato e una pagina HTTPS (oppure localhost)."); return; }
    elements.startCamera.disabled = true; setStatus("Richiesta di accesso alla fotocamera…"); let requestedStream = null;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      state.stream = requestedStream; elements.video.srcObject = requestedStream; await elements.video.play(); elements.stageEmpty.classList.add("is-hidden");
      const facingMode = requestedStream.getVideoTracks()[0]?.getSettings?.().facingMode;
      setStageNote(facingMode === "user" ? "Fotocamera frontale attiva" : "Carico riconoscimento…");
      setStatus(facingMode === "user" ? "Il dispositivo ha aperto la fotocamera frontale. Seleziona la posteriore nelle impostazioni del browser, se disponibile." : "Fotocamera attiva. Preparo il rilevamento automatico dell'oggetto.");
      setControls(true); syncCanvases(); setAutoEnabled(true, false); initialiseSegmentation();
    } catch (error) {
      requestedStream?.getTracks().forEach((track) => track.stop()); elements.video.srcObject = null; setStatus(formatCameraError(error)); state.stream = null; setControls(false);
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null; elements.video.srcObject = null; state.frozen = false; state.hasSnapshot = false; state.selection = []; state.isDrawing = false; state.drawArmed = false; state.auto.generation++; clearAutoMask();
    elements.frozenCanvas.classList.remove("is-visible"); elements.stageEmpty.classList.remove("is-hidden"); setStageNote("Inquadra l'oggetto"); setStatus("Fotocamera chiusa. Nessun fotogramma viene salvato o caricato."); setControls(false); renderFrame(performance.now());
  }

  function onPointerDown(event) {
    if (!state.drawArmed || !state.frozen || !state.stream) return;
    event.preventDefault(); state.isDrawing = true; state.selection = []; appendPoint(normalisedPoint(event)); elements.overlay.setPointerCapture?.(event.pointerId); elements.overlay.classList.add("is-drawing"); setStageNote("Disegno in corso…"); setControls(true);
  }
  function onPointerMove(event) { if (!state.isDrawing) return; event.preventDefault(); appendPoint(normalisedPoint(event)); }
  function onPointerEnd(event) {
    if (!state.isDrawing) return;
    event.preventDefault(); state.isDrawing = false; elements.overlay.releasePointerCapture?.(event.pointerId); elements.overlay.classList.remove("is-drawing");
    if (state.selection.length < 12) { state.selection = []; state.drawArmed = true; setStatus("Il tratto è troppo breve. Riprova seguendo il bordo dell'oggetto con un gesto continuo."); setStageNote("Traccia il contorno con un dito"); }
    else { state.drawArmed = false; setStatus("Sagoma pronta. Le forme animate restano confinate al suo interno."); setStageNote("Sagoma manuale attiva"); }
    setControls(true);
  }

  function updateSegmented(buttons, selected) {
    buttons.forEach((button) => { const isSelected = button === selected; button.classList.toggle("is-selected", isSelected); button.setAttribute("aria-pressed", String(isSelected)); });
  }

  function setView(view, button) {
    state.view = view;
    elements.stage.classList.toggle("is-lines-only", view === "lines");
    updateSegmented(elements.viewButtons, button);
    if (!state.stream) return;
    setStatus(view === "lines" ? "Solo linee attivo. La fotocamera continua a rilevare l'oggetto, ma il video è nascosto." : view === "mask" ? "Maschera attiva: la zona verde mostra l'area rilevata, senza linee. Controlla se include lo sfondo." : "Camera e linee attive. L'effetto resta ritagliato dentro la maschera dell'oggetto.");
  }

  function animationLoop(time) {
    if (!document.hidden) { runSegmentation(time); renderFrame(time); }
    requestAnimationFrame(animationLoop);
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", stopCamera);
  elements.autoMask.addEventListener("click", toggleAutoSegmentation);
  elements.freezeFrame.addEventListener("click", freezeCurrentFrame);
  elements.liveFrame.addEventListener("click", returnToLive);
  elements.drawMask.addEventListener("click", armDrawing);
  elements.clearMask.addEventListener("click", clearMask);
  elements.newColors.addEventListener("click", () => { state.palette = createPalette(); state.marks = createMotionMarks(); if (state.colors === "color") setStatus("Nuova palette e nuovo movimento generati sul dispositivo."); });
  elements.effectButtons.forEach((button) => button.addEventListener("click", () => { state.effect = button.dataset.effect; updateSegmented(elements.effectButtons, button); }));
  elements.colorButtons.forEach((button) => button.addEventListener("click", () => { state.colors = button.dataset.colors; updateSegmented(elements.colorButtons, button); }));
  elements.viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view, button)));
  elements.density.addEventListener("input", () => { state.density = Number(elements.density.value); elements.densityValue.value = String(state.density); elements.densityValue.textContent = String(state.density); });
  elements.lineSize.addEventListener("input", () => { state.lineSize = Number(elements.lineSize.value); elements.lineSizeValue.value = String(state.lineSize); elements.lineSizeValue.textContent = String(state.lineSize); });
  elements.speed.addEventListener("input", () => { state.speed = Number(elements.speed.value); elements.speedValue.value = String(state.speed); elements.speedValue.textContent = String(state.speed); });
  elements.overlay.addEventListener("pointerdown", onPointerDown);
  elements.overlay.addEventListener("pointermove", onPointerMove);
  elements.overlay.addEventListener("pointerup", onPointerEnd);
  elements.overlay.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("resize", syncCanvases);
  window.addEventListener("orientationchange", () => { if (state.selection.length) { state.selection = []; state.drawArmed = false; setStatus("Orientamento cambiato: ridisegna la sagoma per mantenerla allineata al fotogramma."); } state.auto.generation++; clearAutoMask(); window.setTimeout(syncCanvases, 120); });
  window.addEventListener("pagehide", () => state.stream?.getTracks().forEach((track) => track.stop()));

  syncCanvases(); setControls(false); requestAnimationFrame(animationLoop);
})();
