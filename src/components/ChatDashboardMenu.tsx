import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Send, Search, Check, AlertCircle, Sparkles, Shield, 
  ArrowLeft, MessageSquare, Heart, Clock, Smile, Trash2, Plus, FileText
} from 'lucide-react';
import { User, Consultation, ChatMessage } from '../types';
import { fetchAllChatMessages, sendChatMessageViaApi, markChatMessagesAsReadViaApi } from '../data/offlineDb';
import { INITIAL_PSYCHOLOGISTS } from '../data/mockData';

interface ChatDashboardMenuProps {
  currentUser: User;
  consultations: Consultation[];
  setConsultations: React.Dispatch<React.SetStateAction<Consultation[]>>;
  onSaveNotes?: (consultationId: string, notes: string, recommendations: string[]) => void;
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
}

const mapMsg = (apiMsg: any): ChatMessage => ({
  id: apiMsg.id,
  consultationId: apiMsg.consultation_id,
  senderId: apiMsg.sender_id,
  receiverId: apiMsg.receiver_id,
  senderRole: apiMsg.sender_role || (apiMsg.sender_id.startsWith('psikolog') ? 'psikolog' : 'mahasiswa'),
  text: apiMsg.message,
  createdAt: apiMsg.created_at,
  updatedAt: apiMsg.created_at,
  isRead: apiMsg.is_read
});

