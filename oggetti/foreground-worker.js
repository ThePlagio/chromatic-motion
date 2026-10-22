/* U2NETP runs inside a worker; no camera pixels are sent to a server. */
"use strict";

const RUNTIME_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
const MODEL_URL = "https://huggingface.co/edgetools/u2netp/resolve/main/u2netp.onnx";
const MODEL_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
const SIZE = 320;
let session;

async function initialise() {
  importScripts(`${RUNTIME_BASE}ort.min.js`);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = RUNTIME_BASE;
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Download modello: ${response.status}`);
  const model = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", model);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== MODEL_SHA256) throw new Error("Integrità del modello non verificata");
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  postMessage({ type: "ready" });
}

async function analyse(message) {
  const rgba = new Uint8ClampedArray(message.pixels);
  const pixels = SIZE * SIZE;
  const input = new Float32Array(pixels * 3);
  let maximum = 0;
  for (let i = 0; i < pixels; i++) maximum = Math.max(maximum, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  maximum = maximum || 255;
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) input[c * pixels + i] = (rgba[i * 4 + c] / maximum - mean[c]) / std[c];
  }
  const tensor = new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]);
  const result = await session.run({ [session.inputNames[0]]: tensor });
  const values = result[session.outputNames[0]].data;
  if (values.length !== pixels) throw new Error("Formato maschera non previsto");
  let min = Infinity; let max = -Infinity;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  const mask = new Uint8Array(pixels);
  // A flat map cannot identify a subject: do not amplify noise into a foreground.
  if (Number.isFinite(min) && Number.isFinite(max) && max - min > 0.001) {
    for (let i = 0; i < pixels; i++) mask[i] = (values[i] - min) / (max - min) >= 0.5 ? 1 : 0;
  }
  postMessage({ type: "result", generation: message.generation, capturedAt: message.capturedAt, mask: mask.buffer }, [mask.buffer]);
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") await initialise();
    else if (data.type === "frame" && session) await analyse(data);
  } catch (error) {
    postMessage({ type: "error", message: String(error && error.message || error) });
  }
};
