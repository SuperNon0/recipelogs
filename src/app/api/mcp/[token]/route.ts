export const dynamic = "force-dynamic";

function retiredEndpoint() {
  return Response.json({ error: "Utilise /api/mcp et transmets la clé dans un en-tête Authorization ou X-API-Key." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = retiredEndpoint;
export const GET = retiredEndpoint;
export const DELETE = retiredEndpoint;
