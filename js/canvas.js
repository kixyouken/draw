import { VIEWPORT_MARGIN, WORLD_HEIGHT, WORLD_WIDTH } from "./constants.js";
import { denormalizePoint } from "./geometry.js";

export function createCanvasController({
  drawingCanvas,
  gestureCanvas,
  actionHistory,
  getBrushStyle,
}) {
  const drawCtx = drawingCanvas.getContext("2d");
  const viewport = {
    x: 36,
    y: 36,
    scale: 1,
  };

  function clampViewport() {
    const rect = gestureCanvas.getBoundingClientRect();
    const scaledWidth = WORLD_WIDTH * viewport.scale;
    const scaledHeight = WORLD_HEIGHT * viewport.scale;
    const minX = Math.min(VIEWPORT_MARGIN, rect.width - scaledWidth - VIEWPORT_MARGIN);
    const minY = Math.min(VIEWPORT_MARGIN, rect.height - scaledHeight - VIEWPORT_MARGIN);

    viewport.x = Math.min(VIEWPORT_MARGIN, Math.max(minX, viewport.x));
    viewport.y = Math.min(VIEWPORT_MARGIN, Math.max(minY, viewport.y));
  }

  function applyViewport() {
    clampViewport();
    drawingCanvas.style.width = `${WORLD_WIDTH}px`;
    drawingCanvas.style.height = `${WORLD_HEIGHT}px`;
    drawingCanvas.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  }

  function drawLine(from, to, style = {}) {
    const brush = getBrushStyle();
    const prevOp = drawCtx.globalCompositeOperation;
    try {
      const erasing = style.erasing ?? brush.erasing;
      const lineColor = erasing ? "destination-out" : style.color || brush.color;
      const lineSize = erasing ? (style.size || brush.size) * 1.8 : (style.size || brush.size);
      drawCtx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
      drawCtx.strokeStyle = lineColor;
      drawCtx.lineWidth = lineSize;
      drawCtx.beginPath();
      drawCtx.moveTo(from.x, from.y);
      drawCtx.lineTo(to.x, to.y);
      drawCtx.stroke();
    } finally {
      drawCtx.globalCompositeOperation = prevOp;
    }
  }

  function applyAction(action) {
    if (action.type === "draw_line") {
      drawLine(denormalizePoint(action.from), denormalizePoint(action.to), action);
    }
  }

  function redrawHistory() {
    drawCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    actionHistory.forEach(applyAction);
  }

  function resize(gestureCtx) {
    const rect = gestureCanvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    drawingCanvas.width = Math.max(1, Math.floor(WORLD_WIDTH * ratio));
    drawingCanvas.height = Math.max(1, Math.floor(WORLD_HEIGHT * ratio));
    drawingCanvas.style.width = `${WORLD_WIDTH}px`;
    drawingCanvas.style.height = `${WORLD_HEIGHT}px`;
    drawCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    gestureCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
    gestureCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
    gestureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    applyViewport();
    redrawHistory();
  }

  function clear() {
    drawCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  function getFlattenedDataUrl(targetWidth = WORLD_WIDTH, targetHeight = WORLD_HEIGHT) {
    const output = document.createElement("canvas");
    const outputCtx = output.getContext("2d");

    output.width = targetWidth;
    output.height = targetHeight;
    outputCtx.fillStyle = "#ffffff";
    outputCtx.fillRect(0, 0, output.width, output.height);
    outputCtx.drawImage(drawingCanvas, 0, 0, output.width, output.height);

    return output.toDataURL("image/png");
  }

  return {
    viewport,
    applyViewport,
    drawLine,
    applyAction,
    redrawHistory,
    resize,
    clear,
    getFlattenedDataUrl,
  };
}
