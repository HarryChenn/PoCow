import Peer, { DataConnection } from 'peerjs';
import { createGame, GameState, markSeatAi, startRound } from '../engine/game';
import { applyAction } from './apply';
import { makeRoomCode, peerIdForCode } from './code';
import { ClientMsg, HostMsg, LobbyView } from './protocol';
import { viewFor } from './view';

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 3;
const AI_NAMES = ['阿牛', '二妞', '三顺', '四喜', '五魁', '六合', '七巧'];

export interface HostEvents {
  onOpen: (code: string) => void;
  onLobby: (lobby: LobbyView) => void;
  onState: (state: GameState) => void;
  onError: (msg: string) => void;
}

interface Seat {
  name: string;
  kind: 'host' | 'remote' | 'ai';
  conn?: DataConnection;
  connected: boolean;
}

/** 房主会话：权威游戏状态、连接管理、动作校验、脱敏广播 */
export class HostSession {
  code = '';
  state: GameState | null = null;
  private peer: Peer | null = null;
  private seats: Seat[];
  private ev: HostEvents;
  private closed = false;

  constructor(hostName: string, ev: HostEvents) {
    this.ev = ev;
    this.seats = [{ name: hostName, kind: 'host', connected: true }];
    this.open(0);
  }

  /** PeerJS id 撞车时换码重试 */
  private open(attempt: number) {
    const code = makeRoomCode();
    const peer = new Peer(peerIdForCode(code));
    this.peer = peer;
    peer.on('open', () => {
      if (this.closed) return;
      this.code = code;
      this.ev.onOpen(code);
      this.ev.onLobby(this.lobbyView());
    });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id' && attempt < 3) {
        peer.destroy();
        this.open(attempt + 1);
        return;
      }
      if (!this.closed && !this.code) {
        this.ev.onError('联机服务连接失败，请稍后重试');
      }
    });
    peer.on('connection', (conn) => {
      conn.on('data', (d) => this.handleMsg(conn, d as ClientMsg));
      conn.on('close', () => this.handleDrop(conn));
      conn.on('error', () => this.handleDrop(conn));
    });
  }

  private seatOf(conn: DataConnection): number {
    return this.seats.findIndex((s) => s.conn === conn);
  }

  private handleMsg(conn: DataConnection, msg: ClientMsg) {
    if (msg.t === 'hello') {
      if (this.state) return this.reject(conn, '游戏已开始，无法加入');
      if (this.seats.length >= MAX_PLAYERS) return this.reject(conn, '房间已满');
      if (this.seatOf(conn) >= 0) return;
      const base = String(msg.name || '玩家').slice(0, 12);
      const name = this.seats.some((s) => s.name === base)
        ? `${base}${this.seats.length + 1}`
        : base;
      this.seats.push({ name, kind: 'remote', conn, connected: true });
      this.send(conn, { t: 'welcome', seat: this.seats.length - 1 });
      this.pushLobby();
      return;
    }
    if (msg.t === 'action') {
      const seat = this.seatOf(conn);
      if (seat < 0 || !this.state) return;
      if (msg.a.k === 'nextRound') return; // 开下一局仅限房主
      const a = msg.a;
      this.apply((g) => applyAction(g, seat, a));
    }
  }

  private reject(conn: DataConnection, msg: string) {
    this.send(conn, { t: 'error', msg });
    setTimeout(() => conn.close(), 300);
  }

  private handleDrop(conn: DataConnection) {
    const seat = this.seatOf(conn);
    if (seat < 0 || this.closed) return;
    if (!this.state) {
      // 大厅阶段直接移除
      this.seats.splice(seat, 1);
      this.pushLobby();
      return;
    }
    // 局中掉线：AI 接管
    this.seats[seat].connected = false;
    this.seats[seat].conn = undefined;
    this.apply((g) => markSeatAi(g, seat));
  }

  private send(conn: DataConnection, msg: HostMsg) {
    if (conn.open) conn.send(msg);
  }

  private remotes(): { seat: number; conn: DataConnection }[] {
    return this.seats.flatMap((s, i) => (s.conn ? [{ seat: i, conn: s.conn }] : []));
  }

  lobbyView(): LobbyView {
    return {
      code: this.code,
      players: this.seats.map((s) => ({ name: s.name, kind: s.kind, connected: s.connected })),
      canStart: this.seats.length >= MIN_PLAYERS && this.seats.length <= MAX_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  private pushLobby() {
    const lobby = this.lobbyView();
    this.ev.onLobby(lobby);
    for (const { conn } of this.remotes()) this.send(conn, { t: 'lobby', lobby });
  }

  addAi() {
    if (this.state || this.seats.length >= MAX_PLAYERS) return;
    const used = new Set(this.seats.map((s) => s.name));
    const name = AI_NAMES.find((n) => !used.has(n)) ?? `AI-${this.seats.length}`;
    this.seats.push({ name, kind: 'ai', connected: true });
    this.pushLobby();
  }

  /** 大厅中移除座位：AI 直接移除；远端玩家通知后踢出 */
  removeSeat(index: number) {
    if (this.state) return;
    const seat = this.seats[index];
    if (!seat || seat.kind === 'host') return;
    if (seat.kind === 'remote' && seat.conn) {
      this.send(seat.conn, { t: 'roomClosed', msg: '你已被房主移出房间' });
      const conn = seat.conn;
      seat.conn = undefined; // 防止 close 事件触发 handleDrop 重复处理
      setTimeout(() => conn.close(), 300);
    }
    this.seats.splice(index, 1);
    this.pushLobby();
  }

  startGame() {
    if (this.state || this.seats.length < MIN_PLAYERS) return;
    const humanSeats = this.seats.flatMap((s, i) => (s.kind === 'ai' ? [] : [i]));
    this.state = createGame(
      this.seats.map((s) => s.name),
      humanSeats,
    );
    this.broadcast();
  }

  nextRound() {
    if (this.state?.phase === 'showdown') this.apply(startRound);
  }

  /** 房主本地动作与 AI 驱动的统一入口：应用后广播 */
  apply(fn: (g: GameState) => GameState) {
    if (!this.state) return;
    this.state = fn(this.state);
    this.broadcast();
  }

  private broadcast() {
    if (!this.state) return;
    this.ev.onState(this.state);
    for (const { seat, conn } of this.remotes()) {
      this.send(conn, { t: 'state', seat, view: viewFor(this.state, seat) });
    }
  }

  close() {
    this.closed = true;
    for (const { conn } of this.remotes()) {
      this.send(conn, { t: 'roomClosed', msg: '房主解散了房间' });
    }
    setTimeout(() => this.peer?.destroy(), 300);
  }
}
