'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const BASE_STEPS = [
  { id: 'material', title: 'What are you cutting?', sub: 'Tell us about the material and its dimensions.',
    fields: [
      { id: 'material', label: 'Material type', type: 'chips', required: true,
        options: ['Mild steel', 'Stainless steel', 'Aluminum', 'Copper', 'Titanium', 'Other'] },
      { id: 'thickness', label: 'Material thickness', type: 'number', unit: 'mm', required: true, placeholder: 'e.g. 6' },
      { id: 'size', label: 'Part size (approx.)', type: 'chips', optional: true,
        options: ['< 100mm', '100–500mm', '500mm–1m', '> 1m'], hint: 'Used to estimate cutting time' }
    ]
  },
  { id: 'cut', title: 'Describe the cut', sub: 'What does the part look like and how should the edge feel?',
    fields: [
      { id: 'geometry', label: 'Cut geometry', type: 'chips', required: true,
        options: ['Straight lines', 'Simple curves', 'Complex contours', 'Holes / piercing', 'Mixed'] },
      { id: 'finish', label: 'Surface finish needed', type: 'chips', required: true,
        options: ['Rough (structural)', 'Medium (functional)', 'Fine (visible / precise)'] },
      { id: 'haz', label: 'Heat sensitivity', type: 'chips', optional: true,
        options: ['Not sensitive', 'Somewhat sensitive', 'Very sensitive'], hint: 'Affects warping near the cut' }
    ]
  },
  { id: 'precision', title: 'Precision requirements', sub: 'How tight does it need to be?',
    fields: [
      { id: 'tolerance', label: 'Dimensional tolerance', type: 'chips', required: true,
        options: ['±0.5mm (loose)', '±0.2mm (standard)', '±0.1mm (tight)', '< ±0.05mm (precision)'] },
      { id: 'squareness', label: 'Edge squareness', type: 'chips', optional: true,
        options: ['Not critical', 'Important', 'Critical'], hint: 'Matters for welding and assembly fit-up' }
    ]
  },
  { id: 'volume', title: 'Volume & production', sub: 'How many parts, and how often?',
    fields: [
      { id: 'quantity', label: 'Quantity per run', type: 'chips', required: true,
        options: ['1–5 (prototype)', '6–50 (small batch)', '51–500 (medium)', '500+ (production)'] },
      { id: 'frequency', label: 'How often?', type: 'chips', optional: true,
        options: ['One-off', 'Occasionally', 'Monthly', 'Weekly / continuous'], hint: 'Affects setup cost amortization' }
    ]
  },
  { id: 'priority', title: 'Budget & priorities', sub: 'What matters most in this decision?',
    fields: [
      { id: 'priority', label: 'Top priority', type: 'chips', required: true,
        options: ['Lowest cost', 'Fastest turnaround', 'Best quality', 'No heat distortion'] },
      { id: 'budget', label: 'Rough budget per part', type: 'chips', optional: true,
        options: ['< $2', '$2–10', '$10–50', '$50+', 'Not sure yet'] }
    ]
  }
]

const DEPTH_STEP = { id: 'depth', title: 'How detailed should your report be?', sub: 'Choose the level of analysis that fits your needs.', special: 'depth' }

const ADV_STEP = { id: 'advanced', title: 'Your operational parameters', sub: 'All optional — industry averages fill in automatically for anything left blank.',
  fields: [
    { id: 'labor_rate', label: 'Labor cost per hour', type: 'number', unit: '$/hr', optional: true, placeholder: 'avg $35' },
    { id: 'electricity', label: 'Electricity rate', type: 'number', unit: '$/kWh', optional: true, placeholder: 'avg $0.12' },
    { id: 'gas_price', label: 'Gas / fuel cost', type: 'number', unit: '$/unit', optional: true, placeholder: 'avg $1.80' },
    { id: 'machine_rate', label: 'Machine hourly rate', type: 'number', unit: '$/hr', optional: true, placeholder: 'avg $70' },
  ]
}

const EMAIL_STEP = { id: 'email', title: 'Where should we send your report?', sub: 'Your full comparison report will be emailed instantly.', special: 'email' }

