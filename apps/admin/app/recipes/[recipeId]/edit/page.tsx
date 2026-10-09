'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, adminApi, adminError } from '../../../../lib/api';
import { newIngredient, newStep, renumberIngredients, renumberSteps } from '../../../../lib/editor-content.mjs';

type Ingredient = {
  slug: string; canonicalName: string; category: string | null; createIfMissing: boolean;
  quantity: number; unit: string; preparation: string | null; note: string | null;
  sortOrder: number; scalingMode: string; scalingExponent: number; roundingIncrement: number | null;
};
type Step = {
  stepNo: number; instruction: string; durationSeconds: number | null;
  heatLevel: string | null; tip: string | null;
};
type Rule = { ingredientSlug: string; dimensionKey: string; sensitivity: number; minFactor: number; maxFactor: number };
type Content = {
  slug: string; title: string; cuisine: string; servings: number;
  prepTimeMinutes: number | null; cookTimeMinutes: number | null; summary: string | null;
  ingredients: Ingredient[]; steps: Step[]; adjustmentRules: Rule[];
  heroMediaAssetId: string | null; heroMediaAlt: string | null;
};
type Draft = { id: string; recipeId: string; status: string; revision: number; content: Content };
const dimensions = ['saltiness', 'sweetness', 'sourness', 'spiciness', 'umami', 'fat_richness', 'bitterness', 'softness', 'dryness_sauce', 'garlic_onion', 'herbal_aroma'];

