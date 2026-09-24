import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import rrdtool from 'rrdtool'

const execFileAsync = promisify(execFile)

const STEP = 300
const HEARTBEAT = 600
const DS_IN = 'traffic_in'
const DS_OUT = 'traffic_out'

const RRA_TIERS = [
  { pdpPerRow: 1, rows: 600 },
  { pdpPerRow: 6, rows: 700 },
  { pdpPerRow: 24, rows: 775 },
  { pdpPerRow: 288, rows: 797 }
]
const CONSOLIDATION_FUNCTIONS = ['AVERAGE', 'MIN', 'MAX', 'LAST']

function buildRraArgs () {
  const args = []
  for (const cf of CONSOLIDATION_FUNCTIONS) {
    for (const tier of RRA_TIERS) {
      args.push(`RRA:${cf}:0.5:${tier.pdpPerRow}:${tier.rows}`)
    }
  }
  return args
}

function interpolate (sorted, tMs) {
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  if (tMs <= first.t) return first
  if (tMs >= last.t) return last

  let lo = 0
  let hi = sorted.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (sorted[mid].t <= tMs) lo = mid
    else hi = mid
  }

  const a = sorted[lo]
  const b = sorted[hi]
  const frac = (tMs - a.t) / (b.t - a.t)

  return {
    inbound: a.inbound + (b.inbound - a.inbound) * frac,
    outbound: a.outbound + (b.outbound - a.outbound) * frac
  }
}

function buildDenseSeries (controlPoints) {
  const sorted = [...controlPoints].sort((a, b) => a.t - b.t)
  const startSec = Math.ceil(sorted[0].t / 1000 / STEP) * STEP
  const endSec = Math.floor(sorted[sorted.length - 1].t / 1000 / STEP) * STEP

  const rows = []
  for (let t = startSec; t <= endSec; t += STEP) {
    const interp = interpolate(sorted, t * 1000)
    const jitter = () => 1 + (Math.random() - 0.5) * 0.04
    rows.push({
      t,
      inbound: Math.max(0, interp.inbound * jitter()),
      outbound: Math.max(0, interp.outbound * jitter())
    })
  }
  return rows
}

function toCounterRows (rows) {
  let counterIn = Math.floor(Math.random() * 1e9) + 1e6
  let counterOut = Math.floor(Math.random() * 1e8) + 1e5

  return rows.map((r) => {
    counterIn += Math.round((r.inbound / 8) * STEP)
    counterOut += Math.round((r.outbound / 8) * STEP)
    return { t: r.t, in: counterIn, out: counterOut }
  })
}

async function bulkUpdate (file, rows) {
  const CHUNK = 2000
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const args = [
      'update', file,
      '--template', `${DS_IN}:${DS_OUT}`,
      ...chunk.map((r) => `${r.t}:${r.in}:${r.out}`)
    ]
    await execFileAsync('rrdtool', args, {
      env: { ...process.env, LANG: 'C' },
      maxBuffer: 10 * 1024 * 1024
    })
  }
}

function slugify (title) {
  const slug = (title || 'traffic')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return slug || 'traffic'
}

export async function generateRrd (controlPoints, { filenameHint } = {}) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 2) {
    throw new Error('Butuh minimal 2 titik data')
  }

  const dense = buildDenseSeries(controlPoints)
  if (dense.length < 2) {
    throw new Error('Rentang waktu terlalu pendek untuk step 300 detik')
  }

  const counterRows = toCounterRows(dense)
  const safeName = slugify(filenameHint)
  const file = path.join(
    os.tmpdir(),
    `rrdgen_${safeName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.rrd`
  )

  await rrdtool.create(file, {
    start: counterRows[0].t,
    step: STEP,
    force: true
  }, [
    `DS:${DS_IN}:COUNTER:${HEARTBEAT}:0:U`,
    `DS:${DS_OUT}:COUNTER:${HEARTBEAT}:0:U`,
    ...buildRraArgs()
  ])

  await bulkUpdate(file, counterRows)

  return file
}
