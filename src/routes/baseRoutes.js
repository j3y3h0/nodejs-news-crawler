/**
 * @fileoverview 기본 라우터
 * @description 애플리케이션의 기본 라우트를 처리합니다.
 */

const express = require('express');
const router = express.Router();

/**
 * 기본 라우터 설정 함수
 * @function createBaseRouter
 * @param {Object} newsController - 뉴스 컨트롤러 인스턴스
 * @returns {Object} Express 라우터 객체
 * @description 기본 라우트와 헬스체크 라우트를 설정합니다.
 */
function createBaseRouter(newsController) {
  /**
   * GET /
   * @route GET /
   * @group Base - 기본 API
   * @returns {Object} 200 - API 기본 정보와 엔드포인트 목록
   * @returns {Object} 500 - 서버 에러
   * @description API의 기본 정보와 사용 가능한 엔드포인트 목록을 반환합니다.
   */
  router.get('/', newsController.getApiInfo.bind(newsController));

  /**
   * GET /health
   * @route GET /health
   * @group Base - 기본 API
   * @returns {Object} 200 - 서버 상태 정보
   * @returns {Object} 500 - 서버 에러
   * @description 서버의 상태와 데이터베이스 연결 상태를 확인합니다.
   */
  router.get('/health', newsController.getHealthCheck.bind(newsController));

  return router;
}

module.exports = createBaseRouter;
