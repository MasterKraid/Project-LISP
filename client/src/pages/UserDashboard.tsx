import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import DashboardLink from '../components/DashboardLink';
import { ReceiptIcon, EstimateIcon, CustomersIcon, LogoutIcon, WalletIcon, RatelistIcon } from '../components/icons';
import { sendLocalNotification } from '../utils/notifications';

const UserDashboard: React.FC = () => {
  const { user, branch, logout, setActingAsClient } = useAuth();
  const [unreadReports, setUnreadReports] = useState(0);

  // Clear acting-as-client when returning to dashboard
  useEffect(() => { setActingAsClient(null); }, [setActingAsClient]);

  
  useEffect(() => {
    if (user?.role === 'CLIENT') {
      apiService.getReportsClient().then(reports => {
        const unreadCount = reports.filter(r => !r.is_read).length;
        setUnreadReports(unreadCount);
        if (unreadCount > 0) {
          const lastReportCountKey = 'notified_unread_reports_count';
          const lastReportCount = sessionStorage.getItem(lastReportCountKey);
          if (lastReportCount !== unreadCount.toString()) {
            sendLocalNotification('New Lab Reports Available!', {
              body: `You have ${unreadCount} new processed lab reports ready to review and download.`,
              tag: 'new-lab-reports-alert'
            });
            sessionStorage.setItem(lastReportCountKey, unreadCount.toString());
          }
        }
      }).catch(console.error);

      if (typeof user.wallet_balance !== 'undefined' && user.wallet_balance < 1000) {
        const lastWalletNotifyKey = 'notified_low_wallet_balance';
        if (!sessionStorage.getItem(lastWalletNotifyKey)) {
          sendLocalNotification('Low Wallet Balance Alert', {
            body: `Your current wallet balance is ₹${user.wallet_balance.toFixed(2)}. Please settle/recharge to avoid download blocks.`,
            tag: 'low-wallet-balance-alert'
          });
          sessionStorage.setItem(lastWalletNotifyKey, 'true');
        }
      }
    }
  }, [user]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto py-10 px-4 relative z-10">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
          <header className="border-b border-gray-200 pb-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-4 text-center md:text-left">
              <h1 className="m-0 text-2xl md:text-3xl font-bold text-gray-800">User Dashboard</h1>
              {user && (
                <div className="flex flex-col items-center md:items-end bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-600 w-full md:w-auto md:min-w-[200px]">
                  <div className="font-semibold text-gray-800 mb-1 text-base">
                    {user.role === 'CLIENT' ? <i className="fa-solid fa-user-tag mr-2"></i> : <i className="fa-solid fa-user mr-2"></i>}
                    {user.alias || user.username}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mb-1">UID: #{user.id.toString().padStart(4, '0')}</div>
                  {branch && (
                    <div className="mb-2"><i className="fa-solid fa-building mr-2"></i>{branch.name}</div>
                  )}
                  {user.role === 'CLIENT' && typeof user.wallet_balance !== 'undefined' && (
                    <div className={`font-bold px-3 py-1 rounded-full text-xs whitespace-nowrap ${user.wallet_balance < 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      <i className="fa-solid fa-wallet mr-2"></i>₹{user.wallet_balance.toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          <nav className="relative">
            <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl">
              <legend className="px-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                  <i className="fa-solid fa-list-check text-xs"></i>
                </div>
                <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Available Actions</span>
              </legend>
              <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {user?.role !== 'DATA_ENTRY' && (
                  <li><DashboardLink to="/receipt-form" icon={<ReceiptIcon />} text="Create New Receipt" /></li>
                )}

                {user?.role === 'CLIENT' ? (
                  <>
                    <li>
                      <DashboardLink to="/my-ratelist" icon={<RatelistIcon />} text="My Ratelist" />
                    </li>
                    <li>
                      <DashboardLink to="/my-analysis" icon={<i className="fa-solid fa-chart-line"></i>} text="Performance Analysis" />
                    </li>
                  </>
                ) : user?.role === 'DATA_ENTRY' ? null : (
                  <li><DashboardLink to="/estimate-form" icon={<EstimateIcon />} text="Create New Estimate" /></li>
                )}

                <li>
                  <DashboardLink 
                    to="/customers" 
                    icon={<CustomersIcon />} 
                    text={
                      <span className="flex items-center">
                        View Customers
                        {user?.role === 'CLIENT' && unreadReports > 0 && (
                          <i className="fa-solid fa-circle-exclamation text-red-650 animate-pulse ml-2" title="Unread reports active"></i>
                        )}
                      </span>
                    } 
                  />
                </li>

                {user?.role === 'CLIENT' && (
                  <li>
                    <DashboardLink to="/transactions" icon={<WalletIcon />} text="Transaction History" />
                  </li>
                )}

                {(user?.role === 'ADMIN' || user?.role === 'DATA_ENTRY') && (
                  <li>
                    <DashboardLink to="/data-entry-portal" icon={<i className="fa-solid fa-cloud-arrow-up"></i>} text="Data Entry Workspace" />
                  </li>
                )}
              </ul>
            </fieldset>
          </nav>

          <div className="text-center mt-12 pt-6 border-t border-gray-200">
            <button
              onClick={logout}
              className="text-red-600 font-medium bg-red-50 px-6 py-2 rounded-lg transition-colors border border-red-200 hover:bg-red-100"
            >
              <LogoutIcon className="mr-2" />
              Logout
            </button>
          </div>
        </div>
      </div>
      {/* Credit line - behind other UI elements but on top of base background */}
      <div className="fixed bottom-4 right-4 text-xs text-slate-500 opacity-90 flex items-center gap-1 font-medium z-0 pointer-events-none select-none">
        <i className="fa-brands fa-creative-commons"></i> Studio Kivx | Created By Tathagata S.
      </div>
    </div>
  );
};

export default UserDashboard;