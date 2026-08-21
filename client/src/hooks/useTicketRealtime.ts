import { useEffect, useState, useRef } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

export interface UseTicketRealtimeOptions {
  ticketId?: string;
  onUpdate?: (payload: RealtimePostgresChangesPayload<any>) => void;
  autoInvalidateQueries?: boolean;
}

export function useTicketRealtime({
  ticketId,
  onUpdate,
  autoInvalidateQueries = true,
}: UseTicketRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const [lastPayload, setLastPayload] = useState<RealtimePostgresChangesPayload<any> | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('INITIALIZING');
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let isMounted = true;
    const channelName = ticketId 
      ? `ticket-realtime-${ticketId}` 
      : `ticket-realtime-all-${Math.random().toString(36).substring(7)}`;

    const channelConfig: any = {
      event: '*',
      schema: 'public',
      table: 'Ticket',
    };

    if (ticketId) {
      channelConfig.filter = `id=eq.${ticketId}`;
    }

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, (payload) => {
        if (!isMounted) return;
        setLastPayload(payload);

        if (autoInvalidateQueries) {
          if (ticketId) {
            queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
          }
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
        }

        if (onUpdateRef.current) {
          onUpdateRef.current(payload);
        }
      })
      .subscribe((status) => {
        if (!isMounted) return;
        setSubscriptionStatus(status);
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [ticketId, autoInvalidateQueries, queryClient]);

  return {
    lastPayload,
    subscriptionStatus,
    isSubscribed: subscriptionStatus === 'SUBSCRIBED',
  };
}

export default useTicketRealtime;
