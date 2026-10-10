'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';

type Summary = {
  mealEntryCount: number;
  requirementLineCount: number;
  missingLineCount: number;
  fullyCoveredLineCount: number;
  unitMismatchCount: number;
};
type ShoppingItem = {
  ingredient: { id: string; slug: string; name: string; category: string | null };
  unit: string;
  requiredQuantity: number;
  pantryQuantityApplied: number;
  missingQuantity: number;
  pantry: { present: boolean; unit: string | null; unitMatches: boolean };
  sourceEntryCount: number;
};
type Preview = {
  algorithmVersion: string;
  weekStart: string;
  inputHash: string;
  summary: Summary;
  items: ShoppingItem[];
};
type SavedList = {
  id: string;
  weekStart: string;
  versionNo: number;
  algorithmVersion: string;
  inputHash: string;
  contentHash: string;
  summary: Summary;
  createdAt: string;
  items: ShoppingItem[];
};

const MS_DAY = 86_400_000;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayFor(value: Date) {
  const day = value.getUTCDay() || 7;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - day + 1));
}
function addDays(value: string, days: number) {
  return iso(new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * MS_DAY));
}
function isMonday(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && iso(date) === value && date.getUTCDay() === 1;
}
function vietnameseDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T00:00:00.000Z`));
}
function displayDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

function ShoppingItems({ items, label }: { items: ShoppingItem[]; label: string }) {
  return <section className="shoppingItems" aria-label={label}>{items.map((item) => <article className="shoppingItem" key={`${item.ingredient.id}|${item.unit}`}>
    <div className="shoppingItemHeading"><div><h3>{item.ingredient.name}</h3>{item.ingredient.category && <span>{item.ingredient.category}</span>}</div><strong>Cần mua: {item.missingQuantity} <small>{item.unit}</small></strong></div>
    <p>Kế hoạch cần: <b>{item.requiredQuantity} {item.unit}</b></p>
    {item.pantryQuantityApplied > 0 && <p>Kho đã có: <b>{item.pantryQuantityApplied} {item.unit}</b></p>}
    {item.sourceEntryCount > 1 && <p>Dùng trong {item.sourceEntryCount} bữa đã lên kế hoạch.</p>}
    {item.pantry.present && !item.pantry.unitMatches && <p className="unitMismatch" role="status"><b>Khác đơn vị:</b> Kho đang có nguyên liệu này theo đơn vị khác ({item.pantry.unit}). Bếp Nhớ chưa tự quy đổi đơn vị.</p>}
  </article>)}</section>;
}

export default function ShoppingListPage() {
  return <Suspense fallback={<main className="shell householdShell"><div className="stateCard">Đang tải danh sách đi chợ…</div></main>}><ShoppingListContent /></Suspense>;
}

function ShoppingListContent() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedWeek = params.get('week');
  const [weekStart, setWeekStart] = useState(() => isMonday(requestedWeek) ? requestedWeek! : iso(mondayFor(new Date())));
  const [hasPlan, setHasPlan] = useState(false);
  const [savedList, setSavedList] = useState<SavedList | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noHousehold, setNoHousehold] = useState(false);
  const [stale, setStale] = useState(false);
  const loadGeneration = useRef(0);

  const currentWeek = useMemo(() => iso(mondayFor(new Date())), []);

  async function load(nextWeek = weekStart) {
    const generation = ++loadGeneration.current;
    setLoading(true); setError(''); setNoHousehold(false); setPreview(null); setStale(false);
    try {
      await apiRequest(`/me/household/meal-plans/${nextWeek}`);
      if (generation !== loadGeneration.current) return;
      setHasPlan(true);
      try {
        const latest = await apiRequest<{ data: { shoppingList: SavedList } }>(`/me/household/meal-plans/${nextWeek}/shopping-list/latest`);
        if (generation === loadGeneration.current) setSavedList(latest.data.shoppingList);
      } catch (cause) {
        if (generation !== loadGeneration.current) return;
        if (cause instanceof ApiRequestError && cause.status === 404) setSavedList(null);
        else throw cause;
      }
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      if (cause instanceof ApiRequestError && cause.status === 401) { window.location.href = '/login'; return; }
      if (cause instanceof ApiRequestError && cause.status === 404) {
        try {
          await apiRequest('/me/household');
          if (generation === loadGeneration.current) { setHasPlan(false); setSavedList(null); }
        } catch (householdCause) {
          if (generation !== loadGeneration.current) return;
          if (householdCause instanceof ApiRequestError && householdCause.status === 401) window.location.href = '/login';
          else if (householdCause instanceof ApiRequestError && householdCause.status === 404) setNoHousehold(true);
          else setError(getErrorMessage(householdCause, 'Không tải được danh sách đi chợ.'));
        }
      } else setError(getErrorMessage(cause, 'Không tải được danh sách đi chợ.'));
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }

  useEffect(() => { void load(); }, [weekStart]);
  useEffect(() => {
    if (isMonday(requestedWeek) && requestedWeek !== weekStart) selectWeek(requestedWeek!);
  // Query navigation is an external input; selectWeek intentionally clears transient state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedWeek]);

  function selectWeek(nextWeek: string) {
    const same = nextWeek === weekStart;
    loadGeneration.current += 1;
    setWeekStart(nextWeek); setHasPlan(false); setSavedList(null); setPreview(null); setStale(false); setError(''); setNotice('');
    router.replace(`/household/shopping-list?week=${nextWeek}`, { scroll: false });
    if (same) void load(nextWeek);
  }

  async function previewRequirements() {
    if (!hasPlan) return;
    setBusy(true); setError(''); setNotice(''); setStale(false);
    try {
      const response = await apiRequest<{ data: Preview }>(`/me/household/meal-plans/${weekStart}/shopping-requirements`);
      setPreview(response.data);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 404) { setPreview(null); await load(); }
      else setError(getErrorMessage(cause, 'Chưa thể xem nguyên liệu cần mua.'));
    } finally { setBusy(false); }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ data: { shoppingList: SavedList | null; reused: boolean } }>(`/me/household/meal-plans/${weekStart}/shopping-list`, {
        method: 'POST', body: JSON.stringify({ expectedInputHash: preview.inputHash }),
      });
      setPreview(null);
      if (response.data.shoppingList) {
        setSavedList(response.data.shoppingList);
        setNotice(response.data.reused ? 'Danh sách hiện tại vẫn đúng với kế hoạch và kho bếp.' : 'Đã lưu danh sách đi chợ.');
        void loadLatest();
      } else setNotice('Kho bếp đã đủ nguyên liệu cho kế hoạch tuần này. Không cần lưu danh sách đi chợ.');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        setPreview(null); setStale(true); setNotice('');
        await load();
        setStale(true);
      } else setError(getErrorMessage(cause, 'Chưa thể lưu danh sách đi chợ.'));
    } finally { setBusy(false); }
  }

  async function loadLatest() {
    try {
      const response = await apiRequest<{ data: { shoppingList: SavedList } }>(`/me/household/meal-plans/${weekStart}/shopping-list/latest`);
      setSavedList(response.data.shoppingList);
    } catch { /* A just-created list is already displayed; normal navigation will retry. */ }
  }

  if (loading) return <main className="shell householdShell"><div className="stateCard">Đang tải danh sách đi chợ…</div></main>;
  if (noHousehold) return <main className="shell householdShell"><header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link></header><section className="accountPanel shoppingEmpty"><h1>Bạn chưa có gia đình</h1><p>Hãy tạo hoặc tham gia một gia đình trước khi xem danh sách đi chợ.</p><Link className="button" href="/household">Mở trang Gia đình</Link></section></main>;

  return <main className="shell householdShell shoppingShell">
    <header className="detailNav"><Link href="/household" className="backLink">← Gia đình</Link><Link href="/household/pantry" className="backLink">Mở Kho bếp</Link><Link href="/household/meal-plan" className="backLink">Kế hoạch bữa ăn</Link></header>
    <section className="shoppingHero"><div><div className="eyebrow"><span /> Gian bếp gia đình</div><h1>Danh sách đi chợ</h1><p>Xem những nguyên liệu còn thiếu từ kế hoạch bữa ăn của tuần đã chọn và kho bếp hiện tại.</p></div><div className="weekNav" aria-label="Chọn tuần"><button type="button" onClick={() => selectWeek(addDays(weekStart, -7))}>← Tuần trước</button><strong>{vietnameseDate(weekStart)} — {vietnameseDate(addDays(weekStart, 6))}</strong><button type="button" onClick={() => selectWeek(addDays(weekStart, 7))}>Tuần sau →</button></div></section>
    {error && <div className="inlineError" role="alert">{error}</div>}
    {notice && <div className="successNotice" role="status">{notice}</div>}
    {stale && <section className="accountPanel shoppingStale" role="alert"><h2>Kế hoạch bữa ăn hoặc kho bếp đã thay đổi. Hãy xem lại danh sách mới.</h2><button className="button" type="button" onClick={() => void previewRequirements()}>Xem lại nguyên liệu cần mua</button></section>}
    {!hasPlan ? <section className="accountPanel shoppingEmpty"><h2>Tuần này chưa có kế hoạch bữa ăn</h2><p>Hãy lập kế hoạch cho tuần đã chọn trước khi xem nguyên liệu cần mua.</p><Link className="button" href="/household/meal-plan">Mở kế hoạch bữa ăn</Link></section> : <>
      <section className="shoppingIntro accountPanel"><div><h2>Kiểm tra theo kế hoạch và kho bếp</h2><p>Chỉ cùng nguyên liệu và đúng cùng đơn vị mới được trừ khỏi kho. Bếp Nhớ chưa tự quy đổi đơn vị, và việc lưu danh sách không làm thay đổi kho bếp.</p></div><div className="shoppingActions"><button className="button secondary" type="button" onClick={() => selectWeek(currentWeek)}>Về tuần hiện tại</button><button className="button" type="button" disabled={busy} onClick={() => void previewRequirements()}>Xem nguyên liệu cần mua</button></div></section>
      {preview && <section className="shoppingPreview accountPanel" aria-labelledby="shopping-preview-heading"><div className="panelHeading"><div><div className="smallLabel">Theo kho bếp hiện tại</div><h2 id="shopping-preview-heading">Nguyên liệu cần mua</h2><p>Bản xem trước chỉ đọc; số lượng luôn được máy chủ tính lại từ kế hoạch và kho bếp hiện tại.</p></div></div><SummaryGrid summary={preview.summary} />
        {preview.summary.missingLineCount === 0 ? <div className="shoppingCovered" role="status"><h3>Kho bếp đã đủ nguyên liệu cho kế hoạch tuần này.</h3><p>Không cần lưu danh sách đi chợ. Kho bếp không bị thay đổi.</p></div> : <><ShoppingItems items={preview.items} label="Nguyên liệu còn thiếu" /><button className="button" type="button" disabled={busy} onClick={() => void generate()}>Lưu danh sách đi chợ</button></>}
      </section>}
      {savedList && <section className="shoppingSaved accountPanel" aria-labelledby="saved-shopping-heading"><div className="panelHeading"><div><div className="smallLabel">Danh sách đã lưu · Phiên bản {savedList.versionNo}</div><h2 id="saved-shopping-heading">Danh sách đi chợ đã lưu</h2><p>Danh sách đã lưu là ảnh chụp của kế hoạch và kho bếp tại thời điểm tạo{savedList.createdAt ? ` · ${displayDateTime(savedList.createdAt)}` : ''}.</p></div><button className="button secondary" type="button" disabled={busy} onClick={() => void previewRequirements()}>Xem lại theo kế hoạch và kho hiện tại</button></div><SummaryGrid summary={savedList.summary} />{savedList.items.length > 0 && <ShoppingItems items={savedList.items} label="Các mục trong danh sách đi chợ đã lưu" />}</section>}
    </>}
  </main>;
}

function SummaryGrid({ summary }: { summary: Summary }) {
  return <dl className="shoppingSummary" aria-label="Tóm tắt nguyên liệu"><div><dt>Bữa trong kế hoạch</dt><dd>{summary.mealEntryCount}</dd></div><div><dt>Nhóm nguyên liệu đã xét</dt><dd>{summary.requirementLineCount}</dd></div><div><dt>Còn thiếu</dt><dd>{summary.missingLineCount}</dd></div><div><dt>Đã đủ trong kho</dt><dd>{summary.fullyCoveredLineCount}</dd></div><div><dt>Khác đơn vị</dt><dd>{summary.unitMismatchCount}</dd></div></dl>;
}
