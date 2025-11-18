import fetch from 'node-fetch';

// Test the monitoring API directly
async function testMonitoringAPI() {
  try {
    console.log('Testing monitoring API at http://localhost:5000/api/monitoring/live-sessions');
    
    const response = await fetch('http://localhost:5000/api/monitoring/live-sessions', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const data = await response.text();
    console.log('Raw response:', data);
    
    if (response.status === 200) {
      try {
        const jsonData = JSON.parse(data);
        console.log('\nParsed JSON:');
        console.log('Success:', jsonData.success);
        console.log('Sessions count:', jsonData.sessions?.length || 0);
        console.log('Alerts count:', jsonData.alerts?.length || 0);
        
        if (jsonData.alerts && jsonData.alerts.length > 0) {
          console.log('\nFirst few alerts:');
          jsonData.alerts.slice(0, 3).forEach((alert, index) => {
            console.log(`Alert ${index + 1}:`);
            console.log('  ID:', alert.id);
            console.log('  userName:', alert.userName);
            console.log('  userId:', alert.userId);
            console.log('  message:', alert.message);
            console.log('  type:', alert.type);
            console.log('  severity:', alert.severity);
            console.log('');
          });
        }
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError.message);
      }
    }
    
  } catch (error) {
    console.error('Error testing monitoring API:', error.message);
  }
}

testMonitoringAPI();