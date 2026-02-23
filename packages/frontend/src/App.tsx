import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage      from './pages/Dashboard/DashboardPage';
import DriveDetailPage    from './pages/DriveDetail/DriveDetailPage';
import SmartHistoryPage   from './pages/SmartHistory/SmartHistoryPage';
import SchedulesPage      from './pages/Schedules/SchedulesPage';
import NotificationsPage  from './pages/Notifications/NotificationsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="drives/:driveId" element={<DriveDetailPage />} />
        <Route path="smart" element={<SmartHistoryPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
