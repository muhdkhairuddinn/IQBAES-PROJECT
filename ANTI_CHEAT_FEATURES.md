# Anti-Cheat System Features

## Overview
The IQBAES exam system now includes a comprehensive yet user-friendly anti-cheat monitoring system that helps maintain exam integrity while providing a smooth user experience.

## Features Implemented

### 1. Real-time Violation Detection
- **Tab Switching/Window Minimization**: Detects when students switch tabs or minimize the exam window
- **Keyboard Shortcuts**: Monitors and blocks common cheating shortcuts like:
  - Copy/Paste (Ctrl+C, Ctrl+V)
  - Developer Tools (F12, Ctrl+Shift+I/J)
  - Find function (Ctrl+F)
  - Select All (Ctrl+A)
  - View Source (Ctrl+U)
  - Alt+Tab switching
- **Right-click Context Menu**: Prevents access to browser context menus
- **Copy/Paste Operations**: Blocks clipboard operations during exams

### 2. User-Friendly Notifications
- **Non-intrusive Warnings**: Gentle notifications appear in the top-right corner
- **Throttled Alerts**: Maximum one notification every 3 seconds to avoid spam
- **Severity-based Messages**: Different message types based on violation severity:
  - ℹ️ Info: General attention reminders
  - ⚠️ Warning: Focus reminders with violation count
  - ⚠️ Critical: Serious violations requiring immediate attention

### 3. Admin Logging & Monitoring
- **Real-time Logging**: All violations are automatically logged to the admin panel
- **Violation Tracking**: Each violation includes:
  - Timestamp
  - Violation type
  - Severity level
  - Student information
  - Session details
- **Live Monitoring Dashboard**: Admins can view real-time exam sessions and violations
- **Alert System**: Critical violations trigger immediate alerts for administrators

### 4. Smart Integration
- **Session-based Tracking**: Each exam attempt gets a unique session ID
- **Automatic Server Sync**: Violations are automatically sent to the server
- **Graceful Error Handling**: Network issues don't disrupt the exam experience
- **TypeScript Support**: Fully typed for better development experience

## Technical Implementation

### Components Added/Modified:
1. **`services/violationService.ts`**: Handles server communication for violation logging
2. **`hooks/useAntiCheat.ts`**: Enhanced anti-cheat hook with server integration
3. **`components/ExamView.tsx`**: Integrated anti-cheat system with user notifications

### Server Integration:
- Uses existing `/api/monitoring/violations` endpoint
- Integrates with the current logging system
- Compatible with the live monitoring dashboard

## Benefits

### For Students:
- **Clear Expectations**: Students know what actions are monitored
- **Non-disruptive**: Gentle reminders instead of harsh interruptions
- **Fair Warning System**: Progressive notification system

### For Administrators:
- **Real-time Monitoring**: Live view of all exam sessions
- **Comprehensive Logging**: Detailed violation records
- **Actionable Insights**: Easy identification of suspicious behavior
- **Automated Alerts**: Immediate notification of critical violations

### For System Stability:
- **No Performance Impact**: Lightweight monitoring system
- **Error Resilient**: Continues working even if server communication fails
- **TypeScript Safe**: Fully typed for better maintainability

## Usage

The anti-cheat system is automatically active during all exams. No additional configuration is required. Administrators can view violation logs and live monitoring data through the existing admin dashboard.

## Security Features

- **Client-side Prevention**: Blocks actions before they can be completed
- **Server-side Logging**: Ensures violation records cannot be tampered with
- **Session Tracking**: Links violations to specific exam attempts
- **Severity Classification**: Helps prioritize administrative responses

This implementation provides a balanced approach to exam security - maintaining integrity while ensuring a positive user experience for honest students.