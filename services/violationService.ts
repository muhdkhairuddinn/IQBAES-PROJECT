interface ViolationData {
  type: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sessionId?: string;
  examId?: string;
}

class ViolationService {
  private getAuthHeaders(): HeadersInit {
    const token = sessionStorage.getItem('iqbaes-token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async recordViolation(violation: ViolationData, totalViolations: number): Promise<void> {
    // Send the original readable message directly
    const response = await fetch('/api/monitoring/violations', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        violation: {
          details: violation.message, // Send original readable message
          timestamp: violation.timestamp,
          severity: violation.severity,
          type: violation.type
        },
        sessionId: violation.sessionId,
        examId: violation.examId,
        totalViolations
      })
    });
  };
}

export const violationService = new ViolationService();
export default violationService;