import type { DrawOperation } from "./protocol";

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;

function floodFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const start =
    Math.min(height - 1, Math.floor(y)) * width +
    Math.min(width - 1, Math.floor(x));
  const offset = start * 4;
  const target = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
  const replacement = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  const tolerance = 24;
  if (
    target.every(
      (value, index) => Math.abs(value - replacement[index]) <= tolerance,
    )
  )
    return;
  const matches = (pixel: number) =>
    target.every(
      (value, index) =>
        Math.abs(pixels[pixel * 4 + index] - value) <= tolerance,
    );
  const stack = new Int32Array(width * height);
  let count = 0;
  const add = (pixel: number) => {
    if (!matches(pixel)) return;
    const index = pixel * 4;
    pixels[index] = replacement[0];
    pixels[index + 1] = replacement[1];
    pixels[index + 2] = replacement[2];
    pixels[index + 3] = 255;
    stack[count++] = pixel;
  };
  add(start);
  while (count) {
    const pixel = stack[--count];
    if (pixel % width > 0) add(pixel - 1);
    if (pixel % width < width - 1) add(pixel + 1);
    if (pixel >= width) add(pixel - width);
    if (pixel < width * (height - 1)) add(pixel + width);
  }
  ctx.putImageData(image, 0, 0);
}

// Render brush segments identically during streaming and history replay.
export function renderOperation(
  ctx: CanvasRenderingContext2D,
  operation: DrawOperation,
  fromPoint = 0,
) {
  const { points, tool, color, size } = operation;
  if (!points.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;
  ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
  ctx.fillStyle = ctx.strokeStyle;
  if (tool === "brush" || tool === "eraser") {
    if (fromPoint === 0) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (
      let index = Math.max(1, fromPoint);
      index < points.length;
      index += 1
    ) {
      ctx.beginPath();
      ctx.moveTo(points[index - 1].x, points[index - 1].y);
      ctx.lineTo(points[index].x, points[index].y);
      ctx.stroke();
    }
  } else if (tool === "fill") {
    floodFill(ctx, points[0].x, points[0].y, color);
  } else if (points.length === 2) {
    const [a, b] = points;
    ctx.beginPath();
    if (tool === "line") {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (tool === "rectangle") ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (tool === "ellipse")
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
    ctx.stroke();
  }
  ctx.restore();
}
export function clearCanvas(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
