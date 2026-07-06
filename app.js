import { HOLD_TO_SELECT_MS, PINCH_THRESHOLD } from "./js/constants.js";
import {
  distance,
  isInsideWorld,
  isOpenPalm,
  landmarkToPoint,
  normalizePoint,
  normalizedDistance,
  screenToWorld,
} from "./js/geometry.js";
import { createAiImageController } from "./js/ai-image.js";
import { createCanvasController } from "./js/canvas.js";
import { createGestureOverlay } from "./js/gesture-overlay.js";
import { createRoomController } from "./js/room.js";

const t = window.t;
const setLanguage = window.setLanguage;
const getLanguage = window.getLanguage;

  const video = document.querySelector("#cameraView");
  const drawingCanvas = document.querySelector("#drawingCanvas");
  const gestureCanvas = document.querySelector("#gestureCanvas");
  const swatches = [...document.querySelectorAll(".toolbar .swatch")];
  const customColor = document.querySelector("#customColor");
  const sizeOptions = [...document.querySelectorAll(".size-option")];
  const cameraButton = document.querySelector("#cameraButton");
  const eraserButton = document.querySelector("#eraserButton");
  const undoButton = document.querySelector("#undoButton");
  const clearButton = document.querySelector("#clearButton");
  const saveButton = document.querySelector("#saveButton");
  const generateButton = document.querySelector("#generateButton");
  const aiGenerateButton = document.querySelector("#aiGenerateButton");
  const aiDownloadButton = document.querySelector("#aiDownloadButton");
  const aiStyleSelect = document.querySelector("#aiStyleSelect");
  const aiSizeSelect = document.querySelector("#aiSizeSelect");
  const aiModelSelect = document.querySelector("#aiModelSelect");
  const aiPromptInput = document.querySelector("#aiPromptInput");
  const aiResultImage = document.querySelector("#aiResultImage");
  const aiResultWrap = document.querySelector(".ai-result-wrap");
  const aiResultLoading = document.querySelector("#aiResultLoading");
  const aiStatus = document.querySelector("#aiStatus");
  const gestureToolbar = document.querySelector(".gesture-toolbar");
  const gestureAiStyleButton = document.querySelector("#gestureAiStyleButton");
  const gestureAiSizeButton = document.querySelector("#gestureAiSizeButton");
  const gestureAiModelButton = document.querySelector("#gestureAiModelButton");
  const gestureAiGenerateButton = document.querySelector("#gestureAiGenerateButton");
  const statusDot = document.querySelector("#statusDot");
  const statusText = document.querySelector("#statusText");
  const roomInput = document.getElementById("roomInput");
  const nameInput = document.getElementById("nameInput");
  const joinRoomButton = document.getElementById("joinRoomButton");
  const membersList = document.getElementById("membersList");
  const langZhBtn = document.getElementById("langZhBtn");
  const langJaBtn = document.getElementById("langJaBtn");

  let color = "#111827";
  let size = 8;
  let erasing = false;
  let camera = null;
  let hands = null;
  let lastPoint = null;
  let lastPanPoint = null;
  let pinchWasDown = false;
  let hoveredGestureTool = null;
  let hoverStartedAt = 0;
  let hoverActivated = false;
  let aiGenerating = false;

  const actionHistory = [];
  let roomController = null;
  const canvas = createCanvasController({
    drawingCanvas,
    gestureCanvas,
    actionHistory,
    getBrushStyle: () => ({ color, size, erasing }),
  });
  const gestureOverlay = createGestureOverlay({
    gestureCanvas,
    getBrushSize: () => size,
  });
  const { viewport } = canvas;

  // --- Canvas actions ---

  function clearDrawing() {
    canvas.clear();
    actionHistory.length = 0;
    roomController?.sendAction({ type: "clear_canvas" });
    resetDrawingGestureState();
  }

  function saveDrawing() {
    const link = document.createElement("a");
    link.download = `gesture-drawing-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.getFlattenedDataUrl();
    link.click();
  }

  function undoDrawing() {
    if (actionHistory.length) {
      actionHistory.pop();
      canvas.redrawHistory();
      roomController?.sendAction({ type: "undo" });
    }
  }

  // --- UI helpers ---

  function setStatus(messageOrKey, state = "") {
    statusText.textContent = t(messageOrKey);
    statusDot.className = "status-dot" + (state ? " " + state : "");
  }

  function setAiStatus(messageOrKey, state = "") {
    if (!aiStatus) return;
    aiStatus.textContent = t(messageOrKey);
    aiStatus.className = "ai-status" + (state ? " " + state : "");
  }

  roomController = createRoomController({
    actionHistory,
    canvas,
    membersList,
    roomInput,
    nameInput,
    joinRoomButton,
    setStatus,
    t,
  });
  roomController.bindEvents();

  function setHoveredGestureTool(tool) {
    if (hoveredGestureTool === tool) return;

    if (hoveredGestureTool) {
      hoveredGestureTool.classList.remove("gesture-hover");
      hoveredGestureTool.style.setProperty("--hold", "0%");
    }

    hoveredGestureTool = tool;
    hoverStartedAt = performance.now();
    hoverActivated = false;

    if (hoveredGestureTool) {
      hoveredGestureTool.classList.add("gesture-hover");
    }
  }

  function resetGestureSelection() {
    setHoveredGestureTool(null);
    hoverActivated = false;
    resetDrawingGestureState();
  }

  function resetDrawingGestureState() {
    pinchWasDown = false;
    lastPoint = null;
    lastPanPoint = null;
  }

  function updateHoldProgress() {
    if (!hoveredGestureTool) return false;

    const elapsed = performance.now() - hoverStartedAt;
    const progress = Math.min(1, elapsed / HOLD_TO_SELECT_MS);
    hoveredGestureTool.style.setProperty("--hold", `${Math.round(progress * 100)}%`);

    if (progress >= 1 && !hoverActivated) {
      hoverActivated = true;
      activateGestureTool(hoveredGestureTool);
      hoveredGestureTool.classList.remove("selected-flash");
      void hoveredGestureTool.offsetWidth;
      hoveredGestureTool.classList.add("selected-flash");
      setTimeout(() => hoveredGestureTool?.classList.remove("selected-flash"), 360);
      return true;
    }

    return false;
  }

  function findGestureToolAt(point) {
    const rect = gestureCanvas.getBoundingClientRect();
    const screenX = rect.left + point.x;
    const screenY = rect.top + point.y;
    const element = document.elementFromPoint(screenX, screenY);
    return element?.closest?.(".gesture-tool") || null;
  }

  function hasStableDrawingLandmarks(landmarks) {
    const edgeMargin = 0.04;
    const keyPoints = [0, 4, 5, 8, 9, 12, 17, 20];
    return keyPoints.every((index) => {
      const landmark = landmarks[index];
      return (
        landmark.x > edgeMargin &&
        landmark.x < 1 - edgeMargin &&
        landmark.y > edgeMargin &&
        landmark.y < 1 - edgeMargin
      );
    });
  }

  // --- Tool state management ---

  function updateActiveColor(nextColor) {
    color = nextColor;
    erasing = false;
    eraserButton.setAttribute("aria-pressed", "false");

    document.querySelectorAll(".gesture-tool[data-gesture-action='eraser']").forEach((button) => {
      button.classList.remove("active");
    });
    swatches.forEach((button) => {
      button.classList.toggle("active", button.dataset.color === nextColor);
    });
    document.querySelectorAll(".gesture-tool[data-gesture-action='color']").forEach((button) => {
      button.classList.toggle("active", button.dataset.color === nextColor);
    });
    customColor.parentElement.classList.remove("active");
    customColor.value = nextColor;
  }

  function updateBrushSize(nextSize) {
    size = Number(nextSize);
    sizeOptions.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.size) === size);
    });
    document.querySelectorAll(".gesture-tool[data-gesture-action='size']").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.size) === size);
    });
  }

  function toggleEraser() {
    erasing = !erasing;
    eraserButton.setAttribute("aria-pressed", String(erasing));
    document.querySelectorAll(".gesture-tool[data-gesture-action='eraser']").forEach((button) => {
      button.classList.toggle("active", erasing);
    });

    if (erasing) {
      swatches.forEach((button) => button.classList.remove("active"));
      document.querySelectorAll(".gesture-tool[data-gesture-action='color']").forEach((button) => {
        button.classList.remove("active");
      });
      customColor.parentElement.classList.remove("active");
    } else {
      updateActiveColor(color);
    }
  }

  function selectedOptionLabel(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || select?.value || "";
  }

  function cycleSelect(select) {
    if (!select?.options?.length) return "";
    select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return selectedOptionLabel(select);
  }

  function updateGestureAiControls() {
    if (gestureAiStyleButton) gestureAiStyleButton.textContent = `风格: ${selectedOptionLabel(aiStyleSelect)}`;
    if (gestureAiSizeButton) gestureAiSizeButton.textContent = `尺寸: ${selectedOptionLabel(aiSizeSelect)}`;
    if (gestureAiModelButton) gestureAiModelButton.textContent = `模型: ${selectedOptionLabel(aiModelSelect)}`;
    if (gestureAiGenerateButton) gestureAiGenerateButton.disabled = aiGenerating;
  }

  function activateGestureTool(tool) {
    const action = tool.dataset.gestureAction;

    if (action === "color") {
      updateActiveColor(tool.dataset.color);
      setStatus("color_selected", "ready");
    }
    if (action === "size") {
      updateBrushSize(tool.dataset.size);
      setStatus(Number(tool.dataset.size) > 10 ? "line_thick" : "line_thin", "ready");
    }
    if (action === "eraser") {
      toggleEraser();
      setStatus(erasing ? "eraser_mode" : "brush_mode", "ready");
    }
    if (action === "undo") {
      undoDrawing();
      resetDrawingGestureState();
      setStatus("undo_done", "ready");
    }
    if (action === "clear") {
      clearDrawing();
      setStatus("canvas_cleared", "ready");
    }
    if (action === "save") {
      saveDrawing();
      resetDrawingGestureState();
      setStatus("image_saved", "ready");
    }
    if (action === "ai-style") {
      const label = cycleSelect(aiStyleSelect);
      updateGestureAiControls();
      setStatus(`AI 风格: ${label}`, "ready");
    }
    if (action === "ai-size") {
      const label = cycleSelect(aiSizeSelect);
      updateGestureAiControls();
      setStatus(`AI 尺寸: ${label}`, "ready");
    }
    if (action === "ai-model") {
      const label = cycleSelect(aiModelSelect);
      updateGestureAiControls();
      setStatus(`AI 模型: ${label}`, "ready");
    }
    if (action === "ai-generate") {
      if (aiGenerating) {
        setStatus("ai_generating", "ready");
        return;
      }
      aiImageController.generate();
    }
  }

  // --- Gesture overlay ---

  // --- Hand tracking ---

  function handleHandsResult(results) {
    const landmarks = results.multiHandLandmarks?.[0];
    const rect = gestureCanvas.getBoundingClientRect();

    if (!landmarks) {
      pinchWasDown = false;
      lastPoint = null;
      lastPanPoint = null;
      setHoveredGestureTool(null);
      gestureToolbar?.classList.remove("is-drawing");
      gestureOverlay.draw(null, null, null);
      setStatus("put_hand", "ready");
      return;
    }

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const indexPoint = landmarkToPoint(indexTip, rect);
    const worldPoint = screenToWorld(indexPoint, viewport);
    const pinchDistance = normalizedDistance(indexTip, thumbTip);
    const isPinching = pinchDistance < PINCH_THRESHOLD;
    const openPalm = isOpenPalm(landmarks);
    const canDraw = isPinching && !openPalm && hasStableDrawingLandmarks(landmarks);
    const isPanning = openPalm;
    const canUseGestureTools = !isPinching && !isPanning;
    const tool = canUseGestureTools ? findGestureToolAt(indexPoint) : null;

    gestureToolbar?.classList.toggle("is-drawing", isPinching && !openPalm);
    if (!canUseGestureTools) {
      setHoveredGestureTool(null);
    }

    setHoveredGestureTool(tool);
    gestureOverlay.draw(landmarks, indexPoint, {
      isPinching: isPinching && !openPalm,
      isPanning,
      tool,
    });

    if (tool) {
      lastPoint = null;
      lastPanPoint = null;
      pinchWasDown = false;
      if (!updateHoldProgress()) {
        setStatus(`${t("select_hover")}：${tool.textContent || tool.getAttribute("aria-label")}`, "ready");
      }
      return;
    }

    if (isPanning) {
      if (lastPanPoint) {
        viewport.x += indexPoint.x - lastPanPoint.x;
        viewport.y += indexPoint.y - lastPanPoint.y;
        canvas.applyViewport();
      }
      lastPanPoint = indexPoint;
      lastPoint = null;
      pinchWasDown = false;
      setStatus("panning_canvas", "ready");
      return;
    }

    lastPanPoint = null;

    if (aiGenerating) {
      lastPoint = null;
      pinchWasDown = isPinching;
      setStatus("ai_generating", "ready");
      return;
    }

    if (canDraw && isInsideWorld(worldPoint)) {
      if (!pinchWasDown) {
        lastPoint = worldPoint;
      } else if (lastPoint && distance(lastPoint, worldPoint) < 80 / viewport.scale) {
        const action = {
          type: "draw_line",
          from: normalizePoint(lastPoint),
          to: normalizePoint(worldPoint),
          color,
          size,
          erasing,
        };
        canvas.drawLine(lastPoint, worldPoint, action);
        actionHistory.push(action);
        roomController?.sendAction(action);
      }
      lastPoint = worldPoint;
      setStatus(erasing ? "erasing" : "drawing", "drawing");
    } else {
      lastPoint = null;
      setStatus("move_to_toolbar", "ready");
    }

    pinchWasDown = canDraw;
  }

  // --- Camera ---

  async function startCamera() {
    if (!window.Hands || !window.Camera) {
      setStatus("loading_gesture_lib", "error");
      return;
    }

    cameraButton.disabled = true;
    setStatus("requesting_camera", "ready");

    try {
      hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.72,
        minTrackingConfidence: 0.68,
      });
      hands.onResults(handleHandsResult);

      camera = new window.Camera(video, {
        onFrame: async () => {
          await hands.send({ image: video });
        },
        width: 1280,
        height: 720,
      });

      await camera.start();
      cameraButton.textContent = t("camera_button");
      setStatus("camera_ready", "ready");
    } catch (error) {
      console.error(error);
      cameraButton.disabled = false;
      cameraButton.textContent = t("camera_button");
      setStatus("camera_error", "error");
    }
  }

  const aiImageController = createAiImageController({
    elements: {
      generateButton,
      panelGenerateButton: aiGenerateButton,
      downloadButton: aiDownloadButton,
      styleSelect: aiStyleSelect,
      sizeSelect: aiSizeSelect,
      modelSelect: aiModelSelect,
      promptInput: aiPromptInput,
      resultImage: aiResultImage,
    },
    hasDrawing: () => actionHistory.length > 0,
    getDrawingDataUrl: canvas.getFlattenedDataUrl,
    setStatus,
    setAiStatus,
    setGenerating: (isGenerating) => {
      aiGenerating = isGenerating;
      aiResultWrap?.classList.toggle("is-loading", isGenerating);
      aiResultLoading?.setAttribute("aria-hidden", String(!isGenerating));
      if (isGenerating) {
        lastPoint = null;
        pinchWasDown = false;
      }
      updateGestureAiControls();
    },
  });

  // --- Event listeners ---

  swatches.forEach((button) => {
    button.addEventListener("click", () => updateActiveColor(button.dataset.color));
  });

  document.querySelectorAll(".gesture-tool[data-gesture-action='color']").forEach((button) => {
    button.addEventListener("click", () => updateActiveColor(button.dataset.color));
  });

  customColor.addEventListener("input", () => {
    color = customColor.value;
    erasing = false;
    eraserButton.setAttribute("aria-pressed", "false");
    swatches.forEach((button) => button.classList.remove("active"));
    document.querySelectorAll(".gesture-tool[data-gesture-action='color']").forEach((button) => {
      button.classList.remove("active");
    });
    customColor.parentElement.classList.add("active");
  });

  sizeOptions.forEach((button) => {
    button.addEventListener("click", () => updateBrushSize(button.dataset.size));
  });

  document.querySelectorAll(".gesture-tool[data-gesture-action='size']").forEach((button) => {
    button.addEventListener("click", () => updateBrushSize(button.dataset.size));
  });

  [aiStyleSelect, aiSizeSelect, aiModelSelect].forEach((select) => {
    select?.addEventListener("change", updateGestureAiControls);
  });

  document.querySelectorAll(".gesture-tool[data-gesture-action^='ai-']").forEach((button) => {
    button.addEventListener("click", () => activateGestureTool(button));
  });

  cameraButton.addEventListener("click", startCamera);
  eraserButton.addEventListener("click", toggleEraser);
  undoButton.addEventListener("click", undoDrawing);
  clearButton.addEventListener("click", () => clearDrawing());
  saveButton.addEventListener("click", saveDrawing);
  aiImageController.bindEvents();

  document.querySelector(".gesture-tool[data-gesture-action='eraser']").addEventListener("click", toggleEraser);
  document.querySelector(".gesture-tool[data-gesture-action='undo']").addEventListener("click", undoDrawing);
  document.querySelector(".gesture-tool[data-gesture-action='clear']").addEventListener("click", () => clearDrawing());
  document.querySelector(".gesture-tool[data-gesture-action='save']").addEventListener("click", saveDrawing);

  // --- Language buttons ---

  langZhBtn?.addEventListener("click", () => {
    setLanguage("zh");
    langZhBtn.style.background = "var(--accent)";
    langZhBtn.style.color = "#ffffff";
    langJaBtn.style.background = "transparent";
    langJaBtn.style.color = "inherit";
  });

  langJaBtn?.addEventListener("click", () => {
    setLanguage("ja");
    langJaBtn.style.background = "var(--accent)";
    langJaBtn.style.color = "#ffffff";
    langZhBtn.style.background = "transparent";
    langZhBtn.style.color = "inherit";
  });

  if (getLanguage() === "zh") {
    langZhBtn.style.background = "var(--accent)";
    langZhBtn.style.color = "#ffffff";
  } else {
    langJaBtn.style.background = "var(--accent)";
    langJaBtn.style.color = "#ffffff";
  }

  window.addEventListener("resize", () => canvas.resize(gestureOverlay.context));
  window.addEventListener("language-changed", updateGestureAiControls);
  updateGestureAiControls();
  canvas.resize(gestureOverlay.context);
