import Peer, { DataConnection } from 'peerjs';
import { normalizeCode, peerIdForCode } from './code';
import { GameView, HostMsg, LobbyView, NetMsgKey, PlayerAction } from './protocol';

export interface ClientEvents {
  onLobby: (lobby: LobbyView) => void;
  onState: (seat: number, view: GameView) => void;
  /** 加入失败 / 被拒 / 房主断开，均回到首页并展示原因（文案键，由 UI 本地化） */
  onClosed: (msg: NetMsgKey) => void;
}

const JOIN_TIMEOUT_MS = 12000;

/** 加入者会话：连接房主、发动作、收脱敏视图 */
export class ClientSession {
  seat = -1;
  private peer: Peer;
  private conn: DataConnection | null = null;
  private ev: ClientEvents;
  private welcomed = false;
  private ended = false;

  constructor(code: string, name: string, ev: ClientEvents) {
    this.ev = ev;
    this.peer = new Peer();
    const timer = setTimeout(() => {
      if (!this.welcomed) this.fail('net.timeout');
    }, JOIN_TIMEOUT_MS);

    this.peer.on('open', () => {
      const conn = this.peer.connect(peerIdForCode(normalizeCode(code)), { reliable: true });
      this.conn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name } satisfies { t: 'hello'; name: string }));
      conn.on('data', (d) => {
        const m = d as HostMsg;
        if (m.t === 'welcome') {
          this.welcomed = true;
          clearTimeout(timer);
          this.seat = m.seat;
          return;
        }
        if (m.t === 'lobby') return this.ev.onLobby(m.lobby);
        if (m.t === 'state') {
          this.seat = m.seat;
          return this.ev.onState(m.seat, m.view);
        }
        if (m.t === 'error' || m.t === 'roomClosed') this.fail(m.msg);
      });
      conn.on('close', () => this.fail('net.hostClosed'));
      conn.on('error', () => this.fail('net.connError'));
    });
    this.peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      this.fail(
        type === 'peer-unavailable' ? 'net.noRoom' : 'net.serviceFail',
      );
    });
  }

  private fail(msg: NetMsgKey) {
    if (this.ended) return;
    this.ended = true;
    this.ev.onClosed(msg);
    this.peer.destroy();
  }

  send(a: PlayerAction) {
    if (this.conn?.open) this.conn.send({ t: 'action', a });
  }

  leave() {
    this.ended = true;
    this.peer.destroy();
  }
}
