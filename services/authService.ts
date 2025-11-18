export const getAuthHeaders = (): HeadersInit => {
  const token = sessionStorage.getItem('iqbaes-token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const getAuthToken = (): string | null => {
  return sessionStorage.getItem('iqbaes-token');
};

export const setAuthToken = (token: string): void => {
  sessionStorage.setItem('iqbaes-token', token);
};

export const removeAuthToken = (): void => {
  sessionStorage.removeItem('iqbaes-token');
  sessionStorage.removeItem('iqbaes-user');
};

export const isAuthenticated = (): boolean => {
  return !!sessionStorage.getItem('iqbaes-token');
};