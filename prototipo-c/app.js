(() => {
  "use strict";

  // Questa è la stessa combinazione verificata nel Test 02 su iPhone.
  const BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
  const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
  const MAX_PARTICLES = 110;

  const elements = {
    stage: document.querySelector("#stage"),
    video: document.querySelector("#camera"),
    art: document.querySelector("#art"),
    empty: document.querySelector("#empty"),
    note: document.querySelector("#stage-note"),
    status: document.querySelector("#status"),
    telemetry: document.querySelector("#telemetry"),
    cameraDetail: document.querySelector("#camera-detail"),
    rear: document.querySelector("#rear"),
    front: document.querySelector("#front"),
    stop: document.querySelector("#stop"),
    reload: document.querySelector("#reload"),
    density: document.querySelector("#density"),
    size: document.querySelector("#size"),
    speed: document.querySelector("#speed"),
    reactivity: document.querySelector("#reactivity"),
    edge: document.querySelector("#edge"),
    stability: document.querySelector("#stability"),
    newPalette: document.querySelector("#new-palette"),
    effectButtons: [...document.querySelectorAll("[data-effect]")],
    paletteButtons: [...document.querySelectorAll("[data-palette]")],
    viewButtons: [...document.querySelectorAll("[data-view]")],
    outputs: {
      density: document.querySelector("#density-out"),
      size: document.querySelector("#size-out"),
      speed: document.querySelector("#speed-out"),
      reactivity: document.querySelector("#reactivity-out"),
      edge: document.querySelector("#edge-out"),
      stability: document.querySelector("#stability-out"),
    },
  };

  const artContext = elements.art.getContext("2d");
  const modelMask = document.createElement("canvas");
  const modelMaskContext = modelMask.getContext("2d", { willReadFrequently: true });
  const stageMask = document.createElement("canvas");
  const stageMaskContext = stageMask.getContext("2d", { willReadFrequently: true });
  const effectCanvas = document.createElement("canvas");
  const effectContext = effectCanvas.getContext("2d");

  const state = {
    stream: null,
    segmenter: null,
    modelLoading: false,
    modelReady: false,
    labels: [],
    personIndex: 1,
    lastInferenceAt: 0,
    lastFrameAt: 0,
    frames: 0,
    maskPixels: 0,
    hasMask: false,
    maskData: null,
    maskSmooth: new Float32Array(0),
    previousMaskSize: 0,
    cameraMode: null,
    width: 0,
    height: 0,
    effect: "flow",
    paletteMode: "mono",
    view: "camera",
    palette: makePalette(),
    particles: Array.from({ length: MAX_PARTICLES }, makeParticle),
  };

  function numberValue(element) { return Number(element.value); }
  function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
  function setStatus(message) { elements.status.textContent = message; }
  function setNote(message) { elements.note.textContent = message; }

  function makePalette() {
    const start = Math.floor(Math.random() * 360);
    return [0, 34, 95, 158, 211, 272, 325].map((shift, index) => `hsl(${(start + shift) % 360} ${74 + (index % 2) * 15}% ${55 + (index % 3) * 8}%)`);
  }

  function makeParticle() {
    return {
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      drift: .58 + Math.random() * 1.28,
      width: .7 + Math.random() * 1.9,
      color: Math.floor(Math.random() * 7),
      age: 999,
    };
  }

  function updateOutputs() {
    elements.outputs.density.textContent = elements.density.value;
    elements.outputs.size.textContent = elements.size.value;
    elements.outputs.speed.textContent = elements.speed.value;
    const reactivity = numberValue(elements.reactivity);
    const label = reactivity <= 110 ? "Rapida" : reactivity >= 240 ? "Morbida" : "Normale";
    elements.outputs.reactivity.textContent = `${label} · ${reactivity} ms`;
    elements.outputs.edge.textContent = `${elements.edge.value}%`;
    elements.outputs.stability.textContent = `${elements.stability.value}%`;
  }

  function updateTelemetry() {
    elements.telemetry.textContent = `Maschera: ${state.hasMask ? "ATTIVA" : "assente"} · Pixel persona: ${state.maskPixels} · Fotogrammi: ${state.frames}`;
  }

  function updateCameraDetail(stream) {
    const settings = stream?.getVideoTracks?.()[0]?.getSettings?.() || {};
    const mode = settings.facingMode === "user" ? "frontale" : settings.facingMode === "environment" ? "posteriore" : "non dichiarata";
    const resolution = settings.width && settings.height ? ` · ${settings.width}×${settings.height}` : "";
    const label = state.labels[state.personIndex] || state.personIndex;
    elements.cameraDetail.textContent = `Fotocamera: ${stream ? mode : "non attiva"}${stream ? resolution : ""} · Modello persone: versione fissa 1 · Etichetta: ${label}`;
  }

  function updateButtons() {
    const running = Boolean(state.stream);
    const busy = state.modelLoading;
    elements.rear.disabled = running || busy;
    elements.front.disabled = running || busy;
    elements.stop.disabled = !running;
    elements.reload.disabled = !running || busy;
  }

  function fitCanvases() {
    const rect = elements.stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const changed = width !== state.width || height !== state.height;
    if (!changed) return false;
    state.width = width;
    state.height = height;
    [elements.art, stageMask, effectCanvas].forEach((canvas) => {
      canvas.width = width;
      canvas.height = height;
    });
    state.maskData = null;
    if (modelMask.width) drawStageMask();
    return true;
  }

  function coverPlacement(sourceWidth, sourceHeight) {
    const scale = Math.max(state.width / sourceWidth, state.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return { x: (state.width - width) / 2, y: (state.height - height) / 2, width, height };
  }

  function drawStageMask() {
    if (!modelMask.width || !state.width) return;
    stageMaskContext.clearRect(0, 0, state.width, state.height);
    const placement = coverPlacement(modelMask.width, modelMask.height);
    stageMaskContext.imageSmoothingEnabled = true;
    stageMaskContext.imageSmoothingQuality = "high";
    stageMaskContext.drawImage(modelMask, placement.x, placement.y, placement.width, placement.height);
    state.maskData = stageMaskContext.getImageData(0, 0, state.width, state.height).data;
  }

  function pointIsInside(x, y) {
    if (!state.maskData || !state.hasMask) return false;
    const pixelX = clamp(Math.floor(x * state.width), 0, state.width - 1);
    const pixelY = clamp(Math.floor(y * state.height), 0, state.height - 1);
    return state.maskData[(pixelY * state.width + pixelX) * 4 + 3] > 120;
  }

  function respawn(particle) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      particle.x = Math.random();
      particle.y = Math.random();
      if (pointIsInside(particle.x, particle.y)) break;
    }
    particle.phase = Math.random() * Math.PI * 2;
    particle.drift = .58 + Math.random() * 1.28;
    particle.width = .7 + Math.random() * 1.9;
    particle.color = Math.floor(Math.random() * state.palette.length);
    particle.age = 0;
  }

  function fieldAngle(x, y, time, phase) {
    return Math.sin(y * 8.3 + time * .0005 + phase) * 1.35
      + Math.cos(x * 7.1 - time * .00036 - phase) * 1.05
      + Math.sin((x + y) * 4.8 + time * .00022) * .72;
  }

  function strokeColor(particle) {
    if (state.paletteMode === "mono") {
      return ["rgba(255,255,251,.98)", "rgba(221,225,235,.86)", "rgba(174,180,197,.75)", "rgba(255,255,255,.92)"][particle.color % 4];
    }
    return state.palette[particle.color % state.palette.length];
  }

  function drawFlow(particle, time, step, length) {
    const startX = particle.x * state.width;
    const startY = particle.y * state.height;
    const points = 15;
    effectContext.beginPath();
    effectContext.moveTo(startX, startY);
    for (let index = 1; index <= points; index += 1) {
      const ratio = index / points;
      const backwards = fieldAngle(particle.x, particle.y, time - index * 36, particle.phase) + Math.PI;
      const wobble = Math.sin(index * .8 + particle.phase) * length * .045;
      effectContext.lineTo(startX + Math.cos(backwards) * length * ratio + wobble, startY + Math.sin(backwards) * length * ratio - wobble);
    }
    effectContext.stroke();
    const angle = fieldAngle(particle.x, particle.y, time, particle.phase);
    particle.x += Math.cos(angle) * step * particle.drift;
    particle.y += Math.sin(angle) * step * particle.drift;
  }

  function drawGesture(particle, time, step, length) {
    const centerX = particle.x * state.width;
    const centerY = particle.y * state.height;
    const angle = fieldAngle(particle.x, particle.y, time, particle.phase);
    const pieces = 7;
    effectContext.beginPath();
    for (let index = 0; index <= pieces; index += 1) {
      const progress = index / pieces - .5;
      const sideways = Math.sin(index * 1.85 + particle.phase + time * .0015) * length * .18;
      const x = centerX + Math.cos(angle) * length * progress + Math.cos(angle + Math.PI / 2) * sideways;
      const y = centerY + Math.sin(angle) * length * progress + Math.sin(angle + Math.PI / 2) * sideways;
      if (index === 0) effectContext.moveTo(x, y); else effectContext.lineTo(x, y);
    }
    effectContext.stroke();
    particle.x += Math.cos(angle) * step * particle.drift * .76;
    particle.y += Math.sin(angle) * step * particle.drift * .76;
  }

  function drawSpiral(particle, time, step, length) {
    const centerX = particle.x * state.width;
    const centerY = particle.y * state.height;
    const points = 26;
    const radius = Math.max(10, length * .44);
    effectContext.beginPath();
    for (let index = 0; index <= points; index += 1) {
      const ratio = index / points;
      const angle = particle.phase + time * .00125 * particle.drift + ratio * Math.PI * 2.5;
      const x = centerX + Math.cos(angle) * radius * ratio;
      const y = centerY + Math.sin(angle) * radius * ratio * .72;
      if (index === 0) effectContext.moveTo(x, y); else effectContext.lineTo(x, y);
    }
    effectContext.stroke();
    const angle = fieldAngle(particle.x, particle.y, time, particle.phase + 1.2);
    particle.x += Math.cos(angle) * step * particle.drift * .66;
    particle.y += Math.sin(angle) * step * particle.drift * .66;
  }

  function renderEffect(time, delta) {
    fitCanvases();
    effectContext.clearRect(0, 0, state.width, state.height);
    if (!state.hasMask) return;
    const requested = numberValue(elements.density);
    const length = numberValue(elements.size);
    const movement = numberValue(elements.speed) === 0 ? 0 : (.0002 + numberValue(elements.speed) * .00013) * Math.min(delta, 42);
    effectContext.lineCap = "round";
    effectContext.lineJoin = "round";
    for (let index = 0; index < requested; index += 1) {
      const particle = state.particles[index];
      if (particle.age > 12 && (!pointIsInside(particle.x, particle.y) || particle.x < -.1 || particle.y < -.1 || particle.x > 1.1 || particle.y > 1.1)) respawn(particle);
      particle.age += delta;
      effectContext.strokeStyle = strokeColor(particle);
      effectContext.globalAlpha = .58 + (index % 4) * .1;
      effectContext.lineWidth = particle.width * (1 + length / 120);
      if (state.effect === "spiral") drawSpiral(particle, time, movement, length);
      else if (state.effect === "gesture") drawGesture(particle, time, movement, length);
      else drawFlow(particle, time, movement, length);
    }
    effectContext.globalAlpha = 1;
    effectContext.globalCompositeOperation = "destination-in";
    effectContext.drawImage(stageMask, 0, 0);
    effectContext.globalCompositeOperation = "source-over";
  }

  function renderArt(time, delta) {
    renderEffect(time, delta);
    artContext.clearRect(0, 0, state.width, state.height);
    if (!state.hasMask) return;
    if (state.view === "mask") {
      artContext.drawImage(stageMask, 0, 0);
      artContext.globalCompositeOperation = "source-in";
      artContext.fillStyle = "rgba(47,255,128,.66)";
      artContext.fillRect(0, 0, state.width, state.height);
      artContext.globalCompositeOperation = "source-over";
      return;
    }
    artContext.drawImage(effectCanvas, 0, 0);
  }

  function refreshView() {
    elements.stage.classList.toggle("lines-only", state.view === "lines");
    elements.stage.classList.toggle("mask-view", state.view === "mask");
  }

  function clearMask() {
    state.hasMask = false;
    state.maskPixels = 0;
    state.maskData = null;
    modelMaskContext.clearRect(0, 0, modelMask.width, modelMask.height);
    stageMaskContext.clearRect(0, 0, stageMask.width, stageMask.height);
    updateTelemetry();
  }

  function consumeSegmentation(result) {
    const mask = result.categoryMask;
    if (!mask) return;
    try {
      const values = mask.getAsUint8Array();
      const confidence = result.confidenceMasks?.[state.personIndex]?.getAsFloat32Array?.();
      const width = mask.width;
      const height = mask.height;
      const count = values.length;
      if (modelMask.width !== width || modelMask.height !== height || state.previousMaskSize !== count) {
        modelMask.width = width;
        modelMask.height = height;
        state.maskSmooth = new Float32Array(count);
        state.previousMaskSize = count;
      }
      const threshold = numberValue(elements.edge) / 100;
      const stability = numberValue(elements.stability) / 100;
      const pixels = modelMaskContext.createImageData(width, height);
      let personPixels = 0;
      for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
        const raw = confidence?.[index] ?? (values[index] === state.personIndex ? 1 : 0);
        const smoothed = state.frames === 0 ? raw : state.maskSmooth[index] * stability + raw * (1 - stability);
        state.maskSmooth[index] = smoothed;
        if (smoothed < threshold) continue;
        pixels.data[offset + 3] = 255;
        personPixels += 1;
      }
      modelMaskContext.putImageData(pixels, 0, 0);
      drawStageMask();
      state.frames += 1;
      state.maskPixels = personPixels;
      state.hasMask = personPixels > Math.max(8, count * .00045);
      setNote(state.hasMask ? "Maschera persone attiva" : "Cerco una persona");
      setStatus(state.hasMask ? "La grafica si muove dentro la persona. Prova “Maschera” per controllare il bordo." : "Inquadra una persona: la maschera apparirà appena il modello la trova.");
      updateTelemetry();
    } catch (error) {
      clearMask();
      setNote("Errore maschera");
      setStatus("Non riesco a leggere la maschera. Tocca “Ricarica modello”.");
      console.warn(error);
    } finally {
      mask.close?.();
      result.confidenceMasks?.forEach((item) => item.close?.());
    }
  }

  async function loadModel(force = false) {
    if (state.modelLoading) return;
    if (force) {
      state.segmenter?.close?.();
      state.segmenter = null;
      state.modelReady = false;
    }
    if (state.modelReady) return;
    state.modelLoading = true;
    updateButtons();
    setNote("Carico il modello persone");
    setStatus("Carico il rilevamento persone sul telefono…");
    try {
      const vision = await import(BUNDLE);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      state.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      });
      state.labels = state.segmenter.getLabels?.() || [];
      const match = state.labels.findIndex((label) => /person|foreground|selfie/i.test(label));
      state.personIndex = match >= 0 ? match : 1;
      state.modelReady = true;
      updateCameraDetail(state.stream);
      setNote("Modello pronto");
      setStatus("Modello pronto. Inquadra una persona per creare la maschera.");
    } catch (error) {
      state.modelReady = false;
      setNote("Modello non caricato");
      setStatus("Il modello non si è caricato. Controlla la rete e tocca “Ricarica modello”.");
      console.warn(error);
    } finally {
      state.modelLoading = false;
      updateButtons();
    }
  }

  function cameraError(error) {
    if (error?.name === "NotAllowedError") return "Accesso alla fotocamera negato. Autorizzalo nelle impostazioni di Safari e riprova.";
    if (error?.name === "NotReadableError") return "La fotocamera è già utilizzata da un'altra app o scheda.";
    return "Non riesco ad aprire la fotocamera. Apri questa pagina HTTPS in Safari e riprova.";
  }

  async function startCamera(facingMode) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Questa pagina richiede Safari su iPhone e un collegamento HTTPS.");
      return;
    }
    if (state.stream) stopCamera();
    setStatus("Richiedo la fotocamera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      elements.video.srcObject = stream;
      await elements.video.play();
      state.stream = stream;
      state.cameraMode = facingMode;
      state.frames = 0;
      state.lastInferenceAt = 0;
      state.maskSmooth = new Float32Array(0);
      state.previousMaskSize = 0;
      clearMask();
      fitCanvases();
      elements.empty.classList.add("hidden");
      updateCameraDetail(stream);
      updateButtons();
      await loadModel();
    } catch (error) {
      state.stream = null;
      elements.video.srcObject = null;
      setStatus(cameraError(error));
      updateButtons();
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    elements.video.srcObject = null;
    clearMask();
    elements.empty.classList.remove("hidden");
    setNote(state.modelReady ? "Modello pronto" : "Pronto per la fotocamera");
    setStatus("Fotocamera chiusa. Non viene salvato alcun video.");
    updateCameraDetail(null);
    updateButtons();
  }

  function runSegmentation(time) {
    if (!state.modelReady || !state.stream || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (time - state.lastInferenceAt < numberValue(elements.reactivity)) return;
    state.lastInferenceAt = time;
    try {
      state.segmenter.segmentForVideo(elements.video, time, consumeSegmentation);
    } catch (error) {
      setNote("Rilevamento fermo");
      setStatus("Il rilevamento si è interrotto. Tocca “Ricarica modello”.");
      console.warn(error);
    }
  }

  function setSelected(buttons, current) {
    buttons.forEach((button) => {
      const selected = Object.values(button.dataset).includes(current);
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  elements.rear.addEventListener("click", () => startCamera("environment"));
  elements.front.addEventListener("click", () => startCamera("user"));
  elements.stop.addEventListener("click", stopCamera);
  elements.reload.addEventListener("click", () => loadModel(true));
  elements.effectButtons.forEach((button) => button.addEventListener("click", () => { state.effect = button.dataset.effect; setSelected(elements.effectButtons, state.effect); }));
  elements.paletteButtons.forEach((button) => button.addEventListener("click", () => { state.paletteMode = button.dataset.palette; setSelected(elements.paletteButtons, state.paletteMode); }));
  elements.viewButtons.forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; setSelected(elements.viewButtons, state.view); refreshView(); }));
  elements.newPalette.addEventListener("click", () => { state.palette = makePalette(); state.particles.forEach((particle) => { particle.color = Math.floor(Math.random() * state.palette.length); }); });
  [elements.density, elements.size, elements.speed, elements.reactivity, elements.edge, elements.stability].forEach((input) => input.addEventListener("input", updateOutputs));
  window.addEventListener("resize", () => { fitCanvases(); });
  window.addEventListener("pagehide", stopCamera);

  function animationLoop(time) {
    const delta = state.lastFrameAt ? Math.min(50, time - state.lastFrameAt) : 16;
    state.lastFrameAt = time;
    if (!document.hidden) {
      runSegmentation(time);
      renderArt(time, delta);
    }
    requestAnimationFrame(animationLoop);
  }

  updateOutputs();
  updateButtons();
  updateTelemetry();
  refreshView();
  fitCanvases();
  requestAnimationFrame(animationLoop);
})();

