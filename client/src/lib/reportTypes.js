import BloodtypeOutlinedIcon from '@mui/icons-material/BloodtypeOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import GrainOutlinedIcon from '@mui/icons-material/GrainOutlined';
import CoronavirusOutlinedIcon from '@mui/icons-material/CoronavirusOutlined';
import BubbleChartOutlinedIcon from '@mui/icons-material/BubbleChartOutlined';
import BiotechOutlinedIcon from '@mui/icons-material/BiotechOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import DirectionsRunOutlinedIcon from '@mui/icons-material/DirectionsRunOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import AltRouteOutlinedIcon from '@mui/icons-material/AltRouteOutlined';
import AccessibilityNewOutlinedIcon from '@mui/icons-material/AccessibilityNewOutlined';
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import FilterCenterFocusOutlinedIcon from '@mui/icons-material/FilterCenterFocusOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import FlareOutlinedIcon from '@mui/icons-material/FlareOutlined';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import HearingOutlinedIcon from '@mui/icons-material/HearingOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import MoodOutlinedIcon from '@mui/icons-material/MoodOutlined';
import HealingOutlinedIcon from '@mui/icons-material/HealingOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import VaccinesOutlinedIcon from '@mui/icons-material/VaccinesOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

/**
 * Labels, colours and icons for the server's report-type ids
 * (server/src/lib/reportTypes.js). The order here is the order lists show:
 * lab tests, heart tests, scans, other tests, then notes and records.
 */
export const REPORT_TYPES = {
  // Laboratory
  blood: { label: 'Blood test', color: '#e11d48', icon: BloodtypeOutlinedIcon },
  urine: { label: 'Urine test', color: '#d97706', icon: ScienceOutlinedIcon },
  stool: { label: 'Stool test', color: '#a16207', icon: GrainOutlinedIcon },
  culture: { label: 'Culture test', color: '#65a30d', icon: CoronavirusOutlinedIcon },
  semen: { label: 'Semen analysis', color: '#0891b2', icon: BubbleChartOutlinedIcon },
  pathology: { label: 'Biopsy / pathology', color: '#9333ea', icon: BiotechOutlinedIcon },
  genetic: { label: 'Genetic test', color: '#4f46e5', icon: HubOutlinedIcon },
  // Heart
  ecg: { label: 'ECG', color: '#db2777', icon: MonitorHeartOutlinedIcon },
  echo: { label: 'Echocardiogram', color: '#0284c7', icon: FavoriteBorderOutlinedIcon },
  tmt: { label: 'Stress test (TMT)', color: '#ea580c', icon: DirectionsRunOutlinedIcon },
  holter: { label: 'Holter / BP monitor', color: '#be123c', icon: TimerOutlinedIcon },
  angiography: { label: 'Angiography', color: '#b91c1c', icon: AltRouteOutlinedIcon },
  // Scans
  xray: { label: 'X-ray', color: '#475569', icon: AccessibilityNewOutlinedIcon },
  ultrasound: { label: 'Ultrasound', color: '#0d9488', icon: SensorsOutlinedIcon },
  ct: { label: 'CT scan', color: '#6d28d9', icon: DonutLargeOutlinedIcon },
  mri: { label: 'MRI scan', color: '#7c3aed', icon: ViewInArOutlinedIcon },
  mammography: { label: 'Mammogram', color: '#c026d3', icon: FilterCenterFocusOutlinedIcon },
  dexa: { label: 'Bone density', color: '#57534e', icon: StraightenOutlinedIcon },
  nuclear: { label: 'PET / nuclear scan', color: '#ca8a04', icon: FlareOutlinedIcon },
  imaging: { label: 'Imaging', color: '#8b5cf6', icon: ImageSearchOutlinedIcon },
  // Other tests and procedures
  endoscopy: { label: 'Endoscopy', color: '#0f766e', icon: VideocamOutlinedIcon },
  pft: { label: 'Lung function', color: '#0ea5e9', icon: AirOutlinedIcon },
  sleep: { label: 'Sleep study', color: '#4338ca', icon: BedtimeOutlinedIcon },
  neuro: { label: 'EEG / nerve study', color: '#9d174d', icon: PsychologyOutlinedIcon },
  audiometry: { label: 'Hearing test', color: '#15803d', icon: HearingOutlinedIcon },
  eye: { label: 'Eye test', color: '#2563eb', icon: VisibilityOutlinedIcon },
  dental: { label: 'Dental', color: '#0369a1', icon: MoodOutlinedIcon },
  surgery: { label: 'Operation note', color: '#dc2626', icon: HealingOutlinedIcon },
  // Notes and records
  prescription: { label: 'Prescription', color: '#059669', icon: MedicationOutlinedIcon },
  discharge: { label: 'Discharge summary', color: '#1d4ed8', icon: LocalHospitalOutlinedIcon },
  vaccination: { label: 'Vaccination record', color: '#16a34a', icon: VaccinesOutlinedIcon },
  certificate: { label: 'Medical certificate', color: '#b45309', icon: WorkspacePremiumOutlinedIcon },
  bill: { label: 'Bill', color: '#64748b', icon: ReceiptLongOutlinedIcon },
  other: { label: 'Other report', color: '#64748b', icon: DescriptionOutlinedIcon },
};

export const AUTO_TYPE = { label: 'Auto-detect', color: '#2f7cf7', icon: AutoAwesomeOutlinedIcon };

export const typeInfo = (id) => REPORT_TYPES[id] ?? (id === 'auto' ? AUTO_TYPE : REPORT_TYPES.other);

export const TYPE_IDS = Object.keys(REPORT_TYPES);
