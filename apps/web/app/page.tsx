'use client';

import Link from 'next/link';

import {
  useEffect,
  useState,
} from 'react';

import {
  apiRequest,
} from '../lib/api';

import type {
  DevBootstrapResponse,
  RecipeListResponse,
} from '../lib/types';

export default function Home() {
  const [
    recipes,
    setRecipes,
  ] = useState<
    RecipeListResponse | null
  >(null);

  const [
    dev,
    setDev,
  ] = useState<
    DevBootstrapResponse | null
  >(null);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [
          recipeData,
          devData,
        ] =
          await Promise.all([
            apiRequest<
              RecipeListResponse
            >(
              '/recipes?limit=24',
            ),

            apiRequest<
              DevBootstrapResponse
            >(
              '/dev/bootstrap',
            ),
          ]);

        if (!active) {
          return;
        }

        setRecipes(
          recipeData,
        );

        setDev(
          devData,
        );
      } catch (cause) {
        if (!active) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Không tải được dữ liệu.',
        );
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const taste =
    dev?.data
      .tasteProfile;

  return (
    <main className="shell">
      <header className="topbar">
        <Link
          href="/"
          className="brand"
        >
          <span className="brandMark">
            B
          </span>

          <span>
            Bếp Nhớ
          </span>
        </Link>

        <span className="pill">
          Bản phát triển
        </span>
      </header>

      <section className="hero">
        <div className="heroCard">
          <div className="smallLabel">
            Trợ lý nấu món Việt
          </div>

          <h1>
            Càng nấu,
            <br />
            càng hiểu khẩu vị.
          </h1>

          <p>
            Bếp Nhớ ghi nhớ những gì
            bạn thích sau mỗi lần nấu,
            rồi điều chỉnh công thức
            tiếp theo vừa đủ — không
            thay đổi cực đoan chỉ sau
            một lần phản hồi.
          </p>
        </div>

        <aside className="tasteCard">
          <div>
            <div className="smallLabel">
              Taste DNA
            </div>

            <strong>
              {taste
                ? `${Math.round(
                    taste
                      .maturityScore *
                      100,
                  )}%`
                : '—'}
            </strong>

            <p>
              Độ trưởng thành hồ sơ
              khẩu vị hiện tại.
            </p>
          </div>

          <div>
            {taste
              ? `${taste.sampleCount} lần nấu đã được học`
              : 'Chưa có dữ liệu khẩu vị'}
          </div>
        </aside>
      </section>

      <section>
        <div className="sectionTitle">
          <div>
            <div className="smallLabel">
              Hôm nay nấu gì?
            </div>

            <h2>
              Công thức của Bếp Nhớ
            </h2>
          </div>

          {recipes && (
            <p>
              {recipes.meta.count}
              {' '}
              món
            </p>
          )}
        </div>

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {!error &&
         !recipes && (
          <div className="loading">
            Đang mở sổ công thức…
          </div>
        )}

        {recipes && (
          <div className="recipeGrid">
            {recipes.data.map(
              (recipe) => {
                const version =
                  recipe
                    .latestVersion;

                const totalTime =
                  (
                    version
                      ?.prepTimeMinutes ??
                    0
                  ) +
                  (
                    version
                      ?.cookTimeMinutes ??
                    0
                  );

                return (
                  <Link
                    key={
                      recipe.id
                    }
                    href={
                      `/recipes/${recipe.slug}`
                    }
                    className="recipeCard"
                  >
                    <div>
                      <span className="pill brand">
                        Món Việt
                      </span>

                      <h3>
                        {
                          recipe.title
                        }
                      </h3>

                      <p>
                        {version
                          ?.summary ??
                          'Công thức nền của Bếp Nhớ.'}
                      </p>
                    </div>

                    <div className="recipeMeta">
                      <span className="pill">
                        V
                        {
                          version
                            ?.versionNo ??
                          1
                        }
                      </span>

                      {totalTime >
                        0 && (
                        <span className="pill">
                          {totalTime}
                          {' '}
                          phút
                        </span>
                      )}

                      {version && (
                        <span className="pill">
                          {
                            version
                              .servings
                          }
                          {' '}
                          phần
                        </span>
                      )}
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        )}
      </section>

      <div className="footerNote">
        Bếp Nhớ · Recipe → Cook →
        Feedback → Taste DNA →
        Personalized Recipe
      </div>
    </main>
  );
}
