/**
 * @fileoverview 나무뉴스 크롤러
 * @description namu.news 사이트에서 뉴스 데이터를 수집합니다.
 */

const cheerio = require('cheerio');
const BaseCrawler = require('./BaseCrawler');

/**
 * 나무뉴스 크롤러 클래스
 * @class NamuNewsCrawler
 * @extends BaseCrawler
 */
class NamuNewsCrawler extends BaseCrawler {
  /**
   * NamuNewsCrawler 생성자
   * @param {Object} newsService - 뉴스 서비스 인스턴스
   */
  constructor(newsService) {
    super(newsService, { name: 'NamuNewsCrawler' });

    /**
     * 카테고리 URL 목록
     * @type {Array<{url: string, category: string}>}
     */
    this.categories = [
      { url: 'https://namu.news/news/news/technology', category: 'IT/과학' },
      { url: 'https://namu.news/news/news/world', category: '세계' },
      { url: 'https://namu.news/news/news/culture', category: '문화' },
      { url: 'https://namu.news/news/news/society', category: '사회' },
      { url: 'https://namu.news/news/news/economics', category: '경제' },
      { url: 'https://namu.news/news/news/politics', category: '정치' },
      { url: 'https://namu.news/news/news/news-general', category: '시사일반' },
    ];

    // 환경 설정 (env 기반)
    this.maxPerCategory = parseInt(process.env.MAX_NEWS_PER_CATEGORY) || 25;
    this.requestDelayMs = parseInt(process.env.REQUEST_DELAY_MS) || 800;
    this.duplicateLogInterval = 10; // 중복 로그 rate-limit
    this.duplicateSkipCount = 0;
    this.duplicateSkipSilenced = 0;
  }

  /**
   * 뉴스 크롤링 메인
   * @returns {Promise<{success:boolean, itemCount:number}>}
   */
  async crawlNews() {
    const logId = await this.newsService.createCrawlLog('started');
    let itemCount = 0;

    try {
      console.log(`[${this.getName()}] 크롤링 시작...`);

      const allArticles = [];
      for (const cat of this.categories) {
        try {
          console.log(`[${this.getName()}] 카테고리: ${cat.category}`);
          const categoryArticles = await this.crawlCategoryNews(
            cat.url,
            cat.category
          );
          if (categoryArticles.length) {
            allArticles.push(...categoryArticles);
            console.log(
              `[${this.getName()}] ${cat.category}: ${categoryArticles.length}건 수집`
            );
          }
          await this.delay(this.requestDelayMs); // 과도한 요청 방지
        } catch (err) {
          console.error(
            `[${this.getName()}] ${cat.category} 카테고리 에러:`,
            err.message
          );
        }
      }

      // 중복 제거 및 저장
      const newArticles = await this.filterNewArticles(allArticles);
      const detailTasks = [];
      for (const article of newArticles) {
        try {
          const saved = await this.newsService.saveMainNews(article);
          if (saved) {
            // 상세 크롤링 비동기 작업 수집
            const task = this.crawlAndSaveDetailNews(
              saved.news_se,
              article.url
            ).catch(err =>
              console.error(
                `[${this.getName()}] 상세 크롤링 에러 (news_se=${saved.news_se}):`,
                err.message
              )
            );
            detailTasks.push(task);
            itemCount++;
          }
        } catch (err) {
          console.error(
            `[${this.getName()}] 메인 뉴스 저장 에러:`,
            err.message
          );
        }
      }

      // 저장된 상세 모두 완료 대기 (에러는 위 catch에서 처리)
      if (detailTasks.length) {
        await Promise.allSettled(detailTasks);
      }

      await this.newsService.updateCrawlLog(
        logId,
        'success',
        `${itemCount}개 뉴스 수집 완료`,
        itemCount
      );
      console.log(`[${this.getName()}] 완료: ${itemCount}개 저장`);

      // 추가: 기존 메인 뉴스 중 상세 미존재 레코드 백필
      await this.backfillDetails();

      return { success: true, itemCount };
    } catch (error) {
      console.error(`[${this.getName()}] 크롤링 에러:`, error);
      await this.newsService.updateCrawlLog(
        logId,
        'error',
        error.message,
        itemCount
      );
      throw error;
    }
  }

