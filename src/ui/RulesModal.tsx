import { Rich, useI18n } from '../i18n';
import { Key } from '../i18n/dict';

interface Props {
  onClose: () => void;
}

/** 加成/牌力表格：左列文案键，右列已是成品文字 */
function Table({ rows }: { rows: [Key, string][] }) {
  const { t } = useI18n();
  return (
    <table className="rules-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{t(k)}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RulesModal({ onClose }: Props) {
  const { t } = useI18n();
  const power = (n: number) => t('rules.powerN', { n });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rules-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>{t('rules.title')}</h2>
          <button className="btn rules-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rules-body">
          <h3>{t('rules.h.basics')}</h3>
          <p>{t('rules.basics1')}</p>
          <p>
            <Rich k="rules.basics2" />
          </p>

          <h3>{t('rules.h.exchange')}</h3>
          <p>
            <Rich k="rules.exchange1" />
          </p>
          <p>
            <Rich k="rules.exchange2" />
          </p>
          <p>
            <Rich k="rules.exchange3" />
          </p>

          <h3>{t('rules.h.split')}</h3>
          <p>
            <Rich k="rules.split1" />
          </p>

          <h4>{t('rules.h.bonus')}</h4>
          <Table
            rows={[
              ['rules.bonus.flush', '×2'],
              ['rules.bonus.straight', '×2'],
              ['rules.bonus.trips', '×3'],
            ]}
          />
          <p className="rules-note">{t('rules.bonusNote')}</p>

          <h4>{t('rules.h.handBonus')}</h4>
          <p>
            <Rich k="rules.handBonus" />
          </p>

          <h4>{t('rules.h.kicker')}</h4>
          <Table
            rows={[
              ['rules.kicker.1to6', power(1)],
              ['rules.kicker.789', `${power(2)} / ${power(3)} / ${power(4)}`],
              ['rules.kicker.0', power(5)],
              ['rules.kicker.pair', power(7)],
            ]}
          />

          <h3>{t('rules.h.special')}</h3>
          <Table
            rows={[
              ['rules.special.straight5', power(8)],
              ['rules.special.flush5', power(9)],
              ['rules.special.allFace', power(10)],
              ['rules.special.tenSmall', power(11)],
              ['rules.special.bomb', power(12)],
            ]}
          />
          <p className="rules-note">
            <Rich k="rules.specialNote" />
          </p>

          <h3>{t('rules.h.compare')}</h3>
          <p>{t('rules.compare1')}</p>
          <p>{t('rules.compare2')}</p>
          <p>
            <Rich k="rules.compare3" />
          </p>
        </div>
      </div>
    </div>
  );
}
