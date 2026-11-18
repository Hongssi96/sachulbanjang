import { BrowserRouter, Route, Routes } from 'react-router';
import HomePage from './pages/HomePage';
import InventoryPage from './pages/InventoryPage/InventoryPage';
import QualityReportPage from './pages/QualityReportPage/QualityReportPage';
import RecordsPage, { RecordDetailPage } from './pages/RecordsPage/RecordsPage';
import PrecisionInspectionPage from './pages/PrecisionInspectionPage/PrecisionInspectionPage';
import ChatSearchPage from './pages/ChatSearchPage/ChatSearchPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />}>
          <Route path="chat" element={<ChatSearchPage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="records/:recordId" element={<RecordDetailPage />} />
          <Route
            path="records/:recordId/precision-inspection"
            element={<PrecisionInspectionPage />}
          />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="quality-reports" element={<QualityReportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
