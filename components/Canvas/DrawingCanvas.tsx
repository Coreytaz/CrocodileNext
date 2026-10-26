import React from "react";
import { CommandError, useGame } from "../../lib/game-context";
import { createId } from "../../lib/id";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  clearCanvas,
  renderOperation,
} from "../../lib/drawing";
import type { DrawOperation, Point, Tool } from "../../lib/protocol";

type Gesture = {
  operation: DrawOperation;
  version: number;
  pointerId: number;
  sent: number;
  started: boolean;
  finished: boolean;
  submitted: boolean;
  sending: boolean;
  failed: boolean;
};
type Props = {
  enabled: boolean;
  tool: Tool;
  color: string;
  size: number;
  busyChanged: (busy: boolean) => void;
};

export default function DrawingCanvas({
  enabled,
  tool,
  color,
  size,
  busyChanged,
}: Props) {
  const { drawing, command, setError } = useGame();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const baseRef = React.useRef<HTMLCanvasElement | null>(null);
  const appliedRef = React.useRef<{
    version: number;
    operations: DrawOperation[];
  } | null>(null);
  const gestureRef = React.useRef<Gesture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const [paintTick, setPaintTick] = React.useState(0);
  const schedulePaint = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPaintTick((tick) => tick + 1);
    });
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!baseRef.current) {
      baseRef.current = document.createElement("canvas");
      baseRef.current.width = CANVAS_WIDTH;
      baseRef.current.height = CANVAS_HEIGHT;
    }
    const base = baseRef.current.getContext("2d", { willReadFrequently: true });
    const context = canvas.getContext("2d");
    if (!base || !context) return;
    const operations = drawing?.operations || [];
    const applied = appliedRef.current;
    const prefix =
      applied?.version === drawing?.version &&
      applied &&
      applied.operations.length <= operations.length &&
      applied.operations.every(
        (operation, index) =>
          operation === operations[index] ||
          (index === applied.operations.length - 1 &&
            operation.id === operations[index].id &&
            operation.points.length <= operations[index].points.length),
      );
    if (!prefix) {
      clearCanvas(base);
      operations.forEach((operation) => renderOperation(base, operation));
    } else {
      const lastIndex = applied.operations.length - 1;
      if (
        lastIndex >= 0 &&
        applied.operations[lastIndex] !== operations[lastIndex]
      ) {
        renderOperation(
          base,
          operations[lastIndex],
          applied.operations[lastIndex].points.length,
        );
      }
      operations
        .slice(applied.operations.length)
        .forEach((operation) => renderOperation(base, operation));
    }
    appliedRef.current = { version: drawing?.version || 0, operations };
    context.drawImage(baseRef.current, 0, 0);
    const gesture = gestureRef.current;
    if (gesture && (gesture.version !== drawing?.version || !enabled)) {
      gesture.failed = true;
      gestureRef.current = null;
      busyChanged(false);
    } else if (gesture) {
      const accepted = operations.find(
        (operation) => operation.id === gesture.operation.id,
      );
      if (
        gesture.finished &&
        accepted?.complete &&
        accepted.points.length >= gesture.operation.points.length
      ) {
        gestureRef.current = null;
        busyChanged(false);
      } else if (!gesture.failed) {
        renderOperation(
          context,
          gesture.operation,
          accepted?.points.length || 0,
        );
      }
    }
  }, [drawing, paintTick, enabled, busyChanged]);

  const flush = React.useCallback(
    async (gesture: Gesture) => {
      if (gesture.sending || gesture.failed || gesture.submitted) return;
      gesture.sending = true;
      try {
        while (
          !gesture.failed &&
          (gesture.sent < gesture.operation.points.length ||
            !gesture.started ||
            gesture.finished)
        ) {
          const stroke =
            gesture.operation.tool === "brush" ||
            gesture.operation.tool === "eraser";
          if (!stroke && !gesture.finished) break;
          const end = Math.min(
            gesture.sent + 256,
            gesture.operation.points.length,
          );
          const points = gesture.operation.points.slice(gesture.sent, end);
          const complete =
            gesture.finished && end === gesture.operation.points.length;
          if (!gesture.started) {
            await command("DRAW:ADD", {
              version: gesture.version,
              operation: { ...gesture.operation, points, complete },
            });
            gesture.started = true;
          } else {
            await command("DRAW:APPEND", {
              version: gesture.version,
              operationId: gesture.operation.id,
              offset: gesture.sent,
              points,
              complete,
            });
          }
          gesture.sent = end;
          if (complete) {
            gesture.submitted = true;
            break;
          }
          if (gesture.sent === gesture.operation.points.length) break;
        }
      } catch (cause) {
        gesture.failed = true;
        if (gestureRef.current === gesture) {
          gestureRef.current = null;
          busyChanged(false);
        }
        if (cause instanceof CommandError && cause.code === "STALE_VERSION") {
          schedulePaint();
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось передать рисунок",
        );
        void command("ROOM:SYNC", {}).catch(() => {});
        schedulePaint();
      } finally {
        gesture.sending = false;
      }
    },
    [command, setError, busyChanged, schedulePaint],
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      const gesture = gestureRef.current;
      if (gesture) void flush(gesture);
    }, 60);
    return () => {
      clearInterval(timer);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [flush]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x:
        Math.round(
          Math.max(
            0,
            Math.min(
              CANVAS_WIDTH,
              ((event.clientX - box.left) * CANVAS_WIDTH) / box.width,
            ),
          ) * 100,
        ) / 100,
      y:
        Math.round(
          Math.max(
            0,
            Math.min(
              CANVAS_HEIGHT,
              ((event.clientY - box.top) * CANVAS_HEIGHT) / box.height,
            ),
          ) * 100,
        ) / 100,
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !enabled ||
      !drawing ||
      gestureRef.current ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFor(event);
    const shape = tool !== "brush" && tool !== "eraser" && tool !== "fill";
    const gesture: Gesture = {
      operation: {
        id: createId(),
        tool,
        color,
        size,
        points: shape ? [point, point] : [point],
        complete: false,
      },
      version: drawing.version,
      pointerId: event.pointerId,
      sent: 0,
      started: false,
      finished: tool === "fill",
      submitted: false,
      sending: false,
      failed: false,
    };
    gestureRef.current = gesture;
    busyChanged(true);
    schedulePaint();
    if (!shape) void flush(gesture);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (
      !gesture ||
      gesture.finished ||
      gesture.pointerId !== event.pointerId ||
      !enabled
    )
      return;
    const point = pointFor(event);
    const operation = gesture.operation;
    if (operation.tool === "brush" || operation.tool === "eraser") {
      const previous = operation.points.at(-1)!;
      if (
        operation.points.length < 10000 &&
        Math.hypot(previous.x - point.x, previous.y - point.y) >= 0.8
      )
        operation.points.push(point);
    } else if (operation.tool !== "fill") operation.points[1] = point;
    schedulePaint();
  };
  const finish = (
    event: React.PointerEvent<HTMLCanvasElement>,
    cancelled = false,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.finished)
      return;
    if (!cancelled) move(event);
    // A cancelled shape is only a local preview; a streamed stroke is finalized.
    if (cancelled && !gesture.started && !gesture.sending) {
      gesture.failed = true;
      gestureRef.current = null;
      busyChanged(false);
    } else {
      gesture.finished = true;
      void flush(gesture);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    schedulePaint();
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      aria-label={enabled ? "Холст для рисования" : "Рисунок игрока"}
      className={`drawing-canvas ${enabled ? "drawing-enabled" : ""}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    />
  );
}
