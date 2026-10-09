'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi, adminError } from '../../../lib/api';

export default function NewRecipePage() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('vietnamese');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const response = await adminApi<{ data: { id: string; recipeId: string } }>('/admin/recipes', {
        method: 'POST', body: JSON.stringify({ slug, title, cuisine }),
      });
      router.push(`/recipes/${response.data.recipeId}/edit?draft=${response.data.id}`);
    } catch (cause) { setError(adminError(cause)); }
  }
  return <main className="shell narrow"><Link href="/recipes">← Danh sách</Link><form className="panel form" onSubmit={(event) => void submit(event)}><small>Công thức mới</small><h1>Giữ slug và mở draft</h1><label>Slug<input value={slug} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>Tên món<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Ẩm thực<input value={cuisine} onChange={(event) => setCuisine(event.target.value)} required /></label>{error && <div className="error" role="alert">{error}</div>}<button className="primary">Tạo draft</button></form></main>;
}
