import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Upload, TrendingUp, History, LogOut, BarChart2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload Data' },
  { to: '/forecast', icon: TrendingUp, label: 'Forecast' },
  { to: '/history', icon: History, label: 'History' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.full_name || user?.email || '';

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-indigo-950 flex flex-col z-50 select-none">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-indigo-900 flex items-center gap-2.5">
        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <BarChart2 size={15} className="text-white" />
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">DemandForecast</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-300 hover:bg-indigo-900 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info + Logout */}
      <div className="px-3 py-3 border-t border-indigo-900 space-y-0.5">
        <div className="px-3 py-2 text-indigo-400 text-xs truncate font-medium">
          {displayName}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-indigo-300 hover:bg-indigo-900 hover:text-white transition-colors w-full"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
