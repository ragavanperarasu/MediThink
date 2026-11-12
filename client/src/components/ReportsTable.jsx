import { useNavigate } from 'react-router-dom';
import { ListRow, ListRows, StatePill } from './ListRow';
import { timeAgo } from '../lib/format';
import { REPORT_TYPES, TYPE_IDS, typeInfo } from '../lib/reportTypes';

/*
 * Every report as its own row — no folders. An upload holding an ECG, an echo
 * and a lab report shows as three rows, each opening straight on its own page.
 * An upload that is still being read (not split yet) shows as one row.
 */

/**
 * One row per report across all uploads, optionally narrowed by kind,
 * "flagged only" and a search phrase. Newest report date first.
 */
export function reportRows(reports, { type = '', flagged = false, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const rows = reports.flatMap((upload) => {
    const docs = upload.documents ?? [];
    if (!docs.length) {
      // Not split yet (still reading, or failed before the split): the upload itself.
      return [{
        key: upload.id,
        to: `/reports/${upload.id}`,
        title: upload.title,
        category: upload.documentTypes?.[0] ?? upload.reportType,
        date: upload.reportDate,
        sortDate: '',
        status: upload.status,
        flaggedCount: upload.flaggedCount,
        upload,
      }];
    }
    return docs.map((doc) => ({
      key: `${upload.id}-${doc.n}`,
      to: docs.length > 1 ? `/reports/${upload.id}/documents/${doc.n}` : `/reports/${upload.id}`,
      title: doc.title || typeInfo(doc.category).label,
      category: doc.category,
      date: doc.date,
      sortDate: doc.dateISO,
      // While the upload is still being read, a document not yet done shows "Reading".
      status: upload.status === 'analysing' && doc.status === 'analysing' ? 'analysing' : doc.status === 'failed' ? 'failed' : 'ready',
      flaggedCount: doc.flaggedCount,
      upload,
    }));
  });

  return rows
    .filter((row) => !type || row.category === type)
    .filter((row) => !flagged || row.flaggedCount > 0)
    .filter((row) => !q || [row.title, typeInfo(row.category).label, row.upload.title, row.upload.patient?.name, row.upload.facility]
      .some((text) => String(text ?? '').toLowerCase().includes(q)))
    .sort((a, b) =>
      // Newest report first; reports without a printed date by upload time.
      (b.sortDate || '').localeCompare(a.sortDate || '') ||
      String(b.upload.createdAt).localeCompare(String(a.upload.createdAt)));
}

/**
 * The rows split by kind of report, in the fixed order of the kinds (blood
 * test, urine test, …). An upload still being read, not split yet, has no
 * kind so far and is listed first under "Being read".
 */
export function groupByType(rows) {
  const groups = new Map();
  for (const row of rows) {
    const reading = !row.upload.documents?.length && (row.status === 'analysing' || row.status === 'uploaded');
    const id = reading ? 'reading' : REPORT_TYPES[row.category] ? row.category : 'other';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return ['reading', ...TYPE_IDS]
    .filter((id) => groups.has(id))
    .map((id) => ({ id, label: id === 'reading' ? 'Being read' : REPORT_TYPES[id].label, rows: groups.get(id) }));
}

export default function ReportsTable({ rows, dense = false, showKind = true }) {
  const navigate = useNavigate();
  return (
    <ListRows>
      {rows.map((row) => {
        const info = typeInfo(row.category);
        return (
          <ListRow
            key={row.key}
            dense={dense}
            icon={info.icon}
            color={info.color}
            title={row.title}
            // Kind and date — the person is already the profile in use. Under a
            // kind heading, the date alone.
            subtitle={[showKind && info.label, row.date].filter(Boolean).join(' · ')}
            pill={<StatePill status={row.status} flagged={row.flaggedCount} />}
            meta={timeAgo(row.upload.createdAt)}
            onClick={() => navigate(row.to)}
          />
        );
      })}
    </ListRows>
  );
}