// ====================== PLASMA-BIASED SCORING + OXYFUEL RESTRICTION ======================
function score(answers) {
  const t = parseFloat(answers.thickness) || 8
  const fin = answers.finish || ''
  const tol = answers.tolerance || ''
  const haz = answers.haz || ''
  const pri = answers.priority || ''
  const m = answers.material || ''

  const isMildSteel = m === 'Mild steel'

  // Base scores with strong plasma bias
  let L = { q: 82, s: 78, c: 68, sc: 72 }   // Laser
  let W = { q: 78, s: 48, c: 55, sc: 58 }   // Waterjet
  let P = { q: 65, s: 90, c: 88, sc: 85 }   // Plasma
  let O = { q: 40, s: 38, c: 92, sc: isMildSteel ? 58 : 0 }   // Oxyfuel only for Mild steel

  // Thickness bias
  if (t >= 6 && t <= 25) {
    P.sc += 24
    L.sc -= 12
    W.sc -= 8
  }
  if (t > 25 && t <= 50) {
    P.sc += 16
    if (isMildSteel) O.sc += 12
    L.sc -= 14
  }
  if (t > 50) {
    if (isMildSteel) O.sc += 22
    P.sc += 10
    L.sc -= 20
  }

  // Finish quality
  if (fin.includes('Fine')) {
    L.q += 14; W.q += 10
    P.q -= 16
    if (isMildSteel) O.q -= 30
  } else if (fin === 'Rough (structural)') {
    P.sc += 14
    if (isMildSteel) O.sc += 10
  }

  // Tolerance
  if (tol.includes('0.1') || tol.includes('0.05')) {
    L.sc += 15
    W.sc += 11
    P.sc -= 9
  }

  // Heat sensitivity
  if (haz.includes('Very')) {
    W.sc += 22
    L.sc -= 14
    P.sc -= 9
    if (isMildSteel) O.sc -= 20
  }

  // Priorities
  if (pri.includes('Lowest cost') || pri.includes('Lowest')) {
    P.sc += 26
    if (isMildSteel) O.sc += 20
    L.sc -= 14
  }
  if (pri.includes('Fastest turnaround') || pri.includes('Fastest')) {
    P.sc += 20
    L.sc += 6
  }
  if (pri.includes('Best quality') || pri.includes('quality')) {
    L.sc += 18
    W.sc += 12
    P.sc -= 10
  }
  if (pri.includes('No heat distortion') || pri.includes('heat')) {
    W.sc += 26
    L.sc -= 16
    P.sc -= 16
    if (isMildSteel) O.sc -= 22
  }

  const cl = v => Math.min(99, Math.max(5, Math.round(v)))

  return {
    laser:    { q: cl(L.q), s: cl(L.s), c: cl(L.c), sc: cl(L.sc) },
    waterjet: { q: cl(W.q), s: cl(W.s), c: cl(W.c), sc: cl(W.sc) },
    plasma:   { q: cl(P.q), s: cl(P.s), c: cl(P.c), sc: cl(P.sc) },
    oxyfuel:  { q: cl(O.q), s: cl(O.s), c: cl(O.c), sc: cl(O.sc) }
  }
}

// Plasma-friendly cost ranges
function costRange(key, answers) {
  const t = parseFloat(answers.thickness) || 8
  const lr = parseFloat(answers.labor_rate) || 35
  const m = answers.material || ''

  const isMildSteel = m === 'Mild steel'

  const base = {
    laser:    [3.8, 10.5],
    waterjet: [5.5, 16.0],
    plasma:   [0.9, 4.2],
    oxyfuel:  [0.7, 3.5]
  }

  if (key === 'oxyfuel' && !isMildSteel) return '—'

  const r = base[key]
  if (!r) return '—'

  const mult = (t > 30 ? 2.0 : t > 15 ? 1.45 : 1) * (lr > 50 ? 1.25 : lr < 25 ? 0.85 : 1)

  return `$${(r[0] * mult).toFixed(1)}–$${(r[1] * mult).toFixed(1)}`
}

