'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, adminError } from '../../lib/api';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await adminApi('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/recipes');
    } catch (cause) { setError(adminError(cause)); } finally { setBusy(false); }
  }

  return <main className="authPage"><form className="authCard" onSubmit={(event) => void submit(event)}>
    <div className="brand">Bếp Nhớ <span>Editorial</span></div>
    <h1>Đăng nhập quản trị</h1>
    <p>Dùng tài khoản Bếp Nhớ đã được cấp vai trò admin.</p>
    <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <div className="error" role="alert">{error}</div>}
    <button disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
  </form></main>;
}
