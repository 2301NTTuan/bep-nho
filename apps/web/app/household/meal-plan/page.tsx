'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';
import type { RecipeListResponse } from '../../../lib/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'other';
type SuggestionType = 'lunch' | 'dinner';
type Slot = { plannedDate: string; mealType: SuggestionType };
type Entry = {
  id: string; plannedDate: string; mealType: MealType; sortOrder: number; servings: number; note: string | null;
  recipe: { id: string; slug: string; title: string; status: string };
  recipeVersion: { id: string; versionNo: number } | null;
  householdPersonalizedRecipeVersion: { id: string; versionNo: number; algorithmVersion: string } | null;
};
type Plan = { id: string; weekStart: string; entries: Entry[] };
type Suggestion = {
  algorithmVersion: string; weekStart: string; suggestionHash: string; familyTaste: unknown;
  slots: Array<{ plannedDate: string; mealType: SuggestionType; recipe: { id: string; slug: string; title: string }; householdPersonalizedRecipeVersion: { id: string; versionNo: number; algorithmVersion: string }; reason: { recentUseCount: number; alreadyUsedThisWeek: boolean; deterministicTieBreak: string } }>;
};

const MEALS: Array<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: 'Sáng' }, { value: 'lunch', label: 'Trưa' }, { value: 'dinner', label: 'Tối' }, { value: 'other', label: 'Khác' },
];
const MS_DAY = 86_400_000;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayFor(value: Date) { const day = value.getUTCDay() || 7; return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - day + 1)); }
function addDays(value: string, days: number) { return iso(new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * MS_DAY)); }
function vietnameseDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00.000Z`)); }
function slotKey(slot: { plannedDate: string; mealType: string }) { return `${slot.plannedDate}|${slot.mealType}`; }
function initialForm(weekStart: string) { return { plannedDate: weekStart, mealType: 'lunch' as MealType, recipeVersionId: '', servings: '4', note: '' }; }

export default function MealPlanPage() {
  const [weekStart, setWeekStart] = useState(() => iso(mondayFor(new Date())));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recipes, setRecipes] = useState<RecipeListResponse['data']>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noHousehold, setNoHousehold] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(() => initialForm(weekStart));
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [stale, setStale] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const occupied = useMemo(() => new Set((plan?.entries ?? []).filter((entry) => entry.mealType === 'lunch' || entry.mealType === 'dinner').map(slotKey)), [plan]);
  const emptySuggestionSlots = useMemo(
    () => days.flatMap((plannedDate) =>
      (['lunch', 'dinner'] as SuggestionType[])
        .filter((mealType) => !occupied.has(slotKey({ plannedDate, mealType })))
        .map((mealType) => ({ plannedDate, mealType }))),
    [days, occupied],
  );

  async function load(nextWeek = weekStart) {
    setLoading(true); setError(''); setNoHousehold(false); setPreview(null); setStale(false);
    try {
      const [planResponse, recipeResponse] = await Promise.all([
        apiRequest<{ data: Plan }>(`/me/household/meal-plans/${nextWeek}`),
        apiRequest<RecipeListResponse>('/recipes?limit=100'),
      ]);
      setPlan(planResponse.data); setRecipes(recipeResponse.data);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) { window.location.href = '/login'; return; }
      if (cause instanceof ApiRequestError && cause.status === 404) {
        try { await apiRequest('/me/household'); setPlan(null); }
        catch (householdCause) { if (householdCause instanceof ApiRequestError && householdCause.status === 404) setNoHousehold(true); else setError(getErrorMessage(householdCause, 'Không tải được kế hoạch.')); }
      } else setError(getErrorMessage(cause, 'Không tải được kế hoạch bữa ăn.'));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [weekStart]);

  function moveWeek(offset: number) { setWeekStart((current) => addDays(current, offset * 7)); setForm(initialForm(addDays(weekStart, offset * 7))); setSelectedSlots([]); setNotice(''); }
  function entriesFor(date: string, mealType: MealType) { return (plan?.entries ?? []).filter((entry) => entry.plannedDate === date && entry.mealType === mealType).sort((a, b) => a.sortOrder - b.sortOrder); }
  function toggleSlot(slot: Slot) { setPreview(null); setStale(false); setSelectedSlots((current) => current.some((item) => slotKey(item) === slotKey(slot)) ? current.filter((item) => slotKey(item) !== slotKey(slot)) : [...current, slot]); }
  function beginAdd(plannedDate: string, mealType: MealType) { setEditing(null); setEditorOpen(true); setForm({ ...initialForm(weekStart), plannedDate, mealType }); setError(''); }
  function beginEdit(entry: Entry) { setEditing(entry); setEditorOpen(true); setForm({ plannedDate: entry.plannedDate, mealType: entry.mealType, recipeVersionId: entry.recipeVersion?.id ?? '', servings: String(entry.servings), note: entry.note ?? '' }); setError(''); }

  async function createPlan() {
    setBusy(true); setError('');
    try { await apiRequest('/me/household/meal-plans', { method: 'POST', body: JSON.stringify({ weekStart }) }); setNotice('Kế hoạch tuần đã sẵn sàng.'); await load(); }
    catch (cause) { setError(getErrorMessage(cause, 'Chưa thể tạo kế hoạch tuần.')); } finally { setBusy(false); }
  }
  async function saveEntry(event: FormEvent) {
    event.preventDefault(); if (!plan) return;
    const unchangedFamily = editing?.householdPersonalizedRecipeVersion && form.recipeVersionId === '';
    if (!unchangedFamily && !form.recipeVersionId) { setError('Hãy chọn một công thức đã xuất bản.'); return; }
    setBusy(true); setError('');
    const payload = { plannedDate: form.plannedDate, mealType: form.mealType, sortOrder: editing?.sortOrder ?? 0, recipeVersionId: unchangedFamily ? null : form.recipeVersionId, householdPersonalizedRecipeVersionId: unchangedFamily ? editing!.householdPersonalizedRecipeVersion!.id : null, servings: Number(form.servings), note: form.note.trim() || null };
    try {
      await apiRequest(`/me/household/meal-plans/${weekStart}/entries${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setEditing(null); setEditorOpen(false); setForm(initialForm(weekStart)); setNotice(editing ? 'Đã cập nhật bữa ăn.' : 'Đã thêm vào kế hoạch.'); await load();
    } catch (cause) { setError(getErrorMessage(cause, 'Chưa thể lưu bữa ăn.')); } finally { setBusy(false); }
  }
  async function remove(entry: Entry) {
    setBusy(true); setError('');
    try { await apiRequest(`/me/household/meal-plans/${weekStart}/entries/${entry.id}`, { method: 'DELETE' }); setNotice('Đã xóa khỏi kế hoạch.'); await load(); }
    catch (cause) { setError(getErrorMessage(cause, 'Chưa thể xóa bữa ăn.')); } finally { setBusy(false); }
  }
  async function makePreview() {
    if (!selectedSlots.length) { setError('Hãy chọn ít nhất một ô Trưa hoặc Tối còn trống.'); return; }
    setBusy(true); setError(''); setStale(false);
    try { const response = await apiRequest<{ data: Suggestion }>(`/me/household/meal-plans/${weekStart}/suggestions`, { method: 'POST', body: JSON.stringify({ slots: selectedSlots }) }); setPreview(response.data); }
    catch (cause) { setError(getErrorMessage(cause, 'Chưa thể tạo gợi ý.')); } finally { setBusy(false); }
  }
  async function applyPreview() {
    if (!preview) return; setBusy(true); setError('');
    try { await apiRequest(`/me/household/meal-plans/${weekStart}/suggestions/apply`, { method: 'POST', body: JSON.stringify({ slots: selectedSlots, expectedSuggestionHash: preview.suggestionHash }) }); setPreview(null); setSelectedSlots([]); setNotice('Đã áp dụng gợi ý cho kế hoạch tuần.'); await load(); }
    catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        setPreview(null); setStale(true);
        try {
          const refreshed = await apiRequest<{ data: Plan }>(`/me/household/meal-plans/${weekStart}`);
          setPlan(refreshed.data);
          const nowOccupied = new Set(refreshed.data.entries.filter((entry) => entry.mealType === 'lunch' || entry.mealType === 'dinner').map(slotKey));
          setSelectedSlots((current) => current.filter((slot) => !nowOccupied.has(slotKey(slot))));
        } catch { /* The original conflict is the actionable message. */ }
      } else setError(getErrorMessage(cause, 'Chưa thể áp dụng gợi ý.'));
    } finally { setBusy(false); }
  }

  if (loading) return <main className="shell householdShell"><div className="stateCard">Đang tải kế hoạch bữa ăn…</div></main>;
  if (noHousehold) return <main className="shell householdShell"><header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link></header><section className="accountPanel plannerEmpty"><h1>Bạn chưa có gia đình</h1><p>Hãy tạo hoặc tham gia một gia đình trước khi lập kế hoạch bữa ăn.</p><Link className="button" href="/household">Mở trang Gia đình</Link></section></main>;
  return <main className="shell householdShell plannerShell">
    <header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link><Link href="/" className="backLink">Về Bếp Nhớ</Link></header>
    <section className="plannerHero"><div><div className="eyebrow"><span /> Kế hoạch gia đình</div><h1>Kế hoạch bữa ăn</h1><p>Sắp xếp bữa cơm chung theo từng tuần, để mọi người cùng nhìn và cùng cập nhật.</p></div><div className="weekNav" aria-label="Chọn tuần"><button type="button" onClick={() => moveWeek(-1)}>← Tuần trước</button><strong>{vietnameseDate(weekStart)} — {vietnameseDate(addDays(weekStart, 6))}</strong><button type="button" onClick={() => moveWeek(1)}>Tuần sau →</button></div></section>
    {error && <div className="inlineError" role="alert">{error}</div>}{notice && <div className="successNotice" role="status">{notice}</div>}
    {!plan ? <section className="accountPanel plannerEmpty"><h2>Tuần này chưa có kế hoạch</h2><p>Tạo kế hoạch để cả gia đình có thể thêm bữa ăn cho tuần đã chọn.</p><button className="button" type="button" disabled={busy} onClick={() => void createPlan()}>Tạo kế hoạch tuần</button></section> : <>
      <section className="plannerIntro accountPanel"><div><h2>Chủ động sắp xếp bữa ăn</h2><p>Thêm món thủ công cho Sáng, Trưa, Tối hoặc Khác. Những ô Trưa và Tối còn trống có thể dùng gợi ý dành cho gia đình.</p></div><button className="button secondary" type="button" onClick={() => { setWeekStart(iso(mondayFor(new Date()))); }}>Về tuần hiện tại</button></section>
      <section className="plannerGrid" aria-label="Kế hoạch bữa ăn theo tuần">{days.map((day) => <article className="dayCard" key={day}><header><span>{vietnameseDate(day)}</span><strong>{day.slice(8)}</strong></header>{MEALS.map(({ value, label }) => { const entries = entriesFor(day, value); const canSuggest = value === 'lunch' || value === 'dinner'; const slot = { plannedDate: day, mealType: value as SuggestionType }; const empty = canSuggest && entries.length === 0; return <section className="mealSlot" key={value}><div className="slotTitle"><h3>{label}</h3>{empty && <label className="suggestionCheck"><input type="checkbox" checked={selectedSlots.some((item) => slotKey(item) === slotKey(slot))} onChange={() => toggleSlot(slot)} /><span>Chọn để gợi ý</span></label>}</div>{entries.map((entry) => <div className={`plannedMeal ${entry.recipe.status !== 'published' ? 'archivedMeal' : ''}`} key={entry.id}><div><strong>{entry.recipe.title}</strong><span>{entry.servings} phần · {entry.householdPersonalizedRecipeVersion ? 'Family Taste' : 'Bản chuẩn'}</span>{entry.note && <small>{entry.note}</small>}{entry.recipe.status !== 'published' && <em>Lưu trong lịch sử · không còn chọn mới</em>}</div><div className="mealActions"><button type="button" onClick={() => beginEdit(entry)}>Sửa</button><button type="button" onClick={() => void remove(entry)} disabled={busy}>Xóa khỏi kế hoạch</button></div></div>)}{entries.length === 0 && <button type="button" className="addMeal" onClick={() => beginAdd(day, value)}>+ Thêm bữa ăn</button>}</section>; })}</article>)}</section>
      <section className="accountPanel suggestionPanel"><div className="panelHeading"><div><div className="smallLabel">Family Taste</div><h2>Gợi ý bữa ăn cho gia đình</h2><p>Chọn các ô Trưa hoặc Tối còn trống để xem trước. Việc chọn món ưu tiên sự đa dạng và lịch sử bữa ăn. Family Taste được dùng để tinh chỉnh công thức của món đã chọn.</p></div><button className="button secondary" type="button" onClick={() => { setSelectedSlots(emptySuggestionSlots); setPreview(null); setStale(false); }}>Chọn tất cả ô trống</button></div><p className="selectionSummary" role="status">Đã chọn {selectedSlots.length} ô Trưa/Tối còn trống.</p><button className="button" type="button" disabled={busy || selectedSlots.length === 0} onClick={() => void makePreview()}>Xem trước gợi ý</button>{stale && <div className="inlineError" role="alert">Kế hoạch hoặc Family Taste đã thay đổi. Hãy xem lại gợi ý mới.<br /><button type="button" className="textDanger" onClick={() => void makePreview()}>Tạo lại gợi ý</button></div>}{preview && <div className="suggestionPreview"><h3>Gợi ý trước khi áp dụng</h3><p className="previewExplanation">Các món dưới đây chưa được thêm vào kế hoạch. Family Taste chỉ tinh chỉnh công thức của món đã chọn.</p><div className="suggestionList">{preview.slots.map((item) => <article key={slotKey(item)}><span>{vietnameseDate(item.plannedDate)} · {item.mealType === 'lunch' ? 'Trưa' : 'Tối'}</span><strong>{item.recipe.title}</strong><small>Family Taste · phiên bản {item.householdPersonalizedRecipeVersion.versionNo}</small><p>{item.reason.alreadyUsedThisWeek ? 'Đã có trong tuần này, nhưng vẫn phù hợp với các ô đã chọn.' : 'Chưa dùng trong tuần này.'} {item.reason.recentUseCount === 0 ? 'Ít xuất hiện trong 4 tuần gần đây.' : `Đã xuất hiện ${item.reason.recentUseCount} lần trong 4 tuần gần đây.`}</p></article>)}</div><button className="button" type="button" disabled={busy} onClick={() => void applyPreview()}>Áp dụng gợi ý</button></div>}</section>
      {editorOpen && <section className="accountPanel entryEditor"><div className="panelHeading"><div><h2>{editing ? 'Sửa bữa ăn' : 'Thêm bữa ăn'}</h2><p>{editing?.householdPersonalizedRecipeVersion && !form.recipeVersionId ? 'Giữ nguyên phiên bản Family Taste hiện có, hoặc chọn công thức chuẩn mới.' : 'Chọn một công thức đã xuất bản cho kế hoạch.'}</p></div><button type="button" className="textDanger" onClick={() => { setEditing(null); setEditorOpen(false); setForm(initialForm(weekStart)); }}>Đóng</button></div><form className="plannerForm" onSubmit={saveEntry}><label><span>Ngày</span><select value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })}>{days.map((day) => <option value={day} key={day}>{vietnameseDate(day)}</option>)}</select></label><label><span>Bữa</span><select value={form.mealType} onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })}>{MEALS.map((meal) => <option value={meal.value} key={meal.value}>{meal.label}</option>)}</select></label><label className="recipeSelect"><span>Công thức</span><select value={form.recipeVersionId} onChange={(event) => setForm({ ...form, recipeVersionId: event.target.value })} required={!editing?.householdPersonalizedRecipeVersion}>{editing?.householdPersonalizedRecipeVersion && <option value="">Giữ Family Taste: {editing.recipe.title}</option>}<option value="">Chọn công thức</option>{recipes.filter((recipe) => recipe.latestVersion).map((recipe) => <option value={recipe.latestVersion!.id} key={recipe.id}>{recipe.title}</option>)}</select></label><label><span>Số phần</span><input type="number" min="1" max="8" required value={form.servings} onChange={(event) => setForm({ ...form, servings: event.target.value })} /></label><label className="noteField"><span>Ghi chú (không bắt buộc)</span><input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><button className="button" disabled={busy}>{editing ? 'Lưu thay đổi' : 'Thêm vào kế hoạch'}</button></form></section>}
    </>}
  </main>;
}
