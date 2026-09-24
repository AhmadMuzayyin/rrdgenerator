import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { generateRrd } from './rrd.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

app.use(express.json({ limit: '2mb' }))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')))
app.use('/vendor/dragdata.js', express.static(path.join(__dirname, 'node_modules/chartjs-plugin-dragdata/dist/chartjs-plugin-dragdata.js')))

app.post('/api/generate', async (req, res) => {
  const { title, points } = req.body || {}

  if (!Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: 'points wajib berupa array minimal 2 titik' })
  }

  const controlPoints = points.map((p) => ({
    t: Number(p.t),
    inbound: Number(p.inbound),
    outbound: Number(p.outbound)
  }))

  if (controlPoints.some((p) => !Number.isFinite(p.t) || !Number.isFinite(p.inbound) || !Number.isFinite(p.outbound))) {
    return res.status(400).json({ error: 'setiap titik butuh t, inbound, outbound berupa angka' })
  }

  let file
  try {
    file = await generateRrd(controlPoints, { filenameHint: title })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  res.download(file, path.basename(file), async (err) => {
    await fs.unlink(file).catch(() => {})
    if (err && !res.headersSent) {
      res.status(500).end()
    }
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`RRD Generator running at http://localhost:${PORT}`)
})
