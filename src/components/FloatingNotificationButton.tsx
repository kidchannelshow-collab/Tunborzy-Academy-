import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useProfile } from '../lib/useProfile';

interface FloatingNotificationButtonProps {
  onClick: () => void;
}

export default function FloatingNotificationButton({ onClick }: FloatingNotificationButtonProps) {
  const { profile } = useProfile();
  const [position, setPosition] = useState({ x: -1, y: -1 }); // -1 means default position
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const posRef = useRef({ x: -1, y: -1 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!profile?.id || !supabase) {
      setUnreadCount(0);
      return;
    }

    let mounted = true;
    const loadUnread = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);
      if (!error && mounted) setUnreadCount(count || 0);
    };

    loadUnread();
    const channel = supabase.channel(`floating_notifications_${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`
      }, loadUnread)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Initialize position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('floating_button_pos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(parsed);
          posRef.current = parsed;
        }
      } catch(e) { /* ignore */ }
    } else {
      // Set to default position
      setDefaultPosition();
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const setDefaultPosition = () => {
    // Desktop/Tablet: Bottom right. Mobile: Higher up to avoid composer
    const isMobile = window.innerWidth < 768;
    const paddingX = 24;
    const paddingY = isMobile ? 140 : 24; // Extra space on mobile for composer/nav
    
    const x = window.innerWidth - 64 - paddingX; // 64 is button width/height approx
    const y = window.innerHeight - 64 - paddingY;
    
    setPosition({ x, y });
    posRef.current = { x, y };
  };
  
  const handleResize = () => {
    // If screen shrinks, ensure button stays in bounds
    if (posRef.current.x === -1) {
       setDefaultPosition();
       return;
    }
    
    let x = posRef.current.x;
    let y = posRef.current.y;
    const maxX = window.innerWidth - 70;
    const maxY = window.innerHeight - 70;
    
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;
    
    setPosition({ x, y });
    posRef.current = { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (e.button !== 0 && e.type !== 'touchstart') return;
    
    setIsDragging(false); // Reset drag state
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { ...posRef.current };
    
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    
    // Disable text selection during drag
    document.body.style.userSelect = 'none';
  };

  const handlePointerMove = (e: PointerEvent) => {
    e.preventDefault();
    
    const dx = e.clientX - dragStartMouse.current.x;
    const dy = e.clientY - dragStartMouse.current.y;
    
    if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      setIsDragging(true);
    }
    
    if (isDragging) {
      let newX = dragStartPos.current.x + dx;
      let newY = dragStartPos.current.y + dy;
      
      // Keep in viewport bounds
      const minX = 0;
      const minY = 0;
      const maxX = window.innerWidth - (buttonRef.current?.offsetWidth || 64);
      const maxY = window.innerHeight - (buttonRef.current?.offsetHeight || 64);
      
      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));
      
      setPosition({ x: newX, y: newY });
      posRef.current = { x: newX, y: newY };
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.body.style.userSelect = '';
    
    if (isDragging) {
      // Snap to nearest edge
      let x = posRef.current.x;
      let y = posRef.current.y;
      const buttonWidth = buttonRef.current?.offsetWidth || 64;
      
      // Snap horizontally
      if (x < window.innerWidth / 2) {
        x = 16; // Snap to left
      } else {
        x = window.innerWidth - buttonWidth - 16; // Snap to right
      }
      
      setPosition({ x, y });
      posRef.current = { x, y };
      
      // Save
      localStorage.setItem('floating_button_pos', JSON.stringify({ x, y }));
      
      // small delay to prevent click from firing
      setTimeout(() => setIsDragging(false), 50);
    }
  };
  
  // Hide until position is calculated
  if (position.x === -1) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[150]">
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (isDragging) {
             e.preventDefault();
             e.stopPropagation();
             return;
          }
          onClick();
        }}
        className="pointer-events-auto absolute bg-indigo-500 hover:bg-indigo-400 text-white p-4 rounded-full shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center group touch-none"
        style={{ 
          left: position.x, 
          top: position.y,
          transition: isDragging ? 'none' : 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
        title="Go to Announcement Center" aria-label="Open Announcement Center"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#020617]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
