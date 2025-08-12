/**
 * @fileoverview 기본 크롤러 추상 클래스
 * @description 모든 뉴스 크롤러가 상속받을 기본 클래스
 */

const axios = require('axios');
const NodeCache = require('node-cache');

/**
 * 기본 크롤러 추상 클래스
 * @abstract
 * @class BaseCrawler
 */
class BaseCrawler {
  /**
   * BaseCrawler 생성자
   * @constructor
   * @param {Object} newsService - 뉴스 서비스 인스턴스
   * @param {Object} options - 크롤러 옵션
   */
  constructor(newsService, options = {}) {
    this.newsService = newsService;

    /**
     * 캐시 인스턴스
     * @type {NodeCache}
     */
    this.cache = new NodeCache({
      stdTTL: parseInt(process.env.CACHE_TTL_SECONDS) || 3600,
    });

    /**
     * HTTP 클라이언트 인스턴스
     * @type {axios.AxiosInstance}
     */
    this.httpClient = axios.create({
      timeout: parseInt(process.env.CRAWL_TIMEOUT_MS) || 30000,
      headers: {
        'User-Agent':
          options.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ...options.headers,
      },
    });

    /**
     * 크롤러 이름
     * @type {string}
     */
    this.crawlerName = options.name || 'BaseCrawler';
  }

  /**
   * 뉴스 크롤링 메인 메서드
   * @abstract
   * @async
   * @returns {Promise<Object>} 크롤링 결과
   */
  async crawlNews() {
    throw new Error('crawlNews() 메서드는 반드시 구현되어야 합니다.');
  }

  /**
   * 카테고리별 뉴스 크롤링
   * @abstract
   * @async
   * @param {string} categoryUrl - 카테고리 URL
   * @param {string} categoryName - 카테고리명
   * @returns {Promise<Array>} 뉴스 배열
   */
  async crawlCategoryNews(categoryUrl, categoryName) {
    throw new Error('crawlCategoryNews() 메서드는 반드시 구현되어야 합니다.');
  }

  /**
   * 뉴스 상세 내용 크롤링
   * @abstract
   * @async
   * @param {string} articleUrl - 기사 URL
   * @returns {Promise<Object>} 뉴스 상세 정보
   */
  async crawlNewsDetail(articleUrl) {
    throw new Error('crawlNewsDetail() 메서드는 반드시 구현되어야 합니다.');
  }

  /**
   * 새로운 기사만 필터링
   * @async
   * @param {Array} articles - 기사 배열
   * @returns {Promise<Array>} 중복 제거된 기사 배열
   */
  async filterNewArticles(articles) {
    const existingUrls = await this.newsService.getExistingUrls(
      articles.map(article => article.url)
    );

    return articles.filter(article => !existingUrls.includes(article.url));
  }

  /**
   * 뉴스 상세 내용 크롤링 및 저장
   * @async
   * @param {number} mainNewsId - 메인 뉴스 ID
   * @param {string} articleUrl - 기사 URL
   */
  async crawlAndSaveDetailNews(mainNewsId, articleUrl) {
    try {
      // 캐시 확인
      const cacheKey = `detail_${this.crawlerName}_${articleUrl}`;
      let detailData = this.cache.get(cacheKey);

      if (!detailData) {
        detailData = await this.crawlNewsDetail(articleUrl);
        this.cache.set(cacheKey, detailData);
      }

      if (detailData) {
        await this.newsService.saveNewsDetail(mainNewsId, detailData);
      }
    } catch (error) {
      console.error(`${this.crawlerName} 뉴스 상세 크롤링 에러:`, error);
    }
  }

  /**
   * 지연 함수 (요청 간격 조절용)
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise} 지연 Promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.cache.flushAll();
  }

  /**
   * 크롤러 이름 반환
   * @returns {string} 크롤러 이름
   */
  getName() {
    return this.crawlerName;
  }
}

module.exports = BaseCrawler;
