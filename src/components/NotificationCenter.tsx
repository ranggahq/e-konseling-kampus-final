import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, Check, Eye, Trash2, MessageSquare, Calendar, AlertCircle, 
  MapPin, ClipboardList, Activity, Sparkles, UserPlus, ShieldAlert, CheckCircle2
} from 'lucide-react';
import { User, ServerNotification } from '../types';
import { 
  getNotificationsForUser, 
  markNotificationAsReadViaApi, 
  markAllNotificationsAsReadViaApi 
} from '../data/offlineDb';

interface NotificationCenterProps {
  currentUser: User;
}

export default function NotificationCenter({ currentUser }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load and refresh notifications
  const loadNotifications = async () => {
    try {
      const data = await getNotificationsForUser(currentUser.id, currentUser.role);
      // Sort new ones first
      const sorted = (data || []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setNotifications(prev => {
        if (prev.length === sorted.length && prev.every((n, idx) => n.id === sorted[idx].id && n.is_read === sorted[idx].is_read)) {
          return prev;
        }
        return sorted;
      });
    } catch (e) {
      console.warn('Error fetching notifications inside popover:', e);
    }
  };

  useEffect(() => {
    loadNotifications();
    
    // Auto sync notifications periodically (every 5 seconds)
    const interval = setInterval(() => {
      loadNotifications();
    }, 5000);

    return () => clearInterval(interval);
  }, [currentUser.id, currentUser.role]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      try {
        const target = event.target;
        if (target && dropdownRef.current && typeof dropdownRef.current.contains === 'function') {
          if (!dropdownRef.current.contains(target as Node)) {
            setIsOpen(false);
          }
        }
      } catch (err) {
        // Safe fallback is to just swallow the exception or log silently
        console.warn('Click outside safe fallback triggered:', err);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkIndividualRead = async (id: string) => {
    const success = await markNotificationAsReadViaApi(id);
    if (success) {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllRead = async () => {
    const success = await markAllNotificationsAsReadViaApi(currentUser.id, currentUser.role);
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  // Helper to format notification dynamic timestamps in clean Indonesian with Asia/Jakarta (WIB) timezone
  const formatNotificationTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      let d: Date;
      let normalized = dateStr.trim();
      // Normalize format "YYYY-MM-DD HH:mm:ss" into ISO string "YYYY-MM-DDTHH:mm:ssZ"
      // to force browsers to parse it as UTC instead of local browser timezone.
      if (normalized.length === 19 && normalized.includes(' ')) {
        normalized = normalized.replace(' ', 'T') + 'Z';
      } else if (normalized.length > 10 && !normalized.includes('T') && !normalized.endsWith('Z')) {
        normalized = normalized.replace(' ', 'T') + 'Z';
      }
      
      d = new Date(normalized);
      if (isNaN(d.getTime())) {
        d = new Date(dateStr);
      }
      if (isNaN(d.getTime())) {
        return dateStr;
      }

      // Extract parts in Asia/Jakarta timezone
      const getParts = (date: Date) => {
        // Asia/Jakarta is UTC + 7 hours
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const jakartaDate = new Date(utc + (3600000 * 7));
        
        const hr = String(jakartaDate.getHours()).padStart(2, '0');
        const min = String(jakartaDate.getMinutes()).padStart(2, '0');
        
        return {
          year: jakartaDate.getFullYear(),
          month: jakartaDate.getMonth(), // 0-11
          day: jakartaDate.getDate(),
          hour: hr,
          minute: min
        };
      };

      const targetParts = getParts(d);
      const nowParts = getParts(new Date());

      const targetDay = new Date(targetParts.year, targetParts.month, targetParts.day);
      const nowDay = new Date(nowParts.year, nowParts.month, nowParts.day);

      const diffTime = nowDay.getTime() - targetDay.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return `${targetParts.hour}:${targetParts.minute}`;
      } else if (diffDays === 1) {
        return `Kemarin, ${targetParts.hour}:${targetParts.minute}`;
      } else {
        const monthNames = [
          'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 
          'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
        ];
        const dayStr = String(targetParts.day).padStart(2, '0');
        const monthStr = monthNames[targetParts.month] || 'Jun';
        return `${dayStr} ${monthStr} ${targetParts.year}, ${targetParts.hour}:${targetParts.minute}`;
      }
    } catch (e) {
      return 'Beberapa waktu lalu';
    }
  };

  // Get matching icon based on notification title/content keywords
  const getNotificationIconDetails = (title: string, text: string) => {
    const t = (title + ' ' + text).toLowerCase();
    if (t.includes('pesan') || t.includes('chat')) {
      return {
        icon: MessageSquare,
        bgColor: 'bg-blue-50 text-blue-600 border border-blue-100',
      };
    }
    if (t.includes('setuju') || t.includes('jadwal disetujui')) {
      return {
        icon: CheckCircle2,
        bgColor: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      };
    }
    if (t.includes('batal') || t.includes('ditolak')) {
      return {
        icon: AlertCircle,
        bgColor: 'bg-rose-50 text-rose-600 border border-rose-100',
      };
    }
    if (t.includes('antrian') || t.includes('offline') || t.includes('bimbingan tatap muka')) {
      return {
        icon: MapPin,
        bgColor: 'bg-amber-50 text-amber-600 border border-amber-100',
      };
    }
    if (t.includes('selesai')) {
      return {
        icon: ClipboardList,
        bgColor: 'bg-purple-50 text-purple-600 border border-purple-100',
      };
    }
    if (t.includes('hasil phq-9') || t.includes('tes mental')) {
      return {
        icon: Activity,
        bgColor: 'bg-pink-50 text-pink-600 border border-pink-100',
      };
    }
    if (t.includes('baru terdaftar') || t.includes('psikolog baru')) {
      return {
        icon: UserPlus,
        bgColor: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
      };
    }
    return {
      icon: Bell,
      bgColor: 'bg-slate-50 text-slate-600 border border-slate-100',
    };
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* BELL TRIGGER KEY */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
        aria-label="Tampilkan Notifikasi"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            style={{ top: '-4px', right: '-4px' }}
            className="absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FACC15] text-[9px] font-black text-[#000000] animate-pulse shadow-md shadow-[#FACC15]/45 px-1 leading-none select-none z-10"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* DROPDOWN EXPAND PANEL */}
      {isOpen && (
        <div className="absolute right-0 mt-3.5 w-80 md:w-96 glass-panel z-50 overflow-hidden transform origin-top-right transition-all">
          
          {/* POPUP HEADER */}
          <div className="p-4 bg-white/40 border-b border-slate-150/40 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base font-display flex items-center gap-2">
                Notifikasi
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-50/80 text-rose-600 text-[10px] font-extrabold rounded-full">
                    {unreadCount} Baru
                  </span>
                )}
              </h3>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* NOTIFICATION ITERATIONS */}
          <div className="max-h-96 overflow-y-auto no-scrollbar py-1 divide-y divide-slate-100/50 bg-transparent">
            {notifications.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center px-4">
                <div className="p-3 bg-white/50 text-slate-400 rounded-full mb-3 border border-slate-100">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Belum ada notifikasi terkini
                </p>
                <p className="text-[10px] text-slate-350 mt-1 max-w-[200px]">
                  Seluruh pembaruan alur bimbingan Anda akan dirangkum di sini.
                </p>
              </div>
            ) : (
              notifications.map(item => {
                const { icon: CustomIcon, bgColor } = getNotificationIconDetails(item.title, item.text);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkIndividualRead(item.id)}
                    className={`p-4 flex gap-3 cursor-pointer transition-all ${
                      item.is_read 
                        ? 'bg-transparent hover:bg-white/30' 
                        : 'bg-indigo-50/35 hover:bg-indigo-50/55 border-l-2 border-indigo-600'
                    }`}
                  >
                    {/* CUSTOM HIGHLIGHT ICON */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
                      <CustomIcon className="w-4 h-4" />
                    </div>

                    {/* TEXT DETAIL */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex justify-between items-start gap-1">
                        <span className={`text-xs block font-bold leading-tight ${
                          item.is_read ? 'text-slate-700' : 'text-slate-900 font-extrabold'
                        }`}>
                          {item.title}
                        </span>
                        {!item.is_read && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-1.5 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-501 font-medium leading-relaxed break-words">
                        {item.text}
                      </p>
                      <div className="text-[9px] text-slate-400 font-medium font-mono">
                        {formatNotificationTime(item.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
