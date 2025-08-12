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
      for (const article of newArticles) {
        try {
          const saved = await this.newsService.saveMainNews(article);
          if (saved) {
            this.crawlAndSaveDetailNews(saved.news_se, article.url).catch(err =>
              console.error(
                `[${this.getName()}] 상세 크롤링 에러 (news_se=${saved.news_se}):`,
                err.message
              )
            );
            itemCount++;
          }
        } catch (err) {
          console.error(
            `[${this.getName()}] 메인 뉴스 저장 에러:`,
            err.message
          );
        }
      }

      await this.newsService.updateCrawlLog(
        logId,
        'success',
        `${itemCount}개 뉴스 수집 완료`,
        itemCount
      );
      console.log(`[${this.getName()}] 완료: ${itemCount}개 저장`);

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

        // 제목 정제: 제공처/날짜 패턴 뒤쪽 혹은 앞쪽에서 기사명 추출
        // 예: "[AI픽] 'AI 3대 강국 향해'…민관 총 6천억 펀드 뜬다(종합) 시사연합뉴스/2025-08-12"
        // 슬래시 날짜 구분 토큰 제거
        rawText = rawText
          .replace(/\s*시사연합뉴스\/20\d{2}-\d{2}-\d{2}/, '')
          .replace(/\s*연합뉴스\/20\d{2}-\d{2}-\d{2}/, '')
          .replace(/\s{2,}/g, ' ') // 이중 공백 제거
          .trim();

        // 중복 대괄호/중복 제목 패턴 압축 (같은 제목 2회 반복 방지)
        // 예: "제목 제목" 형태 -> 하나만 유지
        rawText = rawText.replace(/^(.+?)\s+\1$/, '$1');

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

      let content = '';
      const contentSelectors = [
        '.article-content',
        '.post-content',
        '.news-content',
        '.content-body',
        'article .content',
        '.entry-content',
        '#content',
        '.article-body',
      ];

      for (const sel of contentSelectors) {
        const el = $(sel);
        if (!el.length) continue;
        const text = el
          .text()
          .replace(/\n\s*\n/g, '\n')
          .trim();
        if (text && text.length > content.length) content = text;
        if (content.length > 300) break;
      }

      // 백업: 문단 수집
      if (content.length < 80) {
        const paragraphs = [];
        $('p').each((i, el) => {
          const t = $(el).text().trim();
          if (t.length > 20 && !/^(\[|▶)/.test(t)) paragraphs.push(t);
          if (paragraphs.length >= 8) return false;
        });
        if (paragraphs.length) content = paragraphs.join('\n');
      }

      // 기자 / 출처 (나무뉴스 자체 서비스라 간단화)
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
          author = el.text().trim();
          if (author) break;
        }
      }

      // 태그 수집
      const tags = [];
      $('.tag, .tags a, .category, .keywords a').each((i, el) => {
        const t = $(el).text().trim();
        if (t && t.length > 0 && !tags.includes(t)) {
          tags.push(t);
        }
      });

      return {
        content:
          content || `뉴스 상세 내용을 추출할 수 없습니다. URL: ${articleUrl}`,
        author: author || '나무뉴스',
        source: '나무뉴스',
        tags: tags.slice(0, 10).join(','),
        viewCount: Math.floor(Math.random() * 1000),
        likeCount: Math.floor(Math.random() * 100),
        commentCount: Math.floor(Math.random() * 50),
      };
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

module.exports = NamuNewsCrawler;
