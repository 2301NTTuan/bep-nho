import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export default function LoginPage() {
  return <Suspense fallback={<main className="authShell"><div className="authCard">Đang mở đăng nhập…</div></main>}><AuthForm mode="login" /></Suspense>;
}
