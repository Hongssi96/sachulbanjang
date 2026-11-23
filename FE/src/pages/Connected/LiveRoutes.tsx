import { Route, Routes } from 'react-router';
import LiveDashboard from './LiveDashboard';
import LiveEquipment from './LiveEquipment';
import LiveQuality from './LiveQuality';
import LiveCollection from './LiveCollection';
import LiveRecords from './LiveRecords';
import LiveInventory from './LiveInventory';
import LiveUsers from './LiveUsers';

export default function LiveRoutes({ tablet = false }: { tablet?: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<LiveDashboard />} />
      <Route path="/realtime" element={<LiveEquipment />} />
      <Route path="/equipment" element={<LiveEquipment />} />
      <Route path="/schedule" element={<LiveCollection kind="schedules" />} />
      <Route path="/tasks" element={<LiveCollection kind="schedules" tablet />} />
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
        element={<LiveCollection kind="reports" tablet={tablet} />}
      />
      <Route path="/handover" element={<LiveCollection kind="handover-notes" />} />
      <Route
        path="/chat"
        element={
          <div className="live-page">
            <h1>대화·검색</h1>
            <p>채팅 기능은 이번 백엔드 연결 범위에서 제외되었습니다.</p>
          </div>
        }
      />
      <Route
        path="*"
        element={
          <div className="live-page">
            <h1>화면을 찾을 수 없습니다.</h1>
          </div>
        }
      />
    </Routes>
  );
}
