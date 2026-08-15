import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '../api/client';
import { useAuth } from './useAuth';

/**
 * Connects a Socket.IO client once the user is authenticated, and pushes live
 * balance updates when a deposit lands on-chain.
 *
 * The socket carries the same JWT as the REST API — an unauthenticated socket
 * is rejected at the handshake, so there is nothing to connect before sign-in.
 */
export function useSocket(onDeposit?: () => void): Socket | null {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const depositHandler = useRef(onDeposit);
  depositHandler.current = onDeposit;

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = tokenStore.get();
    if (!token) return;

    const socket = io(import.meta.env.VITE_API_URL || '/', {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('wallet:deposit', () => depositHandler.current?.());

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  return socketRef.current;
}
