import { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n';
import { HomeScreen } from '../HomeScreen';
import { RulesModal } from '../RulesModal';
import { GameTable } from '../GameTable';
import { createGame, doArrange, doPass, GameState } from '../../engine/game';

// 纯 node 环境（无 jsdom）：只需补一个 localStorage，effect 在 SSR 下不执行
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

function setLang(l: string) {
  localStorage.setItem('pocow-lang', l);
}
const noop = () => {};

function html(node: ReactNode) {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

/** 语言切换器里的「中文」是语言自称，查残留中文时要排除 */
function withoutSwitcher(out: string) {
  return out.replace(/<div class="lang-switch[\s\S]*?<\/div>/g, '');
}

/** 走到摊牌：全员结束换牌 → 每人提交前 3 张作底牌 */
function toShowdown(): GameState {
  let g = createGame(['Ann', 'Bob', 'Cid'], [0, 1, 2]);
  for (let i = 0; i < 3; i++) g = doPass(g, i);
  expect(g.phase).toBe('arrange');
  for (let i = 0; i < 3; i++) {
    g = doArrange(g, i, g.players[i].hand.slice(0, 3).map((c) => c.id));
  }
  expect(g.phase).toBe('showdown');
  return g;
}

describe('整屏渲染双语快照', () => {
  for (const [lang, probe, absent] of [
    ['en', ['Start Solo', 'Play with Friends', 'How to Play'], /[一-鿿]/],
    ['zh', ['单机开局', '和朋友联机', '查看规则'], /Start Solo/],
  ] as const) {
    it(`首页 ${lang}`, () => {
      setLang(lang);
      const out = html(<HomeScreen onSolo={noop} onCreate={noop} onJoin={noop} busy={null} error={null} />);
      for (const p of probe) expect(out).toContain(p);
      expect(withoutSwitcher(out)).not.toMatch(absent);
    });
  }

  it('规则弹窗 en 无中文残留，粗体标记已解析', () => {
    setLang('en');
    const out = html(<RulesModal onClose={noop} />);
    expect(out).toContain('Winner takes all');
    expect(out).toContain('<b>');
    expect(out).not.toContain('**');
    expect(out).not.toMatch(/[一-鿿]/);
  });

  it('牌桌 + 摊牌面板 en 无中文残留、无未翻译键名', () => {
    setLang('en');
    const g = toShowdown();
    const out = html(
      <GameTable state={g} myId={0} onAction={noop} canNextRound exitLabel="Back" onExit={noop} />,
    );
    expect(out).toContain('Showdown');
    expect(withoutSwitcher(out)).not.toMatch(/[一-鿿]/);
    expect(out).not.toMatch(/(table|log|eval|detail|showdown)\.[a-zA-Z]/);
  });

  it('牌桌 zh 正常显示中文', () => {
    setLang('zh');
    const g = toShowdown();
    const out = html(
      <GameTable state={g} myId={0} onAction={noop} canNextRound exitLabel="返回" onExit={noop} />,
    );
    expect(out).toContain('摊牌');
    expect(out).not.toMatch(/(table|log|eval|detail|showdown)\.[a-zA-Z]/);
  });
});
