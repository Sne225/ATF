import type { Advisory } from '../lib/advisor/rules'
import copy from '../i18n/en.json'

export default function SoilGauge({ advisory }: { advisory: Advisory }) {
  const { topsoil, topsoilBand } = advisory.metrics
  if (topsoil === undefined || !topsoilBand) return <p className="muted">{copy.noSoil}</p>
  const marker = Math.max(0, Math.min(100, topsoil / 0.45 * 100))
  return <div>
    <div className="gauge-label"><span>{copy.soilEstimate}</span><strong>{copy[topsoilBand]}</strong></div>
    <div className="gauge-track" role="meter" aria-label={`${topsoilBand} model-estimated topsoil moisture`} aria-valuenow={Math.round(topsoil * 100)} aria-valuemin={0} aria-valuemax={45}>
      <span className="gauge-marker" style={{ left: `${marker}%` }} />
    </div>
    <div className="gauge-scale"><span>{copy.dry}</span><span>{copy.moist}</span><span>{copy.wet}</span></div>
  </div>
}
