(() => {
  "use strict";

  const MEDIAPIPE_BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
  const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
  const SEGMENTATION_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
  const INFERENCE_INTERVAL_MS = 125;
  const PERSON_CATEGORY = 1;

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
    autoMask: document.querySelector("#auto-mask"),
    freezeFrame: document.querySelector("#freeze-frame"),
    liveFrame: document.querySelector("#live-frame"),
    drawMask: document.querySelector("#draw-mask"),
    clearMask: document.querySelector("#clear-mask"),
    density: document.querySelector("#density"),
    densityValue: document.querySelector("#density-value"),
    trail: document.querySelector("#trail"),
    trailValue: document.querySelector("#trail-value"),
    speed: document.querySelector("#speed"),
    speedValue: document.querySelector("#speed-value"),
    stability: document.querySelector("#stability"),
    stabilityValue: document.querySelector("#stability-value"),
    newColors: document.querySelector("#new-colors"),
    effectButtons: [...document.querySelectorAll("[data-effect]")],
    colorButtons: [...document.querySelectorAll("[data-colors]")],
    viewButtons: [...document.querySelectorAll("[data-view]")],
  };

  const overlayContext = elements.overlay.getContext("2d");
  const frozenContext = elements.frozenCanvas.getContext("2d");
  const modelCanvas = document.createElement("canvas");
  const modelContext = modelCanvas.getContext("2d", { willReadFrequently: true });
  const rawMaskCanvas = document.createElement("canvas");
  const rawMaskContext = rawMaskCanvas.getContext("2d", { willReadFrequently: true });
  const matteCanvas = document.createElement("canvas");
  const matteContext = matteCanvas.getContext("2d", { willReadFrequently: true });
  const effectCanvas = document.createElement("canvas");
  const effectContext = effectCanvas.getContext("2d");

  const state = {
    stream: null,
    frozen: false,
    drawing: false,
    drawArmed: false,
    selection: [],
    manualMask: false,
    metrics: null,
    lastFrameAt: 0,
    view: "camera",
    effect: "flow",
    colors: "mono",
    palette: createPalette(),
    density: Number(elements.density.value),
    trail: Number(elements.trail.value),
    speed: Number(elements.speed.value),
    stability: Number(elements.stability.value),
    particles: createParticles(84),
    auto: {
      enabled: true,
      loading: false,
      ready: false,
      failed: false,
      segmenter: null,
      lastInferenceAt: 0,
      lastFoundAt: 0,
      lastStatusAt: 0,
      alpha: new Float32Array(0),
      clip: new Uint8Array(0),
      hasMask: false,
    },
  };

  function createPalette() {
    const hue = Math.floor(Math.random() * 360);
    return [0, 45, 100, 172, 245, 300].map((offset, index) => `hsl(${(hue + offset) % 360} ${70 + (index % 3) * 10}% ${53 + (index % 2) * 12}%)`);
  }

  function createParticle() {
    return {
      x: Math.random(), y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      drift: 0.55 + Math.random() * 1.2,
      width: 0.7 + Math.random() * 2.1,
      color: Math.floor(Math.random() * 6),
      age: Math.random() * 1000,
    };
  }

  function createParticles(count) { return Array.from({ length: count }, createParticle); }
  function setStatus(message) { elements.status.textContent = message; }
  function setStageNote(message) { elements.stageNote.textContent = message; }
  function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }

  function updateAutoButton() {
    const { auto } = state;
    elements.autoMask.setAttribute("aria-pressed", String(auto.enabled));
    elements.autoMask.classList.toggle("button-accent", auto.enabled && !auto.failed);
    elements.autoMask.classList.toggle("button-secondary", !auto.enabled || auto.failed);
    elements.autoMask.textContent = auto.loading ? "Carico riconoscimento…" : auto.failed ? "Riprova rilevamento" : auto.enabled ? "Rilevamento: attivo" : "Rilevamento: spento";
  }

  function setControls(cameraOn) {
    const hasMask = state.auto.hasMask || state.manualMask || state.selection.length > 2;
    elements.startCamera.disabled = cameraOn;
    elements.stopCamera.disabled = !cameraOn;
    elements.autoMask.disabled = !cameraOn || state.auto.loading || state.frozen;
    elements.freezeFrame.disabled = !cameraOn || state.frozen;
    elements.liveFrame.disabled = !cameraOn || !state.frozen;
    elements.drawMask.disabled = !cameraOn || !state.frozen;
    elements.clearMask.disabled = !cameraOn || !hasMask;
    updateAutoButton();
  }

  function getMetrics() {
    const bounds = elements.stage.getBoundingClientRect();
    // A dimensione CSS è più leggera su Safari: il modello lavora già a risoluzione ridotta.
    const scale = 1;
    return { cssWidth: Math.max(1, bounds.width), cssHeight: Math.max(1, bounds.height), width: Math.round(Math.max(1, bounds.width) * scale), height: Math.round(Math.max(1, bounds.height) * scale), scale };
  }

  function resizeCanvas(canvas, metrics) {
    if (canvas.width !== metrics.width || canvas.height !== metrics.height) {
      canvas.width = metrics.width;
      canvas.height = metrics.height;
    }
  }

  function clearContext(context, metrics) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, metrics.width, metrics.height);
  }

  function syncCanvases() {
    const previous = state.metrics;
    state.metrics = getMetrics();
    [elements.overlay, elements.frozenCanvas, rawMaskCanvas, matteCanvas, effectCanvas].forEach((canvas) => resizeCanvas(canvas, state.metrics));
    if (!previous || previous.width !== state.metrics.width || previous.height !== state.metrics.height) {
      state.auto.alpha = new Float32Array(state.metrics.width * state.metrics.height);
      state.auto.clip = new Uint8Array(state.metrics.width * state.metrics.height);
      clearContext(matteContext, state.metrics);
      clearContext(rawMaskContext, state.metrics);
      state.auto.hasMask = false;
      state.manualMask = false;
    }
  }

  function drawCover(context, source, destinationWidth, destinationHeight) {
    const sourceWidth = source.videoWidth || source.width;
    const sourceHeight = source.videoHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const factor = Math.max(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
    const width = sourceWidth * factor;
    const height = sourceHeight * factor;
    context.drawImage(source, (destinationWidth - width) / 2, (destinationHeight - height) / 2, width, height);
  }

  function clearMask() {
    if (!state.metrics) return;
    clearContext(matteContext, state.metrics);
    clearContext(rawMaskContext, state.metrics);
    state.auto.alpha.fill(0);
    state.auto.clip.fill(0);
    state.auto.hasMask = false;
    state.manualMask = false;
    state.selection = [];
  }

  function maskPresent() { return state.auto.hasMask || state.manualMask; }

  function updateMatteFromSegmentation() {
    const { width, height } = state.metrics;
    const raw = rawMaskContext.getImageData(0, 0, width, height).data;
    const previous = state.auto.alpha;
    // Anche alla stabilità più alta la prima maschera deve comparire subito.
    const blend = 0.58 - state.stability * 0.025;
    const count = width * height;
    let occupancy = 0;
    state.auto.clip.fill(0);

    for (let pixel = 0, dataIndex = 3; pixel < count; pixel += 1, dataIndex += 4) {
      const target = raw[dataIndex] / 255;
      previous[pixel] += (target - previous[pixel]) * blend;
    }

    const output = matteContext.createImageData(width, height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const core = Math.min(previous[pixel], previous[pixel - 1], previous[pixel + 1], previous[pixel - width], previous[pixel + width]);
        const alpha = Math.round(clamp((core - 0.18) / 0.5) * 255);
        const dataIndex = pixel * 4;
        output.data[dataIndex] = 255;
        output.data[dataIndex + 1] = 255;
        output.data[dataIndex + 2] = 255;
        output.data[dataIndex + 3] = alpha;
        state.auto.clip[pixel] = alpha;
        occupancy += alpha > 48 ? 1 : 0;
      }
    }
    matteContext.putImageData(output, 0, 0);
    const now = performance.now();
    const previouslyHadMask = state.auto.hasMask;
    state.auto.hasMask = occupancy > count * 0.002;
    if (state.auto.hasMask) state.auto.lastFoundAt = now;
    if (previouslyHadMask !== state.auto.hasMask || now - state.auto.lastStatusAt > 1200) {
      setStageNote(state.auto.hasMask ? "Maschera persone attiva" : "Cerco una persona");
      setStatus(state.auto.hasMask ? (state.view === "mask" ? "Maschera pronta: il verde indica la zona usata per contenere le linee." : "Maschera pronta: creo le linee all'interno della persona.") : "Nessuna persona rilevata. Avvicinati, illumina il soggetto o controlla prima “Mostra maschera”.");
      state.auto.lastStatusAt = now;
    }
  }

  function consumeSegmentation(result) {
    const categoryMask = result.categoryMask;
    if (!categoryMask) return;
    if (!state.metrics || state.frozen || state.manualMask) {
      categoryMask.close?.();
      return;
    }
    try {
      const values = categoryMask.getAsUint8Array();
      modelCanvas.width = categoryMask.width;
      modelCanvas.height = categoryMask.height;
      const image = modelContext.createImageData(categoryMask.width, categoryMask.height);
      for (let index = 0, offset = 0; index < values.length; index += 1, offset += 4) {
        image.data[offset + 3] = values[index] === PERSON_CATEGORY ? 255 : 0;
      }
      modelContext.putImageData(image, 0, 0);
      clearContext(rawMaskContext, state.metrics);
      rawMaskContext.imageSmoothingEnabled = true;
      rawMaskContext.imageSmoothingQuality = "high";
      drawCover(rawMaskContext, modelCanvas, state.metrics.width, state.metrics.height);
      updateMatteFromSegmentation();
    } catch (error) {
      state.auto.failed = true;
      state.auto.enabled = false;
      setStageNote("Rilevamento non disponibile");
      setStatus("Non riesco a leggere la maschera automatica. Puoi usare la sagoma manuale su un fotogramma fissato.");
      console.warn("Mask processing error", error);
    } finally {
      categoryMask.close?.();
      setControls(Boolean(state.stream));
    }
  }

  async function initialiseSegmentation() {
    if (state.auto.loading || state.auto.ready) return;
    state.auto.loading = true;
    state.auto.failed = false;
    updateAutoButton();
    setStatus("Carico il riconoscimento persone…");
    try {
      const vision = await import(MEDIAPIPE_BUNDLE);
      const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      state.auto.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTATION_MODEL },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      state.auto.ready = true;
      setStageNote("Cerco la persona");
      setStatus("Rilevamento pronto. Per controllarlo, passa a “Mostra maschera”.");
    } catch (error) {
      state.auto.failed = true;
      state.auto.enabled = false;
      setStageNote("Rilevamento non disponibile");
      setStatus("Il modello non si è caricato. Verifica la rete e riprova; la sagoma manuale resta disponibile.");
      console.warn("Segmentation setup error", error);
    } finally {
      state.auto.loading = false;
      setControls(Boolean(state.stream));
    }
  }

  function setAutoEnabled(enabled, silent = false) {
    state.auto.enabled = enabled;
    state.manualMask = false;
    if (enabled && !state.auto.ready) initialiseSegmentation();
    if (!silent) {
      setStageNote(enabled ? "Cerco la persona" : "Rilevamento in pausa");
      setStatus(enabled ? "Rilevamento automatico attivo." : "Rilevamento automatico in pausa. Puoi fissare e disegnare una sagoma.");
    }
    setControls(Boolean(state.stream));
  }

  function runSegmentation(time) {
    const { auto } = state;
    if (!auto.enabled || !auto.ready || !state.stream || state.frozen || state.manualMask || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (time - auto.lastInferenceAt < INFERENCE_INTERVAL_MS) return;
    auto.lastInferenceAt = time;
    try {
      auto.segmenter.segmentForVideo(elements.video, time, consumeSegmentation);
    } catch (error) {
      auto.failed = true;
      auto.enabled = false;
      setStageNote("Rilevamento non disponibile");
      setStatus("Il rilevamento si è fermato. Premi “Riprova rilevamento” oppure usa la sagoma manuale.");
      setControls(Boolean(state.stream));
      console.warn("Segmentation error", error);
    }
  }

  function isInsideMask(normalX, normalY) {
    if (!maskPresent() || !state.metrics) return false;
    const x = clamp(Math.floor(normalX * state.metrics.width), 0, state.metrics.width - 1);
    const y = clamp(Math.floor(normalY * state.metrics.height), 0, state.metrics.height - 1);
    return state.auto.clip[y * state.metrics.width + x] > 110;
  }

  function respawnParticle(particle) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      particle.x = Math.random();
      particle.y = Math.random();
      if (!maskPresent() || isInsideMask(particle.x, particle.y)) break;
    }
    particle.phase = Math.random() * Math.PI * 2;
    particle.drift = 0.55 + Math.random() * 1.2;
    particle.width = 0.7 + Math.random() * 2.1;
    particle.color = Math.floor(Math.random() * 6);
    particle.age = 0;
  }

  function flowAngle(x, y, time, phase) {
    return Math.sin(y * 8.2 + time * 0.00046 + phase) * 1.45 + Math.cos(x * 7.1 - time * 0.00033 - phase) * 1.1 + Math.sin((x + y) * 4.2 + time * 0.00021) * 0.65;
  }

  function particleColor(particle) {
    if (state.colors === "mono") return ["rgba(255,255,252,.96)", "rgba(213,216,227,.83)", "rgba(165,169,182,.72)", "rgba(255,255,255,.9)"][particle.color % 4];
    return state.palette[particle.color % state.palette.length];
  }

  function drawFlowParticle(particle, time, step) {
    const { width, height } = state.metrics;
    const startX = particle.x * width;
    const startY = particle.y * height;
    const tail = Math.max(4, Math.round(state.trail / 9));
    effectContext.beginPath();
    effectContext.moveTo(startX, startY);
    for (let index = 1; index <= tail; index += 1) {
      const distance = index * (state.trail / tail) * state.metrics.scale;
      const reverseAngle = flowAngle(particle.x, particle.y, time - index * 30, particle.phase) + Math.PI;
      const wobble = Math.sin(index * .78 + particle.phase) * 2.4 * state.metrics.scale;
      effectContext.lineTo(startX + Math.cos(reverseAngle) * distance + wobble, startY + Math.sin(reverseAngle) * distance - wobble);
    }
    effectContext.stroke();
    const angle = flowAngle(particle.x, particle.y, time, particle.phase);
    particle.x += Math.cos(angle) * step * particle.drift;
    particle.y += Math.sin(angle) * step * particle.drift;
  }

  function drawSpiralParticle(particle, time, step) {
    const { width, height } = state.metrics;
    const cx = particle.x * width;
    const cy = particle.y * height;
    const turns = 1.1 + state.trail / 105;
    const maxRadius = (8 + state.trail * .34) * state.metrics.scale;
    effectContext.beginPath();
    for (let index = 0; index <= 24; index += 1) {
      const t = index / 24;
      const angle = particle.phase + time * .0014 * particle.drift + t * Math.PI * 2 * turns;
      const radius = maxRadius * t;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * .75;
      if (index === 0) effectContext.moveTo(x, y); else effectContext.lineTo(x, y);
    }
    effectContext.stroke();
    const angle = flowAngle(particle.x, particle.y, time, particle.phase + 1.4);
    particle.x += Math.cos(angle) * step * .68;
    particle.y += Math.sin(angle) * step * .68;
  }

  function drawStrokesParticle(particle, time, step) {
    const { width, height } = state.metrics;
    const cx = particle.x * width;
    const cy = particle.y * height;
    const angle = flowAngle(particle.x, particle.y, time, particle.phase);
    const half = (8 + state.trail * .45) * state.metrics.scale;
    effectContext.beginPath();
    effectContext.moveTo(cx - Math.cos(angle) * half, cy - Math.sin(angle) * half);
    effectContext.quadraticCurveTo(cx + Math.sin(angle) * half * .18, cy - Math.cos(angle) * half * .18, cx + Math.cos(angle) * half, cy + Math.sin(angle) * half);
    effectContext.stroke();
    particle.x += Math.cos(angle) * step * .8;
    particle.y += Math.sin(angle) * step * .8;
  }

  function drawEffect(time, delta) {
    const { width, height, scale } = state.metrics;
    clearContext(effectContext, state.metrics);
    if (!maskPresent()) return;
    const count = Math.min(state.density, state.particles.length);
    const speed = state.speed === 0 ? 0 : (0.00022 + state.speed * 0.00013) * Math.min(delta, 42);
    effectContext.lineCap = "round";
    effectContext.lineJoin = "round";
    for (let index = 0; index < count; index += 1) {
      const particle = state.particles[index];
      if (particle.x < -.12 || particle.y < -.12 || particle.x > 1.12 || particle.y > 1.12 || (!isInsideMask(particle.x, particle.y) && particle.age > 18)) respawnParticle(particle);
      particle.age += delta;
      effectContext.strokeStyle = particleColor(particle);
      effectContext.globalAlpha = .56 + (index % 4) * .1;
      effectContext.lineWidth = particle.width * scale;
      if (state.effect === "spiral") drawSpiralParticle(particle, time, speed);
      else if (state.effect === "strokes") drawStrokesParticle(particle, time, speed);
      else drawFlowParticle(particle, time, speed);
    }
    effectContext.globalAlpha = 1;
    effectContext.globalCompositeOperation = "destination-in";
    effectContext.drawImage(matteCanvas, 0, 0, width, height);
    effectContext.globalCompositeOperation = "source-over";
  }

  function drawMaskDebug() {
    clearContext(overlayContext, state.metrics);
    if (!maskPresent()) return;
    overlayContext.drawImage(matteCanvas, 0, 0);
    overlayContext.globalCompositeOperation = "source-in";
    overlayContext.fillStyle = "rgba(66, 255, 144, .72)";
    overlayContext.fillRect(0, 0, state.metrics.width, state.metrics.height);
    overlayContext.globalCompositeOperation = "source-over";
  }

  function drawManualGuide() {
    if (!state.drawArmed || state.selection.length === 0) return;
    const { width, height } = state.metrics;
    overlayContext.save();
    overlayContext.setLineDash([8 * state.metrics.scale, 6 * state.metrics.scale]);
    overlayContext.strokeStyle = "#dbff31";
    overlayContext.lineWidth = 2.1 * state.metrics.scale;
    overlayContext.beginPath();
    state.selection.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) overlayContext.moveTo(x, y); else overlayContext.lineTo(x, y);
    });
    overlayContext.stroke();
    overlayContext.restore();
  }

  function renderFrame(time) {
    if (!state.metrics) syncCanvases();
    const delta = state.lastFrameAt ? time - state.lastFrameAt : 16;
    state.lastFrameAt = time;
    if (state.view === "mask") drawMaskDebug();
    else {
      drawEffect(time, delta);
      clearContext(overlayContext, state.metrics);
      overlayContext.drawImage(effectCanvas, 0, 0);
    }
    drawManualGuide();
  }

  function setView(view, button) {
    state.view = view;
    elements.stage.classList.toggle("is-lines-only", view === "lines");
    elements.stage.classList.toggle("is-mask-view", view === "mask");
    elements.viewButtons.forEach((candidate) => {
      const selected = candidate.dataset.view === view;
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    button?.blur?.();
  }

  function setEffect(effect) {
    state.effect = effect;
    state.particles.forEach(respawnParticle);
    elements.effectButtons.forEach((button) => {
      const selected = button.dataset.effect === effect;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setColors(colors) {
    state.colors = colors;
    elements.colorButtons.forEach((button) => {
      const selected = button.dataset.colors === colors;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function freezeFrame() {
    if (!state.stream || !state.metrics) return;
    clearContext(frozenContext, state.metrics);
    drawCover(frozenContext, elements.video, state.metrics.width, state.metrics.height);
    state.frozen = true;
    state.drawArmed = false;
    elements.frozenCanvas.classList.add("is-visible");
    setAutoEnabled(false, true);
    clearMask();
    setStageNote("Fotogramma fissato");
    setStatus("Fotogramma fissato. Puoi disegnare manualmente la sagoma oppure tornare al live.");
    setControls(true);
  }

  function resumeLive() {
    if (!state.stream) return;
    state.frozen = false;
    state.drawArmed = false;
    state.drawing = false;
    state.selection = [];
    elements.frozenCanvas.classList.remove("is-visible");
    clearMask();
    setAutoEnabled(true, true);
    setStageNote("Cerco la persona");
    setStatus("Anteprima live. La maschera viene nuovamente aggiornata.");
    setControls(true);
  }

  function setManualMask() {
    if (state.selection.length < 3 || !state.metrics) return;
    clearContext(matteContext, state.metrics);
    matteContext.fillStyle = "#fff";
    matteContext.beginPath();
    state.selection.forEach((point, index) => {
      const x = point.x * state.metrics.width;
      const y = point.y * state.metrics.height;
      if (index === 0) matteContext.moveTo(x, y); else matteContext.lineTo(x, y);
    });
    matteContext.closePath();
    matteContext.fill();
    const manual = matteContext.getImageData(0, 0, state.metrics.width, state.metrics.height).data;
    for (let pixel = 0, offset = 3; pixel < state.auto.alpha.length; pixel += 1, offset += 4) {
      state.auto.alpha[pixel] = manual[offset] / 255;
      state.auto.clip[pixel] = manual[offset];
    }
    state.manualMask = true;
    state.auto.hasMask = false;
    state.drawArmed = false;
    setStageNote("Sagoma manuale pronta");
    setStatus("Sagoma manuale applicata. Le linee sono ritagliate al suo interno.");
    setControls(true);
  }

  function normalisedPoint(event) {
    const bounds = elements.overlay.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  }

  function formatCameraError(error) {
    if (error?.name === "NotAllowedError") return "Accesso alla fotocamera non consentito. In Safari, autorizza la fotocamera per questa pagina.";
    if (error?.name === "NotFoundError") return "Non trovo una fotocamera disponibile su questo dispositivo.";
    if (error?.name === "NotReadableError") return "La fotocamera è già usata da un'altra app o dal browser.";
    return "Impossibile avviare la fotocamera. Riprova in Safari da una pagina HTTPS.";
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Questo browser non mette a disposizione la fotocamera. Apri la pagina in Safari su iPhone.");
      return;
    }
    let stream;
    setStatus("Richiedo la fotocamera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      elements.video.srcObject = stream;
      await elements.video.play();
      state.stream = stream;
      state.frozen = false;
      elements.frozenCanvas.classList.remove("is-visible");
      elements.stageEmpty.classList.add("is-hidden");
      syncCanvases();
      clearMask();
      setAutoEnabled(true, true);
      initialiseSegmentation();
      setStageNote("Carico la maschera");
      setStatus("Fotocamera attiva. Attendi il caricamento del riconoscimento persone.");
      setControls(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      elements.video.srcObject = null;
      state.stream = null;
      setStatus(formatCameraError(error));
      setControls(false);
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.frozen = false;
    state.drawArmed = false;
    state.drawing = false;
    elements.video.srcObject = null;
    elements.frozenCanvas.classList.remove("is-visible");
    elements.stageEmpty.classList.remove("is-hidden");
    clearMask();
    setStageNote("Inquadra una persona vicina");
    setStatus("Fotocamera chiusa. Nessun fotogramma viene caricato o salvato.");
    setControls(false);
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", stopCamera);
  elements.autoMask.addEventListener("click", () => {
    if (state.auto.failed) {
      state.auto.failed = false;
      state.auto.ready = false;
      state.auto.segmenter?.close?.();
      state.auto.segmenter = null;
      setAutoEnabled(true);
      return;
    }
    setAutoEnabled(!state.auto.enabled);
  });
  elements.freezeFrame.addEventListener("click", freezeFrame);
  elements.liveFrame.addEventListener("click", resumeLive);
  elements.drawMask.addEventListener("click", () => {
    if (!state.frozen) return;
    clearMask();
    state.drawArmed = true;
    state.selection = [];
    setStageNote("Traccia il bordo della figura");
    setStatus("Disegna un contorno chiuso senza sollevare il dito. Al rilascio verrà usato come maschera.");
    setControls(true);
  });
  elements.clearMask.addEventListener("click", () => {
    clearMask();
    if (state.frozen) setStatus("Sagoma rimossa. Puoi disegnarne una nuova.");
    else setStatus("Sagoma rimossa. Il rilevamento automatico riprenderà al prossimo fotogramma.");
    setControls(Boolean(state.stream));
  });
  elements.effectButtons.forEach((button) => button.addEventListener("click", () => setEffect(button.dataset.effect)));
  elements.colorButtons.forEach((button) => button.addEventListener("click", () => setColors(button.dataset.colors)));
  elements.viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view, button)));
  elements.newColors.addEventListener("click", () => { state.palette = createPalette(); state.particles.forEach((particle, index) => { particle.color = index % state.palette.length; }); });

  [
    [elements.density, elements.densityValue, "density"],
    [elements.trail, elements.trailValue, "trail"],
    [elements.speed, elements.speedValue, "speed"],
    [elements.stability, elements.stabilityValue, "stability"],
  ].forEach(([input, output, key]) => input.addEventListener("input", () => { state[key] = Number(input.value); output.value = input.value; output.textContent = input.value; }));

  elements.overlay.addEventListener("pointerdown", (event) => {
    if (!state.drawArmed) return;
    event.preventDefault();
    state.drawing = true;
    state.selection = [normalisedPoint(event)];
    elements.overlay.setPointerCapture?.(event.pointerId);
  });
  elements.overlay.addEventListener("pointermove", (event) => {
    if (!state.drawing) return;
    const point = normalisedPoint(event);
    const previous = state.selection[state.selection.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > .008) state.selection.push(point);
  });
  const finishDrawing = (event) => {
    if (!state.drawing) return;
    state.drawing = false;
    elements.overlay.releasePointerCapture?.(event.pointerId);
    setManualMask();
  };
  elements.overlay.addEventListener("pointerup", finishDrawing);
  elements.overlay.addEventListener("pointercancel", finishDrawing);
  window.addEventListener("resize", () => window.setTimeout(syncCanvases, 90));
  window.addEventListener("pagehide", () => stopCamera());

  function animationLoop(time) {
    if (!document.hidden) {
      runSegmentation(time);
      renderFrame(time);
    }
    requestAnimationFrame(animationLoop);
  }

  syncCanvases();
  setControls(false);
  requestAnimationFrame(animationLoop);
})();

