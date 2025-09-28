const { Redis } = require('@upstash/redis');

async function testRedis() {
  console.log('Testing Redis connection...');

  const url = 'https://blessed-boar-13636.upstash.io';
  const token = 'ATVEAAIncDJiMjVkNTU5MWRhNzg0ZTRjOTdkZmNhMjRiZGI1YTk4ZnAyMTM2MzY';

  console.log('URL:', url);
  console.log('Token length:', token.length);

  try {
    const redis = new Redis({
      url,
      token,
    });

    console.log('Redis client created');

    const result = await redis.ping();
    console.log('Ping result:', result);
    console.log('Type of result:', typeof result);
    console.log('Result === "PONG":', result === 'PONG');

    // Try setting and getting a test value
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    console.log('Test value:', value);

    console.log('✅ Connection successful!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

testRedis();