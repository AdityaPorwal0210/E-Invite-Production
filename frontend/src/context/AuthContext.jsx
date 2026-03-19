import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notificationCounts, setNotificationCounts] = useState({ pendingInvites: 0, pendingGroupRequests: 0 });

  useEffect(() => {
    // Check if user is logged in on app load
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const fetchNotificationCounts = useCallback(async () => {
    if (!user) return;
    try {
      const response = await api.get('/users/notifications/counts');
      setNotificationCounts(response.data);
    } catch (err) {
      console.error('Failed to fetch notification counts:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotificationCounts();
      // Refresh every 30 seconds
      const interval = setInterval(fetchNotificationCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user, fetchNotificationCounts]);

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setNotificationCounts({ pendingInvites: 0, pendingGroupRequests: 0 });
  };

  const updateUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, updateUser, loading, notificationCounts, fetchNotificationCounts }}>
      {children}
    </AuthContext.Provider>
  );
};
