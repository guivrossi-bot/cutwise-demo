'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const PILL = {
  green: { bg: '#E1F5EE', color: '#085041', dot: '#1D9E75' },
  amber: { bg: '#FAEEDA', color: '#633806', dot: '#EF9F27' },
  red:   { bg: '#FCEBEB', color: '#501313', dot: '#E24B4A' },
}

function Pill({ type, children }) {
  const s = PILL[type] || PILL.green
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {children}
    </span>
  )
}

function scoreReport(answers) {
  const t = parseFloat(answers.thickness) || 8
  const lr = parseFloat(answers.labor_rate) || 35
  const mult = (t > 30 ? 2.2 : t > 15 ? 1.5 : 1) * (lr > 50 ? 1.3 : lr < 20 ? 0.8 : 1)
  const mat = answers.material || ''
  const noOxy = ['Aluminum', 'Stainless', 'Copper', 'Titanium'].some(m => mat.includes(m))

  const laser = { total: (3.2 * mult).toFixed(2), time: (1.4 * mult).toFixed(2), labor: (0.6 * mult).toFixed(2), gas: '0.30', elec: '0.25', cons: '0.65', cutTime: '1.8 min', totalTime: '~2.5 min / part', score: 75 }
  const waterjet = { total: (5.8 * mult).toFixed(2), time: (2.9 * mult).toFixed(2), labor: (0.9 * mult).toFixed(2), gas: '1.10', elec: '0.30', cons: '0.60', cutTime: '6.2 min', totalTime: '~7.5 min / part', score: 58 }
  const plasma = { total: (1.4 * mult).toFixed(2), time: (0.4 * mult).toFixed(2), labor: (0.35 * mult).toFixed(2), gas: '0.25', elec: '0.20', cons: '0.20', cutTime: '0.9 min', totalTime: '~1.4 min / part', score: 65 }
  const oxyfuel = { total: noOxy ? null : (0.8 * mult).toFixed(2), time: noOxy ? null : (0.2 * mult).toFixed(2), labor: noOxy ? null : (0.3 * mult).toFixed(2), gas: noOxy ? null : '0.35', elec: noOxy ? null : '0.05', cons: noOxy ? null : '0.10', cutTime: noOxy ? null : '3.2 min', totalTime: noOxy ? null : '~4.5 min / part', score: noOxy ? 0 : 50 }

  const fin = answers.finish || '', tol = answers.tolerance || '', haz = answers.haz || '', pri = answers.priority || ''
  if (fin.includes('Fine')) { laser.score += 10; waterjet.score += 8; plasma.score -= 20; if (!noOxy) oxyfuel.score -= 30 }
  if (tol.includes('0.1') || tol.includes('0.05')) { laser.score += 10; waterjet.score += 8; plasma.score -= 15; if (!noOxy) oxyfuel.score -= 25 }
  if (haz?.includes('Very')) { laser.score -= 10; waterjet.score += 15 }
  if (pri?.includes('Lowest')) { plasma.score += 15; laser.score -= 5; if (!noOxy) oxyfuel.score += 20 }
  if (t > 50 && !noOxy) { oxyfuel.score += 15 }

  const all = [['laser', laser], ['waterjet', waterjet], ['plasma', plasma], ...(!noOxy ? [['oxyfuel', oxyfuel]] : [])]
  all.sort((a, b) => b[1].score - a[1].score)
  return { laser, waterjet, plasma, oxyfuel, sorted: all, noOxy }
}

