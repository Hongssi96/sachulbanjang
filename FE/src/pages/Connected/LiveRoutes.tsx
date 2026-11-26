import { Route, Routes } from 'react-router';
import LiveDashboard from './LiveDashboard';
import LiveEquipment from './LiveEquipment';
import LiveQuality from './LiveQuality';
import LiveCollection from './LiveCollection';
import LiveRecords from './LiveRecords';
import LiveInventory from './LiveInventory';
import LiveUsers from './LiveUsers';
import LiveChat from './LiveChat';
import LiveHandover from './LiveHandover';
import LiveReportDetail from './LiveReportDetail';
import LiveScheduleDetail from './LiveScheduleDetail';
import NotFoundPage from '../NotFoundPage';

export default function LiveRoutes({ tablet = false }: { tablet?: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<LiveDashboard tablet={tablet} />} />
      <Route path="/realtime" element={<LiveEquipment tablet={tablet} />} />
      <Route path="/equipment" element={<LiveEquipment tablet={tablet} />} />
      <Route path="/schedule" element={<LiveCollection kind="schedules" />} />
      <Route path="/tasks" element={<LiveCollection kind="schedules" tablet />} />
      <Route
        path="/tasks/:scheduleId"
        element={
          tablet ? <LiveScheduleDetail /> : <LiveCollection kind="schedules" tablet={tablet} />
        }
      />
      <Route path="/records" element={<LiveRecords />} />
      <Route path="/records/:recordId" element={<LiveRecords detail />} />
      <Route
        path="/records/:recordId/precision-inspection"
        element={<LiveRecords detail precision />}
      />
      <Route path="/inventory" element={<LiveInventory />} />
      <Route path="/users" element={<LiveUsers />} />
      <Route path="/quality-reports" element={<LiveQuality />} />
      <Route path="/reports" element={<LiveCollection kind="reports" tablet={tablet} />} />
      <Route
        path="/reports/:reportId"
        element={tablet ? <LiveReportDetail /> : <LiveCollection kind="reports" tablet={tablet} />}
      />
      <Route
        path="/handover"
        element={tablet ? <LiveHandover /> : <LiveCollection kind="handover-notes" />}
      />
      <Route path="/chat" element={<LiveChat />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
