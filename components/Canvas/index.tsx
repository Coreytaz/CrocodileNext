import React from "react";
import styles from "./Canvas.module.scss";

type CanvasProps = {
  width: number;
  height: number;
};

const Canvas: React.FC<CanvasProps> = ({ width, height }) => {
  const rootRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = rootRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Resizing a canvas resets its drawing context.
    ctx.lineCap = "round";
    ctx.lineWidth = 8;

    const draw = (event: MouseEvent) => {
      if (event.buttons === 0) return;
      const { offsetX: x, offsetY: y, movementX: dx, movementY: dy } = event;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx, y - dy);
      ctx.stroke();
      ctx.closePath();
    };

    canvas.addEventListener("mousemove", draw);
    return () => canvas.removeEventListener("mousemove", draw);
  }, [width, height]);

  return (
    <canvas
      width={width}
      height={height}
      ref={rootRef}
      className={styles.root}
    />
  );
};

export default Canvas;
