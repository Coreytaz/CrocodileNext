import React from "react";
import styles from "./Canvas.module.scss";

type CanvasProps = {
  width: number;
  height: number;
};

const Canvas: React.FC<CanvasProps> = ({ width, height }) => {
  const rootRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (rootRef.current) {
      const ctx = rootRef.current.getContext("2d");
      if (ctx) {
        // переменные для рисования
        ctx.lineCap = "round";
        ctx.lineWidth = 8;

        // вешаем обработчики на кнопки
        // очистка изображения
        // document.getElementById("clear").onclick = function clear() {
        //   context.clearRect(0, 0, canvas.width, canvas.height);
        // };

        rootRef.current.addEventListener("mousemove", (e) => {
          // в "e"  попадает экземпляр MouseEvent
          const x = e.offsetX;
          const y = e.offsetY;
          const dx = e.movementX;
          const dy = e.movementY;

          // Проверяем зажата ли какая-нибудь кнопка мыши
          // Если да, то рисуем
          if (e.buttons > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - dx, y - dy);
            ctx.stroke();
            ctx.closePath();
          }
        });
      }
    }
  }, []);

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
