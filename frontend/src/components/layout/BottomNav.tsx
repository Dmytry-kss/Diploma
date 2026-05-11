import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Upload, TrendingUp, History, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload',    icon: Upload,          label: 'Upload' },
  { to: '/forecast',  icon: TrendingUp,      label: 'Forecast' },
  { to: '/history',   icon: History,         label: 'History' },
];

export function BottomNav() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 z-50 flex items-center justify-around px-2 h-14">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
      <button
        onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
      >
        <LogOut size={20} />
        Sign Out
      </button>
    </nav>
  );
}
