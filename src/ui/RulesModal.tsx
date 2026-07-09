interface Props {
  onClose: () => void;
}

export function RulesModal({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rules-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>PoCow 德牛 · 规则</h2>
          <button className="btn rules-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rules-body">
          <h3>基本</h3>
          <p>
            54 张牌（含 2 张 Joker），每人 5 张。J / Q / K / Joker 均算 10 点，A 算 1
            点，Joker 不算花色。
          </p>

          <h3>换牌阶段（每局二选一）</h3>
          <p>
            ① <b>与牌堆换牌</b>：局开始且尚未行动时，弃一张、从牌堆摸一张。换后本局退出与对手的换牌——自己不能发起，别人也不能找你。
          </p>
          <p>
            ② <b>找对手换牌</b>：指定一名对手发起，对方可拒绝；接受则双方各从对方手牌中<b>暗选一张</b>互换。每局最多发起
            2 次；被拒绝不消耗次数，但不能再找同一人。
          </p>

          <h3>牌型拆分 3 + 2</h3>
          <p>
            5 张拆为 3 张<b>底牌</b>（定倍数）+ 2 张<b>踢脚</b>（定基数），<b>牌力 = 基数 ×
            倍数</b>。游戏自动选择最优拆分。
          </p>

          <h4>底牌倍数（3 张点数和为 10 的倍数即成牛）</h4>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>同花</td>
                <td>2×</td>
              </tr>
              <tr>
                <td>顺子（Q+K+Joker 视为顺子）</td>
                <td>2×</td>
              </tr>
              <tr>
                <td>三条</td>
                <td>3×</td>
              </tr>
              <tr>
                <td>王炸（双 Joker）</td>
                <td>3×</td>
              </tr>
            </tbody>
          </table>
          <p className="rules-note">同一组 3 张同时满足多个加成时相乘（3 张同花顺 = 4×）。</p>

          <h4>踢脚基数（2 张点数和取个位）</h4>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>1 ～ 6</td>
                <td>1×</td>
              </tr>
              <tr>
                <td>7 / 8 / 9</td>
                <td>2× / 3× / 4×</td>
              </tr>
              <tr>
                <td>0（牛牛）</td>
                <td>5×</td>
              </tr>
              <tr>
                <td>对子 / 双 Joker</td>
                <td>7×</td>
              </tr>
            </tbody>
          </table>

          <h3>特殊胜利（整手 5 张，无需凑牛，不叠踢脚）</h3>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>五张顺子</td>
                <td>8×</td>
              </tr>
              <tr>
                <td>五张同花</td>
                <td>9×</td>
              </tr>
              <tr>
                <td>五花（全为人头牌 / Joker）</td>
                <td>10×</td>
              </tr>
              <tr>
                <td>十小（点数和 ≤ 10）</td>
                <td>11×</td>
              </tr>
              <tr>
                <td>炸弹（四条）</td>
                <td>12×</td>
              </tr>
            </tbody>
          </table>
          <p className="rules-note">
            特殊胜利的牌力 = 特殊基数 × 底牌加成倍数。同时满足多个特殊胜利时基数相加（同花顺 =
            8+9）；底牌加成取 5 张中加成乘积最大的某一组 3 张（不能跨组拼凑）。例：五张顺子自带 3
            张顺 → 16×；炸弹自带三条 → 36×；同花顺 = (8+9)×2×2 = <b>68×</b>。
          </p>

          <h3>比牌与结算</h3>
          <p>比牌只看基数：特殊胜利基数 &gt; 普通踢脚基数 &gt; 无牛；倍数不参与比大小。</p>
          <p>基数相同（含全员无牛）时，按德州扑克规则比 5 张牌（Joker 视为最大单牌）。</p>
          <p>
            <b>赢家通吃</b>：基数最高者获胜，每个输家按赢家的牌力赔分；无牛获胜按 1×
            结算；并列获胜时均分。
          </p>
        </div>
      </div>
    </div>
  );
}