export default function Report({ answers, units, onRestart }) {
  const [fbOpen, setFbOpen] = useState(false)
  const [fbOverall, setFbOverall] = useState(0)
  const [fbComment, setFbComment] = useState('')
  const [fbSubmitted, setFbSubmitted] = useState(false)

  const imp = units === 'imperial'
  const t = parseFloat(answers.thickness) || 8
  const thickStr = imp ? `${(t / 25.4).toFixed(2)} in` : `${t}mm`
  const { laser, waterjet, plasma, oxyfuel, sorted, noOxy } = scoreReport(answers)
  const winner = sorted[0]
  const NAMES = { laser: 'Fiber laser', waterjet: 'Waterjet', plasma: 'Plasma', oxyfuel: 'Oxyfuel' }
  const winnerName = NAMES[winner[0]]
  const winnerData = winner[1]

  async function submitFeedback() {
    try {
      await supabase.from('feedback_submissions').insert([{
        overall_score: fbOverall,
        comment: fbComment,
        answers_payload: answers,
        recommended_process: winner[0]
      }])
    } catch (e) { }
    setFbSubmitted(true)
  }

  const secTitle = txt => (
    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e8e8' }}>{txt}</div>
  )

  const costCard = (key, data, gasLabel) => {
    if (!data.total) return null
    const isWin = key === winner[0]
    return (
      <div key={key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '9px 13px', background: isWin ? '#E6F1FB' : '#f9f9f9', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>{NAMES[key]}</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>${data.total}</span>
        </div>
        {[['Cutting time', data.time], ['Labor', data.labor], [gasLabel, data.gas], ['Electricity', data.elec], ['Consumables', data.cons]].map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 13px', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
            <span style={{ color: '#666' }}>{l}</span>
            <span style={{ fontWeight: 500 }}>${v}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #e8e8e8', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          Comparison report · {answers.material || 'Mild steel'} · {thickStr}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRestart} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e0e0e0', fontSize: 12, color: '#666' }}>New analysis</button>
          <button onClick={() => window.print()} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #85B7EB', background: '#E6F1FB', fontSize: 12, color: '#0C447C', fontWeight: 500 }}>Export PDF</button>
        </div>
      </div>

      <div style={{ maxWidth: 820, width: '100%', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ padding: '14px 18px', borderRadius: 12, border: '2px solid #85B7EB', background: '#E6F1FB', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#185FA5', letterSpacing: '0.5px', marginBottom: 3 }}>RECOMMENDED TECHNOLOGY</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#0C447C', marginBottom: 4 }}>{winnerName}</div>
            <div style={{ fontSize: 12, color: '#185FA5', lineHeight: 1.5, maxWidth: 480 }}>
              For {answers.material || 'your material'} at {thickStr}, {winnerName.toLowerCase()} delivers the best balance of cut quality, speed, and cost for your requirements.
              {noOxy ? ' Note: oxyfuel is not compatible with this material.' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 2 }}>Est. cost per part</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#0C447C' }}>${winnerData.total}</div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>industry average basis</div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle('Side-by-side scorecard')}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${noOxy ? 3 : 4}, 1fr)` }}>
              {['Criterion', 'Fiber laser', 'Waterjet', 'Plasma', ...(!noOxy ? ['Oxyfuel'] : [])].map((h, i) => (
                <div key={h} style={{ padding: '9px 10px', background: i === 1 ? '#E6F1FB' : '#f9f9f9', fontSize: i === 0 ? 11 : 12, fontWeight: 500, color: i === 1 ? '#0C447C' : i === 0 ? '#aaa' : '#1a1a1a', borderBottom: '1px solid #e0e0e0', textAlign: i === 0 ? 'left' : 'center' }}>{h}</div>
              ))}
              {[
                ['Cut quality', <Pill type="green">Excellent</Pill>, <Pill type="green">Excellent</Pill>, <Pill type="amber">Fair</Pill>, <Pill type="amber">Moderate</Pill>],
                ['Tolerance', <Pill type="green">±0.1{imp?'in':'mm'}</Pill>, <Pill type="green">±0.15{imp?'in':'mm'}</Pill>, <Pill type="amber">±0.5{imp?'in':'mm'}</Pill>, <Pill type="red">±1.5{imp?'in':'mm'}</Pill>],
                ['Cut speed', <Pill type="green">Fast</Pill>, <Pill type="amber">Slow</Pill>, <Pill type="green">Very fast</Pill>, <Pill type="amber">Slow</Pill>],
                ['Heat zone', <Pill type="amber">Moderate</Pill>, <Pill type="green">None</Pill>, <Pill type="red">High</Pill>, <Pill type="red">High</Pill>],
                ['Finishing', <Pill type="green">Usually none</Pill>, <Pill type="green">Usually none</Pill>, <Pill type="red">Often needed</Pill>, <Pill type="red">Often needed</Pill>],
                ['Cost fit', <Pill type="green">Good</Pill>, <Pill type="amber">Higher</Pill>, <Pill type="green">Lowest</Pill>, <Pill type="green">Lowest</Pill>],
              ].map((row, ri) => (
                row.slice(0, noOxy ? 4 : 5).map((cell, ci) => (
                  <div key={`${ri}-${ci}`} style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', background: ci === 1 ? 'rgba(230,241,251,0.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: ci === 0 ? 'flex-start' : 'center', fontSize: 12, color: ci === 0 ? '#666' : undefined }}>
                    {cell}
                  </div>
                ))
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle('Cost per part — detailed breakdown')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${noOxy ? 3 : 4}, minmax(0,1fr))`, gap: 10 }}>
            {costCard('laser', laser, 'Gas / assist gas')}
            {costCard('waterjet', waterjet, 'Abrasive (garnet)')}
            {costCard('plasma', plasma, 'Gas (plasma/shield)')}
            {!noOxy && costCard('oxyfuel', oxyfuel, 'O₂ + fuel gas')}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle('Setup & amortization')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${noOxy ? 3 : 4}, minmax(0,1fr))`, gap: 10 }}>
            {[
              { key: 'laser', setup: '~12 min', cost: '$7.00', be: '6 parts', mch: '$85/hr' },
              { key: 'waterjet', setup: '~20 min', cost: '$11.70', be: '10 parts', mch: '$70/hr' },
              { key: 'plasma', setup: '~8 min', cost: '$4.70', be: '4 parts', mch: '$35/hr' },
              ...(!noOxy ? [{ key: 'oxyfuel', setup: '~5 min', cost: '$2.50', be: '2 parts', mch: '$15/hr' }] : [])
            ].map(d => {
              const isWin = d.key === winner[0]
              return (
                <div key={d.key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, padding: '11px 13px', background: isWin ? 'rgba(230,241,251,0.15)' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 9, color: isWin ? '#0C447C' : '#1a1a1a' }}>{NAMES[d.key]}</div>
                  {[['Setup time', d.setup], ['Setup cost / run', d.cost], ['Breakeven qty', d.be], ['Machine cost / hr', d.mch]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#666' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle(`Time estimates — ${imp ? '~19.7×11.8 in part' : '500 × 300mm part'}`)}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${noOxy ? 3 : 4}, minmax(0,1fr))`, gap: 10 }}>
            {[
              { key: 'laser', cut: '1.8 min', pct: 40, pierce: '0.3 min', pp: 15, repos: '0.4 min', rp: 18, total: '~2.5 min / part', color: '#378ADD' },
              { key: 'waterjet', cut: '6.2 min', pct: 80, pierce: '0.8 min', pp: 30, repos: '0.5 min', rp: 20, total: '~7.5 min / part', color: '#1D9E75' },
              { key: 'plasma', cut: '0.9 min', pct: 22, pierce: '0.2 min', pp: 10, repos: '0.3 min', rp: 14, total: '~1.4 min / part', color: '#EF9F27' },
              ...(!noOxy ? [{ key: 'oxyfuel', cut: '3.2 min', pct: 60, pierce: '0.0 min', pp: 0, repos: '1.2 min', rp: 35, total: '~4.5 min / part', color: '#D85A30' }] : [])
            ].map(d => {
              const isWin = d.key === winner[0]
              return (
                <div key={d.key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, padding: '11px 13px', background: isWin ? 'rgba(230,241,251,0.15)' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: isWin ? '#0C447C' : '#1a1a1a' }}>{NAMES[d.key]}</div>
                  {[['Cut time', d.cut, d.pct], ['Pierce time', d.pierce, d.pp], ['Repositioning', d.repos, d.rp]].map(([l, v, pct]) => (
                    <div key={l} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 3 }}><span>{l}</span><span>{v}</span></div>
                      <div style={{ height: 5, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: d.color, width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 5 }}>{d.total}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
          <div onClick={() => setFbOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', cursor: 'pointer', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Were these estimates accurate for your job?</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>Help improve the cost engine — takes 30 seconds</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500 }}>{fbOpen ? 'Close ×' : 'Leave feedback →'}</div>
          </div>

          {fbOpen && !fbSubmitted && (
            <div style={{ borderTop: '1px solid #e8e8e8' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8e8e8' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>How accurate was the overall recommendation?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[[1,'Way off'],[2,'Somewhat off'],[3,'Close enough'],[4,'Pretty accurate'],[5,'Spot on']].map(([n, label]) => (
                    <button key={n} onClick={() => setFbOverall(n)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                      border: fbOverall === n ? (n <= 2 ? '1px solid #F09595' : n === 3 ? '1px solid #FAC775' : '1px solid #9FE1CB') : '1px solid #e0e0e0',
                      background: fbOverall === n ? (n <= 2 ? '#FCEBEB' : n === 3 ? '#FAEEDA' : '#E1F5EE') : '#fff',
                      color: fbOverall === n ? (n <= 2 ? '#791F1F' : n === 3 ? '#633806' : '#085041') : '#666'
                    }}>{n} — {label}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8e8e8' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>What did you actually pay or observe? Any context helps.</div>
                <textarea value={fbComment} onChange={e => setFbComment(e.target.value)} rows={3} placeholder="e.g. 'Laser cost was accurate for 6mm MS but plasma was 30% high for our shop rate. We run at $25/hr labor not $35.'" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
                <div style={{ fontSize: 11, color: '#aaa' }}>Anonymous · used only to improve estimates</div>
                <button onClick={submitFeedback} disabled={fbOverall === 0} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #85B7EB', background: '#E6F1FB', fontSize: 13, fontWeight: 500, color: '#0C447C', opacity: fbOverall === 0 ? 0.4 : 1 }}>Send feedback</button>
              </div>
            </div>
          )}

          {fbOpen && fbSubmitted && (
            <div style={{ borderTop: '1px solid #e8e8e8', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Thank you — that genuinely helps.</div>
              <div style={{ fontSize: 12, color: '#666', maxWidth: 280, lineHeight: 1.5 }}>Every piece of feedback directly adjusts our cost model.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}