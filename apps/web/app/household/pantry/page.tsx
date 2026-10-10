'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';

type Ingredient = { id: string; slug: string; name: string; category: string | null };
type PantryItem = {
  id: string; revision: number; ingredient: Ingredient; quantity: number; unit: string;
  bestBeforeDate: string | null; note: string | null; createdAt: string; updatedAt: string;
};
type PantryResponse = { data: PantryItem[] };
type IngredientResponse = { data: Ingredient[] };
type PantryForm = { quantity: string; unit: string; bestBeforeDate: string; note: string };

const emptyForm = (): PantryForm => ({ quantity: '', unit: '', bestBeforeDate: '', note: '' });

function validQuantity(value: string) {
  return /^\d+(?:\.\d{1,3})?$/.test(value) && Number(value) > 0;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noHousehold, setNoHousehold] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Ingredient[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [addForm, setAddForm] = useState<PantryForm>(emptyForm);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [editForm, setEditForm] = useState<PantryForm>(emptyForm);
  const loadGeneration = useRef(0);
  const searchGeneration = useRef(0);

  const existingIngredientIds = useMemo(() => new Set(items.map((item) => item.ingredient.id)), [items]);

  async function load() {
    const generation = ++loadGeneration.current;
    setLoading(true); setError(''); setNoHousehold(false);
    try {
      const response = await apiRequest<PantryResponse>('/me/household/pantry');
      if (generation !== loadGeneration.current) return;
      setItems(response.data);
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      if (cause instanceof ApiRequestError && cause.status === 401) { window.location.href = '/login'; return; }
      if (cause instanceof ApiRequestError && cause.status === 404) {
        try {
          await apiRequest('/me/household');
          if (generation === loadGeneration.current) setNoHousehold(true);
        } catch (householdCause) {
          if (generation !== loadGeneration.current) return;
          if (householdCause instanceof ApiRequestError && householdCause.status === 401) window.location.href = '/login';
          else if (householdCause instanceof ApiRequestError && householdCause.status === 404) setNoHousehold(true);
          else setError(getErrorMessage(householdCause, 'Không tải được kho bếp.'));
        }
      } else setError(getErrorMessage(cause, 'Không tải được kho bếp.'));
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function closeAdd() {
    searchGeneration.current += 1;
    setAddOpen(false); setSelectedIngredient(null); setResults([]); setQuery(''); setAddForm(emptyForm());
  }

  function beginAdd() {
    setError(''); setNotice(''); setEditing(null); setAddOpen(true); setSelectedIngredient(null); setResults([]); setQuery(''); setAddForm(emptyForm());
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const generation = ++searchGeneration.current;
    setBusy(true); setError('');
    try {
      const value = query.trim();
      const response = await apiRequest<IngredientResponse>(`/me/household/pantry/ingredients?limit=30${value ? `&query=${encodeURIComponent(value)}` : ''}`);
      if (generation === searchGeneration.current) setResults(response.data);
    } catch (cause) {
      if (generation === searchGeneration.current) setError(getErrorMessage(cause, 'Không tìm được nguyên liệu.'));
    } finally { if (generation === searchGeneration.current) setBusy(false); }
  }

  function validate(form: PantryForm) {
    if (!validQuantity(form.quantity)) return 'Số lượng phải lớn hơn 0 và có tối đa 3 chữ số thập phân.';
    if (!form.unit.trim()) return 'Hãy nhập đơn vị.';
    return '';
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!selectedIngredient) { setError('Hãy chọn một nguyên liệu chuẩn của Bếp Nhớ.'); return; }
    const invalid = validate(addForm); if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try {
      await apiRequest('/me/household/pantry', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId: selectedIngredient.id, quantity: Number(addForm.quantity), unit: addForm.unit,
          bestBeforeDate: addForm.bestBeforeDate || null, note: addForm.note.trim() || null,
        }),
      });
      closeAdd(); setNotice('Đã thêm nguyên liệu vào kho bếp.'); await load();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        closeAdd(); setNotice('Nguyên liệu này đã có trong kho.'); await load();
      } else setError(getErrorMessage(cause, 'Chưa thể thêm nguyên liệu.'));
    } finally { setBusy(false); }
  }

  function beginEdit(item: PantryItem) {
    setAddOpen(false); setError(''); setNotice('');
    setEditing(item);
    setEditForm({ quantity: String(item.quantity), unit: item.unit, bestBeforeDate: item.bestBeforeDate ?? '', note: item.note ?? '' });
  }

  function closeEdit() { setEditing(null); setEditForm(emptyForm()); }

  async function update(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    const invalid = validate(editForm); if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try {
      await apiRequest(`/me/household/pantry/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: editing.revision, quantity: Number(editForm.quantity), unit: editForm.unit,
          bestBeforeDate: editForm.bestBeforeDate || null, note: editForm.note.trim() || null,
        }),
      });
      closeEdit(); setNotice('Đã cập nhật kho bếp.'); await load();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        closeEdit(); setNotice('Kho bếp vừa được thành viên khác cập nhật. Dữ liệu mới nhất đã được tải lại.'); await load();
      } else setError(getErrorMessage(cause, 'Chưa thể cập nhật nguyên liệu.'));
    } finally { setBusy(false); }
  }

  async function remove(item: PantryItem) {
    setBusy(true); setError('');
    try {
      await apiRequest(`/me/household/pantry/${item.id}?expectedRevision=${item.revision}`, { method: 'DELETE' });
      if (editing?.id === item.id) closeEdit();
      setNotice('Đã xóa nguyên liệu khỏi kho.'); await load();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        closeEdit(); setNotice('Kho bếp vừa được thành viên khác cập nhật. Dữ liệu mới nhất đã được tải lại.'); await load();
      } else setError(getErrorMessage(cause, 'Chưa thể xóa nguyên liệu.'));
    } finally { setBusy(false); }
  }

  if (loading) return <main className="shell householdShell"><div className="stateCard">Đang tải kho bếp…</div></main>;
  if (noHousehold) return <main className="shell householdShell"><header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link></header><section className="accountPanel pantryEmpty"><h1>Bạn chưa có gia đình</h1><p>Hãy tạo hoặc tham gia một gia đình trước khi quản lý kho bếp.</p><Link className="button" href="/household">Mở trang Gia đình</Link></section></main>;

  return <main className="shell householdShell pantryShell">
    <header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link><Link href="/" className="backLink">Về Bếp Nhớ</Link></header>
    <section className="pantryHero"><div><div className="eyebrow"><span /> Gian bếp gia đình</div><h1>Kho bếp</h1><p>Ghi lại những nguyên liệu cả nhà đang có để mọi người cùng cập nhật. Kho bếp được duy trì thủ công trong giai đoạn này.</p></div><div className="pantryCount"><strong>{items.length}</strong><span>nguyên liệu trong kho</span></div></section>
    {error && <div className="inlineError" role="alert">{error}</div>}
    {notice && <div className="successNotice" role="status">{notice}</div>}
    <section className="pantryIntro accountPanel"><div><h2>Nguyên liệu hiện có</h2><p>Đơn vị được giữ nguyên như bạn nhập; Bếp Nhớ chưa tự quy đổi đơn vị.</p></div><button className="button" type="button" onClick={beginAdd}>Thêm nguyên liệu</button></section>
    {items.length === 0 ? <section className="accountPanel pantryEmpty"><h2>Kho bếp đang trống</h2><p>Thêm nguyên liệu chuẩn của Bếp Nhớ để cả nhà cùng theo dõi.</p><button className="button" type="button" onClick={beginAdd}>Thêm nguyên liệu</button></section> : <section className="pantryGrid" aria-label="Danh sách nguyên liệu trong kho">{items.map((item) => <article className="pantryItem" key={item.id}><div className="pantryItemHeading"><div><h2>{item.ingredient.name}</h2>{item.ingredient.category && <span>{item.ingredient.category}</span>}</div><strong>{item.quantity} <small>{item.unit}</small></strong></div>{item.bestBeforeDate && <p><b>Dùng tốt trước:</b> {displayDate(item.bestBeforeDate)}</p>}{item.note && <p className="pantryNote">{item.note}</p>}<div className="pantryActions"><button type="button" onClick={() => beginEdit(item)}>Sửa</button><button type="button" disabled={busy} onClick={() => void remove(item)}>Xóa khỏi kho</button></div></article>)}</section>}
    {addOpen && <section className="accountPanel pantryEditor" aria-labelledby="add-pantry-heading"><div className="panelHeading"><div><h2 id="add-pantry-heading">Thêm nguyên liệu</h2><p>Tìm và chọn nguyên liệu chuẩn trước khi nhập số lượng.</p></div><button className="textDanger" type="button" onClick={closeAdd}>Đóng</button></div><form className="pantrySearch" onSubmit={search}><label><span>Tìm nguyên liệu chuẩn</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Ví dụ: rau cải" /></label><button className="button secondary" disabled={busy}>Tìm</button></form>{results.length > 0 && <ul className="ingredientResults" aria-label="Kết quả tìm nguyên liệu">{results.map((ingredient) => { const owned = existingIngredientIds.has(ingredient.id); const selected = selectedIngredient?.id === ingredient.id; return <li key={ingredient.id}><button type="button" disabled={owned} className={selected ? 'selectedIngredient' : ''} onClick={() => setSelectedIngredient(ingredient)}><span><strong>{ingredient.name}</strong>{ingredient.category && <small>{ingredient.category}</small>}</span><em>{owned ? 'Đã có trong kho' : selected ? 'Đã chọn' : 'Chọn'}</em></button></li>; })}</ul>}{selectedIngredient && <form className="pantryForm" onSubmit={create}><p className="selectedIngredientNotice" role="status">Đang thêm: <strong>{selectedIngredient.name}</strong></p><PantryFields form={addForm} setForm={setAddForm} /><button className="button" disabled={busy}>Thêm vào kho</button></form>}</section>}
    {editing && <section className="accountPanel pantryEditor" aria-labelledby="edit-pantry-heading"><div className="panelHeading"><div><h2 id="edit-pantry-heading">Sửa nguyên liệu</h2><p>Nguyên liệu chuẩn giữ nguyên: <strong>{editing.ingredient.name}</strong></p></div><button className="textDanger" type="button" onClick={closeEdit}>Đóng</button></div><form className="pantryForm" onSubmit={update}><PantryFields form={editForm} setForm={setEditForm} /><button className="button" disabled={busy}>Lưu thay đổi</button></form></section>}
  </main>;
}

function PantryFields({ form, setForm }: { form: PantryForm; setForm: (form: PantryForm) => void }) {
  return <div className="pantryFields"><label><span>Số lượng</span><input aria-label="Số lượng" type="number" min="0.001" step="0.001" inputMode="decimal" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><label><span>Đơn vị</span><input aria-label="Đơn vị" maxLength={32} required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="Ví dụ: g, ml, quả" /></label><label><span>Dùng tốt trước (không bắt buộc)</span><input aria-label="Dùng tốt trước" type="date" value={form.bestBeforeDate} onChange={(event) => setForm({ ...form, bestBeforeDate: event.target.value })} /></label><label className="pantryNoteField"><span>Ghi chú (không bắt buộc)</span><input aria-label="Ghi chú" maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></div>;
}
