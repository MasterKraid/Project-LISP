import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiService } from './services/api';
import LoginPage from './pages/LoginPage';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ReceiptForm from './pages/ReceiptForm';
import EstimateForm from './pages/EstimateForm';
import ReceiptView from './pages/ReceiptView';
import EstimateView from './pages/EstimateView';
import ManageUsers from './pages/admin/ManageUsers';
import ManageBranches from './pages/admin/ManageBranches';
import ManageLabs from './pages/admin/ManageLabs';
import SystemStatus from './pages/admin/SystemStatus';
import ManageWallets from './pages/admin/ManageWallets';
import ViewCustomers from './pages/admin/ViewCustomers';
import ViewDocuments from './pages/admin/ViewDocuments';
import EditUser from './pages/admin/EditUser';
import EditCustomer from './pages/admin/EditCustomer';
import TransactionHistoryPage from './pages/TransactionHistoryPage';
import ManageReports from './pages/admin/ManageReports';
import ReceiptReport from './pages/admin/ReceiptReport';
import ClientRatelist from './pages/ClientRatelist';
import ReloadPrompt from './components/ReloadPrompt';
import DataEntryPortal from './pages/DataEntryPortal';
import ClientAnalysis from './pages/ClientAnalysis';
import { requestNotificationPermission, sendLocalNotification } from './utils/notifications';

const ProtectedRoute: React.FC<{ children: React.ReactElement; roles?: string[] }> = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" />;
  }
  
  // Data entry users are strictly restricted to only the data entry portal
  if (user.role === 'DATA_ENTRY') {
    if (roles && roles.includes('DATA_ENTRY')) {
      return children;
    }
    return <Navigate to="/data-entry-portal" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" />; // Or an unauthorized page
  }
  return children;
};

const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => (
  <ProtectedRoute roles={['ADMIN']}>{children}</ProtectedRoute>
);

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  // Background real-time notification listener for clients
  useEffect(() => {
    if (user?.role === 'CLIENT') {
      const checkNewReports = async () => {
        try {
          const reports = await apiService.getReportsClient();
          const unreadCount = reports.filter(r => !r.is_read).length;
          if (unreadCount > 0) {
            const lastReportCountKey = 'notified_unread_reports_count';
            const lastReportCount = sessionStorage.getItem(lastReportCountKey);
            if (lastReportCount !== unreadCount.toString()) {
              sendLocalNotification('New Lab Reports Available!', {
                body: `You have ${unreadCount} new processed lab report(s) ready to review and download.`,
                tag: 'new-lab-reports-alert'
              });
              sessionStorage.setItem(lastReportCountKey, unreadCount.toString());
            }
          }
        } catch (e) {
          // silent error handling
        }
      };
      checkNewReports();
      const interval = setInterval(checkNewReports, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <Routes>
      <Route path="/" element={!user ? <LoginPage /> : <Navigate to={user.role === 'ADMIN' ? '/admin-dashboard' : (user.role === 'DATA_ENTRY' ? '/data-entry-portal' : '/dashboard')} />} />

      <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/admin-dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

      <Route path="/receipt-form" element={<ProtectedRoute roles={['ADMIN', 'GENERAL_EMPLOYEE', 'CLIENT']}><ReceiptForm /></ProtectedRoute>} />
      <Route path="/estimate-form" element={<ProtectedRoute roles={['ADMIN', 'GENERAL_EMPLOYEE']}><EstimateForm /></ProtectedRoute>} />

      <Route path="/receipt/:id" element={<ProtectedRoute><ReceiptView /></ProtectedRoute>} />
      <Route path="/estimate/:id" element={<ProtectedRoute roles={['ADMIN', 'GENERAL_EMPLOYEE']}><EstimateView /></ProtectedRoute>} />

      <Route path="/transactions" element={<ProtectedRoute roles={['CLIENT']}><TransactionHistoryPage /></ProtectedRoute>} />
      <Route path="/reports" element={<Navigate to="/customers" />} />
      <Route path="/my-ratelist" element={<ProtectedRoute roles={['CLIENT', 'ADMIN']}><ClientRatelist /></ProtectedRoute>} />
      <Route path="/data-entry-portal" element={<ProtectedRoute roles={['ADMIN', 'DATA_ENTRY']}><DataEntryPortal /></ProtectedRoute>} />
      <Route path="/my-analysis" element={<ProtectedRoute roles={['CLIENT']}><ClientAnalysis /></ProtectedRoute>} />

      <Route path="/admin/users" element={<AdminRoute><ManageUsers /></AdminRoute>} />
      <Route path="/admin/users/edit/:id" element={<AdminRoute><EditUser /></AdminRoute>} />

      <Route path="/admin/branches" element={<AdminRoute><ManageBranches /></AdminRoute>} />
      <Route path="/admin/labs" element={<AdminRoute><ManageLabs /></AdminRoute>} />
      <Route path="/admin/system-status" element={<AdminRoute><SystemStatus /></AdminRoute>} />
      <Route path="/admin/wallet" element={<AdminRoute><ManageWallets /></AdminRoute>} />

      <Route path="/customers" element={<ProtectedRoute><ViewCustomers /></ProtectedRoute>} />
      <Route path="/admin/customers" element={<AdminRoute><ViewCustomers /></AdminRoute>} />
      <Route path="/admin/customers/edit/:id" element={<AdminRoute><EditCustomer /></AdminRoute>} />

       <Route path="/admin/receipts" element={<AdminRoute><ViewDocuments docType="receipt" /></AdminRoute>} />
      <Route path="/admin/receipts/edit/:id" element={<AdminRoute><ReceiptForm /></AdminRoute>} />
      <Route path="/admin/receipt-report" element={<AdminRoute><ReceiptReport /></AdminRoute>} />
      <Route path="/admin/estimates" element={<AdminRoute><ViewDocuments docType="estimate" /></AdminRoute>} />
      <Route path="/admin/reports" element={<AdminRoute><ManageReports /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    requestNotificationPermission().catch(console.error);
  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
        <ReloadPrompt />
      </HashRouter>
    </AuthProvider>
  );
};

export default App;