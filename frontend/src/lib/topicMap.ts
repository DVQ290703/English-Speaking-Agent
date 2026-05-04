// Re-export DASHBOARD_TO_TOPIC_ID from constants so pages/DashboardPage.jsx
// can import from a clean path without reaching into the voice-agent component folder.
export {
  DASHBOARD_TO_TOPIC_ID,
  DASHBOARD_TO_SUB_OPTION,
} from '../components/voice-agent/constants';
