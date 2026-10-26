import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useGame } from "../lib/game-context";
import { buttonClassName } from "../styles/button";

export default function Home() {
  const router = useRouter();
  const { connected, connectionError, error, setError, enter, session, leave } =
    useGame();
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (join: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (session) await leave();
      const result = await enter(join ? "ROOM:JOIN" : "ROOM:CREATE", {
        name,
        ...(join ? { roomId: code.trim().toUpperCase() } : {}),
      });
      await router.push(`/game/${result.roomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Head>
        <title>Crocodile — рисуйте и угадывайте</title>
        <meta
          name="description"
          content="Рисуйте слова и угадывайте с друзьями в реальном времени."
        />
      </Head>
      <main className="landing">
        <div className="landing-intro">
          <span className="eyebrow">ИГРА ДЛЯ СВОИХ</span>
          <h1>
            Crocodile<span className="title-dot">.</span>
          </h1>
          <p>
            Одно слово. Тысяча способов нарисовать.
            <br />
            Догадаются ли друзья, что у вас на уме?
          </p>
          <div className="landing-steps">
            <span>01 · Соберите друзей</span>
            <span>02 · Нарисуйте слово</span>
            <span>03 · Угадайте в чате</span>
          </div>
        </div>
        <section className="entry-card" aria-label="Вход в игру">
          <h2>Начнём рисовать?</h2>
          <p className="muted">Нужны только ник и немного воображения.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            <label className="field-label" htmlFor="nickname">
              Ваш ник
            </label>
            <input
              id="nickname"
              className="text-input"
              autoComplete="off"
              placeholder="Например, Крокодил"
              value={name}
              maxLength={24}
              required
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="submit"
              className={`${buttonClassName} primary-button`}
              disabled={!connected || busy || !name.trim()}
            >
              Создать комнату
            </button>
          </form>
          <div className="entry-divider">
            <span>или присоединитесь к друзьям</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(true);
            }}
          >
            <label className="field-label" htmlFor="room-code">
              Код комнаты
            </label>
            <div className="join-row">
              <input
                id="room-code"
                className="text-input code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
                maxLength={8}
                required
                pattern="[A-Fa-f0-9]{8}"
              />
              <button
                className="secondary-button"
                disabled={!connected || busy || !name.trim() || !code.trim()}
              >
                Войти
              </button>
            </div>
          </form>
          <output
            className={`connection-status ${connected ? "is-online" : ""}`}
          >
            {connected
              ? "● Сервер на связи"
              : connectionError || "Подключаемся к серверу…"}
          </output>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
        </section>
        <p className="landing-footer">
          Без регистрации · Без таймера · В вашем ритме
        </p>
      </main>
    </>
  );
}
