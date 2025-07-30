/**
 * @fileoverview 뉴스 API 라우터
 * @description 뉴스 관련 API 엔드포인트의 라우팅을 처리합니다.
 */

const express = require('express');
const router = express.Router();

/**
 * 뉴스 라우터 설정 함수
 * @function createNewsRouter
 * @param {Object} newsController - 뉴스 컨트롤러 인스턴스
 * @returns {Object} Express 라우터 객체
 * @description 뉴스 관련 API 라우트를 설정하고 컨트롤러와 연결합니다.
 */
function createNewsRouter(newsController) {
  /**
   * GET /api/news
   * @route GET /api/news
   * @group News - 뉴스 관련 API
   * @param {number} page.query - 페이지 번호 (기본값: 1)
   * @param {number} limit.query - 페이지당 항목 수 (기본값: 20, 최대: 100)
   * @param {string} category.query - 카테고리 필터 (선택사항)
   * @param {string} startDate.query - 시작 날짜 필터 (YYYY-MM-DD 형식)
   * @param {string} endDate.query - 종료 날짜 필터 (YYYY-MM-DD 형식)
   * @returns {Object} 200 - 뉴스 목록과 페이징 정보
   * @returns {Object} 400 - 잘못된 요청 파라미터
   * @returns {Object} 500 - 서버 에러
   * @description 저장된 뉴스 목록을 페이징과 필터링 옵션과 함께 조회합니다.
   */
  router.get('/news', newsController.getNews.bind(newsController));

  /**
   * GET /api/news/:id
   * @route GET /api/news/{id}
   * @group News - 뉴스 관련 API
   * @param {number} id.path.required - 뉴스 ID
   * @returns {Object} 200 - 뉴스 상세 정보
   * @returns {Object} 400 - 잘못된 뉴스 ID
   * @returns {Object} 404 - 뉴스를 찾을 수 없음
   * @returns {Object} 500 - 서버 에러
   * @description 특정 뉴스의 상세 정보를 조회합니다.
   */
  router.get('/news/:id', newsController.getNewsDetail.bind(newsController));

  /**
   * POST /api/crawl
   * @route POST /api/crawl
   * @group Crawling - 크롤링 관련 API
   * @returns {Object} 200 - 크롤링 성공 결과
   * @returns {Object} 500 - 크롤링 실행 에러
   * @description 네이버 뉴스 크롤링을 수동으로 실행합니다.
   */
  router.post('/crawl', newsController.executeCrawling.bind(newsController));

  /**
   * GET /api/crawl/logs
   * @route GET /api/crawl/logs
   * @group Crawling - 크롤링 관련 API
   * @param {number} limit.query - 조회할 로그 수 (기본값: 50, 최대: 200)
   * @returns {Object} 200 - 크롤링 로그 목록
   * @returns {Object} 400 - 잘못된 limit 파라미터
   * @returns {Object} 500 - 서버 에러
   * @description 크롤링 작업의 이력과 상태를 조회합니다.
   */
  router.get('/crawl/logs', newsController.getCrawlLogs.bind(newsController));

  /**
   * GET /api/stats
   * @route GET /api/stats
   * @group Statistics - 통계 관련 API
   * @returns {Object} 200 - 뉴스 통계 정보
   * @returns {Object} 500 - 서버 에러
   * @description 뉴스 데이터베이스의 통계 정보를 조회합니다.
   */
  router.get('/stats', newsController.getNewsStats.bind(newsController));

  return router;
}

module.exports = createNewsRouter;
