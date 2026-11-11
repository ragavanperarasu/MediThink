import BloodtypeOutlinedIcon from '@mui/icons-material/BloodtypeOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import BiotechOutlinedIcon from '@mui/icons-material/BiotechOutlined';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';

/** Labels and colours for the server's report-type ids (server/src/lib/reportTypes.js). */
export const REPORT_TYPES = {
  blood: { label: 'Blood test', color: '#e11d48', icon: BloodtypeOutlinedIcon },
  urine: { label: 'Urine test', color: '#d97706', icon: ScienceOutlinedIcon },
  endoscopy: { label: 'Endoscopy', color: '#0d9488', icon: BiotechOutlinedIcon },
  imaging: { label: 'Imaging', color: '#7c3aed', icon: ImageSearchOutlinedIcon },
  ecg: { label: 'ECG', color: '#db2777', icon: MonitorHeartOutlinedIcon },
  echo: { label: 'Echocardiogram', color: '#0284c7', icon: FavoriteBorderOutlinedIcon },
  prescription: { label: 'Prescription', color: '#059669', icon: MedicationOutlinedIcon },
  other: { label: 'Other report', color: '#64748b', icon: DescriptionOutlinedIcon },
};

export const AUTO_TYPE = { label: 'Auto-detect', color: '#2f7cf7', icon: AutoAwesomeOutlinedIcon };

export const typeInfo = (id) => REPORT_TYPES[id] ?? (id === 'auto' ? AUTO_TYPE : REPORT_TYPES.other);

export const TYPE_IDS = Object.keys(REPORT_TYPES);
