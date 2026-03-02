"use strict";

(() => {
  /** @type {HTMLCanvasElement|null} */
  const canvas = document.getElementById("game");
  /** @type {HTMLDivElement|null} */
  const overlay = document.getElementById("overlay");
  /** @type {HTMLDivElement|null} */
  const overlayTitle = document.getElementById("overlayTitle");
  /** @type {HTMLDivElement|null} */
  const overlayHint = document.getElementById("overlayHint");
  /** @type {HTMLElement|null} */
  const scoreEl = document.getElementById("score");
  /** @type {HTMLElement|null} */
  const linesEl = document.getElementById("lines");
  /** @type {HTMLButtonElement|null} */
  const btnRestart = document.getElementById("btnRestart");
  /** @type {HTMLButtonElement|null} */
  const btnPause = document.getElementById("btnPause");

  if (!canvas) {
    throw new Error("Missing canvas#game");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to get 2D canvas context");
  }

  function setOverlay(isVisible, title = "", hint = "") {
    if (!overlay || !overlayTitle || !overlayHint) return;
    overlay.hidden = !isVisible;
    overlayTitle.textContent = title;
    overlayHint.textContent = hint;
  }

  function setScore(score) {
    if (scoreEl) scoreEl.textContent = String(score);
  }

  function setLines(lines) {
    if (linesEl) linesEl.textContent = String(lines);
  }

  const COLS = 10;
  const ROWS = 20;

  const COLORS = {
    0: "transparent",
    1: "#00d2ff", // I
    2: "#ffd166", // O
    3: "#8b5cf6", // T
    4: "#06d6a0", // S
    5: "#ef476f", // Z
    6: "#118ab2", // J
    7: "#f77f00", // L
  };

  const TETROMINOES = /** @type {const} */ ({
    I: {
      id: 1,
      m: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    O: {
      id: 2,
      m: [
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    T: {
      id: 3,
      m: [
        [0, 1, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    S: {
      id: 4,
      m: [
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    Z: {
      id: 5,
      m: [
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    J: {
      id: 6,
      m: [
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    L: {
      id: 7,
      m: [
        [0, 0, 1, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
  });

  /**
   * @typedef {{ id: number, matrix: number[][], x: number, y: number }} Piece
   */

  /** @type {number[][]} */
  let board = [];
  /** @type {Piece|null} */
  let active = null;
  /** @type {Piece|null} */
  let next = null;

  let isPaused = false;
  let isGameOver = false;

  let score = 0;
  let lines = 0;

  let dropIntervalMs = 700;
  let dropAccumulatorMs = 0;
  let lastFrameTs = 0;
  let rafId = 0;

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function cloneMatrix(m) {
    return m.map((row) => row.slice());
  }

  function rotateCW(m) {
    const n = m.length;
    /** @type {number[][]} */
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        out[y][x] = m[n - 1 - x][y];
      }
    }
    return out;
  }

  function pickRandomTetromino() {
    const keys = Object.keys(TETROMINOES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    // @ts-ignore - keys is derived from object keys
    const t = TETROMINOES[key];
    return { id: t.id, matrix: cloneMatrix(t.m) };
  }

  function spawnPiece() {
    if (!next) {
      const t = pickRandomTetromino();
      next = { id: t.id, matrix: t.matrix, x: 0, y: 0 };
    }

    const use = next;
    const nxt = pickRandomTetromino();
    next = { id: nxt.id, matrix: nxt.matrix, x: 0, y: 0 };

    const startX = Math.floor(COLS / 2) - 2;
    const startY = -1;
    active = { id: use.id, matrix: cloneMatrix(use.matrix), x: startX, y: startY };

    if (collides(board, active)) {
      isGameOver = true;
      setOverlay(true, "Game over", "Press Restart to play again");
    }
  }

  function collides(b, piece) {
    const { matrix, x: px, y: py } = piece;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && b[by][bx]) return true;
      }
    }
    return false;
  }

  function mergePiece() {
    if (!active) return;
    const { matrix, x: px, y: py, id } = active;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          board[by][bx] = id;
        }
      }
    }
  }

  function clearFullRows() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      const full = board[y].every((v) => v !== 0);
      if (!full) continue;
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++; // re-check same y index after unshift
    }
    if (cleared > 0) {
      lines += cleared;
      const add =
        cleared === 1 ? 100 : cleared === 2 ? 300 : cleared === 3 ? 500 : 800;
      score += add;
      setLines(lines);
      setScore(score);
    }
  }

  function tryMove(dx, dy) {
    if (!active) return false;
    const test = { ...active, x: active.x + dx, y: active.y + dy };
    if (collides(board, test)) return false;
    active.x += dx;
    active.y += dy;
    return true;
  }

  function tryRotate() {
    if (!active) return false;
    const rotated = rotateCW(active.matrix);
    const test = { ...active, matrix: rotated };
    if (collides(board, test)) return false;
    active.matrix = rotated;
    return true;
  }

  function hardDrop() {
    if (!active) return;
    while (tryMove(0, 1)) {
      // keep moving down
    }
    lockActive();
  }

  function lockActive() {
    mergePiece();
    clearFullRows();
    spawnPiece();
  }

  function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    if (isPaused) {
      setOverlay(true, "Paused", "Press P to resume");
    } else {
      setOverlay(false);
    }
  }

  function restart() {
    board = createBoard();
    active = null;
    next = null;
    isPaused = false;
    isGameOver = false;
    score = 0;
    lines = 0;
    setScore(score);
    setLines(lines);
    setOverlay(false);
    spawnPiece();
  }

  function computeCellSize() {
    return Math.floor(canvas.width / COLS);
  }

  function drawCell(x, y, id, cell) {
    const pad = Math.max(1, Math.floor(cell * 0.08));
    const rx = x * cell;
    const ry = y * cell;

    ctx.fillStyle = COLORS[id] || "#fff";
    ctx.fillRect(rx + pad, ry + pad, cell - pad * 2, cell - pad * 2);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + pad + 0.5, ry + pad + 0.5, cell - pad * 2 - 1, cell - pad * 2 - 1);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(rx + pad, ry + pad, cell - pad * 2, Math.max(2, Math.floor(cell * 0.12)));
  }

  function render() {
    const cell = computeCellSize();

    // Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(COLS * cell, y * cell + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, ROWS * cell);
      ctx.stroke();
    }

    // Board blocks
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = board[y][x];
        if (id) drawCell(x, y, id, cell);
      }
    }

    // Active piece
    if (active) {
      for (let y = 0; y < active.matrix.length; y++) {
        for (let x = 0; x < active.matrix[y].length; x++) {
          if (!active.matrix[y][x]) continue;
          const bx = active.x + x;
          const by = active.y + y;
          if (by < 0) continue;
          drawCell(bx, by, active.id, cell);
        }
      }
    }
  }

  function stepDown() {
    if (!active) return;
    const ok = tryMove(0, 1);
    if (!ok) {
      lockActive();
    }
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = ts - lastFrameTs;
    lastFrameTs = ts;

    if (!isPaused && !isGameOver) {
      dropAccumulatorMs += dt;
      if (dropAccumulatorMs >= dropIntervalMs) {
        dropAccumulatorMs = 0;
        stepDown();
      }
    }
    render();
  }

  function onKeyDown(e) {
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (isPaused || isGameOver) return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        tryMove(-1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        tryMove(1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (tryMove(0, 1)) {
          // Optional tiny reward for manual drop feel
          score += 1;
          setScore(score);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        tryRotate();
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      default:
        break;
    }
  }

  btnRestart?.addEventListener("click", () => restart());
  btnPause?.addEventListener("click", () => togglePause());
  document.addEventListener("keydown", onKeyDown);

  // Start
  restart();
  setOverlay(false);
  rafId = window.requestAnimationFrame(frame);
})();
