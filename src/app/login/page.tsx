import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const messages: Record<string, string> = {
  denied: 'Dieses GitHub-Konto ist für das Dashboard nicht freigeschaltet.',
  state: 'Die Anmeldung ist abgelaufen. Bitte noch einmal versuchen.',
  github: 'GitHub hat die Anmeldung nicht bestätigt. Bitte noch einmal versuchen.',
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect('/');
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-card">
        <h1>Factory-Queue</h1>
        <p className="muted">Job-Queue der Software Factory über alle Repositories.</p>
        {error && <p className="alert">{messages[error] ?? 'Die Anmeldung ist fehlgeschlagen.'}</p>}
        <a className="button" href="/api/auth/login">
          Mit GitHub anmelden
        </a>
      </div>
    </main>
  );
}
