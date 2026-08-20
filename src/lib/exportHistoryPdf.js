import { jsPDF } from 'jspdf'
import { DETAILED_HISTORY_SECTIONS } from './detailedWizardSteps.js'
import { formatStatusLabel } from './health.js'

function safeName(text) {
  return (text || 'hive')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatDateLabel(record) {
  if (record.inspectionDate) return record.inspectionDate
  try {
    return new Date(record.date).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return record.date || ''
  }
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = doc.splitTextToSize(String(text || ''), maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function ensureSpace(doc, y, needed = 20) {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - 14) {
    doc.addPage()
    return 18
  }
  return y
}

function writeQuickRecord(doc, record, y, pageWidth) {
  const margin = 14
  const maxWidth = pageWidth - margin * 2

  y = ensureSpace(doc, y, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  y = addWrappedText(
    doc,
    `Quick inspection — ${formatDateLabel(record)}`,
    margin,
    y,
    maxWidth,
    6,
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const meta = [
    record.hiveName && `Hive: ${record.hiveName}`,
    (record.yard || record.location) &&
      `Location: ${record.yard || record.location}`,
    record.weather && `Weather: ${record.weather}`,
    record.temperature && `Temp: ${record.temperature}°C`,
  ]
    .filter(Boolean)
    .join(' · ')
  if (meta) y = addWrappedText(doc, meta, margin, y + 2, maxWidth)

  const quickFields = [
    ['Entrance', record.entranceBehavior],
    ['Temperament', record.temperament],
    ['Odour', record.odour],
    ['Dead bees', record.deadBees],
    ['Queen', record.queenSpotted],
    ['Eggs', record.eggsPresent],
    ['Brood pattern', record.broodPattern],
    ['Brood stages', record.broodStages],
    ['Disease', record.diseaseSigns],
    ['Adult bees', record.adultBeeHealth],
    ['Varroa', record.varroaLoad],
    ['Queen cells', record.queenCells],
    ['Honey', record.honeyStores],
    ['Pollen', record.pollenStores],
    ['Room to expand', record.roomToExpand],
    ['Brace comb', record.braceComb],
    ['Notes', record.notes],
  ]

  for (const [label, value] of quickFields) {
    if (!value) continue
    y = ensureSpace(doc, y, 10)
    y = addWrappedText(
      doc,
      `${label}: ${formatStatusLabel(value)}`,
      margin,
      y + 1,
      maxWidth,
    )
  }

  return y + 8
}

function writeDetailedRecord(doc, record, y, pageWidth) {
  const margin = 14
  const maxWidth = pageWidth - margin * 2

  y = ensureSpace(doc, y, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  y = addWrappedText(
    doc,
    `Detailed inspection — ${formatDateLabel(record)}`,
    margin,
    y,
    maxWidth,
    6,
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  for (const section of DETAILED_HISTORY_SECTIONS) {
    const filled = section.fields.filter(([, key]) => record[key])
    if (!filled.length) continue

    y = ensureSpace(doc, y, 14)
    doc.setFont('helvetica', 'bold')
    y = addWrappedText(doc, section.title, margin, y + 2, maxWidth, 5.5)
    doc.setFont('helvetica', 'normal')

    for (const [label, key] of filled) {
      y = ensureSpace(doc, y, 10)
      y = addWrappedText(
        doc,
        `${label}: ${formatStatusLabel(record[key])}`,
        margin,
        y + 1,
        maxWidth,
      )
    }
  }

  return y + 8
}

export function downloadHistoryPdf(hive, inspections) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  y = addWrappedText(doc, 'HiveLog Inspection History', margin, y, pageWidth - 28, 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  y = addWrappedText(
    doc,
    `${hive?.name || 'Hive'}${hive?.location ? ` · ${hive.location}` : ''}`,
    margin,
    y + 2,
    pageWidth - 28,
  )
  y = addWrappedText(
    doc,
    `Generated ${new Date().toLocaleString()} · ${inspections.length} record${inspections.length === 1 ? '' : 's'}`,
    margin,
    y + 1,
    pageWidth - 28,
  )
  y += 6

  if (!inspections.length) {
    y = addWrappedText(doc, 'No inspections recorded yet.', margin, y, pageWidth - 28)
  } else {
    inspections.forEach((record, index) => {
      if (index > 0) {
        y = ensureSpace(doc, y, 12)
        doc.setDrawColor(180)
        doc.line(margin, y, pageWidth - margin, y)
        y += 6
      }
      y =
        record.inspectionKind === 'detailed'
          ? writeDetailedRecord(doc, record, y, pageWidth)
          : writeQuickRecord(doc, record, y, pageWidth)
    })
  }

  const filename = `hivelog-${safeName(hive?.name)}-history.pdf`
  doc.save(filename)
  return filename
}

export function downloadRecordPdf(hive, record) {
  return downloadHistoryPdf(hive, [record])
}
