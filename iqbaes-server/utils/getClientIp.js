/**
 * Extract the real client IP address from a request
 * Handles X-Forwarded-For headers (can contain multiple IPs: client, proxy1, proxy2)
 * Falls back to req.ip or req.connection.remoteAddress
 * 
 * @param {Object} req - Express request object
 * @returns {string} - The client IP address
 */
export const getClientIp = (req) => {
  // First, try X-Forwarded-For header (most reliable when behind proxy)
  // Format: "client-ip, proxy1-ip, proxy2-ip" - we want the first (original client)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // Split by comma and get all IPs in the chain
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    
    // Find the first non-localhost IP (original client)
    // The chain is usually: "real-client-ip, proxy-ip, proxy2-ip"
    for (const ip of ips) {
      // Handle IPv6-mapped IPv4 addresses
      const cleanIp = ip.startsWith('::ffff:') ? ip.replace('::ffff:', '') : ip;
      if (cleanIp && cleanIp !== '::1' && cleanIp !== '127.0.0.1' && !cleanIp.startsWith('::')) {
        return cleanIp;
      }
    }
    
    // If all IPs in chain are localhost, still return the first one for logging
    // This might happen in development when everything goes through localhost
    if (ips.length > 0) {
      const firstIp = ips[0];
      return firstIp.startsWith('::ffff:') ? firstIp.replace('::ffff:', '') : firstIp;
    }
  }

  // Try X-Real-IP header (some proxies like Nginx use this)
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    const cleanRealIp = xRealIp.startsWith('::ffff:') ? xRealIp.replace('::ffff:', '') : xRealIp;
    if (cleanRealIp && cleanRealIp !== '::1' && cleanRealIp !== '127.0.0.1' && !cleanRealIp.startsWith('::')) {
      return cleanRealIp;
    }
  }

  // Use Express's req.ip (works when trust proxy is enabled)
  if (req.ip) {
    const cleanReqIp = req.ip.startsWith('::ffff:') ? req.ip.replace('::ffff:', '') : req.ip;
    if (cleanReqIp && cleanReqIp !== '::1' && cleanReqIp !== '127.0.0.1' && !cleanReqIp.startsWith('::')) {
      return cleanReqIp;
    }
  }

  // Fallback to connection remote address
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress) {
    // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
    if (remoteAddress.startsWith('::ffff:')) {
      const ipv4 = remoteAddress.replace('::ffff:', '');
      if (ipv4 !== '127.0.0.1') {
        return ipv4;
      }
    }
    
    // Handle IPv6 localhost (::1) - show as localhost for clarity
    if (remoteAddress === '::1') {
      return '127.0.0.1 (localhost)';
    }
    
    // If it's IPv4 and not localhost, return it
    if (remoteAddress !== '::1' && remoteAddress !== '127.0.0.1' && !remoteAddress.startsWith('::')) {
      return remoteAddress;
    }
  }

  // Last resort: return localhost if nothing else works
  // This happens when accessing from the same machine (e.g., admin on server PC)
  return '127.0.0.1 (localhost)';
};

