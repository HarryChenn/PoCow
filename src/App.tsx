import { useRef, useState } from 'react';
import { createGame, GameState } from './engine/game';
import { applyAction } from './net/apply';
import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { GameView, LobbyView } from './net/protocol';
import { GameTable } from './ui/GameTable';
import { HomeScreen } from './ui/HomeScreen';
import { Lobby } from './ui/Lobby';
import { useAiDriver } from './ui/useAiDriver';

const SOLO_AI_NAMES = ['阿牛', '二妞', '三顺', '四喜', '五魁', '六合', '七巧'];

type Mode = 'home' | 'solo' | 'host' | 'client';

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [soloState, setSoloState] = useState<GameState | null>(null);
  const [hostState, setHostState] = useState<GameState | null>(null);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [clientView, setClientView] = useState<GameView | null>(null);
  const [clientSeat, setClientSeat] = useState(0);
  const [homeBusy, setHomeBusy] = useState<string | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const hostRef = useRef<HostSession | null>(null);
  const clientRef = useRef<ClientSession | null>(null);

  // AI 驱动：单机与房主模式（客户端不驱动）
  useAiDriver(
    mode === 'solo' ? soloState : mode === 'host' ? hostState : null,
    (fn) => {
      if (mode === 'solo') setSoloState((g) => (g ? fn(g) : g));
      else hostRef.current?.apply(fn);
    },
  );

  const goHome = () => {
    hostRef.current?.close();
    hostRef.current = null;
    clientRef.current?.leave();
    clientRef.current = null;
    setSoloState(null);
    setHostState(null);
    setLobby(null);
    setClientView(null);
    setHomeBusy(null);
    setMode('home');
  };

  const startSolo = (name: string, aiCount: number) => {
    setHomeError(null);
    setSoloState(createGame([name, ...SOLO_AI_NAMES.slice(0, aiCount)], [0]));
    setMode('solo');
  };

  const createRoom = (name: string) => {
    setHomeError(null);
    setHomeBusy('正在创建房间…');
    hostRef.current = new HostSession(name, {
      onOpen: () => {
        setHomeBusy(null);
        setMode('host');
      },
      onLobby: setLobby,
      onState: setHostState,
      onError: (msg) => {
        hostRef.current = null;
        setHomeBusy(null);
        setHomeError(msg);
        setMode('home');
      },
    });
  };

  const joinRoom = (name: string, code: string) => {
    setHomeError(null);
    setHomeBusy('正在加入房间…');
    clientRef.current = new ClientSession(code, name, {
      onLobby: (lb) => {
        setHomeBusy(null);
        setLobby(lb);
        setMode('client');
      },
      onState: (seat, view) => {
        setHomeBusy(null);
        setClientSeat(seat);
        setClientView(view);
        setMode('client');
      },
      onClosed: (msg) => {
        clientRef.current = null;
        setLobby(null);
        setClientView(null);
        setHomeBusy(null);
        setHomeError(msg);
        setMode('home');
      },
    });
  };

  if (mode === 'solo' && soloState) {
    return (
      <GameTable
        state={soloState}
        myId={0}
        onAction={(a) => setSoloState((g) => (g ? applyAction(g, 0, a) : g))}
        canNextRound
        exitLabel="返回首页"
        onExit={goHome}
      />
    );
  }

  if (mode === 'host') {
    if (hostState) {
      return (
        <GameTable
          state={hostState}
          myId={0}
          onAction={(a) => hostRef.current?.apply((g) => applyAction(g, 0, a))}
          canNextRound
          exitLabel="解散房间"
          onExit={goHome}
        />
      );
    }
    if (lobby) {
      return (
        <Lobby
          lobby={lobby}
          isHost
          onAddAi={() => hostRef.current?.addAi()}
          onRemoveAi={(i) => hostRef.current?.removeAi(i)}
          onStart={() => hostRef.current?.startGame()}
          onLeave={goHome}
          leaveLabel="解散房间"
        />
      );
    }
  }

  if (mode === 'client') {
    if (clientView) {
      return (
        <GameTable
          state={clientView}
          myId={clientSeat}
          onAction={(a) => clientRef.current?.send(a)}
          canNextRound={false}
          exitLabel="退出房间"
          onExit={goHome}
        />
      );
    }
    if (lobby) {
      return <Lobby lobby={lobby} isHost={false} onLeave={goHome} leaveLabel="退出房间" />;
    }
  }

  return (
    <HomeScreen
      onSolo={startSolo}
      onCreate={createRoom}
      onJoin={joinRoom}
      busy={homeBusy}
      error={homeError}
    />
  );
}
