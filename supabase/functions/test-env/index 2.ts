import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const flyToken = Deno.env.get('FLY_API_TOKEN');
  const flyAppName = Deno.env.get('FLY_APP_NAME');
  const dockerImage = Deno.env.get('DOCKER_IMAGE');

  return new Response(
    JSON.stringify({
      flyToken: {
        exists: !!flyToken,
        length: flyToken?.length || 0,
        isEmpty: flyToken === '',
        isNull: flyToken === null,
        isUndefined: flyToken === undefined,
        firstChars: flyToken?.substring(0, 10) + '...',
      },
      flyAppName: flyAppName || 'not set',
      dockerImage: dockerImage || 'not set',
      allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('FLY') || k.includes('DOCKER')),
    }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});
