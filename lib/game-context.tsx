import React from "react";
import { io, type Socket } from "socket.io-client";
import { createId } from "./id";
import type {
  ClientEvents,
  CommandPayloads,
  CommandResults,
  DrawingState,
  PrivateWord,
  Reply,
  RoomState,
  ServerEvents,
  Session,
} from "./protocol";

export class CommandError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const sessionKey = (roomId: string) => `crocodile:session:${roomId}`;
export function readSession(roomId: string): Session | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(sessionKey(roomId)) || "null",
    ) as Session | null;
    return value?.roomId === roomId &&
      typeof value.playerId === "string" &&
      typeof value.token === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
type Command = <E extends keyof CommandPayloads>(
  event: E,
  payload: CommandPayloads[E],
) => Promise<CommandResults[E]>;
type GameContextValue = {
  connected: boolean;
  ready: boolean;
  connectionError: string;
  error: string;
  setError: (value: string) => void;
  room: RoomState | null;
  drawing: DrawingState | null;
  secret: PrivateWord | null;
  session: Session | null;
  command: Command;
  enter: (
    event: "ROOM:CREATE" | "ROOM:JOIN",
    payload: { name?: string; roomId?: string; token?: string },
  ) => Promise<Session>;
  leave: () => Promise<void>;
  clearSession: (roomId: string) => void;
};
const GameContext = React.createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = React.useRef<Socket<ServerEvents, ClientEvents> | null>(
    null,
  );
  const [connected, setConnected] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState("");
  const [error, setError] = React.useState("");
  const [room, setRoom] = React.useState<RoomState | null>(null);
  const [drawing, setDrawing] = React.useState<DrawingState | null>(null);
  const [secret, setSecret] = React.useState<PrivateWord | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const roomRef = React.useRef<RoomState | null>(null);
  const syncPending = React.useRef(false);

  const command: Command = React.useCallback(
    async <E extends keyof CommandPayloads>(
      event: E,
      payload: CommandPayloads[E],
    ): Promise<CommandResults[E]> => {
      const socket = socketRef.current;
      if (!socket?.connected)
        throw new CommandError(
          "OFFLINE",
          "Нет связи с сервером. Дождитесь подключения",
        );
      const data = { ...payload, commandId: createId() };
      // Keep the same command ID on acknowledgement retry; never buffer offline actions.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let reply: Reply<CommandResults[E]>;
        // The public command signature correlates E, its payload and its reply.
        // Socket.IO's generic variadic tuple cannot preserve that correlation here.
        try {
          reply = (await (socket as unknown as Socket)
            .timeout(5000)
            .emitWithAck(event, data)) as Reply<CommandResults[E]>;
        } catch {
          if (attempt === 0 && socket.connected) continue;
          throw new CommandError(
            "TIMEOUT",
            "Сервер не подтвердил действие. Подключитесь заново",
          );
        }
        if (!reply.ok)
          throw new CommandError(reply.error.code, reply.error.message);
        return reply.data;
      }
      throw new CommandError("TIMEOUT", "Сервер не ответил");
    },
    [],
  );

  React.useEffect(() => {
    const socket: Socket<ServerEvents, ClientEvents> = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9999",
      {
        transports: ["websocket"],
        autoConnect: false,
      },
    );
    socketRef.current = socket;
    const resync = () => {
      if (syncPending.current) return;
      syncPending.current = true;
      void command("ROOM:SYNC", {})
        .catch((cause: Error) => setError(cause.message))
        .finally(() => {
          syncPending.current = false;
        });
    };
    socket.on("connect", () => {
      setConnected(true);
      setConnectionError("");
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setReady(false);
      setSecret(null);
    });
    socket.on("connect_error", () => {
      setConnected(false);
      setConnectionError("Сервер недоступен. Пробуем подключиться…");
    });
    socket.on("ROOM:STATE", (state) => {
      if (
        roomRef.current?.id !== state.id ||
        roomRef.current.version !== state.version
      ) {
        setDrawing(null);
        setSecret(null);
      }
      roomRef.current = state;
      setRoom(state);
    });
    socket.on("ROOM:REPLACED", () => {
      if (roomRef.current)
        sessionStorage.removeItem(sessionKey(roomRef.current.id));
      setSession(null);
      setReady(false);
      setRoom(null);
      setDrawing(null);
      setSecret(null);
      roomRef.current = null;
      setError(
        "Эта игровая сессия открыта в другой вкладке. Здесь можно войти заново.",
      );
    });
    socket.on("WORD:PRIVATE", (state) => {
      if (state.version === roomRef.current?.version) setSecret(state);
    });
    socket.on("CHAT:MESSAGE", (item) =>
      setRoom((previous) => {
        if (
          !previous ||
          previous.messages.some((message) => message.id === item.id)
        )
          return previous;
        return {
          ...previous,
          messages: [...previous.messages, item].slice(-200),
        };
      }),
    );
    socket.on("DRAW:STATE", (state) => {
      if (state.version === roomRef.current?.version) setDrawing(state);
    });
    socket.on("DRAW:ADDED", (update) => {
      setDrawing((previous) => {
        if (
          !previous ||
          update.version !== previous.version ||
          update.revision <= previous.revision
        )
          return previous;
        if (update.revision !== previous.revision + 1) {
          queueMicrotask(resync);
          return previous;
        }
        return {
          ...previous,
          revision: update.revision,
          redoCount: 0,
          operations: [...previous.operations, update.operation],
        };
      });
    });
    socket.on("DRAW:APPENDED", (update) => {
      setDrawing((previous) => {
        if (
          !previous ||
          update.version !== previous.version ||
          update.revision <= previous.revision
        )
          return previous;
        const last = previous.operations.at(-1);
        if (
          update.revision !== previous.revision + 1 ||
          last?.id !== update.operationId ||
          last.points.length !== update.offset
        ) {
          queueMicrotask(resync);
          return previous;
        }
        return {
          ...previous,
          revision: update.revision,
          operations: [
            ...previous.operations.slice(0, -1),
            {
              ...last,
              points: [...last.points, ...update.points],
              complete: update.complete,
            },
          ],
        };
      });
    });
    const goOffline = () => {
      socket.disconnect();
      setConnected(false);
      setReady(false);
    };
    const goOnline = () => {
      socket.connect();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (navigator.onLine) socket.connect();
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [command]);

  const enter = React.useCallback(
    async (
      event: "ROOM:CREATE" | "ROOM:JOIN",
      payload: { name?: string; roomId?: string; token?: string },
    ) => {
      const result =
        event === "ROOM:CREATE"
          ? await command(event, { name: payload.name || "" })
          : await command(event, { ...payload, roomId: payload.roomId || "" });
      sessionStorage.setItem(sessionKey(result.roomId), JSON.stringify(result));
      setSession(result);
      setReady(true);
      setError("");
      return result;
    },
    [command],
  );
  const clearSession = React.useCallback((roomId: string) => {
    sessionStorage.removeItem(sessionKey(roomId));
    setSession(null);
    setReady(false);
    setRoom(null);
    setDrawing(null);
    setSecret(null);
    roomRef.current = null;
  }, []);
  const leave = React.useCallback(async () => {
    if (!session) return;
    await command("ROOM:LEAVE", {});
    clearSession(session.roomId);
  }, [command, clearSession, session]);

  return (
    <GameContext.Provider
      value={{
        connected,
        ready,
        connectionError,
        error,
        setError,
        room,
        drawing,
        secret,
        session,
        command,
        enter,
        leave,
        clearSession,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
export function useGame() {
  const context = React.useContext(GameContext);
  if (!context) throw new Error("GameProvider is missing");
  return context;
}
