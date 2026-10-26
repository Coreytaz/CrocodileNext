import React from "react";
import GameModal from "./GameModal";
import type { PrivateWord, RoomState } from "../lib/protocol";
import { buttonClassName } from "../styles/button";

type Props = {
  room: RoomState;
  playerId: string;
  secret: PrivateWord | null;
  connected: boolean;
  busy: boolean;
  error: string;
  onSelect: (word: string) => void;
  onExit: () => void;
};

export default function RoundDialogs({
  room,
  playerId,
  secret,
  connected,
  busy,
  error,
  onSelect,
  onExit,
}: Props) {
  const storageKey = `crocodile:result:${room.id}:${playerId}`;
  const [seenRound, setSeenRound] = React.useState(() => {
    try {
      return Number(sessionStorage.getItem(storageKey)) || 0;
    } catch {
      return 0;
    }
  });
  const drawer = room.drawerId === playerId;
  const result = room.lastResult;
  if (result && result.round > seenRound) {
    const dismiss = () => {
      setSeenRound(result.round);
      try {
        sessionStorage.setItem(storageKey, String(result.round));
      } catch {
        /* The in-memory acknowledgement still closes this result. */
      }
    };
    return (
      <GameModal
        key={`result-${result.round}`}
        label="Итоги раунда"
        title={`${result.winnerName} — победитель!`}
        description={`Раунд ${result.round} завершён. ${drawer ? "Выберите новое слово для следующего раунда." : "Рисующий выберет слово для следующего раунда."}`}
        icon="🏆"
        onDismiss={dismiss}
      >
        <p className="modal-answer">
          Угадано слово: <b>{result.word}</b>
        </p>
        <button
          className={`${buttonClassName} primary-button`}
          onClick={dismiss}
        >
          {drawer && !room.hasWord ? "Выбрать слово" : "Продолжить"}
        </button>
      </GameModal>
    );
  }
  if (!drawer || room.hasWord) return null;
  const options = secret?.version === room.version ? secret.options : [];

  return (
    <GameModal
      key={`choice-${room.version}`}
      label="Выбор слова"
      title="Что будем рисовать?"
      description={`Раунд ${room.version}. Выберите одно из трёх слов. Его увидите только вы, а затем откроется холст.`}
      icon="✎"
    >
      <div className="word-picker">
        {options.map((word) => (
          <button
            key={word}
            disabled={!connected || busy}
            onClick={() => onSelect(word)}
          >
            {word}
          </button>
        ))}
      </div>
      {!connected && (
        <output className="modal-connection">
          Восстанавливаем связь с сервером…
        </output>
      )}
      {connected && options.length !== 3 && (
        <output className="modal-connection">Получаем варианты слов…</output>
      )}
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
      <button
        className="text-button modal-exit"
        disabled={!connected || busy}
        onClick={onExit}
      >
        Выйти из комнаты
      </button>
    </GameModal>
  );
}
