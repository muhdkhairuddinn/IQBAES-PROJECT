interface ViolationDetails {
  type: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AntiCheatLog {
  examId: string;
  studentId: string;
  violation: ViolationDetails;
  sessionId?: string;
  totalViolations?: number;
}

class AntiCheatService {
  private getAuthHeaders(): HeadersInit {
    const token = sessionStorage.getItem('iqbaes-token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async getViolationsForAdmin(examId?: string): Promise<AntiCheatLog[]> {
    try {
      const url = examId 
        ? `/api/monitoring/violations?examId=${examId}`
        : '/api/monitoring/violations';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || 'Failed to fetch violations');
      }

      const result = await response.json();
      return result.violations || [];
    } catch (error) {
      console.error('❌ Failed to fetch violations:', error);
      throw error;
    }
  }

  async getViolationsByStudent(studentId: string): Promise<AntiCheatLog[]> {
    try {
      const response = await fetch(`/api/monitoring/violations?studentId=${studentId}`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || 'Failed to fetch student violations');
      }

      const result = await response.json();
      return result.violations || [];
    } catch (error) {
      console.error('❌ Failed to fetch student violations:', error);
      throw error;
    }
  }

  async getViolationStats(examId?: string): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStudent: Record<string, number>;
  }> {
    try {
      const violations = await this.getViolationsForAdmin(examId);
      
      const stats = {
        total: violations.length,
        byType: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        byStudent: {} as Record<string, number>
      };

      violations.forEach(log => {
        // Count by type
        stats.byType[log.violation.type] = (stats.byType[log.violation.type] || 0) + 1;
        
        // Count by severity
        stats.bySeverity[log.violation.severity] = (stats.bySeverity[log.violation.severity] || 0) + 1;
        
        // Count by student
        stats.byStudent[log.studentId] = (stats.byStudent[log.studentId] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('❌ Failed to get violation stats:', error);
      throw error;
    }
  }

  async clearViolations(examId?: string): Promise<void> {
    try {
      const url = examId 
        ? `/api/monitoring/violations?examId=${examId}`
        : '/api/monitoring/violations';
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || 'Failed to clear violations');
      }

      console.log('✅ Violations cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear violations:', error);
      throw error;
    }
  }
}

export const antiCheatService = new AntiCheatService();
export default antiCheatService;