  /**
   * 상세 미수집 메인 뉴스에 대해 url_lk로 상세 크롤링 백필
   */
  async backfillDetails() {
    try {
      const limit = parseInt(process.env.BACKFILL_DETAIL_LIMIT) || 30;
      const targets = await this.newsService.getMainNewsWithoutDetail(limit);
      if (!targets.length) return;
      console.log(
        `[${this.getName()}] 상세 백필 대상: ${targets.length}건 (limit=${limit})`
      );

      for (const row of targets) {
        try {
          // row 에 url_lk 존재한다고 가정
          if (!row.url_lk) continue;
          const detail = await this.crawlNewsDetail(row.url_lk);
          if (detail && detail.content) {
            await this.newsService.saveNewsDetail(row.news_se, detail);
            console.log(
              `[${this.getName()}] 상세 백필 완료: news_se=${row.news_se}`
            );
            // 백필 간 요청 간격
            await this.delay(200);
          }
        } catch (err) {
          console.warn(
            `[${this.getName()}] 상세 백필 실패: news_se=${row.news_se} - ${err.message}`
          );
        }
      }
    } catch (error) {
      console.error(`[${this.getName()}] 상세 백필 전체 에러:`, error.message);
    }
  }

  /**
   * 카테고리 페이지 크롤링
   * @param {string} categoryUrl
   * @param {string} categoryName
   * @returns {Promise<Array>}
   */
  async crawlCategoryNews(categoryUrl, categoryName) {
    try {
      const response = await this.httpClient.get(categoryUrl);
      const $ = cheerio.load(response.data);

      const items = [];
      const seenUrls = new Set();

      // 1) 기본: /article/ 숫자 패턴 링크 추출
      $('a[href*="/article/"]').each((i, el) => {
        if (items.length >= 40) return false; // 안전 상한
        const $a = $(el);
        const href = $a.attr('href');
        if (!href) return;
        // 정규화된 절대 URL
        const url = href.startsWith('http') ? href : `https://namu.news${href}`;
        if (!/\/article\/\d+/.test(url)) return; // 기사 링크 형태 필터
        if (seenUrls.has(url)) return; // 중복 제거

        // 앵커 텍스트 정제: 줄바꿈/공백 축소
        let rawText = $a.text().replace(/\s+/g, ' ').trim();
        if (!rawText) return;

        // "더보기" 등 불필요 항목 제외
        if (/더보기|로그인|시사\s*$/.test(rawText)) return;

        // 날짜 추출 (YYYY-MM-DD)
        const dateMatch = rawText.match(/(20\d{2}-\d{2}-\d{2})/);
        let publishedAt = new Date();
        if (dateMatch) {
          const parsed = new Date(dateMatch[1]);
          if (!isNaN(parsed.getTime())) publishedAt = parsed;
        }
        // 제목/제공처 prefix 정규화
        rawText = this.normalizeTitleProvider(rawText);

        // 지나치게 짧은 텍스트 제외
        if (rawText.length < 5) return;

        seenUrls.add(url);
        items.push({
          title: rawText,
          url,
          imageUrl: null, // 리스트 페이지에 뚜렷한 이미지 선택자 미확인
          summary: rawText,
          category: categoryName,
          publishedAt,
        });
      });

      // 2) 보강: article / section 요소 내부의 a를 우선 정렬 (이미 수집된 URL 제외)
      if (items.length < 10) {
        $('article a[href*="/article/"], section a[href*="/article/"]').each(
          (i, el) => {
            if (items.length >= 50) return false;
            const $a = $(el);
            const href = $a.attr('href');
            if (!href) return;
            const url = href.startsWith('http')
              ? href
              : `https://namu.news${href}`;
            if (seenUrls.has(url)) return;
            if (!/\/article\/\d+/.test(url)) return;
            let t = $a.text().replace(/\s+/g, ' ').trim();
            if (!t || t.length < 5) return;
            if (/더보기|로그인/.test(t)) return;
            t = this.normalizeTitleProvider(t);
            seenUrls.add(url);
            items.push({
              title: t,
              url,
              imageUrl: null,
              summary: t,
              category: categoryName,
              publishedAt: new Date(),
            });
          }
        );
      }

      // 3) 최신순 정렬: publishedAt 내림차순 (같은 날짜면 원래 순서 유지)
      items.sort((a, b) => b.publishedAt - a.publishedAt);

      // 4) 카테고리당 최종 상한 (환경변수로 추후 추출 가능)
      const MAX_PER_CATEGORY =
        parseInt(process.env.MAX_NEWS_PER_CATEGORY) || 25;
      return items.slice(0, MAX_PER_CATEGORY);
    } catch (error) {
      console.error(
        `[${this.getName()}] ${categoryName} 카테고리 크롤링 에러:`,
        error.message
      );
      return [];
    }
  }

