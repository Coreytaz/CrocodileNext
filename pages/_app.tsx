import "../styles/globals.css";
import type { AppProps } from "next/app";
import { GameProvider } from "../lib/game-context";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <GameProvider>
      <Component {...pageProps} />
    </GameProvider>
  );
}

export default MyApp;
