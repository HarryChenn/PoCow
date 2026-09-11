import { useState } from 'react';
import { LobbyView } from '../net/protocol';
import { LangSwitch, useI18n } from '../i18n';
import { Key } from '../i18n/dict';

interface Props {
  lobby: LobbyView;
  isHost: boolean;
  onAddAi?: () => void;
  /** 移除座位：AI 或踢出远端玩家（仅房主） */
  onRemove?: (index: number) => void;
  onStart?: () => void;
  onLeave: () => void;
  leaveLabel: string;
}

export function Lobby({ lobby, isHost, onAddAi, onRemove, onStart, onLeave, leaveLabel }: Props) {
  const { t } = useI18n();
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
      <LangSwitch className="lang-corner" />
      <h1 className="game-title lobby-title">{t('lobby.title')}</h1>
      <div className="setup-panel lobby-panel">
        <div className="lobby-code-row">
          <span className="lobby-code" onClick={copyCode}>
            {lobby.code}
          </span>
          <button className="btn" onClick={copyCode}>
            {copied ? t('lobby.copied') : t('lobby.copyCode')}
          </button>
        </div>
        <p className="lobby-hint">{t('lobby.shareHint')}</p>

        <div className="lobby-list">
          {lobby.players.map((p, i) => (
            <div key={i} className="lobby-row">
              <span className={`lobby-kind lobby-kind-${p.kind}`}>{t(`lobby.kind.${p.kind}` as Key)}</span>
              <span className="lobby-name">{p.name}</span>
              {!p.connected && <span className="chip">{t('lobby.disconnected')}</span>}
              {isHost && p.kind === 'ai' && (
                <button className="btn lobby-remove" onClick={() => onRemove?.(i)}>
                  {t('lobby.remove')}
                </button>
              )}
              {isHost && p.kind === 'remote' && (
                <button className="btn lobby-remove lobby-kick" onClick={() => onRemove?.(i)}>
                  {t('lobby.kick')}
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: lobby.maxPlayers - lobby.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="lobby-row lobby-empty">
              <span className="lobby-name">{t('lobby.waitingJoin')}</span>
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
                {t('lobby.addAi')}
              </button>
              <button className="btn btn-primary" disabled={!lobby.canStart} onClick={onStart}>
                {t('lobby.start', { n: lobby.players.length })}
              </button>
            </>
          )}
          {!isHost && <span className="lobby-hint">{t('lobby.waitHost')}</span>}
          <button className="btn btn-ghost" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
        {isHost && !lobby.canStart && <p className="lobby-hint">{t('lobby.needPlayers')}</p>}
      </div>
    </div>
  );
}
