/**
 * Test script to provision a Fly machine via Edge Function
 * Run with: node test-provision.js
 */

const SUPABASE_URL = 'https://jtpqkbybuxbcvqeffmtf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cHFrYnlidXhiY3ZxZWZmbXRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDAxNjQxMiwiZXhwIjoyMDY1NTkyNDEyfQ.YRE8U7CtQtDjb4kB3P_6V6cKmPxo4lfJ0pdfQGfh_DE';
const USER_ID = '63eea370-27a1-4099-866a-e3ed340b278d';

async function testProvision() {
  console.log('[Test] Starting provision test...');
  console.log('[Test] User ID:', USER_ID);

  const payload = {
    region: 'sin', // Singapore
    cpuPriority: 'normal'
  };

  console.log('[Test] Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/test-provision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('[Test] Response status:', response.status);
    console.log('[Test] Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('[Test] Response body (raw):', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('[Test] Response body (parsed):', JSON.stringify(responseData, null, 2));
    } catch (e) {
      console.error('[Test] Failed to parse JSON:', e.message);
    }

    if (response.ok) {
      console.log('\n✅ SUCCESS!');
      console.log('Machine ID:', responseData?.machineId);
      console.log('Status:', responseData?.status);
    } else {
      console.log('\n❌ FAILED!');
      console.log('Error:', responseData?.error || responseText);
      console.log('Message:', responseData?.message);
    }

  } catch (error) {
    console.error('\n💥 EXCEPTION:', error.message);
    console.error('Stack:', error.stack);
  }
}

testProvision();
