import { useNavigate } from 'react-router-dom';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import { ListRow, ListRows, StatePill } from './ListRow';
import { timeAgo } from '../lib/format';
import { typeInfo } from '../lib/reportTypes';

/**
 * The list of uploads — one quiet line each. The icon says what it is (a
 * folder when the PDF held several documents), the pill appears only when
 * something needs a look, and everything else is a click away.
 */
export default function ReportsTable({ reports, dense = false }) {
  const navigate = useNavigate();

  return (
    <ListRows>
      {reports.map((report) => {
        const folder = report.documentCount > 1;
        const info = typeInfo(report.documentTypes?.[0] ?? report.reportType);
        return (
          <ListRow
            key={report.id}
            dense={dense}
            icon={folder ? FolderRoundedIcon : info.icon}
            color={folder ? '#f59e0b' : info.color}
            title={report.title}
            subtitle={[report.patient?.name, folder ? `${report.documentCount} documents` : info.label].filter(Boolean).join(' · ')}
            pill={<StatePill status={report.status} flagged={report.flaggedCount} />}
            meta={timeAgo(report.createdAt)}
            onClick={() => navigate(`/reports/${report.id}`)}
          />
        );
      })}
    </ListRows>
  );
}
