import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Canvas from "../../components/Canvas";
import RoundDialogs from "../../components/RoundDialogs";
import { CommandError, readSession, useGame } from "../../lib/game-context";
import type { Tool } from "../../lib/protocol";
import { buttonClassName } from "../../styles/button";

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "brush", label: "Кисть", icon: "✎" },
  { id: "eraser", label: "Ластик", icon: "▱" },
  { id: "line", label: "Линия", icon: "╱" },
  { id: "rectangle", label: "Прямоугольник", icon: "□" },
  { id: "ellipse", label: "Круг", icon: "○" },
  { id: "fill", label: "Заливка", icon: "◩" },
];
const palette = [
  "#202b29",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#92400e",
  "#94a3b8",
];

export default function GamePage() {
  const router = useRouter();
  const roomId =
    typeof router.query.id === "string" ? router.query.id.toUpperCase() : "";
  const {
    connected,
    ready,
    connectionError,
    error,
    setError,
    room,
    drawing,
    secret,
    session,
    enter,
    command,
    leave,
    clearSession,
  } = useGame();
  const [name, setName] = React.useState("");
  const [joining, setJoining] = React.useState(false);
  const [restoring, setRestoring] = React.useState(true);
  const [missing, setMissing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [drawingBusy, setDrawingBusy] = React.useState(false);
  const [tool, setTool] = React.useState<Tool>("brush");
  const [color, setColor] = React.useState("#202b29");
  const [size, setSize] = React.useState(8);
  const [text, setText] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const active = session?.roomId === roomId && room?.id === roomId;
  const drawer = active && room.drawerId === session.playerId;
  const owner = active && room.ownerId === session.playerId;

  React.useEffect(() => {
    if (!roomId || !connected) return;
    let cancelled = false;
    // Session discovery and socket membership are one asynchronous restoration.
    void Promise.resolve(readSession(roomId))
      .then((saved) => {
        if (cancelled || !saved) return;
        return enter("ROOM:JOIN", { roomId, token: saved.token });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (
          cause instanceof CommandError &&
          ["ROOM_NOT_FOUND", "SESSION_EXPIRED"].includes(cause.code)
        ) {
          clearSession(roomId);
          setMissing(cause.code === "ROOM_NOT_FOUND");
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось восстановить игру",
        );
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, connected, enter, clearSession, setError]);

  React.useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [room?.messages]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  };
  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setError("");
    try {
      await enter("ROOM:JOIN", { roomId, name });
      setMissing(false);
    } catch (cause) {
      if (cause instanceof CommandError && cause.code === "ROOM_NOT_FOUND")
        setMissing(true);
      setError(cause instanceof Error ? cause.message : "Не удалось войти");
    } finally {
      setJoining(false);
    }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!room || !text.trim()) return;
    const sent = text;
    await run(async () => {
      await command("CHAT:SEND", { version: room.version, text: sent });
      setText((current) => (current === sent ? "" : current));
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/game/${roomId}`,
      );
      setCopied(true);
    } catch {
      setError(`Не удалось скопировать. Код комнаты: ${roomId}`);
    }
  };
  const connectedToRoom = connected && ready && !restoring;
  const canDraw = Boolean(
    drawer &&
    room?.hasWord &&
    drawing?.version === room?.version &&
    connectedToRoom,
  );
  const disabled = !canDraw || busy || drawingBusy;

  const pageHead = (
    <Head>
      <title>{`${active ? `Комната ${roomId}` : "Вход в комнату"} — Crocodile`}</title>
    </Head>
  );
  if (!active || !room || !session)
    return (
      <>
        {pageHead}
        <main className="join-page">
          <section className="entry-card">
            <Link className="brand-link" href="/">
              Crocodile.
            </Link>
            <h1>Комната {roomId}</h1>
            <p className="muted">Введите ник и присоединитесь к рисунку.</p>
            {(restoring || !connected) && (
              <output className="connection-status">
                {connectionError ||
                  (connected
                    ? "Восстанавливаем игру…"
                    : "Подключаемся к серверу…")}
              </output>
            )}
            {!restoring && (
              <form onSubmit={(event) => void join(event)}>
                <label className="field-label" htmlFor="join-name">
                  Ваш ник
                </label>
                <input
                  className="text-input"
                  id="join-name"
                  value={name}
                  maxLength={24}
                  required
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                />
                <button
                  className={`${buttonClassName} primary-button`}
                  disabled={!connected || joining || !name.trim() || missing}
                >
                  Войти в комнату
                </button>
              </form>
            )}
            {error && (
              <p role="alert" className="error-notice">
                {error}
              </p>
            )}
            <Link className="back-link" href="/">
              {missing ? "Создать новую комнату" : "На главную"}
            </Link>
          </section>
        </main>
      </>
    );

  const artist = room.players.find((player) => player.id === room.drawerId);
  return (
    <>
      {pageHead}
      <main className="game-shell">
        <header className="game-header">
          <div className="header-brand">
            <span className="brand-link">Crocodile.</span>
            <span className="room-code">КОМНАТА {room.id}</span>
          </div>
          <div className="header-actions">
            <output
              className={`connection-status ${connectedToRoom ? "is-online" : ""}`}
            >
              {connectedToRoom ? "● На связи" : "● Восстанавливаем связь…"}
            </output>
            <button className="secondary-button" onClick={() => void copy()}>
              {copied ? "Ссылка скопирована" : "Пригласить друзей"}
            </button>
            <button
              className="text-button"
              disabled={!connectedToRoom || busy}
              onClick={() =>
                void run(async () => {
                  await leave();
                  await router.push("/");
                })
              }
            >
              Выйти
            </button>
          </div>
        </header>
        {!connectedToRoom && (
          <output className="warning-notice">
            {connectionError || "Связь прервалась. Переподключаемся…"} Место
            сохраняется 30 секунд.
          </output>
        )}
        {error && (
          <div className="error-notice error-row" role="alert">
            <span>{error}</span>
            <button
              className="text-button"
              onClick={() => setError("")}
              aria-label="Закрыть ошибку"
            >
              ×
            </button>
          </div>
        )}
        <div className="game-layout">
          <section className="drawing-panel" aria-label="Рисование">
            <div className="word-bar">
              <div>
                <span className="eyebrow">
                  РАУНД {room.version} ·{" "}
                  {drawer ? "ВАША ДОСКА" : "УГАДАЙТЕ СЛОВО"}
                </span>
                <h1>
                  {drawer ? (
                    secret?.word ? (
                      <>
                        Рисуем:{" "}
                        <span className="secret-word">{secret.word}</span>
                      </>
                    ) : (
                      "Выберите слово перед рисованием"
                    )
                  ) : room.hasWord ? (
                    `${artist?.name || "Игрок"} рисует…`
                  ) : (
                    `${artist?.name || "Игрок"} выбирает слово…`
                  )}
                </h1>
                <p className="muted">
                  {drawer
                    ? room.hasWord
                      ? "Слово видите только вы. Покажите его рисунком!"
                      : "Выберите одно из трёх слов — после этого откроется рисование."
                    : room.hasWord
                      ? "Первый правильный ответ выигрывает раунд. Пишите в чат!"
                      : "Новый раунд начнётся с выбора слова рисующим."}
                </p>
              </div>
              {drawer && (
                <button
                  className="secondary-button"
                  disabled={
                    !connectedToRoom || busy || drawingBusy || !room.hasWord
                  }
                  onClick={() =>
                    void run(() =>
                      command("WORD:NEXT", { version: room.version }),
                    )
                  }
                >
                  Новое слово
                </button>
              )}
            </div>
            <div className="canvas-frame">
              <Canvas
                enabled={canDraw}
                tool={tool}
                color={color}
                size={size}
                busyChanged={setDrawingBusy}
              />
              {!room.hasWord && (
                <div className="canvas-placeholder" aria-hidden="true">
                  <span>✎</span>
                  <p>Здесь скоро появится рисунок</p>
                </div>
              )}
            </div>
            {drawer ? (
              <div className="drawing-toolbar">
                <fieldset
                  disabled={disabled}
                  className="tools-group"
                  aria-label="Инструменты"
                >
                  {tools.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      aria-pressed={tool === item.id}
                      className={`tool-button ${tool === item.id ? "selected" : ""}`}
                      onClick={() => setTool(item.id)}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span className="tool-label">{item.label}</span>
                    </button>
                  ))}
                </fieldset>
                <fieldset
                  disabled={disabled}
                  className="palette-group"
                  aria-label="Цвета"
                >
                  {palette.map((value) => (
                    <button
                      key={value}
                      className={`color-button ${color === value ? "selected" : ""}`}
                      style={{ background: value }}
                      aria-label={`Цвет ${value}`}
                      aria-pressed={color === value}
                      onClick={() => setColor(value)}
                    />
                  ))}
                  <label className="custom-color" title="Другой цвет">
                    <span>+</span>
                    <input
                      type="color"
                      aria-label="Другой цвет"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                    />
                  </label>
                </fieldset>
                <div className="toolbar-bottom">
                  <label className="size-control">
                    Толщина{" "}
                    <input
                      type="range"
                      min="1"
                      max="80"
                      value={size}
                      disabled={disabled}
                      onChange={(event) => setSize(Number(event.target.value))}
                    />
                    <output>{size}</output>
                  </label>
                  <div className="history-actions">
                    <button
                      className="text-button"
                      disabled={disabled || !drawing?.operations.length}
                      onClick={() =>
                        void run(() =>
                          command("DRAW:UNDO", { version: room.version }),
                        )
                      }
                    >
                      ↶ Отменить
                    </button>
                    <button
                      className="text-button"
                      disabled={disabled || !drawing?.redoCount}
                      onClick={() =>
                        void run(() =>
                          command("DRAW:REDO", { version: room.version }),
                        )
                      }
                    >
                      ↷ Повторить
                    </button>
                    <button
                      className="text-button danger"
                      disabled={disabled || !drawing?.operations.length}
                      onClick={() =>
                        void run(() =>
                          command("DRAW:CLEAR", { version: room.version }),
                        )
                      }
                    >
                      Очистить
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="viewer-caption">
                Рисует {artist?.name}
                {artist && !artist.connected ? " · переподключается" : ""} ·
                Угадывайте в чате →
              </p>
            )}
          </section>
          <aside className="room-sidebar">
            <section className="players-panel" aria-label="Игроки">
              <div className="panel-heading">
                <h2>За одним столом</h2>
                <span>{room.players.length}/20</span>
              </div>
              <ul className="player-list">
                {room.players.map((player) => (
                  <li
                    key={player.id}
                    className={!player.connected ? "player-offline" : ""}
                  >
                    <span className="player-avatar" aria-hidden="true">
                      {player.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="player-info">
                      <b>
                        {player.name}
                        {player.id === session.playerId ? " (вы)" : ""}
                      </b>
                      <span>
                        {[
                          player.id === room.ownerId ? "Владелец" : "",
                          player.id === room.drawerId
                            ? "Рисует"
                            : player.guessed
                              ? "Угадал ✓"
                              : "Угадывает",
                          room.lastResult?.winnerId === player.id
                            ? "Победитель прошлого раунда 🏆"
                            : "",
                          !player.connected ? "Не в сети" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {owner && player.id !== room.drawerId && (
                      <button
                        className="assign-button"
                        title={`Назначить рисующим: ${player.name}`}
                        aria-label={`Назначить рисующим: ${player.name}`}
                        disabled={
                          !connectedToRoom ||
                          busy ||
                          !player.connected ||
                          drawingBusy
                        }
                        onClick={() =>
                          void run(() =>
                            command("ROOM:ASSIGN_DRAWER", {
                              version: room.version,
                              playerId: player.id,
                            }),
                          )
                        }
                      >
                        ✎
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section className="chat-panel" aria-label="Чат">
              <div className="panel-heading">
                <h2>Догадки и разговоры</h2>
                <span aria-hidden="true">↗</span>
              </div>
              <div
                className="chat-messages"
                ref={messagesRef}
                role="log"
                aria-label="Сообщения чата"
                aria-live="polite"
              >
                {room.messages.map((item) =>
                  item.kind === "system" ? (
                    <p className="system-message" key={item.id}>
                      {item.text}
                    </p>
                  ) : (
                    <div className="chat-message" key={item.id}>
                      <b>{item.name}</b>
                      <p>{item.text}</p>
                    </div>
                  ),
                )}
              </div>
              <form
                className="chat-form"
                onSubmit={(event) => void send(event)}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Сообщение
                </label>
                <input
                  id="chat-message"
                  className="text-input"
                  autoComplete="off"
                  placeholder={
                    drawer ? "Напишите друзьям…" : "Что это может быть?"
                  }
                  maxLength={500}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={!connectedToRoom}
                />
                <button
                  className="send-button"
                  aria-label="Отправить"
                  disabled={!connectedToRoom || busy || !text.trim()}
                >
                  ↑
                </button>
              </form>
            </section>
          </aside>
        </div>
        <footer className="game-footer">
          Рисуем по очереди. Играем в своём ритме.
        </footer>
      </main>
      <RoundDialogs
        key={`${room.id}:${session.playerId}`}
        room={room}
        playerId={session.playerId}
        secret={secret}
        connected={connectedToRoom}
        busy={busy}
        error={error}
        onSelect={(word) =>
          void run(() =>
            command("WORD:SELECT", { version: room.version, word }),
          )
        }
        onExit={() =>
          void run(async () => {
            await leave();
            await router.push("/");
          })
        }
      />
    </>
  );
}
