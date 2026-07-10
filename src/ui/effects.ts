/** 轻量 DOM 粒子特效：迸发、震屏。纯装饰，游走于 React 之外，自行清理。 */

const PARTICLE_MS = 900;

export interface BurstOpts {
  count?: number;
  symbols?: string[];
  colors?: string[];
  /** 迸发半径（px） */
  spread?: number;
  sizePx?: number;
}

const DEFAULT_SYMBOLS = ['♠', '♥', '♦', '♣', '✦'];
const DEFAULT_COLORS = ['#f2b93b', '#ffe9ad', '#e8503c', '#fdfbf5'];

export function burst(x: number, y: number, opts: BurstOpts = {}) {
  const {
    count = 14,
    symbols = DEFAULT_SYMBOLS,
    colors = DEFAULT_COLORS,
    spread = 90,
    sizePx = 16,
  } = opts;
  const host = document.createElement('div');
  host.className = 'fx-burst';
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    const ang = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.6);
    s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    s.style.color = colors[Math.floor(Math.random() * colors.length)];
    s.style.fontSize = `${sizePx * (0.6 + Math.random() * 0.8)}px`;
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`);
    s.style.animationDelay = `${Math.random() * 80}ms`;
    host.appendChild(s);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), PARTICLE_MS + 300);
}

export function burstGold(x: number, y: number, count = 16) {
  burst(x, y, { count, symbols: ['✦', '★', '✧'], colors: ['#f2b93b', '#ffe9ad', '#fff'], spread: 110 });
}

export function burstGreen(x: number, y: number) {
  burst(x, y, { count: 12, symbols: ['✦', '✓'], colors: ['#6fd97a', '#b8f0be'], spread: 70 });
}

export function shake(selector = '.table-screen') {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  el.classList.remove('fx-shake');
  void el.offsetWidth; // 重启动画
  el.classList.add('fx-shake');
  setTimeout(() => el.classList.remove('fx-shake'), 500);
}
