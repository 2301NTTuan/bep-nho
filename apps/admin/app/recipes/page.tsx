'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminApiError, adminApi, adminError } from '../../lib/api';

type Recipe = {
  id: string; slug: string; title: string; cuisine: string; status: string;
  latestPublishedVersion: { id: string; versionNo: number; publishedAt: string } | null;
  drafts: Array<{ id: string; revision: number; updatedAt: string }>;
};

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);

  async function load() {
    try {
      const me = await adminApi<{ data: { user: { role: string } } }>('/me');
      if (me.data.user.role !== 'admin') { setDenied(true); return; }
      const response = await adminApi<{ data: Recipe[] }>('/admin/recipes');
      setRecipes(response.data);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) { router.replace('/login'); return; }
      if (cause instanceof AdminApiError && cause.status === 403) setDenied(true);
      else setError(adminError(cause));
    }
  }
  useEffect(() => { void load(); }, []);

  async function action(recipe: Recipe, name: 'archive' | 'restore' | 'draft') {
    setError('');
    try {
      if (name === 'draft') {
        const response = await adminApi<{ data: { id: string } }>(`/admin/recipes/${recipe.id}/drafts`, { method: 'POST' });
        router.push(`/recipes/${recipe.id}/edit?draft=${response.data.id}`);
      } else {
        await adminApi(`/admin/recipes/${recipe.id}/${name}`, { method: 'POST' });
        await load();
      }
    } catch (cause) { setError(adminError(cause)); }
  }

  if (denied) return <main className="shell"><section className="state"><h1>Không có quyền quản trị</h1><p>Tài khoản này đã đăng nhập nhưng không có vai trò admin.</p><Link href="/login">Đổi tài khoản</Link></section></main>;
  return <main className="shell">
    <header className="topbar"><div className="brand">Bếp Nhớ <span>Editorial</span></div><Link className="primary" href="/recipes/new">Tạo công thức</Link></header>
    <section className="pageTitle"><div><small>Thư viện nội dung</small><h1>Công thức chuẩn</h1></div><p>Draft có revision; publish luôn tạo version bất biến mới.</p></section>
    {error && <div className="error" role="alert">{error}</div>}
    {!recipes && !error && <div className="state">Đang tải danh sách…</div>}
    <div className="recipeTable">{recipes?.map((recipe) => <article key={recipe.id}>
      <div><span className={`status ${recipe.status}`}>{recipe.status}</span><h2>{recipe.title}</h2><code>{recipe.slug}</code></div>
      <div className="versionInfo"><b>{recipe.latestPublishedVersion ? `V${recipe.latestPublishedVersion.versionNo}` : 'Chưa publish'}</b><span>{recipe.drafts.length} draft đang mở</span></div>
      <div className="rowActions"><Link href={`/recipes/${recipe.id}`}>Chi tiết</Link>{recipe.drafts[0] ? <Link href={`/recipes/${recipe.id}/edit?draft=${recipe.drafts[0].id}`}>Sửa draft</Link> : recipe.latestPublishedVersion && <button onClick={() => void action(recipe, 'draft')}>Tạo draft</button>}{recipe.status === 'published' ? <button className="danger" onClick={() => void action(recipe, 'archive')}>Archive</button> : recipe.status === 'archived' && <button onClick={() => void action(recipe, 'restore')}>Restore</button>}</div>
    </article>)}</div>
  </main>;
}
