(() => {
  "use strict";

  const BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
  const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
  const PERSON = 1;
  const INTERVAL = 180;

  const video = document.querySelector("#camera");
  const overlay = document.querySelector("#mask");
  const stage = document.querySelector("#stage");
  const empty = document.querySelector("#empty");
  const badge = document.querySelector("#badge");
  const status = document.querySelector("#status");
  const metrics = document.querySelector("#metrics");
  const start = document.querySelector("#start");
  const stop = document.querySelector("#stop");
  const retry = document.querySelector("#retry");
  const context = overlay.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskContext = maskCanvas.getContext("2d");

  const state = { stream: null, segmenter: null, loading: false, ready: false, lastAt: 0, frames: 0, pixels: 0, hasMask: false };

  function setStatus(message) { status.textContent = message; }
  function setBadge(message, ok = false) { badge.textContent = message; badge.classList.toggle("ok", ok); }
  function updateMetrics() { metrics.textContent = `Fotogrammi analizzati: ${state.frames} · Pixel persona: ${state.pixels} · Maschera: ${state.hasMask ? "VERDE ATTIVA" : "assente"}`; }
  function fit() {
    const box = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
    return { width, height };
  }
  function placement(sourceWidth, sourceHeight, width, height) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
  }
  function render() {
    const { width, height } = fit();
    context.clearRect(0, 0, width, height);
    if (!state.hasMask || !maskCanvas.width) return;
    const area = placement(maskCanvas.width, maskCanvas.height, width, height);
    context.globalAlpha = .64;
    context.drawImage(maskCanvas, area.x, area.y, area.width, area.height);
    context.globalAlpha = 1;
  }
  function consume(result) {
    const mask = result.categoryMask;
    if (!mask) return;
    try {
      const values = mask.getAsUint8Array();
      const width = mask.width;
      const height = mask.height;
      if (maskCanvas.width !== width || maskCanvas.height !== height) { maskCanvas.width = width; maskCanvas.height = height; }
      const image = maskContext.createImageData(width, height);
      let pixels = 0;
      for (let index = 0, offset = 0; index < values.length; index += 1, offset += 4) {
        if (values[index] !== PERSON) continue;
        image.data[offset] = 45;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 120;
        image.data[offset + 3] = 255;
        pixels += 1;
      }
      maskContext.putImageData(image, 0, 0);
      state.frames += 1;
      state.pixels = pixels;
      state.hasMask = pixels > 8;
      setBadge(state.hasMask ? "MASCHERA VERDE ATTIVA" : "CERCO UNA PERSONA", state.hasMask);
      setStatus(state.hasMask ? "Persona ricevuta dal modello: il verde qui sopra è la maschera reale." : "Il modello sta analizzando, ma in questo fotogramma non trova una persona.");
      updateMetrics();
      render();
    } catch (error) {
      setBadge("ERRORE MASCHERA");
      setStatus("Il modello si è caricato ma non riesce a leggere il risultato. Tocca “Ricarica modello”.");
      console.warn(error);
    } finally {
      mask.close?.();
      result.confidenceMasks?.forEach((item) => item.close?.());
    }
  }
  async function loadModel(force = false) {
    if (state.loading) return;
    if (force) { state.segmenter?.close?.(); state.segmenter = null; state.ready = false; }
    if (state.ready) return;
    state.loading = true;
    retry.disabled = true;
    setBadge("CARICO IL MODELLO");
    setStatus("Carico il modello persone sul telefono…");
    try {
      const vision = await import(BUNDLE);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      state.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: "VIDEO", outputCategoryMask: true, outputConfidenceMasks: false });
      state.ready = true;
      setBadge("MODELLO PRONTO");
      setStatus("Modello pronto. Inquadra una persona: il verde deve comparire direttamente sopra il video.");
    } catch (error) {
      state.ready = false;
      setBadge("MODELLO NON CARICATO");
      setStatus("Non riesco a caricare il modello. Verifica la connessione e tocca “Ricarica modello”.");
      console.warn(error);
    } finally {
      state.loading = false;
      retry.disabled = !state.stream;
    }
  }
  function loop(time) {
    if (state.ready && state.stream && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && time - state.lastAt >= INTERVAL) {
      state.lastAt = time;
      try { state.segmenter.segmentForVideo(video, time, consume); }
      catch (error) { setBadge("RILEVAMENTO FERMO"); setStatus("Il rilevamento si è fermato. Tocca “Ricarica modello”."); console.warn(error); }
    }
    requestAnimationFrame(loop);
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("Questa pagina deve essere aperta in Safari su iPhone."); return; }
    setStatus("Richiedo la fotocamera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = stream;
      await video.play();
      state.stream = stream;
      state.frames = 0; state.pixels = 0; state.hasMask = false; updateMetrics(); render();
      empty.classList.add("hidden");
      start.disabled = true; stop.disabled = false; retry.disabled = false;
      await loadModel();
    } catch (error) {
      setStatus(error?.name === "NotAllowedError" ? "Accesso alla fotocamera negato: autorizzalo nelle impostazioni di Safari." : "Non riesco ad aprire la fotocamera. Riprova in Safari da questa pagina HTTPS.");
    }
  }
  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null; state.hasMask = false; state.pixels = 0; render(); updateMetrics();
    empty.classList.remove("hidden");
    start.disabled = false; stop.disabled = true; retry.disabled = true;
    setBadge(state.ready ? "MODELLO PRONTO" : "MODELLO NON CARICATO", state.ready);
    setStatus("Fotocamera chiusa.");
  }
  start.addEventListener("click", startCamera);
  stop.addEventListener("click", stopCamera);
  retry.addEventListener("click", () => loadModel(true));
  window.addEventListener("resize", render);
  window.addEventListener("pagehide", stopCamera);
  updateMetrics();
  requestAnimationFrame(loop);
})();

