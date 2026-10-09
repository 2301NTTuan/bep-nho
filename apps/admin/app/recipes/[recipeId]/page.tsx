'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, adminError } from '../../../lib/api';

type RecipeDetail = {
  id: string; slug: string; canonicalTitle: string; cuisine: string; status: string;
  versions: Array<{ id: string; versionNo: number; contentHash: string; publishedAt: string }>;
  drafts: Array<{ id: string; status: string; revision: number; updatedAt: string }>;
};

export default function RecipeAdminDetail() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState('');
  async function load() {
    try { setRecipe((await adminApi<{ data: RecipeDetail }>(`/admin/recipes/${recipeId}`)).data); }
    catch (cause) { setError(adminError(cause)); }
  }
  useEffect(() => { void load(); }, [recipeId]);
  async function createDraft() {
    try {
      const result = await adminApi<{ data: { id: string } }>(`/admin/recipes/${recipeId}/drafts`, { method: 'POST' });
      router.push(`/recipes/${recipeId}/edit?draft=${result.data.id}`);
    } catch (cause) { setError(adminError(cause)); }
  }
  return <main className="shell"><header className="topbar"><Link href="/recipes">← Danh sách</Link>{recipe?.versions.length ? <button className="primary" onClick={() => void createDraft()}>Tạo draft từ bản mới nhất</button> : null}</header>{error && <div className="error">{error}</div>}{recipe && <><section className="pageTitle"><div><small>{recipe.status}</small><h1>{recipe.canonicalTitle}</h1><code>{recipe.slug}</code></div><p>{recipe.cuisine}</p></section><div className="twoCols"><section className="panel"><h2>Drafts</h2>{recipe.drafts.length === 0 && <p>Không có draft.</p>}{recipe.drafts.map((draft) => <div className="listRow" key={draft.id}><span>{draft.status} · revision {draft.revision}</span>{draft.status === 'draft' && <Link href={`/recipes/${recipe.id}/edit?draft=${draft.id}`}>Mở editor</Link>}</div>)}</section><section className="panel"><h2>Published versions</h2>{recipe.versions.map((version) => <div className="listRow" key={version.id}><b>V{version.versionNo}</b><code>{version.contentHash.slice(0, 12)}…</code></div>)}</section></div></>}</main>;
}