const TECH_NAMES = { laser: 'Fiber laser', waterjet: 'Waterjet', plasma: 'Plasma', oxyfuel: 'Oxyfuel' }
const TECH_COLORS = { laser: '#378ADD', waterjet: '#1D9E75', plasma: '#EF9F27', oxyfuel: '#D85A30' }

export default function Wizard({ units, onComplete }) {
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  function buildSteps() {
    const steps = [...BASE_STEPS, DEPTH_STEP]
    if (answers.depth === 'detailed') steps.push(ADV_STEP)
    steps.push(EMAIL_STEP)
    return steps
  }

  const steps = buildSteps()
  const step = steps[current]
  const filled = Object.keys(answers).filter(k => answers[k] && answers[k] !== '').length
  const sc = score(answers)

  // Remove oxyfuel from display when not Mild steel
  let sorted = Object.entries(sc).sort((a, b) => b[1].sc - a[1].sc)
  const isMildSteel = answers.material === 'Mild steel'
  if (!isMildSteel) {
    sorted = sorted.filter(([key]) => key !== 'oxyfuel')
  }

  function pick(id, val) {
    setAnswers(prev => ({ ...prev, [id]: val }))
  }

  async function handleSubmit() {
    if (!answers.email?.includes('@')) return
    try {
      await supabase.from('leads').insert([{
        email: answers.email,
        name: answers.first_name || null,
        company: answers.company || null,
        locale: navigator.language || 'en-US',
        unit_system: units,
        depth_mode: answers.depth || 'general',
        input_payload: answers,
        recommended_process: sorted[0][0]
      }])
    } catch (e) { console.log('Lead capture:', e) }
    setSubmitted(true)
    setTimeout(() => onComplete(answers), 1500)
  }

  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Report on its way!</div>
        <div style={{ fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 280 }}>Loading your comparison report...</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 'calc(100vh - 52px)' }}>
      <div style={{ borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 3, padding: '10px 20px', borderBottom: '1px solid #e8e8e8' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i < current ? '#1D9E75' : i === current ? '#378ADD' : '#e0e0e0', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#999', letterSpacing: '0.5px', marginBottom: 3 }}>
            STEP {current + 1} OF {steps.length}
          </div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{step.sub}</div>
        </div>

        <div style={{ padding: '4px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {step.special === 'depth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'general', tag: 'Quick', tagColor: '#085041', tagBg: '#E1F5EE', title: 'General comparison report', desc: 'Technology recommendation, quality comparison, and estimated cost ranges based on industry averages.' },
                { val: 'detailed', tag: 'Detailed', tagColor: '#633806', tagBg: '#FAEEDA', title: 'Detailed cost breakdown', desc: 'All of the above, plus a precise cost model using your own labor, energy, and machine rates.' }
              ].map(opt => (
                <div key={opt.val} onClick={() => pick('depth', opt.val)} style={{
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                  border: answers.depth === opt.val ? '2px solid #85B7EB' : '1px solid #e0e0e0',
                  background: answers.depth === opt.val ? '#E6F1FB' : '#fff'
                }}>
                  <div style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, display: 'inline-block', marginBottom: 4, background: opt.tagBg, color: opt.tagColor, fontWeight: 500 }}>{opt.tag}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, color: answers.depth === opt.val ? '#0C447C' : '#1a1a1a' }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          )}

          {step.special === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f5f5f5', borderLeft: '3px solid #378ADD', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                <p style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>Your report includes a <strong style={{ color: '#1a1a1a' }}>technology recommendation</strong>, full cost breakdown, quality scorecard, and time estimates.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>First name <span style={{ fontSize: 10, color: '#aaa' }}>optional</span></div>
                  <input type="text" placeholder="Ana" value={answers.first_name || ''} onChange={e => pick('first_name', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Company <span style={{ fontSize: 10, color: '#aaa' }}>optional</span></div>
                  <input type="text" placeholder="Acme Mfg." value={answers.company || ''} onChange={e => pick('company', e.target.value)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Email address</div>
                <input type="email" placeholder="you@company.com" value={answers.email || ''} onChange={e => pick('email', e.target.value)} />
              </div>
              <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>No spam. We use your email only to send this report.</div>
            </div>
          )}

          {!step.special && step.fields?.map(f => (
            <div key={f.id}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.label}
                {f.optional && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#f0f0f0', color: '#aaa', border: '1px solid #e0e0e0' }}>optional</span>}
              </div>
              {f.type === 'chips' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {f.options.map(o => (
                    <button key={o} onClick={() => pick(f.id, o)} style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 12, transition: 'all 0.15s',
                      border: answers[f.id] === o ? '1px solid #85B7EB' : '1px solid #e0e0e0',
                      background: answers[f.id] === o ? '#E6F1FB' : '#fff',
                      color: answers[f.id] === o ? '#0C447C' : '#1a1a1a'
                    }}>{o}</button>
                  ))}
                </div>
              )}
              {f.type === 'number' && (
                <div style={{ position: 'relative' }}>
                  <input type="number" placeholder={f.placeholder} value={answers[f.id] || ''} onChange={e => pick(f.id, e.target.value)} style={{ paddingRight: 40 }} />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa', pointerEvents: 'none' }}>{units === 'imperial' && f.unit === 'mm' ? 'in' : f.unit}</span>
                </div>
              )}
              {f.hint && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{f.hint}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid #e8e8e8' }}>
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12, color: '#666',
            visibility: current === 0 ? 'hidden' : 'visible'
          }}>Back</button>

          {step.special === 'email'
            ? <button onClick={handleSubmit} disabled={!answers.email?.includes('@')} style={{
                padding: '7px 20px', borderRadius: 8, border: '1px solid #5DCAA5', background: '#E1F5EE',
                fontSize: 13, fontWeight: 500, color: '#085041', opacity: answers.email?.includes('@') ? 1 : 0.4
              }}>Send my report →</button>
            : <button onClick={() => setCurrent(c => Math.min(steps.length - 1, c + 1))} style={{
                padding: '7px 20px', borderRadius: 8, border: '1px solid #85B7EB', background: '#E6F1FB',
                fontSize: 13, fontWeight: 500, color: '#0C447C'
              }}>Continue →</button>
          }
        </div>
      </div>

      {/* Live Comparison Panel */}
      <div style={{ background: '#f9f9f9', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Live comparison</div>
          <div style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: filled < 2 ? '#FAEEDA' : filled < 5 ? '#E6F1FB' : '#E1F5EE',
            color: filled < 2 ? '#633806' : filled < 5 ? '#0C447C' : '#085041'
          }}>
            {filled < 2 ? 'Waiting for input' : filled < 5 ? 'Partial estimate' : 'Good estimate'}
          </div>
        </div>

        {sorted.map(([key, s], i) => (
          <div key={key} style={{ padding: '12px 18px', borderBottom: '1px solid #e8e8e8', background: i === 0 && filled > 1 ? '#fff' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{TECH_NAMES[key]}</span>
                {i === 0 && filled > 1 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#E6F1FB', color: '#0C447C' }}>Leading</span>}
              </div>
              <span style={{ fontSize: 12, color: '#666' }}>{filled > 0 ? <><strong style={{ color: '#1a1a1a' }}>{costRange(key, answers)}</strong> / part</> : '—'}</span>
            </div>
            {[['Quality', s.q], ['Speed', s.s], ['Cost fit', s.c]].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#aaa', width: 60, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: TECH_COLORS[key], width: `${val}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        ))}

        {filled >= 2 && (
          <div style={{ margin: '10px 14px', padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #e0e0e0', borderLeft: '3px solid #378ADD', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
            <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              <strong style={{ color: '#1a1a1a' }}>Signal:</strong> For {answers.material || 'your material'}{answers.thickness ? ` / ${answers.thickness}${units === 'imperial' ? 'in' : 'mm'}` : ''}, 
              <strong style={{ color: '#1a1a1a' }}>{TECH_NAMES[sorted[0][0]]}</strong> is currently leading.
              {answers.haz?.includes('Very') ? ' Waterjet advantage: zero heat.' : ''}
              {answers.material && answers.material !== 'Mild steel' && ' Note: Oxyfuel only available for Mild steel.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}