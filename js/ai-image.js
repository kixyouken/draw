function buildPrompt(promptInput, styleSelect) {
  const prompt = (promptInput?.value || "").trim();
  const stylePrompts = {
    children: "polished cute children's book illustration, soft friendly colors, clean outlines, gentle lighting",
    watercolor: "delicate watercolor illustration, textured paper, soft gradients, elegant brush strokes",
    cartoon3d: "high quality 3D cartoon render, rounded shapes, playful materials, studio lighting",
    sticker: "clean sticker icon, bold outline, simple background, crisp vector-like edges",
    realistic: "realistic photo style, natural materials, detailed lighting, clean composition",
  };
  const selectedStyle = styleSelect?.value || "children";
  const basePrompt = prompt || "the subject shown in the sketch";

  return [
    `Use the provided sketch as a strict structure guide and redraw it as ${stylePrompts[selectedStyle]}.`,
    `Subject request: ${basePrompt}.`,
    "Preserve the exact layout, silhouette, proportions, relative positions, and camera angle from the sketch.",
    "Do not add, remove, merge, or reorder visible parts from the sketch.",
    "If the sketch has repeated visible parts, keep the exact same count and placement.",
    "Do not replace the sketched subject with a more generic or different object.",
    "Clean up messy line artifacts only after preserving the drawn structure. Keep the result wholesome, bright, and high quality.",
  ].join(" ");
}

function getResultImageFromAgnes(data) {
  const first = data?.data?.[0] || data?.images?.[0] || data?.output?.[0] || data;
  const b64 = first?.b64_json || first?.base64 || first?.image_base64 || first?.data;
  const url = first?.url || first?.image_url;

  if (typeof b64 === "string" && b64.startsWith("data:image/")) return b64;
  if (typeof b64 === "string" && b64.length > 100) return `data:image/png;base64,${b64}`;
  if (typeof url === "string") return url;
  return "";
}

function sizeToDimensions(sizeValue) {
  const [width, height] = String(sizeValue || "1024x768").split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 768,
  };
}

function formatGenerationError(error) {
  const message = error?.message || String(error || "");
  try {
    const parsed = JSON.parse(message);
    return parsed?.error?.message || parsed?.message || parsed?.error || message;
  } catch {
    return message;
  }
}

export function createAiImageController({
  elements,
  hasDrawing = () => true,
  getDrawingDataUrl,
  setStatus,
  setAiStatus,
  setGenerating = () => {},
}) {
  let latestAiImageUrl = "";
  const {
    generateButton,
    panelGenerateButton,
    downloadButton,
    styleSelect,
    sizeSelect,
    modelSelect,
    promptInput,
    resultImage,
  } = elements;

  async function generate() {
    if (!panelGenerateButton) return;

    if (!hasDrawing()) {
      setAiStatus("ai_failed", "error");
      setStatus("ai_empty_canvas", "error");
      return;
    }

    const sizeValue = sizeSelect?.value || "1024x768";
    const { width, height } = sizeToDimensions(sizeValue);

    panelGenerateButton.disabled = true;
    if (generateButton) generateButton.disabled = true;
    setGenerating(true);
    setAiStatus("ai_generating", "loading");
    setStatus("ai_generation_started", "ready");

    try {
      const statusResponse = await fetch("/api/generate-image/status");
      const status = await statusResponse.json();
      if (!status.configured) {
        throw new Error("Agnes API key is not configured");
      }

      const drawingImage = getDrawingDataUrl(width, height);
      const payload = {
        image: drawingImage,
        prompt: buildPrompt(promptInput, styleSelect),
        model: modelSelect?.value || "agnes-image-2.1-flash",
        size: sizeValue,
      };

      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.details || data?.error || response.statusText);
      }

      latestAiImageUrl = getResultImageFromAgnes(data);
      if (!latestAiImageUrl) {
        throw new Error("No image found in Agnes response");
      }

      resultImage.src = latestAiImageUrl;
      resultImage.classList.add("has-result");
      downloadButton.disabled = false;
      setAiStatus("ai_done", "ready");
      setStatus("ai_generation_done", "ready");
    } catch (error) {
      const errorMessage = formatGenerationError(error);
      console.error(error);
      setAiStatus("ai_failed", "error");
      setStatus(errorMessage || "ai_generation_failed", "error");
    } finally {
      setGenerating(false);
      panelGenerateButton.disabled = false;
      if (generateButton) generateButton.disabled = false;
    }
  }

  function download() {
    if (!latestAiImageUrl) return;
    const link = document.createElement("a");
    link.download = `agnes-ai-image-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = latestAiImageUrl;
    link.click();
  }

  function bindEvents() {
    generateButton?.addEventListener("click", generate);
    panelGenerateButton?.addEventListener("click", generate);
    downloadButton?.addEventListener("click", download);
  }

  return { bindEvents, generate, download };
}