export default function ChatDashboardMenu({ 
  currentUser, 
  consultations, 
  setConsultations,
  onSaveNotes,
  selectedChatId,
  setSelectedChatId
}: ChatDashboardMenuProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Audit render log
  console.count('ChatDashboardMenu Render');

  const selectedChat = React.useMemo(() => {
    if (!selectedChatId) return null;
    return consultations.find(c => c.id === selectedChatId) || null;
  }, [consultations, selectedChatId]);

  const consultationsRef = useRef(consultations);
  const selectedChatIdRef = useRef(selectedChatId);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    consultationsRef.current = consultations;
  }, [consultations]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [chatSubTab, setChatSubTab] = useState<'active' | 'unread'>('active');
  
  // Mobile responsiveness helper
  const [showListOnMobile, setShowListOnMobile] = useState(true);

  // Clinical notes states for psychologist sidebar
  const [diagnosis, setDiagnosis] = useState('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [newRecommendation, setNewRecommendation] = useState('');
  const [isNotesSaved, setIsNotesSaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessagesWaiting, setHasNewMessagesWaiting] = useState(false);
  
  const lastOpenedRoomIdRef = useRef<string | null>(null);
  const userSentMessageRef = useRef<boolean>(false);
  const prevMsgCountRef = useRef<number>(0);

  // Calculate stats for each chat: last message, relative timestamp, unread count
  const getChatStats = (consultId: string, partnerId: string) => {
    const roomMsgs = messages.filter(m => m.consultationId === consultId);
    const sorted = [...roomMsgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const lastMsg = sorted[sorted.length - 1];
    const unreadCount = roomMsgs.filter(m => m.receiverId === currentUser.id && !m.isRead).length;

    return {
      lastMessage: lastMsg ? lastMsg.text : 'Belum ada percakapan.',
      lastMessageTime: lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '',
      unreadCount,
      lastMsgObj: lastMsg
    };
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Buffer of 120px to determine if they are close enough to bottom
    const nearBottom = distanceFromBottom < 120;
    
    setIsNearBottom(prev => {
      if (prev !== nearBottom) {
        return nearBottom;
      }
      return prev;
    });

    if (nearBottom) {
      setHasNewMessagesWaiting(prev => {
        if (prev) return false;
        return prev;
      });
    }
  };

  // Keep list layout in sync on mobile when a chat is selected
  useEffect(() => {
    if (selectedChatId) {
      setShowListOnMobile(false);
    }
  }, [selectedChatId]);

  // Load psychologist clinical notes when chat room changes
  useEffect(() => {
    if (selectedChat) {
      setDiagnosis(selectedChat.diagnosisNotes || '');
      setRecommendations(selectedChat.recommendations || []);
    }
  }, [selectedChat]);

  // Load messages from backend API
  const syncChatMessages = async () => {
    try {
      const allApiMsgs = await fetchAllChatMessages();
      const mapped = allApiMsgs.map(mapMsg);
      setMessages(prev => {
        if (prev.length === mapped.length && prev.every((m, idx) => m.id === mapped[idx].id && m.isRead === mapped[idx].isRead && m.text === mapped[idx].text)) {
          return prev;
        }
        return mapped;
      });

      const currentConsultations = consultationsRef.current;
      const currentSelectedChatId = selectedChatIdRef.current;
      const curUser = currentUserRef.current;

      // Auto-reconstruct missing chat consultation rooms if there are any chat messages
      // with a consultation_id that is NOT in the local consultations list
      const existingIds = new Set(currentConsultations.map(c => c.id));
      const missingIds = new Set<string>();

      allApiMsgs.forEach(m => {
        if (m.consultation_id && !existingIds.has(m.consultation_id)) {
          // Only reconstruct rooms where the current user is a participant
          if (m.sender_id === curUser.id || m.receiver_id === curUser.id) {
            missingIds.add(m.consultation_id);
          }
        }
      });

      if (missingIds.size > 0) {
        let localUsers: User[] = [];
        try {
          const uStr = localStorage.getItem('app_users');
          if (uStr) localUsers = JSON.parse(uStr);
        } catch (e) {}

        let localPsychs: any[] = [];
        try {
          const pStr = localStorage.getItem('app_psychologists');
          localPsychs = pStr ? JSON.parse(pStr) : INITIAL_PSYCHOLOGISTS;
        } catch (e) {
          localPsychs = INITIAL_PSYCHOLOGISTS;
        }

        const newRoomsToInject: Consultation[] = [];

        missingIds.forEach(id => {
          const firstMsg = allApiMsgs.find(m => m.consultation_id === id);
          if (firstMsg) {
            const senderIsPsych = firstMsg.sender_role === 'psikolog' || firstMsg.sender_id.startsWith('psikolog');
            const studentId = senderIsPsych ? firstMsg.receiver_id : firstMsg.sender_id;
            const psychId = senderIsPsych ? firstMsg.sender_id : firstMsg.receiver_id;

            const studentObj = localUsers.find(u => u.id === studentId);
            const psychObj = localPsychs.find(p => p.id === psychId);

            // Determine student detail with multiple fallback layers to guarantee real student name is resolved
            let sName = 'Mahasiswa POLINELA';
            let sNim = 'NIM';
            let sPhone: string | undefined = undefined;

            if (studentId === curUser.id && curUser.role === 'mahasiswa') {
              sName = curUser.name;
              sNim = curUser.nimOrNip;
              sPhone = curUser.phoneNumber;
            } else if (studentObj) {
              sName = studentObj.name;
              sNim = studentObj.nimOrNip;
              sPhone = studentObj.phoneNumber;
            } else {
              // Extract from existing consultations if we have any prior records
              const existingUserConsult = currentConsultations.find(
                c => c.studentId === studentId && c.studentName && c.studentName !== 'Mahasiswa Tidak Dikenal' && c.studentName !== 'Mahasiswa POLINELA'
              );
              if (existingUserConsult) {
                sName = existingUserConsult.studentName;
                sNim = existingUserConsult.studentNim;
                sPhone = existingUserConsult.studentPhone || existingUserConsult.studentWhatsapp;
              } else if ((firstMsg as any).student_name) {
                sName = (firstMsg as any).student_name;
              }
            }

            // Determine psychologist name
            let pName = 'Psikolog POLINELA';
            let pAvatar = '';
            if (psychId === curUser.id && curUser.role === 'psikolog') {
              pName = curUser.name;
              pAvatar = curUser.avatarUrl || '';
            } else if (psychObj) {
              pName = psychObj.name;
              pAvatar = psychObj.avatarUrl || '';
            }

            const newRoom: Consultation = {
              id: id,
              studentId: studentId,
              studentName: sName,
              studentNim: sNim,
              studentPhone: sPhone,
              studentWhatsapp: sPhone,
              psychologistId: psychId,
              psychologistName: pName,
              psychologistAvatar: pAvatar,
              consultation_id: id,
              mahasiswa_id: studentId,
              psikolog_id: psychId,
              date: 'Asynchronous',
              timeSlot: 'Fleksibel',
              status: 'ongoing',
              type: 'chat',
              symptoms: firstMsg.message || 'Konsultasi chat baru',
              symptomDuration: '1-2 minggu',
              createdAt: firstMsg.created_at || new Date().toISOString(),
              updatedAt: firstMsg.created_at || new Date().toISOString()
            };
            newRoomsToInject.push(newRoom);
          }
        });

        if (newRoomsToInject.length > 0) {
          setConsultations(prev => {
            const finalToAdd = newRoomsToInject.filter(nr => !prev.some(p => p.id === nr.id));
            if (finalToAdd.length === 0) return prev;
            const updated = [...finalToAdd, ...prev];
            localStorage.setItem('all_consultations', JSON.stringify(updated));
            return updated;
          });
        }
      }

      // If we have an active selected chat, mark seen messages as read for this user
      if (currentSelectedChatId) {
        const hasUnreadReceived = allApiMsgs.some(
          m => m.consultation_id === currentSelectedChatId && m.receiver_id === curUser.id && !m.is_read
        );
        if (hasUnreadReceived) {
          await markChatMessagesAsReadViaApi(currentSelectedChatId, curUser.id);
        }
      }
    } catch (e) {
      console.error('Failed syncing chat messages dashboard:', e);
    }
  };

  // Initial and periodic sync
  useEffect(() => {
    syncChatMessages();
    const interval = setInterval(syncChatMessages, 3000);
    return () => clearInterval(interval);
  }, [currentUser.id]);

  // Filter consultations that are 'approved' or 'ongoing' (active chats)
  const isStudent = currentUser.role === 'mahasiswa';

  const getResolvedStudentName = useCallback((chat: Consultation, studentUser: User | null) => {
    if (studentUser?.name) return studentUser.name;
    if (chat.studentName && chat.studentName !== 'Mahasiswa POLINELA' && chat.studentName !== 'Mahasiswa Tidak Dikenal') {
      return chat.studentName;
    }
    // Search other consultations
    const existing = consultations.find(
      c => c.studentId === chat.studentId && c.studentName && c.studentName !== 'Mahasiswa POLINELA' && c.studentName !== 'Mahasiswa Tidak Dikenal'
    );
    if (existing?.studentName) return existing.studentName;
    if (chat.studentNim && chat.studentNim !== 'NIM') return `Mahasiswa (${chat.studentNim})`;
    return 'Mahasiswa POLINELA';
  }, [consultations]);

  const rawChatConsultations = consultations.filter(c => {
    const isMatchedRole = isStudent ? c.studentId === currentUser.id : c.psychologistId === currentUser.id;
    const isValidStatus = c.status === 'approved' || c.status === 'ongoing' || c.status === 'CHAT_AKTIF' || c.status === 'SEDANG_BERLANGSUNG';
    const isChatType = c.type === 'chat';
    return isMatchedRole && isValidStatus && isChatType;
  });

  // Deduplicate helper so that 1 partner (student or psychologist) gets maximum 1 chat room
  const dedupedChatMap = new Map<string, Consultation>();
  const sortedSessions = [...rawChatConsultations].sort(
    (a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()
  );

  for (const session of sortedSessions) {
    const partnerId = isStudent ? session.psychologistId : session.studentId;
    if (!dedupedChatMap.has(partnerId)) {
      dedupedChatMap.set(partnerId, session);
    }
  }

  const chatConsultations = Array.from(dedupedChatMap.values()).filter(c => {
    // Only display rooms that have at least 1 message in history
    const roomMsgs = messages.filter(m => m.consultationId === c.id);
    return roomMsgs.length > 0;
  });

  // Count unread active rooms
  const unreadChatsCount = chatConsultations.filter(c => {
    const partnerId = isStudent ? c.psychologistId : c.studentId;
    return getChatStats(c.id, partnerId).unreadCount > 0;
  }).length;

  const chatSubTabFiltered = chatConsultations.filter(c => {
    const partnerId = isStudent ? c.psychologistId : c.studentId;
    if (chatSubTab === 'active') {
      return c.status === 'approved' || c.status === 'ongoing' || c.status === 'CHAT_AKTIF' || c.status === 'SEDANG_BERLANGSUNG';
    } else if (chatSubTab === 'unread') {
      return getChatStats(c.id, partnerId).unreadCount > 0;
    }
    return true;
  });

  // Search filter
  const filteredChats = chatSubTabFiltered.filter(c => {
    const targetName = isStudent ? c.psychologistName : c.studentName;
    return targetName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Fetch student details from localStorage
  const getStudentDetails = (studentId: string): User | null => {
    try {
      const usersStr = localStorage.getItem('app_users');
      if (usersStr) {
        const users = JSON.parse(usersStr) as User[];
        const found = users.find(u => u.id === studentId);
        if (found) return found;
      }
    } catch (e) {
      console.error('Error getting student details:', e);
    }
    return null;
  };

  // Modern circular avatar renderer
  const renderAvatar = (name: string, avatarUrl?: string, sizeClass: string = "w-11 h-11") => {
    if (avatarUrl && avatarUrl.trim() !== '' && !avatarUrl.includes('placeholder')) {
      return (
        <img 
          src={avatarUrl}
          alt={name}
          className={`${sizeClass} rounded-full object-cover border border-slate-150 shrink-0`}
        />
      );
    }

    // Modern circular avatar with stylish colors and dynamic background
    const initials = name ? name.charAt(0).toUpperCase() : '?';
    const colors = [
      'bg-indigo-50 text-indigo-700 border-indigo-150',
      'bg-emerald-50 text-emerald-700 border-emerald-150',
      'bg-rose-50 text-rose-700 border-rose-150',
      'bg-amber-50 text-amber-700 border-amber-150',
      'bg-sky-50 text-sky-700 border-sky-150',
      'bg-teal-50 text-teal-700 border-teal-150'
    ];
    const charCodeSum = name ? name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) : 0;
    const colorClass = colors[charCodeSum % colors.length];

    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-xs tracking-wider border ${colorClass} shrink-0 shadow-3xs`}>
        {initials}
      </div>
    );
  };

  // Get current status of psychologist (online, busy, offline)
  const getPsychologistStatus = (psychId: string): 'online' | 'busy' | 'offline' => {
    const saved = localStorage.getItem(`psych_status_${psychId}`);
    if (saved === 'online' || saved === 'busy' || saved === 'offline') {
      return saved;
    }
    // Backward compatibility for old values
    if (saved === 'Online') return 'online';
    if (saved === 'Offline') return 'offline';
    if (saved === 'Sedang Bertugas' || saved === 'Sedang Konsultasi') return 'busy';
    
    // Default values if empty
    return psychId === 'psikolog_1' ? 'online' : 'offline';
  };

  // Helper to format/translate psychologist status for student view
  const getPsychologistDisplayLabel = (psychId: string) => {
    const status = getPsychologistStatus(psychId);
    if (status === 'online') {
      return {
        text: '🟢 Tersedia untuk Konsultasi',
        bgClass: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
        dotClass: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
      };
    } else if (status === 'offline') {
      return {
        text: '⚪ Offline / Tidak Tersedia',
        bgClass: 'bg-rose-50 text-rose-600 border border-rose-100',
        dotClass: 'bg-rose-500'
      };
    } else {
      return {
        text: '🟡 Sedang Bertugas',
        bgClass: 'bg-amber-50 text-amber-700 border border-amber-200 font-extrabold',
        dotClass: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
      };
    }
  };

  // Check if student is active (only psychologists can be online/offline/sedang bertugas)
  const isUserOnline = (id: string) => {
    if (id.startsWith('psikolog')) {
      return getPsychologistStatus(id) === 'online';
    }
    return false; // Student is not tracked with active indicators anymore
  };

  const forceScrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current;
    if (el) {
      if (smooth) {
        try {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth'
          });
        } catch (err) {
          el.scrollTop = el.scrollHeight;
        }
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    setIsNearBottom(true);
    setHasNewMessagesWaiting(false);
  }, []);

  // Telemetry for component lifetime (Audit)
  useEffect(() => {
    console.log('ChatDashboardMenu MOUNTED');
    return () => {
      console.log('ChatDashboardMenu UNMOUNTED');
    };
  }, []);

  // Scroll logic
  useEffect(() => {
    if (!selectedChat) {
      lastOpenedRoomIdRef.current = null;
      prevMsgCountRef.current = 0;
      return;
    }

    const roomId = selectedChat.id;
    const currentRoomMsgCount = messages.filter(m => m.consultationId === roomId).length;
    const el = scrollContainerRef.current;

    // 1. Initial room opening
    if (roomId !== lastOpenedRoomIdRef.current) {
      console.log(`Chat room opened / swapped: ${roomId}`);
      lastOpenedRoomIdRef.current = roomId;
      prevMsgCountRef.current = currentRoomMsgCount;
      setHasNewMessagesWaiting(false);
      
      if (el) {
        el.scrollTop = el.scrollHeight;
        // Double check after 50ms for images and layout
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        }, 50);
      }
      return;
    }

    // 2. Message count increased (new messages arrived or sent)
    if (currentRoomMsgCount > prevMsgCountRef.current) {
      console.log(`Message count increased in room ${roomId}: ${prevMsgCountRef.current} -> ${currentRoomMsgCount}`);
      prevMsgCountRef.current = currentRoomMsgCount;

      let currentlyNearBottom = true;
      if (el) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        currentlyNearBottom = distanceFromBottom < 220; // safe buffer
      }

      if (userSentMessageRef.current || currentlyNearBottom) {
        userSentMessageRef.current = false;
        if (el) {
          el.scrollTop = el.scrollHeight;
          // Trigger multiple micro-intervals to guarantee absolute bottom on repaint
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
          }, 30);
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
          }, 100);
        }
      } else {
        setHasNewMessagesWaiting(true);
      }
    }
  }, [messages, selectedChat?.id]);

  const updateConsultationStatus = (consultationId: string, newStatus: string) => {
    setConsultations(prev => prev.map(c => {
      if (c.id === consultationId) {
        return { ...c, status: newStatus as any, updatedAt: new Date().toISOString() };
      }
      return c;
    }));

    try {
      const allStr = localStorage.getItem('all_consultations');
      if (allStr) {
        const list = JSON.parse(allStr) as Consultation[];
        const updated = list.map(c => {
          if (c.id === consultationId) {
            return { ...c, status: newStatus as any, updatedAt: new Date().toISOString() };
          }
          return c;
        });
        localStorage.setItem('all_consultations', JSON.stringify(updated));
      }
    } catch (e) {
      console.error(e);
    }

    // Real-time selectedChat values will auto-sync properly via the derived useMemo hook
  };

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !inputText.trim()) return;

    const partnerId = isStudent ? selectedChat.psychologistId : selectedChat.studentId;
    const cleanText = inputText.trim();
    setInputText('');

    try {
      const resp = await sendChatMessageViaApi(
        selectedChat.id,
        currentUser.id,
        partnerId,
        isStudent ? 'mahasiswa' : 'psikolog',
        cleanText
      );
      if (resp.success && resp.data) {
        userSentMessageRef.current = true;
        setMessages(prev => {
          const mappedItem = mapMsg(resp.data);
          if (prev.some(m => m.id === mappedItem.id)) return prev;
          return [...prev, mappedItem];
        });
        // Force immediate proactive scroll to bottom to eliminate lay-shifting wait
        forceScrollToBottom(false);
        setTimeout(() => forceScrollToBottom(false), 50);
      }
    } catch (e) {
      console.error('Failed sending message from chat dashboard:', e);
    }
  };

  // Clinical notes
  const handleAddRec = () => {
    if (!newRecommendation.trim()) return;
    setRecommendations([...recommendations, newRecommendation.trim()]);
    setNewRecommendation('');
  };

  const handleRemoveRec = (idx: number) => {
    setRecommendations(recommendations.filter((_, i) => i !== idx));
  };

  const handleSaveWorkspaceNotes = () => {
    if (onSaveNotes && selectedChat) {
      onSaveNotes(selectedChat.id, diagnosis, recommendations);
      setIsNotesSaved(true);
      setTimeout(() => setIsNotesSaved(false), 2500);
    }
  };

  const activeRoomMessages = selectedChat 
    ? messages.filter(m => m.consultationId === selectedChat.id)
    : [];

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden h-[75vh] flex">
      
      {/* 1. LEFT SIDEBAR: ACTIVE CHATS LIST */}
      <div className={`w-full md:w-85 border-r border-slate-100 bg-slate-50/40 flex flex-col shrink-0 ${
        showListOnMobile ? 'block' : 'hidden md:flex'
      }`}>
        {/* Search header */}
        <div className="p-4 border-b border-slate-100/80 bg-white">
          <h3 className="font-bold text-slate-800 text-sm md:text-base font-display flex items-center gap-1.5 mb-3">
            <MessageSquare className="w-4.5 h-4.5 text-indigo-600" /> Chat Konsultasi
          </h3>
          <div className="relative">
            <input 
              type="text"
              placeholder="Cari psikolog / mahasiswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 text-slate-800 text-xs pl-8 pr-3 py-2 border border-slate-150 rounded-xl focus:outline-none focus:border-indigo-500 font-medium"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Dynamic Sub-tabs for Chat Konsultasi */}
        <div className="p-2 bg-slate-50 border-b border-slate-205 flex gap-1 z-10 shrink-0">
          {[
            { id: 'active', label: 'Percakapan Aktif' },
            { id: 'unread', label: 'Belum Dibaca' }
          ].map(tab => {
            const isActive = chatSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setChatSubTab(tab.id as any)}
                className={`flex-1 py-1.5 px-0.5 rounded-lg text-[10px] md:text-[11px] font-extrabold text-center transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-3xs' 
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {tab.label}
                {tab.id === 'unread' && unreadChatsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[9px] font-black animate-pulse">
                    {unreadChatsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Chats scroll block */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
          {(() => { console.count('Chat Message List Render'); return null; })()}
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2 mt-6">
              <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <MessageSquare className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                {chatSubTab === 'unread' 
                  ? 'Tidak ada pesan belum dibaca saat ini.' 
                  : 'Belum ada percakapan aktif.'}
              </p>
              <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
                {chatSubTab === 'unread' 
                  ? 'Anda sudah membaca semua pesan obrolan.' 
                  : isStudent 
                  ? 'Psikolog yang Anda hubungi untuk konsultasi chat akan muncul di sini.' 
                  : 'Mahasiswa yang memulai konsultasi chat akan muncul di sini.'}
              </p>
            </div>
          ) : (
            filteredChats.map(chat => {
              const partnerId = isStudent ? chat.psychologistId : chat.studentId;
              const selectedStudentUser = !isStudent ? getStudentDetails(partnerId) : null;
              const partnerName = isStudent 
                ? chat.psychologistName 
                : getResolvedStudentName(chat, selectedStudentUser);
              const partnerAvatar = isStudent ? chat.psychologistAvatar : selectedStudentUser?.avatarUrl;
              const isSelected = selectedChat?.id === chat.id;
              const stats = getChatStats(chat.id, partnerId);
              
              // Only psychologist status matters. Students do not track presence.
              const psychStatusInfo = isStudent ? getPsychologistDisplayLabel(partnerId) : null;

              return (
                <button
                   key={chat.id}
                   onClick={() => {
                     setSelectedChatId(chat.id);
                     setShowListOnMobile(false);
                   }}
                   className={`w-full p-4 flex items-center gap-3.5 text-left transition-all border-l-4 cursor-pointer hover:bg-slate-50/70 border-b border-slate-50 ${
                     isSelected 
                       ? 'bg-indigo-50/20 border-indigo-600' 
                       : 'border-transparent'
                   }`}
                >
                  {/* Avatar Container */}
                  <div className="relative shrink-0">
                    {renderAvatar(partnerName, partnerAvatar, "w-11 h-11")}
                    {isStudent && psychStatusInfo && (
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${psychStatusInfo.dotClass}`} />
                    )}
                  </div>

                  {/* Teaser details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="font-bold text-slate-800 text-xs md:text-sm font-display truncate">
                        {partnerName}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0 font-mono">
                        {stats.lastMessageTime}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-450 truncate mt-0.5 font-medium leading-relaxed italic">
                      "{stats.lastMessage}"
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      {/* Only show completed badge, but no active presence status for students */}
                      {chat.status === 'completed' ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-500">
                          Selesai
                        </span>
                      ) : (
                        isStudent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-emerald-50 text-emerald-700">
                            Aktif
                          </span>
                        )
                      )}
                      
                      {isStudent && chat.type === 'chat' && (
                        <span className="text-[9px] text-indigo-500 font-bold bg-indigo-50/50 px-1.5 py-0.5 rounded">💬 Chat</span>
                      )}
                      
                      {!isStudent && stats.unreadCount > 0 && (
                        <span className="text-[10px] text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded-md animate-pulse">
                          ({stats.unreadCount} pesan baru)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unread badge alert for student */}
                  {isStudent && stats.unreadCount > 0 && (
                    <div className="bg-emerald-550 text-white text-[9px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shrink-0 animate-bounce">
                      {stats.unreadCount}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. CHAT WINDOW PANEL */}
      <div className={`flex-1 flex flex-col h-full bg-white relative ${
        !showListOnMobile ? 'block' : 'hidden md:flex'
      }`}>
        {(() => { console.count('Chat Window Render'); return null; })()}
        {selectedChat ? (
          <>
            {/* Header info */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white z-10 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Back to list on mobile */}
                <button 
                  onClick={() => setShowListOnMobile(true)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 md:hidden"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>

                {(() => {
                  const partnerId = isStudent ? selectedChat.psychologistId : selectedChat.studentId;
                  const selectedStudentUser = !isStudent ? getStudentDetails(partnerId) : null;
                  const partnerName = isStudent 
                    ? selectedChat.psychologistName 
                    : getResolvedStudentName(selectedChat, selectedStudentUser);
                  const partnerAvatar = isStudent ? selectedChat.psychologistAvatar : selectedStudentUser?.avatarUrl;
                  const psychStatusInfo = isStudent ? getPsychologistDisplayLabel(partnerId) : null;

                  return (
                    <>
                      <div className="relative shrink-0">
                        {renderAvatar(partnerName, partnerAvatar, "w-10 h-10")}
                        {isStudent && psychStatusInfo && (
                          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${psychStatusInfo.dotClass}`} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-850 text-xs md:text-sm truncate">
                          {partnerName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                          {isStudent && psychStatusInfo ? (
                            <span className="font-extrabold text-slate-700">{psychStatusInfo.text}</span>
                          ) : (
                            <span className="font-bold text-indigo-600 font-mono">NIM: {selectedChat.studentNim}</span>
                          )}
                          {!isStudent && selectedStudentUser?.prodiOrUnit && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 font-semibold">{selectedStudentUser.prodiOrUnit}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isStudent && (
                  selectedChat.status === 'completed' || selectedChat.status === 'SELESAI' || selectedChat.status === 'diarsipkan' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-slate-500 text-[10px] md:text-xs font-extrabold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      Chat Diarsipkan
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-150 rounded-full text-indigo-700 text-[10px] md:text-xs font-extrabold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                      Chat Aktif
                    </div>
                  )
                )}
                <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-750 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                  <Shield className="w-3.5 h-3.5" /> 🔒 Konsultasi Aman
                </div>
              </div>
            </div>

            {/* Area percakapan langsung tampil tanpa banner keluhan */}

            {/* Bubble logs scrolling container */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 bg-slate-50/30"
            >
              {activeRoomMessages.length === 0 ? (
                <div className="text-center py-12 max-w-xs mx-auto space-y-3">
                  <div className="w-11 h-11 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs md:text-sm">Ruang Chat Interaktif Aktif</h4>
                  <p className="text-[10px] text-slate-455 font-medium leading-relaxed">
                    Sesi chat resmi, aman, dan mematuhi kode etik bimbingan mahasiswa POLINELA.
                  </p>
                </div>
              ) : (
                activeRoomMessages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUser.id;
                  const timeStr = new Date(msg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] md:max-w-[65%] rounded-2xl px-3.5 py-2.5 text-xs md:text-sm shadow-3xs relative ${
                        isMe 
                          ? 'bg-indigo-600 text-white rounded-br-none' 
                          : 'bg-white text-slate-805 border border-slate-100 rounded-bl-none'
                      }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        
                        <div className="flex items-center justify-end gap-1.5 mt-1.5">
                          <span className={`text-[9px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {timeStr}
                          </span>

                          {/* Double ticks for Read stats */}
                          {isMe && (
                            <div className="shrink-0">
                              {msg.isRead ? (
                                <span className="flex items-center text-emerald-300">
                                  <Check className="w-3 h-3 shrink-0" />
                                  <Check className="w-3 h-3 shrink-0" />
                                </span>
                              ) : (
                                <Check className="w-3 h-3 text-slate-350 shrink-0" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating scroll indicator and notification */}
            {(!isNearBottom || hasNewMessagesWaiting) && (
              <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
                {hasNewMessagesWaiting && (
                  <span className="bg-emerald-500 text-white font-extrabold text-[10px] px-3.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
                    ↓ Pesan Terbaru
                  </span>
                )}
                {!isNearBottom && (
                  <button
                    type="button"
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                        setIsNearBottom(true);
                        setHasNewMessagesWaiting(false);
                      }
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-[11px] px-4 py-2 rounded-full border border-indigo-500 shadow-md flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Scroll ke Pesan Terbaru
                  </button>
                )}
              </div>
            )}

            {/* Input keyboard tray */}
            {selectedChat.status === 'completed' || selectedChat.status === 'SELESAI' ? (
              <div className="p-4 border-t border-slate-100 bg-slate-50 text-center text-slate-500 flex flex-col items-center justify-center gap-1 shrink-0">
                <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 text-slate-400">
                  <Shield className="w-3.5 h-3.5" /> Sesi Selesai
                </div>
                <p className="text-[10px] text-slate-450 leading-normal max-w-sm">
                  Sesi chat ini telah diakhiri oleh Psikolog. Percakapan dialihkan menjadi read-only guna menjamin integritas arsip bimbingan.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Ketik pesan Anda di sini... (Tekan Enter)"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 bg-slate-150/40 text-slate-800 text-xs md:text-sm border border-slate-200 focus:outline-none focus:border-indigo-500 px-4 py-3 rounded-2xl placeholder-slate-400 font-medium"
                  />
                  <button 
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-50 disabled:text-slate-400 text-white rounded-2xl transition-all cursor-pointer shadow-xs"
                  >
                    <Send className="w-4 md:w-5 h-4 md:h-5" />
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/20">
            <div className="w-16 h-16 bg-white border border-slate-100 rounded-3xl flex items-center justify-center shadow-3xs mb-4">
              <MessageSquare className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm md:text-base font-display">Ruang Konseling Digital POLINELA</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed font-semibold">
              Hubungkan secara instan. Silakan pilih salah satu daftar chat aktif dari panel kiri Anda untuk berkirim pesan secara interaktif.
            </p>
          </div>
        )}
      </div>

      {/* 3. RIGHT SIDEBAR: CATATAN KONSULTASI (Only for psychologist and when chat room is active) */}
      {!isStudent && selectedChat && !showListOnMobile && (
        <div className="hidden lg:flex w-75 border-l border-slate-100 p-5 flex-col h-full overflow-y-auto shrink-0 bg-slate-50/25">
          <div className="flex items-center gap-1.5 pb-2.5 border-b border-slate-200">
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider font-display">Catatan Konsultasi Psikolog</h4>
          </div>

          <div className="space-y-4 mt-4">
            {/* Diagnosis Input */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Asesmen Psikologis
              </label>
              <textarea
                value={diagnosis}
                onChange={(e) => {
                  setDiagnosis(e.target.value);
                  setIsNotesSaved(false);
                }}
                placeholder="Tuliskan evaluasi klinis mahasiswa..."
                className="w-full h-32 bg-white text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 p-2.5 rounded-xl text-xs leading-relaxed"
              />
            </div>

            {/* Recommendations */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Rencana Aksi & Rekomendasi
              </label>
              
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {recommendations.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Belum ada rekomendasi ditambahkan.</p>
                ) : (
                  recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-150 text-[10px] text-slate-600">
                      <p className="flex-1 pr-1 leading-normal">{rec}</p>
                      <button 
                        onClick={() => handleRemoveRec(i)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-1 pt-1">
                <input
                  type="text"
                  value={newRecommendation}
                  onChange={(e) => setNewRecommendation(e.target.value)}
                  placeholder="Tambahkan aksi..."
                  className="flex-1 bg-white text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 px-2 py-1.5 rounded-lg text-[10px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRec();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddRec}
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveWorkspaceNotes}
                disabled={!diagnosis.trim() && recommendations.length === 0}
                className="w-full flex items-center justify-center gap-1 py-2 bg-indigo-600 hover:bg-indigo-750 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer transition-all"
              >
                {isNotesSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    Berhasil Tersimpan!
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    Simpan Catatan Konsultasi
                  </>
                )}
              </button>
              <p className="text-[9px] text-slate-400 text-center mt-1 leading-normal">
                Catatan konsultasi tersimpan secara real-time ke dalam sistem utama.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
