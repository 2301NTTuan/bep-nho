'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiRequest, getErrorMessage } from '../lib/api';
import type { DevBootstrapResponse, RecipeListResponse } from '../lib/types';

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Bếp Nhớ — trang chủ">
      <span className="brandMark" aria-hidden="true">BN</span>
      <span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span>
    </Link>
  );
}

export default function Home() {
  const [recipes, setRecipes] = useState<RecipeListResponse | null>(null);
  const [dev, setDev] = useState<DevBootstrapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setError(null);
      try {
        const [recipeData, devData] = await Promise.all([
          apiRequest<RecipeListResponse>('/recipes?limit=24'),
          apiRequest<DevBootstrapResponse>('/dev/bootstrap'),
        ]);
        if (active) {
          setRecipes(recipeData);
          setDev(devData);
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Không mở được sổ công thức.'));
      }
    }

    void load();
    return () => { active = false; };
  }, [reloadKey]);

  const taste = dev?.data.tasteProfile;

  return (
    <main className="shell homeShell">
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Điều hướng chính">
          <a href="#recipes">Món hôm nay</a>
          <span className="statusDot"><i /> Bếp đang mở</span>
        </nav>
      </header>

      <section className="hero">
        <div className="heroCard">
          <div className="eyebrow"><span /> Trợ lý nấu món Việt có trí nhớ</div>
          <h1>Càng nấu, Bếp Nhớ càng <em>hiểu khẩu vị</em> của bạn.</h1>
          <p>Mỗi lần vào bếp là một lần công thức được tinh chỉnh vừa đủ — có lý do, có giới hạn và luôn giữ lại phiên bản bạn đã nấu.</p>
          <a className="button heroAction" href="#recipes">Chọn món để nấu <span aria-hidden="true">↓</span></a>
          <div className="heroProof" aria-label="Đặc tính của Bếp Nhớ">
            <span><b>01</b> Công thức chuẩn</span>
            <span><b>02</b> Học sau mỗi lần nấu</span>
            <span><b>03</b> Điều chỉnh có kiểm soát</span>
          </div>
        </div>

        <aside className="tasteCard">
          <div className="tasteOrnament" aria-hidden="true">味</div>
          <div>
            <div className="smallLabel light">Taste DNA của bạn</div>
            <strong>{taste ? `${Math.round(taste.maturityScore * 100)}%` : '—'}</strong>
            <p>{taste ? 'Hồ sơ đang dần rõ nét qua từng bữa cơm.' : 'Nấu món đầu tiên để Bếp Nhớ bắt đầu học.'}</p>
          </div>
          <div className="tasteProgress" aria-hidden="true"><span style={{ width: `${Math.max(4, (taste?.maturityScore ?? 0) * 100)}%` }} /></div>
          <div className="tasteMeta"><span>{taste?.sampleCount ?? 0}</span> lần nấu đã góp vào khẩu vị</div>
        </aside>
      </section>

      <section id="recipes" className="recipeSection">
        <div className="sectionTitle">
          <div><div className="smallLabel">Gợi ý từ gian bếp</div><h2>Hôm nay mình nấu gì?</h2></div>
          {recipes && <p>{recipes.meta.count} công thức đã kiểm chứng</p>}
        </div>

        {error && (
          <div className="stateCard errorState" role="alert">
            <span className="stateIcon">!</span><div><strong>Gian bếp đang tạm gián đoạn</strong><p>{error}</p></div>
            <button className="button secondary" type="button" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button>
          </div>
        )}

        {!error && !recipes && (
          <div className="recipeGrid" aria-label="Đang tải công thức">
            {[1, 2, 3].map((item) => <div className="recipeCard skeletonCard" key={item}><i /><i /><i /></div>)}
          </div>
        )}

        {recipes?.data.length === 0 && (
          <div className="stateCard"><span className="stateIcon">○</span><div><strong>Sổ công thức còn trống</strong><p>Các món Việt đầu tiên đang được chuẩn bị.</p></div></div>
        )}

        {recipes && recipes.data.length > 0 && (
          <div className="recipeGrid">
            {recipes.data.map((recipe, index) => {
              const version = recipe.latestVersion;
              const totalTime = (version?.prepTimeMinutes ?? 0) + (version?.cookTimeMinutes ?? 0);
              return (
                <Link key={recipe.id} href={`/recipes/${recipe.slug}`} className="recipeCard">
                  <div className={`recipeVisual tone${(index % 3) + 1}`}>
                    <span className="recipeIndex">0{index + 1}</span>
                    <span className="bowl" aria-hidden="true"><i /><i /><i /></span>
                    <span className="pill lightPill">Món Việt</span>
                  </div>
                  <div className="recipeBody">
                    <div><h3>{recipe.title}</h3><p>{version?.summary ?? 'Công thức nền cân bằng, rõ từng bước.'}</p></div>
                    <div className="recipeMeta">
                      {totalTime > 0 && <span><i className="clockIcon" /> {totalTime} phút</span>}
                      {version && <span>{version.servings} phần</span>}
                      <b aria-label="Mở công thức">→</b>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="siteFooter"><Brand /><p>Recipe → Cook → Feedback → Taste DNA → Công thức của riêng bạn</p></footer>
    </main>
  );
}