  /**
   * 상세 페이지 크롤링
   * @param {string} articleUrl
   * @returns {Promise<Object>}
   */
  async crawlNewsDetail(articleUrl) {
    try {
      let attempt = 0;
      const maxAttempts = 2;
      let response;
      let $;
      while (attempt < maxAttempts) {
        attempt++;
        response = await this.httpClient.get(articleUrl);
        $ = cheerio.load(response.data);
        if ($('body').text().length > 200 || attempt === maxAttempts) break;
        await this.delay(300 + attempt * 200); // 재시도 지연
      }
      // ---------- 상세 파싱 고도화 시작 ----------
      const toAbs = src => {
        if (!src) return null;
        if (/^https?:\/\//i.test(src)) return src;
        if (src.startsWith('//')) return 'https:' + src;
        return `https://namu.news${src.startsWith('/') ? '' : '/'}${src}`;
      };

      // 1) 메타 정보 (title/description/keywords) 확보 (본문 품질 낮을 때 보강)
      const metaTitle = (
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text() ||
        ''
      ).trim();
      const metaDesc = (
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        ''
      ).trim();
      const metaKeywords = ($('meta[name="keywords"]').attr('content') || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      // 2) 노이즈 제거 (스크립트/스타일/광고/공유)
      const removeSelectors = [
        'script',
        'style',
        'noscript',
        'iframe',
        'form',
        'button',
        'svg',
        '.ads',
        '.advert',
        '.ad',
        '.share',
        '.sns',
        '.social',
        '.breadcrumb',
        '.nav',
        '.related',
        '.recommend',
      ];
      removeSelectors.forEach(sel => $(sel).remove());

      // 3) 기사 컨테이너 후보 선택 (p 태그 수 기준)
      const candidateSelectors = [
        'article',
        '.article',
        '.article-body',
        '.post',
        '.post-content',
        '.entry-content',
        '.content-body',
        '#content',
        'main',
      ];

      let bestContainer = null;
      let bestScore = 0;
      candidateSelectors.forEach(sel => {
        $(sel).each((_, el) => {
          const $el = $(el);
          const textLen = $el.text().trim().length;
          // 문단 수 가중치
          const pCount = $el.find('p').length;
          const score = textLen + pCount * 80; // heuristic
          if (score > bestScore) {
            bestScore = score;
            bestContainer = $el;
          }
        });
      });

      // 4) 컨테이너 내부 불필요 문단/요소 제거 (저작권/배포고지 등)
      if (bestContainer) {
        bestContainer
          .find(
            'p:contains(무단 전재), p:contains(재배포), p:contains(Copyright), p:contains(이 기사), p:contains(사진=)'
          )
          .each((_, el) => $(el).remove());
      }

      // 5) 문단 추출
      let paragraphs = [];
      if (bestContainer) {
        bestContainer.find('br').replaceWith('\n');
        bestContainer.find('p').each((_, el) => {
          const text = $(el)
            .text()
            .replace(/\u00a0/g, ' ')
            .replace(/\s+$/g, '')
            .replace(/^[\s\t]+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (text && text.length >= 20 && !/^\[[^\]]+\]$/.test(text)) {
            paragraphs.push(text);
          }
        });
      }

      // 6) 중복/연속 문단 정리
      const seenPara = new Set();
      paragraphs = paragraphs.filter(p => {
        if (seenPara.has(p)) return false;
        seenPara.add(p);
        return true;
      });

      // 7) 이미지 수집 (본문 상위 5개)
      let images = [];
      if (bestContainer) {
        bestContainer.find('img').each((_, img) => {
          if (images.length >= 5) return false;
          const src = toAbs($(img).attr('data-src') || $(img).attr('src'));
          if (src && !images.includes(src)) images.push(src);
        });
      }

      // 8) 컨테이너 기반 content 구성, 부족하면 fallback
      let content = paragraphs.join('\n\n');
      if (content.length < 120) {
        // fallback: 페이지 전체에서 긴 문단 추출
        const altParas = [];
        $('p').each((_, el) => {
          const t = $(el).text().trim();
          if (t.length > 40) altParas.push(t);
          if (altParas.length >= 15) return false;
        });
        if (altParas.length) {
          content = altParas.join('\n\n');
        }
      }
      if (content.length < 80 && metaDesc) {
        content = metaDesc + (content ? '\n\n' + content : '');
      }

      // 9) 저작권/잡음 패턴 제거
      content = content
        .replace(/(무단 전재[\s\S]*?$)/gm, '')
        .replace(/▶.*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // 10) 기자/작성자 추출 (전문 선택자 실패 시 정규식)
      const authorSelectors = [
        '.author-name',
        '.reporter-name',
        '.writer',
        '.byline',
        '.article-author',
        '.post-author',
      ];
      let author = '';
      for (const sel of authorSelectors) {
        const el = $(sel);
        if (el.length) {
          author = el.text().replace(/\s+/g, ' ').trim();
          if (author) break;
        }
      }
      if (!author) {
        const m = content.match(/([가-힣]{2,4})\s?기자/);
        if (m) author = m[1] + ' 기자';
      }

      // 11) 태그 (본문 내 + meta keywords 통합)
      const tagSet = new Set();
      $('.tag, .tags a, .keywords a, a.tag').each((_, el) => {
        const t = $(el).text().trim();
        if (t && t.length <= 30) tagSet.add(t);
      });
      metaKeywords.forEach(k => tagSet.add(k));
      const tags = Array.from(tagSet).slice(0, 10);

      // 12) 이미지 정보 content 끝에 마크다운 형태로 부가 (선택)
      if (images.length) {
        content +=
          '\n\n' +
          images.map((src, i) => `![image_${i + 1}](${src})`).join('\n');
      }

      // 13) (서울=연합뉴스) 형태의 위치=통신사 패턴 추출 → source 추론
      let inferredSource = '나무뉴스';
      const providerList = [
        '연합뉴스',
        '시사연합뉴스',
        '시사엑스포츠뉴스',
        '뉴시스',
        'YTN',
        '머니투데이',
        '한국경제',
        '서울경제',
        '조선일보',
        '한겨레',
        '경향신문',
        '세계일보',
        'MBN',
        'SBS',
        'KBS',
        'MBC',
        'JTBC',
      ];
      const leadSlice = content.slice(0, 250);
      const locSrcMatch = leadSlice.match(
        /[\[(]([가-힣A-Za-z·\s]{1,8})=([가-힣A-Za-z·]{2,15})[)\]]/
      );
      if (locSrcMatch && providerList.includes(locSrcMatch[2])) {
        inferredSource = locSrcMatch[2];
        // 본문에서 해당 패턴 제거
        content = content.replace(locSrcMatch[0], '').trim();
      } else {
        // 제목 메타에서 제공처 prefix 남아있으면 추출 (예: 연합뉴스/제목)
        const titleSourceMatch = metaTitle.match(
          /^(?:\[.*?\]\s*)?([가-힣A-Za-z·]{2,15})\//
        );
        if (titleSourceMatch && providerList.includes(titleSourceMatch[1])) {
          inferredSource = titleSourceMatch[1];
        }
      }

      return {
        content:
          content || `뉴스 상세 내용을 추출할 수 없습니다. URL: ${articleUrl}`,
        author: author || '나무뉴스',
        source: inferredSource,
        tags: tags.join(','),
        viewCount: Math.floor(Math.random() * 1000),
        likeCount: Math.floor(Math.random() * 100),
        commentCount: Math.floor(Math.random() * 50),
      };
      // ---------- 상세 파싱 고도화 종료 ----------
    } catch (error) {
      console.error(`[${this.getName()}] 상세 크롤링 에러:`, error.message);
      return {
        content: `크롤링 에러로 인해 상세 내용을 가져올 수 없습니다. URL: ${articleUrl}`,
        author: '나무뉴스',
        source: '나무뉴스',
        tags: '',
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
      };
    }
  }
}

/**
 * 제목 내 제공처 prefix 제거 및 중복 패턴 정리
 * 예: "시사연합뉴스/연합뉴스/ 제목" 또는 "연합뉴스 2025-08-12 제목" 등
 * @param {string} raw
 * @returns {string}
 */
NamuNewsCrawler.prototype.normalizeTitleProvider = function (raw) {
  if (!raw) return raw;
  let title = raw.trim();
  // 공통 제공처 리스트
  const providers = [
    '연합뉴스',
    '시사연합뉴스',
    '시사엑스포츠뉴스',
    '뉴시스',
    'YTN',
    '머니투데이',
    '한국경제',
    '서울경제',
    '조선일보',
    '한겨레',
    '경향신문',
    '세계일보',
    'MBN',
    'SBS',
    'KBS',
    'MBC',
    'JTBC',
  ];
  // 1) 선행 제공처 + '/' 제거 반복
  for (let i = 0; i < 3; i++) {
    const before = title;
    title = title.replace(
      new RegExp(
        `^(?:${providers.join('|')})(?:\\s*[/|:>-]+\\s*|/)+(?=\n|\\[|[가-힣A-Za-z0-9'\"\[] )`,
        'i'
      ),
      ''
    );
    if (before === title) break;
    title = title.trim();
  }
  // 2) 제공처 + 날짜 패턴 제거 (예: 연합뉴스/2025-08-12 )
  title = title.replace(
    new RegExp(
      `^(?:${providers.join('|')})\s*[/|-]?\s*20\\d{2}-\\d{2}-\\d{2}\s*`,
      'i'
    ),
    ''
  );
  // 3) 중복 공백/중복 제목 단축
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/^(.+?)\s+\1$/, '$1');
  return title;
};

module.exports = NamuNewsCrawler;
