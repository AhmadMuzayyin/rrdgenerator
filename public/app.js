(() => {
  const POINTS = 120
  const COLOR_IN = { border: '#548235', fill: 'rgba(169, 209, 142, 0.85)' }
  const COLOR_OUT = { border: '#31859b', fill: 'rgba(143, 202, 202, 0.85)' }

  const rangeSelect = document.getElementById('rangeSelect')
  const resetBtn = document.getElementById('resetBtn')
  const generateBtn = document.getElementById('generateBtn')
  const titleInput = document.getElementById('graphTitle')
  const titleDisplay = document.getElementById('graphTitleDisplay')
  const rangeDisplay = document.getElementById('graphRangeDisplay')
  const canvas = document.getElementById('trafficChart')

  let chart = null
  let currentRange = null
  let currentPoints = []

  function startOfDay (d) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  function startOfWeek (d) {
    const x = startOfDay(d)
    const day = (x.getDay() + 6) % 7 // Monday = 0
    x.setDate(x.getDate() - day)
    return x
  }

  function startOfMonth (d) {
    const x = startOfDay(d)
    x.setDate(1)
    return x
  }

  function startOfYear (d) {
    const x = startOfDay(d)
    x.setMonth(0, 1)
    return x
  }

  function addDays (d, n) {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }

  function addMonths (d, n) {
    const x = new Date(d)
    x.setMonth(x.getMonth() + n)
    return x
  }

  function addYears (d, n) {
    const x = new Date(d)
    x.setFullYear(x.getFullYear() + n)
    return x
  }

  function computeRange (key) {
    const now = new Date()

    switch (key) {
      case '2d': return { start: addDays(now, -2), end: now }
      case '3d': return { start: addDays(now, -3), end: now }
      case '4d': return { start: addDays(now, -4), end: now }
      case '1w': return { start: addDays(now, -7), end: now }
      case '2w': return { start: addDays(now, -14), end: now }
      case '1mo': return { start: addMonths(now, -1), end: now }
      case '2mo': return { start: addMonths(now, -2), end: now }
      case '3mo': return { start: addMonths(now, -3), end: now }
      case '4mo': return { start: addMonths(now, -4), end: now }
      case '6mo': return { start: addMonths(now, -6), end: now }
      case '1y': return { start: addYears(now, -1), end: now }
      case '2y': return { start: addYears(now, -2), end: now }
      case 'dayshift': {
        const s = addDays(startOfDay(now), -1)
        return { start: s, end: addDays(s, 1) }
      }
      case 'thisday': return { start: startOfDay(now), end: now }
      case 'thisweek': return { start: startOfWeek(now), end: now }
      case 'thismonth': return { start: startOfMonth(now), end: now }
      case 'thisyear': return { start: startOfYear(now), end: now }
      case 'prevday': {
        const e = startOfDay(now)
        return { start: addDays(e, -1), end: e }
      }
      case 'prevweek': {
        const e = startOfWeek(now)
        return { start: addDays(e, -7), end: e }
      }
      case 'prevmonth': {
        const e = startOfMonth(now)
        return { start: addMonths(e, -1), end: e }
      }
      case 'prevyear': {
        const e = startOfYear(now)
        return { start: addYears(e, -1), end: e }
      }
      default: return { start: addDays(now, -7), end: now }
    }
  }

  function diurnalFactor (date) {
    const hour = date.getHours() + date.getMinutes() / 60
    const daily = 0.5 + 0.5 * Math.cos(((hour - 14) / 24) * 2 * Math.PI)
    const day = date.getDay()
    const weekendFactor = (day === 0 || day === 6) ? 0.72 : 1
    return Math.max(0.06, daily * weekendFactor)
  }

  function generateSeries (start, end) {
    const startMs = start.getTime()
    const endMs = end.getTime()
    const step = (endMs - startMs) / (POINTS - 1)

    const baseIn = 45e9
    const baseOut = 10e9
    let walkIn = 0
    let walkOut = 0

    const points = []
    for (let i = 0; i < POINTS; i++) {
      const t = startMs + step * i
      const d = new Date(t)
      const factor = diurnalFactor(d)

      walkIn += (Math.random() - 0.5) * baseIn * 0.04
      walkIn = Math.max(-baseIn * 0.25, Math.min(baseIn * 0.25, walkIn))
      walkOut += (Math.random() - 0.5) * baseOut * 0.04
      walkOut = Math.max(-baseOut * 0.25, Math.min(baseOut * 0.25, walkOut))

      const noiseIn = (Math.random() - 0.5) * baseIn * 0.05
      const noiseOut = (Math.random() - 0.5) * baseOut * 0.05

      const inbound = Math.max(0, baseIn * factor + walkIn + noiseIn)
      const outbound = Math.max(0, baseOut * factor + walkOut + noiseOut)

      points.push({ t, inbound, outbound })
    }
    return points
  }

  function formatBps (v) {
    const abs = Math.abs(v)
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + ' G'
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + ' M'
    if (abs >= 1e3) return (v / 1e3).toFixed(2) + ' K'
    return v.toFixed(2) + ' '
  }

  function formatBytes (bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let v = bytes
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return v.toFixed(2) + ' ' + units[i]
  }

  function formatLabel (date, spanMs) {
    const day = spanMs <= 3 * 86400000
    const week = spanMs <= 15 * 86400000
    const month = spanMs <= 95 * 86400000

    if (day) {
      return date.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' +
        date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    if (week) {
      return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) + ' ' +
        date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    if (month) {
      return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
  }

  function computeStats (points) {
    const n = points.length
    const durationSec = (points[n - 1].t - points[0].t) / 1000

    const inVals = points.map((p) => p.inbound)
    const outVals = points.map((p) => p.outbound)

    const inAvg = inVals.reduce((a, b) => a + b, 0) / n
    const outAvg = outVals.reduce((a, b) => a + b, 0) / n

    return {
      inCurrent: inVals[n - 1],
      inAverage: inAvg,
      inMaximum: Math.max(...inVals),
      inTotal: (inAvg * durationSec) / 8,
      outCurrent: outVals[n - 1],
      outAverage: outAvg,
      outMaximum: Math.max(...outVals),
      outTotal: (outAvg * durationSec) / 8
    }
  }

  function updateLegend (points) {
    const s = computeStats(points)
    document.getElementById('inCurrent').textContent = formatBps(s.inCurrent)
    document.getElementById('inAverage').textContent = formatBps(s.inAverage)
    document.getElementById('inMaximum').textContent = formatBps(s.inMaximum)
    document.getElementById('inTotal').textContent = formatBytes(s.inTotal)

    document.getElementById('outCurrent').textContent = formatBps(s.outCurrent)
    document.getElementById('outAverage').textContent = formatBps(s.outAverage)
    document.getElementById('outMaximum').textContent = formatBps(s.outMaximum)
    document.getElementById('outTotal').textContent = formatBytes(s.outTotal)
  }

  function fmtHeaderDate (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')
  }

  function renderChart (range) {
    currentRange = range
    const points = generateSeries(range.start, range.end)
    const spanMs = range.end.getTime() - range.start.getTime()

    const labels = points.map((p) => formatLabel(new Date(p.t), spanMs))

    rangeDisplay.textContent = `From ${fmtHeaderDate(range.start)} To ${fmtHeaderDate(range.end)}`
    titleDisplay.textContent = titleInput.value

    const data = {
      labels,
      datasets: [
        {
          label: 'Inbound',
          data: points.map((p) => p.inbound),
          borderColor: COLOR_IN.border,
          backgroundColor: COLOR_IN.fill,
          fill: 'origin',
          borderWidth: 1,
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 4,
          tension: 0.15
        },
        {
          label: 'Outbound',
          data: points.map((p) => p.outbound),
          borderColor: COLOR_OUT.border,
          backgroundColor: COLOR_OUT.fill,
          fill: 'origin',
          borderWidth: 1,
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 4,
          tension: 0.15
        }
      ]
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          grid: { color: '#ffb3b3', borderDash: [2, 2] },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 8,
            color: '#333',
            font: { family: '"DejaVu Sans Mono", monospace', size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#ffb3b3', borderDash: [2, 2] },
          ticks: {
            color: '#333',
            font: { family: '"DejaVu Sans Mono", monospace', size: 10 },
            callback: (v) => formatBps(v)
          },
          title: {
            display: true,
            text: 'bits per second',
            font: { family: '"DejaVu Sans Mono", monospace', size: 11 }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBps(ctx.parsed.y)}`
          }
        },
        dragData: {
          round: 0,
          showTooltip: true,
          onDrag: (_e, _datasetIndex, _index, value) => {
            if (value < 0) return false
          },
          onDragEnd: (_e, _datasetIndex, _index, _value) => {
            const pts = chart.data.datasets[0].data.map((v, i) => ({
              t: points[i].t,
              inbound: chart.data.datasets[0].data[i],
              outbound: chart.data.datasets[1].data[i]
            }))
            updateLegend(pts)
          }
        }
      }
    }

    if (chart) {
      chart.destroy()
    }
    chart = new Chart(canvas.getContext('2d'), { type: 'line', data, options })
    currentPoints = points
    updateLegend(points)
  }

  async function handleGenerate () {
    const payload = {
      title: titleInput.value,
      points: currentPoints.map((p, i) => ({
        t: p.t,
        inbound: chart.data.datasets[0].data[i],
        outbound: chart.data.datasets[1].data[i]
      }))
    }

    const originalLabel = generateBtn.textContent
    generateBtn.disabled = true
    generateBtn.textContent = 'Generating...'

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Gagal generate (HTTP ${res.status})`)
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : 'traffic.rrd'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Gagal generate RRD: ' + err.message)
    } finally {
      generateBtn.disabled = false
      generateBtn.textContent = originalLabel
    }
  }

  rangeSelect.addEventListener('change', () => {
    renderChart(computeRange(rangeSelect.value))
  })

  resetBtn.addEventListener('click', () => {
    renderChart(computeRange(rangeSelect.value))
  })

  titleInput.addEventListener('input', () => {
    titleDisplay.textContent = titleInput.value
  })

  generateBtn.addEventListener('click', handleGenerate)

  renderChart(computeRange(rangeSelect.value))
})()
