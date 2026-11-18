export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ service: 'software-factory-monitor', alive: true });
}
