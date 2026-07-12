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
          <p>
            三个核心概念：<b>牌力</b>决定谁赢（只比牌力）；<b>倍率</b>来自底牌加成，不参与比大小；
            <b>赔分 = 牌力 × 倍率</b>，是输家赔给赢家的分数。
          </p>

          <h3>换牌阶段（自由行动，无回合顺序）</h3>
          <p>
            所有玩家<b>同时</b>行动：随时可换牌堆、找空闲的对手换牌或结束换牌。正在交换的一对玩家会显示「交换中」，期间不能与其他人操作；全员结束后进入拆分。
          </p>
          <p>
            ① <b>与牌堆换牌</b>：局开始且尚未行动时，弃一张、从牌堆摸一张。换后本局退出与对手的换牌——自己不能发起，别人也不能找你。
          </p>
          <p>
            ② <b>找对手换牌</b>：指定一名对手发起，对方可拒绝；接受则双方各从对方手牌中<b>暗选一张</b>互换（双方选定后会短暂亮出所选位置再交换）。<b>同一对玩家之间每局最多互换
            2 次</b>（不论谁发起）；被拒绝不消耗次数，但不能再找同一人。
          </p>

          <h3>牌型拆分 3 + 2</h3>
          <p>
            5 张拆为 3 张<b>底牌</b>（定倍率）+ 2 张<b>踢脚</b>（定牌力）。换牌结束后进入
            <b>拆分阶段</b>：每人自行点选 3 张作底牌并确认，<b>拆分不当可能无牛</b>
            ；特殊胜利无需拆分、自动生效。
          </p>

          <h4>底牌倍率（3 张点数和为 10 的倍数即成牛）</h4>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>同花</td>
                <td>×2</td>
              </tr>
              <tr>
                <td>顺子（Q+K+Joker 视为顺子）</td>
                <td>×2</td>
              </tr>
              <tr>
                <td>三条</td>
                <td>×3</td>
              </tr>
              <tr>
                <td>王炸（双 Joker）</td>
                <td>×3</td>
              </tr>
            </tbody>
          </table>
          <p className="rules-note">同一组 3 张同时满足多个加成时相乘（3 张同花顺 = ×4）。</p>

          <h4>踢脚牌力（2 张点数和取个位）</h4>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>1 ～ 6</td>
                <td>牌力 1</td>
              </tr>
              <tr>
                <td>7 / 8 / 9</td>
                <td>牌力 2 / 3 / 4</td>
              </tr>
              <tr>
                <td>0（牛牛）</td>
                <td>牌力 5</td>
              </tr>
              <tr>
                <td>对子 / 双 Joker</td>
                <td>牌力 7</td>
              </tr>
            </tbody>
          </table>

          <h3>特殊胜利（整手 5 张，无需凑牛，不叠踢脚）</h3>
          <table className="rules-table">
            <tbody>
              <tr>
                <td>五张顺子</td>
                <td>牌力 8</td>
              </tr>
              <tr>
                <td>五张同花</td>
                <td>牌力 9</td>
              </tr>
              <tr>
                <td>五花（全为人头牌 / Joker）</td>
                <td>牌力 10</td>
              </tr>
              <tr>
                <td>十小（点数和 ≤ 10）</td>
                <td>牌力 11</td>
              </tr>
              <tr>
                <td>炸弹（四条）</td>
                <td>牌力 12</td>
              </tr>
            </tbody>
          </table>
          <p className="rules-note">
            特殊胜利的赔分 = 特殊牌力 × 底牌倍率。同时满足多个特殊胜利时牌力相加（同花顺 =
            8+9）；底牌倍率取 5 张中加成乘积最大的某一组 3 张（不能跨组拼凑）。例：五张顺子自带 3
            张顺 → 8×2 = 16 分；炸弹自带三条 → 12×3 = 36 分；同花顺 = (8+9)×2×2 = <b>68 分</b>。
          </p>

          <h3>比牌与结算</h3>
          <p>只比牌力：特殊胜利 &gt; 普通踢脚 &gt; 无牛；倍率不参与比大小。</p>
          <p>牌力相同（含全员无牛）时，按德州扑克规则比 5 张牌（Joker 视为最大单牌）。</p>
          <p>
            <b>赢家通吃</b>：牌力最高者获胜，每个输家按赢家的赔分（牌力 ×
            倍率）赔给赢家；无牛获胜按 1 分结算；并列获胜时均分。
          </p>
        </div>
      </div>
    </div>
  );
}