export default function RecipeEditor() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const draftId = useSearchParams().get('draft');
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!draftId) { setError('Thiếu draft ID.'); return; }
    adminApi<{ data: Draft }>(`/admin/recipe-drafts/${draftId}`).then((response) => setDraft(response.data)).catch((cause) => setError(adminError(cause)));
  }, [draftId]);

  function setContent(update: (content: Content) => Content) {
    setDraft((current) => current ? { ...current, content: update(current.content) } : current);
  }
  function field<K extends keyof Content>(key: K, value: Content[K]) { setContent((content) => ({ ...content, [key]: value })); }

  async function save() {
    if (!draft) return; setBusy(true); setError(''); setNotice('');
    try {
      const response = await adminApi<{ data: Draft }>(`/admin/recipe-drafts/${draft.id}`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: draft.revision, content: draft.content }) });
      setDraft(response.data); setNotice(`Đã lưu revision ${response.data.revision}.`);
    } catch (cause) { setError(adminError(cause)); } finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true); setError('');
    const data = new FormData(); data.append('file', file);
    try {
      const response = await adminApi<{ data: { id: string } }>('/admin/media', { method: 'POST', body: data });
      field('heroMediaAssetId', response.data.id); setNotice('Ảnh đã được chuẩn hóa và tải lên. Hãy nhập alt text rồi lưu draft.');
    } catch (cause) { setError(adminError(cause)); } finally { setBusy(false); }
  }

  async function publish() {
    if (!draft) return; setBusy(true); setError('');
    try {
      const result = await adminApi<{ data: { versionNo: number } }>(`/admin/recipe-drafts/${draft.id}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision: draft.revision }) });
      setNotice(`Đã publish V${result.data.versionNo}.`); router.push(`/recipes/${recipeId}`);
    } catch (cause) { setError(adminError(cause)); } finally { setBusy(false); }
  }

  if (!draft) return <main className="shell"><Link href={`/recipes/${recipeId}`}>← Chi tiết</Link><div className="state">{error || 'Đang tải editor…'}</div></main>;
  const content = draft.content;
  return <main className="shell editor"><header className="topbar"><Link href={`/recipes/${recipeId}`}>← Chi tiết</Link><div className="saveBar"><span>Revision {draft.revision}</span><button disabled={busy} onClick={() => void save()}>Lưu draft</button></div></header>
    <section className="pageTitle"><div><small>Recipe draft</small><h1>{content.title || 'Chưa đặt tên'}</h1></div><p>Mỗi lần lưu kiểm tra revision để không ghi đè thay đổi của admin khác.</p></section>
    {error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel form grid"><label>Slug<input value={content.slug} onChange={(event) => field('slug', event.target.value)} /></label><label>Tên món<input value={content.title} onChange={(event) => field('title', event.target.value)} /></label><label>Ẩm thực<input value={content.cuisine} onChange={(event) => field('cuisine', event.target.value)} /></label><label>Số phần<input type="number" min="1" max="8" value={content.servings} onChange={(event) => field('servings', Number(event.target.value))} /></label><label>Chuẩn bị (phút)<input type="number" min="0" value={content.prepTimeMinutes ?? ''} onChange={(event) => field('prepTimeMinutes', event.target.value ? Number(event.target.value) : null)} /></label><label>Nấu (phút)<input type="number" min="0" value={content.cookTimeMinutes ?? ''} onChange={(event) => field('cookTimeMinutes', event.target.value ? Number(event.target.value) : null)} /></label><label className="wide">Tóm tắt<textarea value={content.summary ?? ''} onChange={(event) => field('summary', event.target.value || null)} /></label></section>

    <section className="panel"><div className="sectionHead"><div><small>01</small><h2>Nguyên liệu</h2></div><button onClick={() => field('ingredients', renumberIngredients([...content.ingredients, newIngredient() as Ingredient]))}>+ Thêm nguyên liệu</button></div><div className="editorRows">{content.ingredients.map((item, index) => <article key={`${index}-${item.slug}`} className="editorRow"><div className="rowGrid"><label>Slug<input value={item.slug} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, slug: event.target.value } : row))} /></label><label>Tên chuẩn<input value={item.canonicalName} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, canonicalName: event.target.value } : row))} /></label><label>Nhóm<input value={item.category ?? ''} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, category: event.target.value || null } : row))} /></label><label>Lượng<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} /></label><label>Đơn vị<input value={item.unit} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, unit: event.target.value } : row))} /></label><label>Sơ chế<input value={item.preparation ?? ''} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, preparation: event.target.value || null } : row))} /></label><label>Ghi chú<input value={item.note ?? ''} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, note: event.target.value || null } : row))} /></label><label>Scaling<select value={item.scalingMode} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, scalingMode: event.target.value } : row))}><option>LINEAR</option><option>CONSERVATIVE</option><option>FIXED</option></select></label><label>Số mũ<input type="number" step="0.05" min="0.05" max="1" value={item.scalingExponent} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, scalingExponent: Number(event.target.value) } : row))} /></label><label>Bước làm tròn<input type="number" step="0.001" min="0.001" value={item.roundingIncrement ?? ''} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, roundingIncrement: event.target.value ? Number(event.target.value) : null } : row))} /></label><label className="confirm"><input type="checkbox" checked={item.createIfMissing} onChange={(event) => field('ingredients', content.ingredients.map((row, i) => i === index ? { ...row, createIfMissing: event.target.checked } : row))} /> Cho phép tạo nguyên liệu mới</label></div><button className="danger compact" onClick={() => field('ingredients', renumberIngredients(content.ingredients.filter((_, i) => i !== index)))}>Xóa nguyên liệu</button></article>)}</div></section>

    <section className="panel"><div className="sectionHead"><div><small>02</small><h2>Các bước</h2></div><button onClick={() => field('steps', renumberSteps([...content.steps, newStep() as Step]))}>+ Thêm bước</button></div><div className="editorRows">{content.steps.map((step, index) => <article key={index} className="editorRow"><b>Bước {step.stepNo}</b><label>Hướng dẫn<textarea value={step.instruction} onChange={(event) => field('steps', content.steps.map((row, i) => i === index ? { ...row, instruction: event.target.value } : row))} /></label><div className="rowGrid"><label>Thời lượng giây<input type="number" min="0" value={step.durationSeconds ?? ''} onChange={(event) => field('steps', content.steps.map((row, i) => i === index ? { ...row, durationSeconds: event.target.value ? Number(event.target.value) : null } : row))} /></label><label>Mức lửa<input value={step.heatLevel ?? ''} onChange={(event) => field('steps', content.steps.map((row, i) => i === index ? { ...row, heatLevel: event.target.value || null } : row))} /></label><label>Mẹo<textarea value={step.tip ?? ''} onChange={(event) => field('steps', content.steps.map((row, i) => i === index ? { ...row, tip: event.target.value || null } : row))} /></label></div><button className="danger compact" onClick={() => field('steps', renumberSteps(content.steps.filter((_, i) => i !== index)))}>Xóa bước</button></article>)}</div></section>

    <section className="panel"><div className="sectionHead"><div><small>03</small><h2>Quy tắc Taste</h2></div><button onClick={() => field('adjustmentRules', [...content.adjustmentRules, { ingredientSlug: content.ingredients[0]?.slug ?? '', dimensionKey: 'saltiness', sensitivity: .1, minFactor: .75, maxFactor: 1.25 }])}>+ Thêm quy tắc</button></div>{content.adjustmentRules.map((rule, index) => <div className="ruleRow" key={index}><label>Nguyên liệu<select value={rule.ingredientSlug} onChange={(event) => field('adjustmentRules', content.adjustmentRules.map((row, i) => i === index ? { ...row, ingredientSlug: event.target.value } : row))}>{content.ingredients.map((item) => <option value={item.slug} key={item.slug}>{item.canonicalName || item.slug}</option>)}</select></label><label>Chiều vị<select value={rule.dimensionKey} onChange={(event) => field('adjustmentRules', content.adjustmentRules.map((row, i) => i === index ? { ...row, dimensionKey: event.target.value } : row))}>{dimensions.map((value) => <option key={value}>{value}</option>)}</select></label><label>Sensitivity<input type="number" step="0.01" min="-2" max="2" value={rule.sensitivity} onChange={(event) => field('adjustmentRules', content.adjustmentRules.map((row, i) => i === index ? { ...row, sensitivity: Number(event.target.value) } : row))} /></label><label>Hệ số tối thiểu<input type="number" step="0.01" min="0.01" max="3" value={rule.minFactor} onChange={(event) => field('adjustmentRules', content.adjustmentRules.map((row, i) => i === index ? { ...row, minFactor: Number(event.target.value) } : row))} /></label><label>Hệ số tối đa<input type="number" step="0.01" min="0.01" max="3" value={rule.maxFactor} onChange={(event) => field('adjustmentRules', content.adjustmentRules.map((row, i) => i === index ? { ...row, maxFactor: Number(event.target.value) } : row))} /></label><button className="danger compact" onClick={() => field('adjustmentRules', content.adjustmentRules.filter((_, i) => i !== index))}>Xóa</button></div>)}</section>

    <section className="panel mediaPanel"><div><small>04</small><h2>Ảnh hero</h2><p>JPEG, PNG hoặc WebP; tối đa 8 MB. Server luôn decode và chuẩn hóa.</p></div><label className="upload">Chọn ảnh<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0])} /></label>{content.heroMediaAssetId && <img src={`${API_BASE}/media/${content.heroMediaAssetId}`} alt={content.heroMediaAlt ?? ''} />}<label>Alt text có ý nghĩa<input value={content.heroMediaAlt ?? ''} onChange={(event) => field('heroMediaAlt', event.target.value || null)} /></label></section>

    <section className="publishPanel"><div><small>05</small><h2>Kiểm tra và publish</h2><p>Publish tạo RecipeVersion mới bất biến. Không thể sửa V cũ.</p></div><label className="confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Tôi đã kiểm tra nguyên liệu, bước nấu, Taste rules và alt text.</label><button className="primary" disabled={!confirmed || busy} onClick={() => void publish()}>Publish version mới</button></section>
  </main>;
}
