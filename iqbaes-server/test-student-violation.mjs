// Test script to simulate a student taking an exam and generating violations
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api';

async function testStudentViolation() {
  try {
    console.log('🧪 Testing student violation with proper authentication...');
    
    // Step 1: Login as student
    console.log('\n1. Logging in as student...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'student1@university.edu',
        password: 'student123'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Student login failed:', loginResponse.status);
      const errorText = await loginResponse.text();
      console.log('Error:', errorText);
      return;
    }
    
    const { accessToken, user } = await loginResponse.json();
    console.log('✅ Student logged in:', user.name, 'ID:', user.id);
    console.log('🔑 Token received:', accessToken ? 'Yes' : 'No');
    
    // Step 2: Get available exams
    console.log('\n2. Getting available exams...');
    const examResponse = await fetch(`${BASE_URL}/exams`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!examResponse.ok) {
      console.log('❌ Failed to get exams:', examResponse.status);
      return;
    }
    
    const exams = await examResponse.json();
    if (exams.length === 0) {
      console.log('❌ No exams available');
      return;
    }
    
    const exam = exams[0];
    console.log('📝 Found exam:', exam.title, 'ID:', exam.id);
    
    // Step 3: Start exam session
    console.log('\n3. Starting exam session...');
    const sessionResponse = await fetch(`${BASE_URL}/submissions/start-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        examId: exam.id
      })
    });
    
    if (!sessionResponse.ok) {
      console.log('❌ Session start failed:', sessionResponse.status);
      const errorText = await sessionResponse.text();
      console.log('Error:', errorText);
      return;
    }
    
    console.log('✅ Exam session started');
    
    // Step 4: Record a violation with proper authentication
    console.log('\n4. Recording violation with student authentication...');
    const violationResponse = await fetch(`${BASE_URL}/monitoring/violations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        violation: {
          details: 'Student switched tabs during exam',
          timestamp: new Date().toISOString(),
          severity: 'critical',
          type: 'tab_switch'
        },
        sessionId: `session-${user.id}-${exam.id}-${Date.now()}`,
        examId: exam.id,
        totalViolations: 1
      })
    });
    
    if (!violationResponse.ok) {
      console.log('❌ Violation recording failed:', violationResponse.status);
      const errorText = await violationResponse.text();
      console.log('Error:', errorText);
      return;
    }
    
    const violationResult = await violationResponse.json();
    console.log('✅ Violation recorded with proper student authentication!');
    console.log('📝 Response:', JSON.stringify(violationResult, null, 2));
    
    // Step 5: Check monitoring dashboard
    console.log('\n5. Checking monitoring dashboard...');
    const monitoringResponse = await fetch(`${BASE_URL}/monitoring/live-sessions`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (monitoringResponse.ok) {
      const monitoringData = await monitoringResponse.json();
      console.log('📊 Monitoring data retrieved');
      
      if (monitoringData.processedAlerts && monitoringData.processedAlerts.length > 0) {
        console.log('\n🚨 Recent alerts:');
        monitoringData.processedAlerts.slice(0, 3).forEach((alert, index) => {
          console.log(`  ${index + 1}. Student: ${alert.studentName || 'Unknown Student'}`);
          console.log(`     User ID: ${alert.userId || 'N/A'}`);
          console.log(`     Type: ${alert.violationType || alert.type}`);
          console.log(`     Time: ${alert.timestamp}`);
          console.log(`     Details:`, alert.details || 'N/A');
          console.log('');
        });
      } else {
        console.log('📭 No alerts found in monitoring data');
      }
    } else {
      console.log('❌ Failed to fetch monitoring data:', monitoringResponse.status);
    }
    
    console.log('\n✅ Test completed! Check the monitoring dashboard at http://localhost:5174/monitoring');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testStudentViolation();