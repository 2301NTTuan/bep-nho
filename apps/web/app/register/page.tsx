import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export default function RegisterPage() {
  return <Suspense fallback={<main className="authShell"><div className="authCard">Đang mở đăng ký…</div></main>}><AuthForm mode="register" /></Suspense>;
}
