import { useState } from 'react';
import { LobbyView } from '../net/protocol';

interface Props {
  lobby: LobbyView;
  isHost: boolean;
  onAddAi?: () => void;
  onRemoveAi?: (index: number) => void;
  onStart?: () => void;
  onLeave: () => void;
  leaveLabel: string;
}

const KIND_LABEL = { host: '房主', remote: '玩家', ai: 'AI' } as const;

export function Lobby({ lobby, isHost, onAddAi, onRemoveAi, onStart, onLeave, leaveLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  return (
    <div className="setup-screen">
      <h1 className="game-title lobby-title">房间</h1>
      <div className="setup-panel lobby-panel">
        <div className="lobby-code-row">
          <span className="lobby-code" onClick={copyCode}>
            {lobby.code}
          </span>
          <button className="btn" onClick={copyCode}>
            {copied ? '已复制 ✓' : '复制房间码'}
          </button>
        </div>
        <p className="lobby-hint">把房间码发给朋友，他们在首页输入即可加入</p>

        <div className="lobby-list">
          {lobby.players.map((p, i) => (
            <div key={i} className="lobby-row">
              <span className={`lobby-kind lobby-kind-${p.kind}`}>{KIND_LABEL[p.kind]}</span>
              <span className="lobby-name">{p.name}</span>
              {!p.connected && <span className="chip">已掉线</span>}
              {isHost && p.kind === 'ai' && (
                <button className="btn lobby-remove" onClick={() => onRemoveAi?.(i)}>
                  移除
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: lobby.maxPlayers - lobby.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="lobby-row lobby-empty">
              <span className="lobby-name">等待加入…</span>
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {isHost && (
            <>
              <button
                className="btn"
                disabled={lobby.players.length >= lobby.maxPlayers}
                onClick={onAddAi}
              >
                + 添加 AI
              </button>
              <button className="btn btn-primary" disabled={!lobby.canStart} onClick={onStart}>
                开始游戏（{lobby.players.length} 人）
              </button>
            </>
          )}
          {!isHost && <span className="lobby-hint">等待房主开始游戏…</span>}
          <button className="btn btn-ghost" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
        {isHost && !lobby.canStart && <p className="lobby-hint">至少需要 3 名玩家（可用 AI 补位）</p>}
      </div>
    </div>
  );
}
